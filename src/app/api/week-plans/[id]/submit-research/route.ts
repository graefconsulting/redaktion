import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enqueueTask } from '@/lib/queue';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;
        const body = await req.json();
        const { topics, globalHints } = body as {
            topics: { title: string, description: string, category: string, weekday?: string }[],
            globalHints?: string
        };

        if (!topics || !Array.isArray(topics) || topics.length === 0) {
            return NextResponse.json({ error: "No topics provided" }, { status: 400 });
        }

        const weekPlan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId },
            include: { postSlots: true }
        });

        if (!weekPlan) {
            return NextResponse.json({ error: "Week plan not found" }, { status: 404 });
        }

        // Compare new topics with existing PostSlots to see if anything changed
        // We consider it changed if:
        // 1. the number of slots is different
        // 2. the category, derived userInstruction, or weekday is different for any slot

        let hasChanges = weekPlan.postSlots.length !== topics.length;

        if (!hasChanges) {
            const getIncomingInstruction = (t: any) => `Titel: ${t.title}\nBeschreibung: ${t.description}`;

            // Sort both arrays deterministically
            const existingSlots = [...weekPlan.postSlots].sort((a, b) =>
                a.category.localeCompare(b.category) || (a.userInstruction || "").localeCompare(b.userInstruction || "")
            );

            const newTopics = [...topics].sort((a, b) =>
                a.category.localeCompare(b.category) || getIncomingInstruction(a).localeCompare(getIncomingInstruction(b))
            );

            for (let i = 0; i < existingSlots.length; i++) {
                const ext = existingSlots[i];
                const incoming = newTopics[i];
                const incomingInstruction = getIncomingInstruction(incoming);

                if (ext.category !== incoming.category || ext.userInstruction !== incomingInstruction || (ext.weekday || "") !== (incoming.weekday || "")) {
                    hasChanges = true;
                    break;
                }
            }
        }

        // Also check if globalHints changed
        if (globalHints !== undefined && globalHints !== weekPlan.globalHints) {
            hasChanges = true;
        }

        if (!hasChanges) {
            // No changes detected. We can skip deleting and regenerating!
            return NextResponse.json({ success: true, unchanged: true });
        }

        // Changes detected! We must wipe existing PostSlots and Tasks for this week and start over.
        await prisma.$transaction(async (tx) => {
            await tx.postSlot.deleteMany({
                where: { weekPlanId }
            });

            await tx.task.deleteMany({
                where: {
                    relatedWeekId: weekPlanId,
                    type: "briefing"
                }
            });

            if (globalHints !== undefined) {
                await tx.weekPlan.update({
                    where: { id: weekPlanId },
                    data: { globalHints }
                });
            }

            for (const topic of topics) {
                const userInstruction = `Titel: ${topic.title}\nBeschreibung: ${topic.description}`;

                const postSlot = await tx.postSlot.create({
                    data: {
                        weekPlanId,
                        category: topic.category,
                        userInstruction: userInstruction,
                        weekday: topic.weekday || null
                    }
                });

                const dbTask = await tx.task.create({
                    data: {
                        type: "briefing",
                        relatedWeekId: weekPlanId,
                        relatedPostId: postSlot.id,
                        status: "queued"
                    }
                });

                await enqueueTask('generate-briefing', {
                    taskId: dbTask.id,
                    weekPlanId,
                    postSlotId: postSlot.id,
                    topicTitle: topic.title,
                    topicDescription: topic.description,
                    category: topic.category,
                    globalHints: globalHints || weekPlan.globalHints
                });
            }
        });

        return NextResponse.json({ success: true, unchanged: false });

    } catch (error) {
        console.error("Error submitting research:", error);
        return NextResponse.json({ error: "Failed to submit research topics and create brief tasks" }, { status: 500 });
    }
}
