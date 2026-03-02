import { NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
import { prisma } from "@/lib/db";
import { enqueueTask } from "@/lib/queue";
import { initBackgroundWorkers } from "@/workers";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;
        const body = await req.json();

        // `contents` is an array of { postSlotId, content }
        const contents: { postSlotId: string; content: string }[] = body.contents || [];

        // Ensure worker is running
        await initBackgroundWorkers();

        // Fetch plan details
        const plan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId },
            include: {
                postSlots: true
            }
        });
        if (!plan) return NextResponse.json({ error: "WeekPlan not found" }, { status: 404 });

        // Update post slots with finalized content
        const updatePromises = contents.map(c =>
            prisma.postSlot.update({
                where: { id: c.postSlotId },
                data: { selectedContent: c.content }
            })
        );
        await Promise.all(updatePromises);

        // Fetch them again to get updated timestamps
        const postSlots = await prisma.postSlot.findMany({
            where: { weekPlanId }
        });

        // Check for existing image tasks
        const existingTasks = await prisma.task.findMany({
            where: { relatedWeekId: weekPlanId, type: "image_ideas" }
        });

        // Smart change detection
        let hasChanges = existingTasks.length !== postSlots.length;

        if (!hasChanges) {
            for (const slot of postSlots) {
                const correspondingTask = existingTasks.find(t => t.relatedPostId === slot.id);
                if (!correspondingTask) {
                    hasChanges = true;
                    break;
                }
                // Check if the slot was updated after the task was created (meaning Content was edited)
                if (slot.updatedAt.getTime() > correspondingTask.createdAt.getTime() + 2000) {
                    hasChanges = true;
                    break;
                }
            }
        }

        if (!hasChanges) {
            return NextResponse.json({ success: true, unchanged: true, message: "No changes detected, existing image ideas kept." });
        }

        // Delete existing tasks for image ideas if we are regenerating
        if (existingTasks.length > 0) {
            await prisma.task.deleteMany({
                where: { id: { in: existingTasks.map(t => t.id) } }
            });
        }

        const tasksCreated = [];

        // Fetch BrandConfig for audience
        const brand = await prisma.brandConfig.findFirst({ where: { isPublished: true } });

        // Enqueue a job for each finalized post slot
        for (const slot of postSlots) {
            if (!slot.selectedContent) continue; // Skip if no content exists yet

            const dbTask = await prisma.task.create({
                data: {
                    type: "image_ideas",
                    relatedWeekId: weekPlanId,
                    relatedPostId: slot.id,
                    status: "queued"
                }
            });

            const jobId = await enqueueTask('generate-image-ideas', {
                taskId: dbTask.id,
                weekPlanId,
                postSlotId: slot.id,
                category: slot.category,
                userInstruction: slot.userInstruction,
                briefing: slot.selectedBriefing || "", // Can act as context
                content: slot.selectedContent || "",   // Core context for image
                targetAudience: brand?.targetAudience || ""
            }, {
                retryBackoff: true,
                retryLimit: 1
            });

            await prisma.task.update({
                where: { id: dbTask.id },
                data: { providerJobId: jobId }
            });

            tasksCreated.push({
                id: dbTask.id,
                postSlotId: slot.id,
                status: dbTask.status
            });
        }

        return NextResponse.json({ tasks: tasksCreated });
    } catch (error) {
        console.error("Error triggering image tasks:", error);
        return NextResponse.json({ error: "Failed to trigger image idea generation." }, { status: 500 });
    }
}
