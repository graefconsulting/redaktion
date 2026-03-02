import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { initBackgroundWorkers } from '@/workers';
import { enqueueTask } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;

        // Ensure worker is running when the page is loaded
        await initBackgroundWorkers();

        const tasks = await prisma.task.findMany({
            where: {
                relatedWeekId: weekPlanId,
                type: "content"
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

        // Enrich tasks with their postSlot data
        const enrichedTasks = tasks.map(t => {
            const slot = t.relatedPostId ? slotMap.get(t.relatedPostId) : null;
            return {
                ...t,
                postSlot: slot
            };
        });

        const weekPlan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId }
        });

        return NextResponse.json({
            tasks: enrichedTasks,
            weekPlan: weekPlan ? { year: weekPlan.year, week: weekPlan.week } : null
        });

    } catch (error) {
        console.error("Error fetching content tasks:", error);
        return NextResponse.json({ error: "Failed to fetch content tasks." }, { status: 500 });
    }
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;
        const body = await req.json();
        const { postSlotId, customHint } = body;

        if (!postSlotId) return NextResponse.json({ error: "postSlotId required" }, { status: 400 });

        await initBackgroundWorkers();

        const weekPlan = await prisma.weekPlan.findFirst({
            where: { id: weekPlanId }
        });

        if (!weekPlan) return NextResponse.json({ error: "WeekPlan not found" }, { status: 404 });

        const postSlot = await prisma.postSlot.findFirst({
            where: { id: postSlotId, weekPlanId }
        });

        if (!postSlot) return NextResponse.json({ error: "PostSlot not found" }, { status: 404 });

        // Delete existing task for this exact postSlot
        await prisma.task.deleteMany({
            where: {
                relatedWeekId: weekPlanId,
                type: "content",
                relatedPostId: postSlotId
            }
        });

        const instructionString = postSlot.userInstruction || "Thema";
        const lines = instructionString.split('\n');
        const topicTitle = lines.find((l: string) => l.startsWith("Titel: "))?.replace("Titel: ", "") || "Thema";

        const dbTask = await prisma.task.create({
            data: {
                type: "content",
                relatedWeekId: weekPlanId,
                relatedPostId: postSlot.id,
                status: "queued"
            }
        });

        await enqueueTask('generate-content', {
            taskId: dbTask.id,
            weekPlanId,
            postSlotId: postSlot.id,
            topicTitle,
            category: postSlot.category,
            globalHints: weekPlan.globalHints,
            briefing: postSlot.selectedBriefing || "",
            customHint
        });

        return NextResponse.json({ success: true, taskId: dbTask.id });

    } catch (error) {
        console.error("Error regenerating content task:", error);
        return NextResponse.json({ error: "Failed to regenerate content." }, { status: 500 });
    }
}
