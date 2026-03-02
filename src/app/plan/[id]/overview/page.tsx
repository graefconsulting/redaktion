import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import OverviewClient from "./OverviewClient";

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const plan = await prisma.weekPlan.findUnique({
        where: { id },
        include: {
            postSlots: {
                include: {
                    images: true
                }
            }
        }
    });

    if (!plan) return notFound();

    // Map postSlots to a plain serializable object for the client component
    const mappedSlots = plan.postSlots.map(slot => {
        // Find the selected/last successful image to display
        // Since we only generate one image currently per prompt (after phase 7 select), 
        // we can just pick the first valid image asset for the slot.
        const imageToDisplay = slot.images.length > 0 ? slot.images[0] : null;

        return {
            id: slot.id,
            category: slot.category,
            content: slot.selectedContent || "",
            imagePrompt: slot.selectedImagePrompt || "",
            weekday: slot.weekday || "",
            imageUrl: imageToDisplay ? imageToDisplay.url : null,
            imageId: imageToDisplay ? imageToDisplay.id : null,
        };
    });

    return (
        <OverviewClient
            weekPlan={{ year: plan.year, week: plan.week }}
            weekPlanId={id}
            initialSlots={mappedSlots}
            isFinalized={plan.status === "finalized"}
        />
    );
}
