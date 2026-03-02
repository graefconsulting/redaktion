import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enqueueTask } from '@/lib/queue';
import { initBackgroundWorkers } from '@/workers';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;

        // Ensure worker is running
        await initBackgroundWorkers();

        // Validate plan exists
        const plan = await prisma.weekPlan.findFirst({
            where: { id: weekPlanId }
        });
        if (!plan) return NextResponse.json({ error: "WeekPlan not found" }, { status: 404 });

        // Retrieve postSlots that have a selectedBriefing
        const postSlots = await prisma.postSlot.findMany({
            where: {
                weekPlanId: weekPlanId,
                selectedBriefing: { not: null }
            }
        });

        if (postSlots.length === 0) {
            return NextResponse.json({ error: "No finalized briefings found for content generation." }, { status: 400 });
        }

        // Check for existing content tasks
        const existingTasks = await prisma.task.findMany({
            where: { relatedWeekId: weekPlanId, type: "content" }
        });

        // If tasks exist, we check if they cover all the current finalized postSlots.
        // We look at `PostSlot.updatedAt` vs `Task.createdAt`. 
        // If the postSlot was updated AFTER the task was created, the briefing likely changed!
        let hasChanges = existingTasks.length !== postSlots.length;

        if (!hasChanges) {
            for (const slot of postSlots) {
                const correspondingTask = existingTasks.find(t => t.relatedPostId === slot.id);
                if (!correspondingTask) {
                    hasChanges = true;
                    break;
                }
                // Add a 2 second buffer because they might be created slightly apart during initial generation.
                if (slot.updatedAt.getTime() > correspondingTask.createdAt.getTime() + 2000) {
                    hasChanges = true;
                    break;
                }
            }
        }

        if (!hasChanges) {
            return NextResponse.json({ success: true, unchanged: true, message: "No changes detected, existing content kept." });
        }

        // Delete any existing content tasks for this phase to start fresh
        await prisma.task.deleteMany({
            where: {
                relatedWeekId: weekPlanId,
                type: "content"
            }
        });

        const tasksCreated = [];

        // For each confirmed PostSlot context, enqueue a content generation job
        for (const slot of postSlots) {
            const dbTask = await prisma.task.create({
                data: {
                    type: "content",
                    relatedWeekId: weekPlanId,
                    relatedPostId: slot.id,
                    status: "queued"
                }
            });

            const lines = slot.userInstruction!.split('\n');
            const topicTitle = lines.find((l: string) => l.startsWith("Titel: "))?.replace("Titel: ", "") || slot.category;

            const jobId = await enqueueTask('generate-content', {
                taskId: dbTask.id,
                weekPlanId,
                postSlotId: slot.id,
                topicTitle,
                category: slot.category,
                globalHints: plan.globalHints,
                briefing: slot.selectedBriefing!
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

        return NextResponse.json({
            success: true,
            unchanged: false,
            message: `Enqueued ${tasksCreated.length} content generation tasks`,
            tasks: tasksCreated
        });

    } catch (error) {
        console.error("Error submitting briefing:", error);
        return NextResponse.json({ error: "Failed to submit briefing for content generation." }, { status: 500 });
    }
}
