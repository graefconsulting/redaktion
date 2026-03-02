import { Job } from 'pg-boss';
import { prisma } from '@/lib/db';
import { openRouterChat } from '@/lib/openRouter';
import { getQueue } from '@/lib/queue';

interface GenerateImageIdeasPayload {
    taskId: string;
    weekPlanId: string;
    postSlotId: string;
    category: string;
    userInstruction: string;
    briefing: string;
    content: string;
    targetAudience: string;
}

export async function processGenerateImageIdeas(jobs: Job<GenerateImageIdeasPayload>[]) {
    const job = jobs[0];
    if (!job) return;
    const { taskId, category, userInstruction, briefing, content, targetAudience } = job.data;

    try {
        // 1. Mark task as running
        await prisma.task.update({
            where: { id: taskId },
            data: { status: 'running', startedAt: new Date() }
        });

        // 2. Build the prompt for Gemini
        // We want 3 distinct visual ideas based on the text.
        const systemPrompt = `Du bist ein Creative Director und Art Buyer für Health-Rise.
Deine Aufgabe ist es, 3 komplett unterschiedliche, aber hochgradig passende rein visuelle Bild-Ideen für einen Social Media Post zu entwickeln.

ZIELGRUPPE: ${targetAudience}

KONTEXT DES POSTS:
Kategorie: ${category}
Briefing/Thema: ${briefing}
Finaler Text des Posts: ${content}
Spezifische User-Anweisung (falls vorhanden): ${userInstruction}

ANFORDERUNGEN AN DIE BILDER:
- Entwickle 3 VÖLLIG UNTERSCHIEDLICHE visuelle Konzepte. 
- Variante 1: Eher generisch, nah am Text, klassisches Stock-Motiv
- Variante 2: Etwas abstrakter, metaphorischer oder emotionaler
- Variante 3: Überraschend, "Out-of-the-Box" oder sehr spezifisch auf ein Detail fokussiert
- WICHTIG: Erstelle die Beschreibungen zwingend in ENGLISCHER Sprache (English), da sie an einen Bild-Generator geschickt werden, der nur englische Text-zu-Bild-Prompts versteht.
- Der Name der Variante ("variantName") und das Konzept ("concept") können auf Deutsch bleiben, aber die "description" MUSS auf Englisch sein.

WICHTIG: Antworte AUSSCHLIESSLICH mit einem validen JSON-Array in genau dieser Struktur:
[
  {
    "variantName": "Generisch & Klar",
    "concept": "Ein kurzes Konzept (1 Satz, warum dieses Bild passt)",
    "description": "Precise description of the image in ENGLISH (content, mood, colors, perspective...)"
  },
  ...
]
`;

        // 3. Call Gemini (via OpenRouter or native)
        console.log(`[Task ${taskId}] Generating image ideas with Gemini...`);

        const jsonResponse = await openRouterChat(
            systemPrompt,
            "Generiere exakt 3 unterschiedliche Bildideen im JSON Format.",
            {
                model: "google/gemini-3-flash-preview",
                temperature: 0.7 // Enough creativity for diverse variants
            }
        );

        // 4. Save result
        await prisma.task.update({
            where: { id: taskId },
            data: {
                status: 'success',
                resultJson: jsonResponse,
                durationMs: 0 // Could calculate actual duration
            }
        });

        console.log(`[Task ${taskId}] Image ideas generation complete.`);

    } catch (error: any) {
        console.error(`[Task ${taskId}] Failed to generate image ideas:`, error);
        await prisma.task.update({
            where: { id: taskId },
            data: {
                status: 'failed',
                errorMessage: error.message || 'Unknown error'
            }
        });
        throw error; // Let pg-boss retry if configured
    }
}

let imageWorkerStarted = false;

export async function startImageWorker() {
    if (imageWorkerStarted) return;
    const boss = await getQueue();
    if (!boss) {
        console.warn("Could not get pg-boss queue for image ideas.");
        return;
    }

    await boss.createQueue('generate-image-ideas');
    await boss.work('generate-image-ideas', processGenerateImageIdeas);
    console.log("Registered worker for 'generate-image-ideas'");
    imageWorkerStarted = true;
}
