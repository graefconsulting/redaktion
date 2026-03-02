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
        const categories: string[] = body.categories || [];

        const customHints: Record<string, string> = body.customHints || {};

        // Ensure worker is running
        await initBackgroundWorkers();

        // Fetch plan details (using findFirst to avoid strict UniqueInput requirement if schema differs)
        const plan = await prisma.weekPlan.findFirst({
            where: { id: weekPlanId }
        });
        if (!plan) return NextResponse.json({ error: "WeekPlan not found" }, { status: 404 });

        // Fetch BrandConfig for targetAudience
        const brand = await prisma.brandConfig.findFirst({
            where: { isPublished: true }
        });

        // Delete existing tasks for exactly these requested categories
        const existingTasks = await prisma.task.findMany({
            where: { relatedWeekId: weekPlanId, type: "research" }
        });
        const taskIdsToDelete: string[] = [];
        for (const t of existingTasks) {
            if (t.payload) {
                try {
                    const parsed = JSON.parse(t.payload);
                    if (categories.includes(parsed.category)) {
                        taskIdsToDelete.push(t.id);
                    }
                } catch { /* empty */ }
            }
        }
        if (taskIdsToDelete.length > 0) {
            await prisma.task.deleteMany({
                where: { id: { in: taskIdsToDelete } }
            });
        }

        const tasksCreated = [];

        // Enqueue a job for each category requested
        for (const category of categories) {
            const hint = customHints[category] || "";

            // 1. Create Task record in DB to track it
            const dbTask = await prisma.task.create({
                data: {
                    type: "research",
                    relatedWeekId: weekPlanId,
                    status: "queued",
                    payload: JSON.stringify({ category, customHint: hint })
                }
            });

            // 2. Put into pg-boss queue
            const jobId = await enqueueTask('generate-research', {
                taskId: dbTask.id,
                weekPlanId,
                category,
                weekNumber: plan.week,
                targetAudience: brand?.targetAudience || "Gesundheitsbewusst",
                customHint: hint
            }, {
                // Options: Retry up to 1 time if fail
                retryBackoff: true,
                retryLimit: 1
            });

            // Update task with the provider jobId
            await prisma.task.update({
                where: { id: dbTask.id },
                data: { providerJobId: jobId }
            });

            tasksCreated.push({
                id: dbTask.id,
                category,
                status: dbTask.status
            });
        }

        return NextResponse.json({ tasks: tasksCreated });

    } catch (error) {
        console.error("Error triggering research tasks:", error);
        return NextResponse.json({ error: "Failed to trigger research." }, { status: 500 });
    }
}

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;

        // Ensure worker is running when the page is loaded (important for dev restarts)
        await initBackgroundWorkers();

        const tasks = await prisma.task.findMany({
            where: {
                relatedWeekId: weekPlanId,
                type: "research"
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // The React frontend depends on `category` being a visible property, but Prisma Task
        // only stores it inside the JSON `payload` column. We extract it here:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedTasks = tasks.map((t: any) => {
            let cat = "Unbekannt";
            if (t.payload) {
                try {
                    cat = JSON.parse(t.payload).category || cat;
                } catch { /* empty */ }
            }
            return {
                ...t,
                category: cat
            };
        });

        // Fetch the week plan to get existing postSlots and globalHints
        const plan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId },
            include: { postSlots: true }
        });

        return NextResponse.json({
            tasks: mappedTasks,
            postSlots: plan?.postSlots || [],
            globalHints: plan?.globalHints || ""
        });

    } catch (error) {
        console.error("Error fetching tasks:", error);
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
                type: "research"
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting tasks:", error);
        return NextResponse.json({ error: "Failed to reset research." }, { status: 500 });
    }
}
