import { prisma } from "./db";

type OpenRouterMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

export async function callOpenRouter(
    messages: OpenRouterMessage[],
    model: string = "perplexity/sonar-pro",
    logMetadata?: {
        relatedWeekId?: string;
        relatedPostId?: string;
        step?: string;
        promptTemplateId?: string;
    }
) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is not configured.");
    }

    const startTime = Date.now();

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": process.env.APP_BASE_URL || "http://localhost:3000",
                "X-Title": "Health Rise Redaktionsplaner",
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenRouter API Error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const durationMs = Date.now() - startTime;
        const aiOutput = data.choices[0]?.message?.content || "";

        // Parse tokens and estimate cost (OpenRouter sometimes provides cost, else we just log tokens)
        const promptTokens = data.usage?.prompt_tokens || 0;
        const completionTokens = data.usage?.completion_tokens || 0;
        const totalTokens = data.usage?.total_tokens || 0;

        // Log the API call to database
        const finalPromptSent = messages.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join("\n\n");

        // We do this in the background, not blocking the return
        Promise.all([
            prisma.llmCallLog.create({
                data: {
                    provider: "openrouter",
                    model: model,
                    finalPromptSent: finalPromptSent,
                    inputs: JSON.stringify(messages),
                    fullOutput: aiOutput,
                    durationMs: durationMs,
                    relatedWeekId: logMetadata?.relatedWeekId,
                    relatedPostId: logMetadata?.relatedPostId,
                    step: logMetadata?.step,
                    promptTemplateId: logMetadata?.promptTemplateId,
                }
            }).then(logEntry => {
                return prisma.usageCost.create({
                    data: {
                        provider: "openrouter",
                        model: model,
                        promptTokens,
                        completionTokens,
                        totalTokens,
                        llmCallLogId: logEntry.id
                    }
                });
            })
        ]).catch((e: unknown) => console.error("Failed to log LLM call to DB:", e));

        return {
            content: aiOutput,
            durationMs,
            usage: data.usage
        };

    } catch (error) {
        console.error("OpenRouter Call Failed:", error);
        throw error;
    }
}

/**
 * Convenience helper for simple system + user prompts.
 * Automatically strips Markdown code block formatting from the response.
 */
export async function openRouterChat(
    systemPrompt: string,
    userPrompt: string,
    options?: {
        model?: string;
        logMetadata?: any;
        temperature?: number;
    }
): Promise<string> {
    const messages: OpenRouterMessage[] = [];
    if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userPrompt });

    // Assuming we can pass temperature to callOpenRouter in the future, 
    // but right now callOpenRouter doesn't take temperature. We'll ignore it or add it later.
    const res = await callOpenRouter(messages, options?.model, options?.logMetadata);

    // Clean markdown code blocks from JSON output
    let result = res.content.trim();
    const jsonMatch = result.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
        result = jsonMatch[0];
    }
    return result;
}
