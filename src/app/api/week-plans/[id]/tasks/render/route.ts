import { NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
import { prisma } from "@/lib/db";
import { getQueue } from "@/lib/queue";
import { initBackgroundWorkers } from "@/workers";

// GET: fetch render tasks
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;

        // Verify plan
        const plan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId }
        });
        if (!plan) return NextResponse.json({ error: "WeekPlan not found" }, { status: 404 });

        // Get all image_render tasks for this plan
        const tasks = await prisma.task.findMany({
            where: {
                relatedWeekId: weekPlanId,
                type: "image_render"
            },
            orderBy: { createdAt: "desc" } // get newest first
        });

        // Aggregate status for multi-prompt batches
        const slotTasksMap = new Map<string, any[]>();
        for (const task of tasks) {
            if (!task.relatedPostId) continue;
            if (!slotTasksMap.has(task.relatedPostId)) {
                slotTasksMap.set(task.relatedPostId, []);
            }
            slotTasksMap.get(task.relatedPostId)!.push(task);
        }

        const filteredTasks = [];
        for (const [slotId, slotTasks] of slotTasksMap.entries()) {
            // Tasks are ordered newest first. Find the batch.
            const newestTime = new Date(slotTasks[0].createdAt).getTime();
            const batchTasks = slotTasks.filter(t => newestTime - new Date(t.createdAt).getTime() < 10000); // within 10 seconds

            let aggStatus = "success";
            let aggError = null;

            if (batchTasks.some(t => t.status === "failed")) {
                aggStatus = "failed";
                aggError = batchTasks.find(t => t.status === "failed")?.errorMessage || "Ein (oder mehrere) Bilder konnten nicht generiert werden.";
            } else if (batchTasks.some(t => t.status === "queued" || t.status === "running")) {
                // If any is still running, the batch is running
                aggStatus = "running";
            }

            const repTask = { ...slotTasks[0], status: aggStatus, errorMessage: aggError || slotTasks[0].errorMessage };
            filteredTasks.push(repTask);
        }

        // Manually attach post slots & images
        const postSlotIds = filteredTasks.map(t => t.relatedPostId).filter(Boolean) as string[];
        const slots = await prisma.postSlot.findMany({
            where: { id: { in: postSlotIds } },
            include: { images: true }
        });

        const tasksWithSlots = filteredTasks.map(t => ({
            ...t,
            postSlot: slots.find(s => s.id === t.relatedPostId) || null
        }));

        return NextResponse.json({
            tasks: tasksWithSlots,
            weekPlan: { year: plan.year, week: plan.week }
        });
    } catch (error) {
        console.error("Error fetching render tasks:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// POST: Start or retry render tasks
export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;
        const body = await req.json().catch(() => ({}));
        const specificPostSlotId = body.postSlotId; // optional

        await initBackgroundWorkers();

        const plan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId },
            include: { postSlots: true }
        });
        if (!plan) return NextResponse.json({ error: "WeekPlan not found" }, { status: 404 });

        const slotsToProcess = specificPostSlotId
            ? plan.postSlots.filter(s => s.id === specificPostSlotId)
            : plan.postSlots;

        let startedCount = 0;
        const boss = await getQueue();

        for (const slot of slotsToProcess) {
            // Check if we already have a successful render task for this slot
            const existingTasks = await prisma.task.findMany({
                where: { relatedPostId: slot.id, type: "image_render" },
                orderBy: { createdAt: 'desc' }
            });

            // We consider it "active" only if it was queued recently (e.g. within 5 mins) to prevent getting stuck
            // But for simplicity in this MVP, if it failed or if we specifically requested it, we just queue a new one.
            const successfulTasks = existingTasks.filter(t => t.status === "success");
            const hasRecentActive = existingTasks.some(t =>
                (t.status === "running" || t.status === "queued") &&
                (new Date().getTime() - new Date(t.createdAt).getTime() < 5 * 60 * 1000)
            );

            // Check if the most recent success was for the CURRENT selectedImagePrompt
            // If the user went back to Phase 6 and changed the prompt, we MUST generate a new image
            let isPromptUpToDate = false;
            if (successfulTasks.length > 0) {
                const latestSuccess = successfulTasks[0];
                try {
                    if (latestSuccess.payload) {
                        const payloadObj = JSON.parse(latestSuccess.payload);
                        if (payloadObj.prompt === slot.selectedImagePrompt && payloadObj.model === slot.imageModel) {
                            isPromptUpToDate = true;
                        }
                    } else {
                        // If there is no payload, we cannot guarantee the prompt is up-to-date.
                        // We must assume it is FALSE so that the user gets a new image generated
                        // when they change the prompt in Phase 6.
                        isPromptUpToDate = false;
                    }
                } catch (e) { }
            }

            // Allow retry if specifically requested (specificPostSlotId exists) OR if (no up-to-date success AND no recent active task)
            if ((!isPromptUpToDate && !hasRecentActive) || specificPostSlotId) {
                // If there's an existing successful one and we are re-rendering, we just create a new task

                // We need the selectedImagePrompt to exist to do a render
                if (!slot.selectedImagePrompt) {
                    continue; // Cannot render without prompt
                }

                // Split multi-prompt logic
                const individualPrompts = slot.selectedImagePrompt.split('\n\n---\n\n').map(p => p.trim()).filter(Boolean);

                for (const prompt of individualPrompts) {
                    // Create Task
                    const newTask = await prisma.task.create({
                        data: {
                            type: "image_render",
                            relatedWeekId: weekPlanId,
                            relatedPostId: slot.id,
                            status: "queued",
                            payload: JSON.stringify({
                                prompt: prompt,
                                model: slot.imageModel
                            })
                        }
                    });

                    // Enqueue
                    await boss.send('generate-image-renders', { taskId: newTask.id });
                    startedCount++;
                }
            }
        }

        return NextResponse.json({ success: true, startedCount });

    } catch (error) {
        console.error("Error starting render tasks:", error);
        return NextResponse.json({ error: "Failed to start render tasks." }, { status: 500 });
    }
}

// DELETE: Remove all generated images and tasks for a specific post slot
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;

        // Use URL search params instead of req.json() since some clients don't support bodies in DELETE requests
        const { searchParams } = new URL(req.url);
        const specificPostSlotId = searchParams.get('postSlotId');

        if (!specificPostSlotId) {
            return NextResponse.json({ error: "postSlotId is required" }, { status: 400 });
        }

        // Delete ImageAssets associated with this slot
        await prisma.imageAsset.deleteMany({
            where: { postSlotId: specificPostSlotId }
        });

        // Delete image_render Tasks associated with this slot
        await prisma.task.deleteMany({
            where: {
                relatedWeekId: weekPlanId,
                relatedPostId: specificPostSlotId,
                type: "image_render"
            }
        });

        return NextResponse.json({ success: true, message: "Images and tasks deleted" });

    } catch (error) {
        console.error("Error deleting render tasks:", error);
        return NextResponse.json({ error: "Failed to delete render tasks." }, { status: 500 });
    }
}
