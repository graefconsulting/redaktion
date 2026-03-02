import { getQueue } from "@/lib/queue";
import type { Job } from 'pg-boss';
import { prisma } from "@/lib/db";
import { callOpenRouter } from "@/lib/openRouter";

export async function startBriefingWorker() {
    const queue = await getQueue();

    console.log("Starting Briefing Queue Worker...");

    await queue.createQueue('generate-briefing');

    await queue.work('generate-briefing', async (jobs: Job<unknown>[]) => {
        for (const job of jobs) {
            const { taskId, weekPlanId, postSlotId, topicTitle, topicDescription, category, globalHints } = job.data as {
                taskId: string;
                weekPlanId: string;
                postSlotId: string;
                topicTitle: string;
                topicDescription: string;
                category: string;
                globalHints?: string;
            };

            try {
                // 1. Mark task as running
                await prisma.task.update({
                    where: { id: taskId },
                    data: { status: "running", startedAt: new Date(), attemptCount: { increment: 1 } }
                });

                // 2. Fetch Brand Rules
                const brand = await prisma.brandConfig.findFirst({
                    where: { isPublished: true },
                    orderBy: { createdAt: 'desc' }
                });

                // 3. Fetch Prompt Template
                const template = await prisma.promptTemplate.findFirst({
                    where: { templateType: "briefing_generation", isPublished: true }
                });

                if (!template) throw new Error(`Active PromptTemplate briefing_generation not found`);

                // 4. Construct the prompt
                const basePrompt = template.content
                    .replace("{{topic}}", `${topicTitle} - ${topicDescription}`)
                    .replace("{{toneAndVoice}}", brand?.toneAndVoice || "")
                    .replace("{{doAndDont}}", brand?.doAndDont || "")
                    .replace("{{productInfo}}", "TBD"); // Products come later in the content phase

                const currentHints = globalHints ? `\n\nZusätzliche Wochen-Hinweise: ${globalHints}` : "";

                const finalPrompt = basePrompt + currentHints;

                const systemPrompt = `You are a professional social media strategist.
Respond ONLY with valid JSON. No intro text, no markdown block ticks, no explanation outside the JSON.
You must generate exactly 3 distinct, high-quality briefing variants for this topic (e.g., Myth-busting, Educational, Story-driven, etc.).
The expected JSON format is:
{
  "variants": [
    {
      "angle": "Kurze Bezeichnung des Winkels (z.B. Myth-busting)",
      "briefingText": "Detaillierter Text des Briefings in 3-4 Sätzen."
    }
  ]
}`;

                // 5. Call OpenRouter
                const result = await callOpenRouter(
                    [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: finalPrompt }
                    ],
                    "anthropic/claude-sonnet-4.6",
                    {
                        relatedWeekId: weekPlanId,
                        relatedPostId: postSlotId,
                        step: `briefing_${category}`,
                        promptTemplateId: template.id
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
                    console.error("Failed to parse JSON. Raw AI response was:", aiResponse);
                    throw new Error("AI returned invalid JSON: " + aiResponse.substring(0, 100) + "...");
                }

                // 6. Save results to Task
                await prisma.task.update({
                    where: { id: taskId },
                    data: {
                        status: "success",
                        finishedAt: new Date(),
                        resultJson: aiResponse,
                        durationMs: result.durationMs
                    }
                });

                console.log(`[Worker] Successfully generated 3 briefing variants for slot: ${postSlotId}`);

            } catch (error: unknown) {
                console.error(`[Worker] Error in generate-briefing:`, error);
                await prisma.task.update({
                    where: { id: taskId },
                    data: {
                        status: "failed",
                        finishedAt: new Date(),
                        errorMessage: error instanceof Error ? error.message : "Unknown error"
                    }
                });
                throw error;
            }
        }
    });
}
