import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;

        // Verify it exists
        const plan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId }
        });

        if (!plan) {
            return NextResponse.json({ error: "WeekPlan not found" }, { status: 404 });
        }

        // The schema has onDelete: Cascade for PostSlots.
        // Images have onDelete: SetNull on PostSlot, but we can just delete the WeekPlan 
        // and ideally handle images via cleanup script or directly here.
        // For now, prototype level: just delete WeekPlan.
        await prisma.weekPlan.delete({
            where: { id: weekPlanId }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting WeekPlan:", error);
        return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }
}
