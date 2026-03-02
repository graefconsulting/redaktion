import { prisma } from "./db";

type KieTaskInput = {
    prompt: string;
    image_urls?: string[]; // for nano-banana-edit
    image_input?: string[]; // for nano-banana-pro
    output_format?: string;
    image_size?: string; // used by nano-banana-edit
    aspect_ratio?: string; // used by nano-banana-pro
    resolution?: string; // used by nano-banana-pro
};

type KieGenerationParams = {
    model: string;
    callBackUrl?: string;
    input: KieTaskInput;
};

export async function createKieTask(
    params: KieGenerationParams
) {
    const apiKey = process.env.KIEAI_API_KEY;
    if (!apiKey) {
        throw new Error("KIEAI_API_KEY is not configured.");
    }

    try {
        const response = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(params),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Kie API Error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        if (data.code !== 200) {
            throw new Error(`Kie API Error: ${data.message} ${JSON.stringify(data)}`);
        }

        return data.data.taskId as string;
    } catch (error) {
        console.error("Kie API Call Failed:", error);
        throw error;
    }
}

export async function queryKieTask(taskId: string) {
    const apiKey = process.env.KIEAI_API_KEY;
    if (!apiKey) {
        throw new Error("KIEAI_API_KEY is not configured.");
    }

    try {
        const response = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Kie API Error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        if (data.code !== 200) {
            throw new Error(`Kie API Error: ${data.message} ${JSON.stringify(data)}`);
        }

        // Return standard structure for background worker checks
        return {
            state: data.data.state, // 'waiting', 'queuing', 'generating', 'success', 'fail'
            resultUrls: data.data.resultJson ? JSON.parse(data.data.resultJson).resultUrls : null,
            failMsg: data.data.failMsg,
            costTime: data.data.costTime
        };
    } catch (error) {
        console.error("Kie API Query Failed:", error);
        throw error;
    }
}
