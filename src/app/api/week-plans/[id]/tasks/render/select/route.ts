import { NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
import { prisma } from "@/lib/db";

// POST: Select a final image and delete others for the same slot
export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;
        const body = await req.json().catch(() => ({}));
        const { postSlotId, selectedImageId } = body;

        if (!postSlotId || !selectedImageId) {
            return NextResponse.json({ error: "postSlotId and selectedImageId are required" }, { status: 400 });
        }

        // Verify the image exists and belongs to the slot
        const selectedImage = await prisma.imageAsset.findFirst({
            where: { id: selectedImageId, postSlotId }
        });

        if (!selectedImage) {
            return NextResponse.json({ error: "Image not found for this slot" }, { status: 404 });
        }

        // Delete all OTHER images for this slot
        await prisma.imageAsset.deleteMany({
            where: {
                postSlotId,
                id: { not: selectedImageId }
            }
        });

        return NextResponse.json({ success: true, message: "Image selected and others deleted." });

    } catch (error) {
        console.error("Error selecting image:", error);
        return NextResponse.json({ error: "Failed to select image." }, { status: 500 });
    }
}
