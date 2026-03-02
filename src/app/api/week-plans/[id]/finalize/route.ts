import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { triggerCleanup } from '@/lib/cleanup';

export const dynamic = 'force-dynamic';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;
        const body = await req.json();

        // expected body: { confirmedSlotIds: string[], rejectedSlotIds: string[] }
        const { confirmedSlotIds, rejectedSlotIds } = body;

        if (!Array.isArray(confirmedSlotIds) || !Array.isArray(rejectedSlotIds)) {
            return NextResponse.json({ error: "Invalid payload format" }, { status: 400 });
        }

        // 1. Delete rejected slots right now (synchronously)
        if (rejectedSlotIds.length > 0) {
            await prisma.postSlot.deleteMany({
                where: {
                    id: { in: rejectedSlotIds },
                    weekPlanId: weekPlanId
                }
            });
        }

        // 2. Mark WeekPlan as finalized
        await prisma.weekPlan.update({
            where: { id: weekPlanId },
            data: { status: "finalized" }
        });

        // 3. Trigger async cleanup for the week plan (do not await, let it run in background)
        triggerCleanup(weekPlanId).catch(err => {
            console.error(`Failed to run background cleanup for week ${weekPlanId}:`, err);
        });

        return NextResponse.json({ success: true, message: "Week finalized and cleanup started." });

    } catch (error) {
        console.error("Error finalizing week:", error);
        return NextResponse.json({ error: "Fehler beim Abschließen der Woche." }, { status: 500 });
    }
}
