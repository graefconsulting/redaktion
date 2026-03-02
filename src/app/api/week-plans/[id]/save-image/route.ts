import { NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
import { prisma } from "@/lib/db";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;
        const body = await req.json();

        // `selections` is an array of { postSlotId, selectedImagePrompt, referenceImageUrl? }
        const selections: {
            postSlotId: string;
            selectedImagePrompt: string;
            referenceImageUrl?: string;
            imageModel?: string;
            imageFormat?: string;
            imageSize?: string;
            imageResolution?: string;
        }[] = body.selections || [];

        // Fetch plan details to verify existence
        const plan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId }
        });
        if (!plan) return NextResponse.json({ error: "WeekPlan not found" }, { status: 404 });

        // Update post slots with finalized image details
        const updatePromises = selections.map(c =>
            prisma.postSlot.update({
                where: { id: c.postSlotId },
                data: {
                    selectedImagePrompt: c.selectedImagePrompt,
                    referenceImageUrl: c.referenceImageUrl || null,
                    ...(c.imageModel && { imageModel: c.imageModel }),
                    ...(c.imageFormat && { imageFormat: c.imageFormat }),
                    ...(c.imageSize && { imageSize: c.imageSize }),
                    ...(c.imageResolution && { imageResolution: c.imageResolution })
                }
            })
        );
        await Promise.all(updatePromises);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error saving image ideas:", error);
        return NextResponse.json({ error: "Failed to save selected image ideas." }, { status: 500 });
    }
}
