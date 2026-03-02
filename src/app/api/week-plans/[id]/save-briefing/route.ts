import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;
        const body = await req.json();

        // Expected payload: array of { postSlotId, selectedBriefing }
        const { selections } = body as {
            selections: { postSlotId: string, selectedBriefing: string }[]
        };

        if (!selections || !Array.isArray(selections)) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        // Verify week plan exists
        const weekPlan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId }
        });

        if (!weekPlan) {
            return NextResponse.json({ error: "Week plan not found" }, { status: 404 });
        }

        // Run updates in a transaction
        await prisma.$transaction(
            selections.map(selection =>
                prisma.postSlot.update({
                    where: { id: selection.postSlotId },
                    data: { selectedBriefing: selection.selectedBriefing }
                })
            )
        );

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Error saving selected briefings:", error);
        return NextResponse.json({ error: "Failed to save selected briefings" }, { status: 500 });
    }
}
