import { NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
import { prisma } from "@/lib/db";
import { enqueueTask } from "@/lib/queue";
import { initBackgroundWorkers } from "@/workers";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;

        await initBackgroundWorkers();

        const tasks = await prisma.task.findMany({
            where: {
                relatedWeekId: weekPlanId,
                type: "image_ideas"
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Fetch corresponding PostSlots to enrich the response
        const postSlotIds = tasks.map(t => t.relatedPostId).filter(Boolean) as string[];

        const postSlots = await prisma.postSlot.findMany({
            where: {
                id: { in: postSlotIds }
            }
        });

        const slotMap = new Map(postSlots.map(ps => [ps.id, ps]));

        // Enrich tasks with their postSlot data and category
        const mappedTasks = tasks.map(t => {
            const slot = t.relatedPostId ? slotMap.get(t.relatedPostId) : null;
            return {
                ...t,
                postSlot: slot,
                category: slot?.category || "Unbekannt"
            };
        });

        const weekPlan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId }
        });

        return NextResponse.json({
            tasks: mappedTasks,
            weekPlan: weekPlan ? { year: weekPlan.year, week: weekPlan.week } : null
        });

    } catch (error) {
        console.error("Error fetching image tasks:", error);
        return NextResponse.json({ error: "Failed to fetch tasks." }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;

        await prisma.task.deleteMany({
            where: {
                relatedWeekId: weekPlanId,
                type: "image_ideas"
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting image tasks:", error);
        return NextResponse.json({ error: "Failed to reset image tasks." }, { status: 500 });
    }
}

// POST is used to re-trigger a specific image ideas generation (custom prompt)
export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;
        const body = await req.json();
        const postSlotId: string = body.postSlotId;
        const instruction: string = body.instruction || "";

        if (!postSlotId) {
            return NextResponse.json({ error: "postSlotId required" }, { status: 400 });
        }

        await initBackgroundWorkers();

        const plan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId }
        });
        if (!plan) return NextResponse.json({ error: "WeekPlan not found" }, { status: 404 });

        const slot = await prisma.postSlot.findUnique({
            where: { id: postSlotId }
        });

        if (!slot || !slot.selectedContent) {
            return NextResponse.json({ error: "PostSlot invalid or missing content" }, { status: 400 });
        }

        // Save the new instruction
        if (instruction) {
            await prisma.postSlot.update({
                where: { id: postSlotId },
                data: { imageInstruction: instruction }
            });
        }

        // Delete existing task for this slot to allow UI to show loading again
        await prisma.task.deleteMany({
            where: { relatedWeekId: weekPlanId, relatedPostId: postSlotId, type: "image_ideas" }
        });

        // 1. Create Task record
        const dbTask = await prisma.task.create({
            data: {
                type: "image_ideas",
                relatedWeekId: weekPlanId,
                relatedPostId: postSlotId,
                status: "queued"
            }
        });

        // Fetch BrandConfig
        const brand = await prisma.brandConfig.findFirst({ where: { isPublished: true } });

        // 2. Put into queue
        const jobId = await enqueueTask('generate-image-ideas', {
            taskId: dbTask.id,
            weekPlanId,
            postSlotId,
            category: slot.category,
            userInstruction: instruction || slot.imageInstruction || "",
            briefing: slot.selectedBriefing || "",
            content: slot.selectedContent || "",
            targetAudience: brand?.targetAudience || ""
        }, {
            retryBackoff: true,
            retryLimit: 1
        });

        await prisma.task.update({
            where: { id: dbTask.id },
            data: { providerJobId: jobId }
        });

        return NextResponse.json({ success: true, task: dbTask });

    } catch (error) {
        console.error("Error regenerating image ideas:", error);
        return NextResponse.json({ error: "Failed to trigger." }, { status: 500 });
    }
}
