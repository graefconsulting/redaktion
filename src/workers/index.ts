import { getQueue } from "@/lib/queue";

// This is a minimal wrapper.
// In a real production environment outside of this local dev setup, 
// you would run a separate Node process. For this Next.js MVP,
// we initialize it once when the app starts up.
let workerStarted = false;

export async function initBackgroundWorkers() {
    if (workerStarted) return;

    if (process.env.NODE_ENV !== "test") {
        try {
            // Lazy load to avoid module resolution loops during build
            const { startWorker: startResearch } = await import("./researchWorker");
            const { startBriefingWorker } = await import("./briefingWorker");
            const { startContentWorker } = await import("./contentWorker");
            const { startImageWorker } = await import("./imageWorker");
            const { startRenderWorker } = await import("./renderWorker");
            await startResearch();
            await startBriefingWorker();
            await startContentWorker();
            await startImageWorker();
            await startRenderWorker();
            workerStarted = true;
            console.log("Background workers initialized (Next.js context)");
        } catch (e) {
            console.error("Failed to start background workers:", e);
        }
    }
}
