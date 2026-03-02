import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;
        const body = await req.json();
        const { targetYear, targetWeek, includeContent } = body;

        if (!targetYear || !targetWeek) {
            return NextResponse.json({ error: "Zieljahr und Zielwoche sind erforderlich." }, { status: 400 });
        }

        const tYear = parseInt(targetYear, 10);
        const tWeek = parseInt(targetWeek, 10);

        // Check if target week already exists
        const existingTarget = await prisma.weekPlan.findUnique({
            where: { year_week: { year: tYear, week: tWeek } }
        });

        if (existingTarget) {
            return NextResponse.json({ error: "Die gewählte Kalenderwoche existiert bereits." }, { status: 400 });
        }

        // Fetch original week plan with slots and images
        const sourcePlan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId },
            include: {
                postSlots: {
                    include: { images: true }
                }
            }
        });

        if (!sourcePlan) {
            return NextResponse.json({ error: "Ursprungsplan nicht gefunden." }, { status: 404 });
        }

        // Create the new WeekPlan
        const newPlan = await prisma.weekPlan.create({
            data: {
                year: tYear,
                week: tWeek,
                status: "draft",
                globalHints: sourcePlan.globalHints
            }
        });

        // Copy slots
        for (const slot of sourcePlan.postSlots) {
            const newSlotInput: any = {
                weekPlanId: newPlan.id,
                platform: slot.platform,
                category: slot.category,
                weekday: slot.weekday,
                productId: slot.productId,
                userInstruction: slot.userInstruction
            };

            if (includeContent) {
                newSlotInput.selectedBriefing = slot.selectedBriefing;
                newSlotInput.selectedContent = slot.selectedContent;
                newSlotInput.selectedImagePrompt = slot.selectedImagePrompt;
                newSlotInput.imageInstruction = slot.imageInstruction;
                newSlotInput.imageModel = slot.imageModel;
                newSlotInput.imageFormat = slot.imageFormat;
                newSlotInput.imageSize = slot.imageSize;
                newSlotInput.imageResolution = slot.imageResolution;
            }

            const newSlot = await prisma.postSlot.create({ data: newSlotInput });

            // If includeContent and there are images, copy the image assets
            if (includeContent && slot.images.length > 0) {
                for (const img of slot.images) {
                    await prisma.imageAsset.create({
                        data: {
                            postSlotId: newSlot.id,
                            url: img.url,
                            source: img.source,
                            version: img.version
                        }
                    });
                }
            }
        }

        return NextResponse.json({ success: true, newPlanId: newPlan.id });
    } catch (error) {
        console.error("Error duplicating WeekPlan:", error);
        return NextResponse.json({ error: "Fehler beim Duplizieren." }, { status: 500 });
    }
}
