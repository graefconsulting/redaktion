import { getQueue } from "@/lib/queue";
import { prisma } from "@/lib/db";
import { createKieTask, queryKieTask } from "@/lib/kieApi";

import { PgBoss } from "pg-boss";

export async function startRenderWorker() {
    const queueName = 'generate-image-renders';
    console.log(`[Worker] Initializing worker for queue: ${queueName}`);

    const boss = await getQueue(); // await getQueue()
    await boss.createQueue(queueName);
    console.log(`[Worker] Queue ${queueName} created on pg-boss`);

    await boss.work(queueName, async (jobs: any[]) => {
        const job = jobs[0];
        if (!job) return;
        const { taskId } = job.data as { taskId: string };
        console.log(`[Worker] Processing generate-image-renders for generic Task ID: ${taskId}`);

        try {
            // 1. Fetch our local Task and PostSlot
            const task = await prisma.task.findUnique({
                where: { id: taskId }
            });

            if (!task || !task.relatedPostId) {
                console.error(`Task or relatedPostId not found for task ${taskId}`);
                return;
            }

            const slot = await prisma.postSlot.findUnique({
                where: { id: task.relatedPostId }
            });

            if (!slot) {
                console.error(`PostSlot not found for task ${taskId}`);
                return;
            }

            // 2. Mark task as running
            await prisma.task.update({
                where: { id: taskId },
                data: {
                    status: 'running',
                    startedAt: new Date(),
                    attemptCount: { increment: 1 }
                }
            });

            // 3. Prepare parameters for Kie.ai based on selected model
            let modelId = 'google/nano-banana';
            if (slot.imageModel === 'nano-banana-pro') {
                modelId = 'google/nano-banana-pro';
            } else if (slot.imageModel === 'nano-banana') {
                modelId = slot.referenceImageUrl ? 'google/nano-banana-edit' : 'google/nano-banana';
            }

            let prompt = slot.selectedImagePrompt || '';

            // Read split prompt from payload if it exists
            if (task.payload) {
                try {
                    const payloadObj = JSON.parse(task.payload);
                    if (payloadObj.prompt) {
                        prompt = payloadObj.prompt;
                    }
                } catch (e) {
                    console.warn(`[Worker] Could not parse payload for task ${taskId}`);
                }
            }

            // Anti Split-Screen Prompt Enforcer
            prompt += "\n\nCRITICAL MUST DO: Create a single, unified scene. Do NOT create split-screens, collages, or multi-panel images.";

            const outputFormat = slot.imageFormat || 'png';

            let inputParams: any = {
                prompt: prompt,
                output_format: outputFormat
            };

            // Nano Banana Pro vs Nano Banana Edit requires slightly different mapping
            if (slot.imageModel === 'nano-banana-pro') {
                inputParams.resolution = slot.imageResolution || '1K';
                inputParams.aspect_ratio = slot.imageSize || '1:1';
                if (slot.referenceImageUrl) {
                    inputParams.image_input = [slot.referenceImageUrl];
                }
            } else {
                // assume nano-banana / nano-banana-edit
                inputParams.image_size = slot.imageSize || '1:1';
                if (slot.referenceImageUrl) {
                    inputParams.image_urls = [slot.referenceImageUrl];
                }
            }

            // 4. Create Task on Kie.ai
            const kieTaskId = await createKieTask({
                model: modelId,
                input: inputParams
            });

            // Save provider job ID to our DB for polling
            await prisma.task.update({
                where: { id: taskId },
                data: { providerJobId: kieTaskId }
            });

            console.log(`[Worker] Started Kie.ai task ${kieTaskId} for local task ${taskId}`);

            // 5. Poll for completion
            let isComplete = false;
            let pollingAttempts = 0;
            const maxPollingAttempts = 60; // 60 * 5s = 5 minutes timeout

            while (!isComplete && pollingAttempts < maxPollingAttempts) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                pollingAttempts++;

                const status = await queryKieTask(kieTaskId);

                if (status === null || status.state === 'fail') {
                    throw new Error(`Kie API task failed or was not found: ${status?.failMsg}`);
                }

                if (status.state === 'success') {
                    isComplete = true;

                    if (status.resultUrls && status.resultUrls.length > 0) {
                        const finalUrl = status.resultUrls[0];

                        // Save ImageAsset
                        await prisma.imageAsset.create({
                            data: {
                                postSlotId: slot.id,
                                url: finalUrl,
                                source: 'kieai'
                            }
                        });

                        // Mark task success
                        await prisma.task.update({
                            where: { id: taskId },
                            data: {
                                status: 'success',
                                finishedAt: new Date(),
                                resultJson: JSON.stringify({ url: finalUrl }),
                                durationMs: status.costTime || null
                            }
                        });
                        console.log(`[Worker] Task ${taskId} completed successfully. Image URL: ${finalUrl}`);
                    } else {
                        throw new Error("Kie API returned success but no resultUrls.");
                    }
                } else if (status.state === 'fail') {
                    throw new Error(`Kie API task failed: ${status.failMsg}`);
                }
                // If waiting, queuing, or generating, just continue polling
            }

            if (!isComplete) {
                throw new Error("Polling timeout reached (5 minutes) while waiting for Kie.ai.");
            }

        } catch (error: any) {
            console.error(`[Worker] Task ${taskId} failed:`, error);
            await prisma.task.update({
                where: { id: taskId },
                data: {
                    status: 'failed',
                    finishedAt: new Date(),
                    errorMessage: error.message || 'Unknown error during image generation render.',
                }
            });
        }
    });

    console.log(`Registered background worker for ${queueName}`);
}
