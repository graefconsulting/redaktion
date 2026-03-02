import { getQueue } from "@/lib/queue";
import type { Job } from 'pg-boss';
import { prisma } from "@/lib/db";
import { callOpenRouter } from "@/lib/openRouter";

export async function startWorker() {
    const queue = await getQueue();

    console.log("Starting Research Queue Worker...");

    // In pg-boss >= 9, queues must be created explicitly before we can use them
    await queue.createQueue('generate-research');

    await queue.work('generate-research', async (jobs: Job<unknown>[]) => {
        // Process single job (pg-boss parses payload automatically)
        for (const job of jobs) {
            const { taskId, weekPlanId, category, targetAudience, weekNumber, customHint } = job.data as {
                taskId: string;
                weekPlanId: string;
                category: string;
                targetAudience: string;
                weekNumber: number;
                customHint?: string;
            };

            try {
                // 1. Mark task as running
                await prisma.task.update({
                    where: { id: taskId },
                    data: { status: "running", startedAt: new Date(), attemptCount: { increment: 1 } }
                });

                // 2. Determine prompt template based on category
                const templateType = category === "Saisonalität" ? "research_seasonal" : "research_general";

                const template = await prisma.promptTemplate.findFirst({
                    where: { templateType, isPublished: true }
                });

                if (!template) throw new Error(`Active PromptTemplate ${templateType} not found`);

                // 3. Inject variables
                let promptStr = template.content
                    .replace("{{targetAudience}}", targetAudience || "Gesundheitsbewusste Menschen")
                    .replace("{{category}}", category);

                if (templateType === "research_seasonal") {
                    promptStr = promptStr.replace("{{weekNumber}}", weekNumber.toString());
                }

                if (customHint) {
                    promptStr += `\n\nZusätzlicher Hinweis / Spezifische Anforderung für diese Suche:\n${customHint}`;
                }

                // 4. Call OpenRouter
                const systemPrompt = `You are a professional social media researcher and content planner.
Respond ONLY with valid JSON. No intro text, no markdown block ticks, no code blocks, no explanation outside the JSON.
Return exactly 4 topics.
Each title must be concise (max. 8 words).
Each description must be one sentence (max. 20 words) explaining why this topic is relevant for the specific calendar week.
The expected JSON format is:
{
  "category": "${category}",
  "topics": [
    {
      "title": "Kurzer Titel des Themas (max. 8 Wörter)",
      "description": "Eine Satz Beschreibung, warum dieses Thema diese Woche relevant ist (max. 20 Wörter)."
    }
  ]
}`;

                const result = await callOpenRouter(
                    [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: promptStr }
                    ],
                    "perplexity/sonar-pro-search",
                    {
                        relatedWeekId: weekPlanId,
                        step: `research_${category}`,
                        promptTemplateId: template.id
                    }
                );

                let aiResponse = result.content.trim();
                // Strip markdown wrappers if they exist despite instruction
                if (aiResponse.startsWith("```json")) {
                    aiResponse = aiResponse.substring(7);
                    if (aiResponse.endsWith("```")) {
                        aiResponse = aiResponse.substring(0, aiResponse.length - 3);
                    }
                } else if (aiResponse.startsWith("```")) {
                    aiResponse = aiResponse.substring(3);
                    if (aiResponse.endsWith("```")) {
                        aiResponse = aiResponse.substring(0, aiResponse.length - 3);
                    }
                }
                aiResponse = aiResponse.trim();

                // Validate JSON parsing
                try {
                    JSON.parse(aiResponse);
                } catch (e) {
                    throw new Error("AI returned invalid JSON: " + result.content);
                }

                // 5. Save results to Task
                await prisma.task.update({
                    where: { id: taskId },
                    data: {
                        status: "success",
                        finishedAt: new Date(),
                        resultJson: aiResponse,
                        durationMs: result.durationMs
                    }
                });

                console.log(`[Worker] Successfully completed research for category: ${category}`);

            } catch (error: unknown) {
                console.error(`[Worker] Error in generate-research:`, error);
                await prisma.task.update({
                    where: { id: taskId },
                    data: {
                        status: "failed",
                        finishedAt: new Date(),
                        errorMessage: error instanceof Error ? error.message : "Unknown error"
                    }
                });
                throw error; // Let pg-boss handle retry rules if configured
            }
        }
    });
}

