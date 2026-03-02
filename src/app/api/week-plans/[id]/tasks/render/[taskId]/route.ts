import { NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
import { prisma } from "@/lib/db";

// DELETE a specific task (image generation result)
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string, taskId: string }> }
) {
    try {
        const { id: weekPlanId, taskId } = await params;

        // Verify plan
        const plan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId }
        });
        if (!plan) return NextResponse.json({ error: "WeekPlan not found" }, { status: 404 });

        // Verify task
        const task = await prisma.task.findUnique({
            where: { id: taskId }
        });
        if (!task || task.relatedWeekId !== weekPlanId) {
            return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }

        // Delete the task record
        await prisma.task.delete({
            where: { id: taskId }
        });

        // Also delete any ImageAsset that was created from this task payload?
        // Since we didn't firmly map ImageAsset.id -> Task.id directly yet (ImageAsset just points to postSlotId), 
        // we might just leave the ImageAssets alone or delete those matching the URL.
        if (task.resultJson) {
             try {
                 const parsed = JSON.parse(task.resultJson);
                 if (parsed.url) {
                      await prisma.imageAsset.deleteMany({
                           where: { url: parsed.url, postSlotId: task.relatedPostId! }
                      });
                 }
             } catch(e) {}
        }


        return NextResponse.json({ success: true, deletedTaskId: taskId });

    } catch (error) {
        console.error("Error deleting render task:", error);
        return NextResponse.json({ error: "Failed to delete task." }, { status: 500 });
    }
}
