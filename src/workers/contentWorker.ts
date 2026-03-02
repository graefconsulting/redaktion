import { Job } from 'pg-boss';
import { getQueue } from '@/lib/queue';
import { prisma } from '@/lib/db';
import { callOpenRouter } from '@/lib/openRouter';

export async function startContentWorker() {
    const queue = await getQueue();

    await queue.work('generate-content', async (jobs: Job<unknown>[]) => {
        // Process single job (pg-boss parses payload automatically)
        for (const job of jobs) {
            const { taskId, weekPlanId, postSlotId, topicTitle, category, globalHints, briefing } = job.data as {
                taskId: string;
                weekPlanId: string;
                postSlotId: string;
                topicTitle: string;
                category: string;
                globalHints?: string;
                briefing: string;
                customHint?: string;
            };

            try {
                // 1. Mark task running
                await prisma.task.update({
                    where: { id: taskId },
                    data: { status: "running" }
                });

                // 2. Fetch Brand Rules
                const brand = await prisma.brandConfig.findFirst({
                    where: { isPublished: true }
                });

                // 3. Construct Prompt
                // The prompt forces the LLM to output exactly 3 variants with different tones/emojis.
                // 1. Professional/Informative (No Emojis)
                // 2. Engaging/Community-focused (Moderate Emojis)
                // 3. Provocative/Attention-grabbing (Heavy/Appropriate Emojis)

                let systemPrompt = `Du bist ein hochkarätiger Social Media Texter und Content Creator.
Antworte AUSSCHLIESSLICH mit gültigem JSON. Kein Intro-Text, keine Markdown-Blöcke (\`\`\`), keine Erklärungen außerhalb des JSON.
Das JSON-Format MUSS exakt so aussehen:
{
  "variants": [
    {
      "tone": "Name der Tonalität (z.B. 'Professionell & Informativ (Keine Emojis)')",
      "content": "Der finale Social Media Post Text..."
    }
  ]
}

- Generiere EXAKT 3 Varianten für den Post.
- Variante 1: Tonalität Professionell & Informativ. Nutze KEINE Emojis.
- Variante 2: Tonalität Aktivierend & Community-nah. Nutze WENIG bis MITTEL Emojis (passend platziert).
- Variante 3: Tonalität Emotional & Aufmerksamkeitsstark. Nutze VIELE passende Emojis.
- Schreibe für die gewählte Zielgruppe. Nutze sinnvolle Hashtags und immer einen Call-to-Action.`;

                let promptStr = `Erstelle einen Social Media Post aus dem folgenden Briefing.

Thema: ${topicTitle}
Kategorie: ${category}
Zielgruppe: ${brand?.targetAudience || "Gesundheitsbewusst"}
Marken-Regeln (Tone & Voice): ${brand?.toneAndVoice || "Keine spezifizierten Vorgaben"}
Marken-Regeln (Do & Don't): ${brand?.doAndDont || "Keine spezifizierten Vorgaben"}

Das finale Briefing (Konzept/Angle):
${briefing}
`;
                if (globalHints) {
                    promptStr += `\nÜbergreifende Vorgaben/Hinweise:\n${globalHints}\n`;
                }

                // Add specific custom hint if requested for regeneration
                if (job.data && (job.data as any).customHint) {
                    promptStr += `\nSpezifische Anforderung für diese Neu-Generierung:\n${(job.data as any).customHint}\n`;
                }

                // 4. Call OpenRouter using Claude 4.6 Sonnet
                const result = await callOpenRouter(
                    [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: promptStr }
                    ],
                    "anthropic/claude-sonnet-4.6",
                    {
                        relatedWeekId: weekPlanId,
                        relatedPostId: postSlotId,
                        step: `content_${category}`,
                    }
                );

                let aiResponse = result.content.trim();

                // Robust JSON extraction
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
                if (jsonMatch) {
                    aiResponse = jsonMatch[0];
                }

                // Validate JSON parsing
                try {
                    JSON.parse(aiResponse);
                } catch (e) {
                    console.error("Failed to parse JSON for Content. Raw AI response was:", aiResponse);
                    throw new Error("AI returned invalid JSON: " + aiResponse.substring(0, 100) + "...");
                }

                // 5. Save Result
                await prisma.task.update({
                    where: { id: taskId },
                    data: {
                        status: "success",
                        resultJson: aiResponse
                    }
                });

            } catch (error: any) {
                console.error("Worker generic error:", error);
                await prisma.task.update({
                    where: { id: taskId },
                    data: {
                        status: "failed",
                        errorMessage: error.message || "Unbekannter Fehler",
                        // Optional: Store partial text if you want it visible
                        // resultJson: error.message
                    }
                });
            }
        }
    });
}
