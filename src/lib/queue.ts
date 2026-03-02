import { PgBoss, SendOptions } from 'pg-boss';

const boss = new PgBoss(process.env.DATABASE_URL!);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
boss.on('error', (error: any) => console.error('pg-boss error:', error));

let isStarted = false;

export async function getQueue() {
    if (!isStarted) {
        await boss.start();
        isStarted = true;
        console.log("pg-boss started successfully");
    }
    return boss;
}

// Helper generic function for adding tasks
export async function enqueueTask<T extends object>(queueName: string, data: T, options?: SendOptions) {
    const queue = await getQueue();
    // Ensure queue exists to prevent 'Queue does not exist' errors
    await queue.createQueue(queueName);
    const jobId = await queue.send(queueName, data, options);
    return jobId;
}
