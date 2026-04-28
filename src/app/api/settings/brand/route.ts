import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
    try {
        const brand = await prisma.brandConfig.findFirst({
            where: { isPublished: true },
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({ brand });
    } catch (error) {
        console.error("Error fetching BrandConfig:", error);
        return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const existing = await prisma.brandConfig.findFirst({
            where: { isPublished: true },
            orderBy: { createdAt: "desc" },
        });

        const data = {
            toneAndVoice: body.toneAndVoice ?? null,
            doAndDont: body.doAndDont ?? null,
            visualGuidelines: body.visualGuidelines ?? null,
            salesIntensity: body.salesIntensity ?? null,
            targetAudience: body.targetAudience ?? null,
            optionalFocus: body.optionalFocus ?? null,
            ctaGuidelines: body.ctaGuidelines ?? null,
            versionReason: body.versionReason || "Manuell bearbeitet",
        };

        const brand = existing
            ? await prisma.brandConfig.update({ where: { id: existing.id }, data })
            : await prisma.brandConfig.create({ data: { ...data, isPublished: true } });

        return NextResponse.json({ brand });
    } catch (error) {
        console.error("Error saving BrandConfig:", error);
        return NextResponse.json({ error: "Fehler beim Speichern" }, { status: 500 });
    }
}
