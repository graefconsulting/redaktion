import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { openRouterChat } from '@/lib/openRouter';

export const dynamic = 'force-dynamic';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: weekPlanId } = await params;
        const body = await req.json();
        const { postSlotId, reworkInstruction } = body;

        if (!postSlotId || !reworkInstruction) {
            return NextResponse.json({ error: "postSlotId and reworkInstruction are required" }, { status: 400 });
        }

        // Verify week plan and slot
        const plan = await prisma.weekPlan.findUnique({
            where: { id: weekPlanId }
        });
        if (!plan) return NextResponse.json({ error: "WeekPlan not found" }, { status: 404 });

        const slot = await prisma.postSlot.findUnique({
            where: { id: postSlotId }
        });
        if (!slot) return NextResponse.json({ error: "PostSlot not found" }, { status: 404 });

        const currentContent = slot.selectedContent || "";

        // Fetch BrandConfig for context
        const brand = await prisma.brandConfig.findFirst({ where: { isPublished: true } });
        let brandContext = "";
        if (brand) {
            brandContext = `
WICHTIGE MARKEN-RICHTLINIEN:
- Tone & Voice: ${brand.toneAndVoice || 'Nicht definiert'}
- Do's & Don'ts: ${brand.doAndDont || 'Nicht definiert'}
- Zielgruppe: ${brand.targetAudience || 'Nicht definiert'}
`;
        }

        // We do a synchronous LLM call for the rework (since it's a quick text adjustment)
        const prompt = `
Du bist ein professioneller Social-Media-Manager. 
Hier ist ein bestehender Social-Media-Post für Facebook:
---
${currentContent}
---

Der Benutzer wünscht folgende Überarbeitung an diesem Post:
---
${reworkInstruction}
---

${brandContext}

Bitte schreibe den Post basierend auf diesem Änderungswunsch um. 
Gib NUR den neuen, fertigen Post-Text aus, keine weiteren Erklärungen. 
Die Ausgabe MUSS direkt auf Facebook kopierbar sein.
`;

        const newText = await openRouterChat(prompt, "", { model: "anthropic/claude-3-5-sonnet-20241022" }); // or another fast model

        if (!newText || newText.trim().length === 0) {
            throw new Error("LLM returned empty text");
        }

        // Clean up output a bit
        let cleanedText = newText.trim();
        if (cleanedText.startsWith('"') && cleanedText.endsWith('"')) {
            cleanedText = cleanedText.slice(1, -1);
        }

        // Update the slot directly with the new text
        await prisma.postSlot.update({
            where: { id: postSlotId },
            data: { selectedContent: cleanedText }
        });

        return NextResponse.json({ success: true, newContent: cleanedText });

    } catch (error) {
        console.error("Error in inline text rework:", error);
        return NextResponse.json({ error: "Fehler bei der Textüberarbeitung." }, { status: 500 });
    }
}
