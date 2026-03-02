import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
    try {
        // Check if we can connect to the database
        await prisma.$queryRaw`SELECT 1`;

        return NextResponse.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            database: "connected"
        });
    } catch (error) {
        console.error("Health check failed:", error);
        return NextResponse.json({
            status: "error",
            timestamp: new Date().toISOString(),
            database: "disconnected",
            message: error instanceof Error ? error.message : "Unknown error"
        }, { status: 503 });
    } finally {
        // In serverless/edge environments, prisma connects automatically per request
        // but standard Next.js dev server keeps it alive.
    }
}
