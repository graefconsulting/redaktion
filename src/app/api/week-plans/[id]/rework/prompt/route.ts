import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { openRouterChat } from '@/lib/openRouter';
import { getQueue } from '@/lib/queue';

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

        const slot = await prisma.postSlot.findUnique({
            where: { id: postSlotId }
        });
        if (!slot) return NextResponse.json({ error: "PostSlot not found" }, { status: 404 });

        const currentPrompt = slot.selectedImagePrompt || "";
        const currentContent = slot.selectedContent || "";

        // 1. Generate new Prompt via LLM synchronously (it's fast)
        const sysPrompt = `
Du bist ein Midjourney/Bildgenerierungs-Experte.
Hier ist der derzeite Bild-Prompt (in Englisch):
---
${currentPrompt}
---
Der aktuelle Social-Media-Text dazu lautet (als Kontext):
---
${currentContent}
---

Der Nutzer hat nun folgenden Änderungswunsch für das Bild:
---
${reworkInstruction}
---

Bitte passe den Prompt entsprechend an. Schreibe einen hoch-optimierten, detaillierten englischen Prompt für einen AI-Bildgenerator.
Gib NUR den Text des neuen Prompts aus, keine Erklärungen. Keine Anführungszeichen drum herum.
`;

        const newPromptMsg = await openRouterChat(sysPrompt, "", { model: "openai/gpt-4o-mini" });

        let newPrompt = newPromptMsg.trim();
        if (newPrompt.startsWith('"') && newPrompt.endsWith('"')) {
            newPrompt = newPrompt.slice(1, -1);
        }

        // 2. Save new prompt to database
        await prisma.postSlot.update({
            where: { id: postSlotId },
            data: { selectedImagePrompt: newPrompt }
        });

        // 3. Create a new image_render task
        const newTask = await prisma.task.create({
            data: {
                type: "image_render",
                relatedWeekId: weekPlanId,
                relatedPostId: postSlotId,
                status: "queued",
                payload: JSON.stringify({
                    prompt: newPrompt,
                    model: slot.imageModel || "nano-banana"
                })
            }
        });

        // 4. Enqueue to generation worker
        const boss = await getQueue();
        await boss.send('generate-image-renders', { taskId: newTask.id });

        return NextResponse.json({ success: true, taskId: newTask.id, newPrompt });

    } catch (error) {
        console.error("Error in inline image prompt rework:", error);
        return NextResponse.json({ error: "Fehler bei der Bildüberarbeitung." }, { status: 500 });
    }
}
