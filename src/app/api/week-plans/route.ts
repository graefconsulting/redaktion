import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
    try {
        const { year, week } = await req.json();

        if (!year || !week) {
            return NextResponse.json({ error: "Year and week are required." }, { status: 400 });
        }

        // Try to find an existing plan
        let plan = await prisma.weekPlan.findUnique({
            where: {
                year_week: { year, week }
            },
            include: {
                postSlots: true
            }
        });

        // If it doesn't exist, create it
        if (!plan) {
            plan = await prisma.weekPlan.create({
                data: {
                    year,
                    week,
                    status: "draft"
                },
                include: {
                    postSlots: true
                }
            });
        }

        return NextResponse.json({ plan });
    } catch (error) {
        console.error("Error creating/fetching week plan:", error);
        return NextResponse.json({ error: "Failed to create/fetch week plan." }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const yearStr = searchParams.get("year");
        const weekStr = searchParams.get("week");

        if (!yearStr || !weekStr) {
            return NextResponse.json({ error: "Year and week parameters are required." }, { status: 400 });
        }

        const year = parseInt(yearStr, 10);
        const week = parseInt(weekStr, 10);

        const plan = await prisma.weekPlan.findUnique({
            where: {
                year_week: { year, week }
            },
            include: {
                postSlots: {
                    include: {
                        images: true
                    }
                }
            }
        });

        if (!plan) {
            return NextResponse.json({ exists: false, status: null });
        }

        let finalizedSlots = undefined;
        if (plan.status === "finalized") {
            finalizedSlots = plan.postSlots.map(slot => {
                const imageToDisplay = slot.images.length > 0 ? slot.images[0] : null;
                return {
                    id: slot.id,
                    category: slot.category,
                    content: slot.selectedContent || "",
                    imageUrl: imageToDisplay ? imageToDisplay.url : null
                };
            });
        }

        return NextResponse.json({
            exists: true,
            planId: plan.id,
            status: plan.status,
            slots: finalizedSlots
        });
    } catch (error) {
        console.error("Error fetching week plan context:", error);
        return NextResponse.json({ error: "Failed to fetch week plan context." }, { status: 500 });
    }
}
