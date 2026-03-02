import { prisma } from './db';
import fs from 'fs';
import path from 'path';

/**
 * Runs cleanup for a finalized WeekPlan.
 * - Deletes tasks associated with deleted slots
 * - Deletes unused ImageAssets and their files
 */
export async function triggerCleanup(weekPlanId: string) {
    console.log(`[CLEANUP] Starting cleanup for finalized WeekPlan: ${weekPlanId}`);

    try {
        // 1. Find the remaining valid PostSlots for this week
        const validSlots = await prisma.postSlot.findMany({
            where: { weekPlanId: weekPlanId },
            include: { images: true }
        });
        const validSlotIds = validSlots.map(s => s.id);

        // 2. Cleanup Tasks
        // Finalized weeks do not need Tasks. The selected content is already 
        // saved in PostSlot. Deleting tasks removes all unused JSON variants.
        const allTasks = await prisma.task.findMany({
            where: { relatedWeekId: weekPlanId }
        });

        if (allTasks.length > 0) {
            await prisma.task.deleteMany({
                where: { id: { in: allTasks.map(t => t.id) } }
            });
            console.log(`[CLEANUP] Deleted ${allTasks.length} tasks (wiped variants).`);
        }

        // Also cleanup LlmCallLogs to truly free up DB space and wipe variants
        const allLogs = await prisma.llmCallLog.findMany({
            where: { relatedWeekId: weekPlanId }
        });
        if (allLogs.length > 0) {
            await prisma.llmCallLog.deleteMany({
                where: { id: { in: allLogs.map(l => l.id) } }
            });
            console.log(`[CLEANUP] Deleted ${allLogs.length} LLM Call Logs.`);
        }

        // 3. Cleanup unused images for VALID slots
        // Ensure each valid slot only keeps exactly ONE image (the latest or existing one)
        let deletedFilesCount = 0;
        const basePath = path.join(process.cwd(), 'public');

        for (const slot of validSlots) {
            if (slot.images.length > 1) {
                // Keep the first one, delete the rest
                const [keepImg, ...deleteImgs] = slot.images;
                for (const img of deleteImgs) {
                    if (img.url.startsWith('/uploads/')) {
                        const filePath = path.join(basePath, img.url);
                        try {
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                                deletedFilesCount++;
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
                await prisma.imageAsset.deleteMany({
                    where: { id: { in: deleteImgs.map(i => i.id) } }
                });
            }
        }

        // 4. Cleanup orphaned images (from rejected slots, already deleted)

        const unlinkedImages = await prisma.imageAsset.findMany({
            where: { postSlotId: null }
        });

        for (const img of unlinkedImages) {
            if (img.url.startsWith('/uploads/')) {
                const filePath = path.join(basePath, img.url);
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        deletedFilesCount++;
                    }
                } catch (e) {
                    console.error(`[CLEANUP] Failed to delete file ${filePath}`, e);
                }
            }
        }

        if (unlinkedImages.length > 0) {
            await prisma.imageAsset.deleteMany({
                where: { id: { in: unlinkedImages.map(i => i.id) } }
            });
            console.log(`[CLEANUP] Deleted ${unlinkedImages.length} unlinked ImageAssets from DB, and ${deletedFilesCount} files from disk.`);
        }

        console.log(`[CLEANUP] Cleanup for WeekPlan ${weekPlanId} finished successfully.`);

    } catch (error) {
        console.error(`[CLEANUP] Error during cleanup for WeekPlan ${weekPlanId}:`, error);
    }
}
