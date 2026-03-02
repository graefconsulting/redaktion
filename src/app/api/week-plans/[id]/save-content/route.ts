import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;
        const body = await req.json();
        const { selections } = body;

        if (!selections || !Array.isArray(selections)) {
            return NextResponse.json({ error: "Invalid payload: selections array missing." }, { status: 400 });
        }

        const plan = await prisma.weekPlan.findFirst({
            where: { id: weekPlanId }
        });
        if (!plan) return NextResponse.json({ error: "WeekPlan not found" }, { status: 404 });

        for (const item of selections) {
            const { postSlotId, selectedContent } = item;
            if (!postSlotId || !selectedContent) continue;

            await prisma.postSlot.update({
                where: { id: postSlotId },
                data: { selectedContent: selectedContent }
            });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Error saving content:", error);
        return NextResponse.json({ error: "Failed to save content selections." }, { status: 500 });
    }
}
