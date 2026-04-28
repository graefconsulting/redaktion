import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
    try {
        const templates = await prisma.promptTemplate.findMany({
            where: { isPublished: true },
            orderBy: { templateType: "asc" },
        });
        return NextResponse.json({ templates });
    } catch (error) {
        console.error("Error fetching PromptTemplates:", error);
        return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const { templateType, content, versionReason } = body;

        if (!templateType || !content) {
            return NextResponse.json({ error: "templateType und content sind erforderlich" }, { status: 400 });
        }

        const existing = await prisma.promptTemplate.findFirst({
            where: { templateType, isPublished: true },
        });

        const template = existing
            ? await prisma.promptTemplate.update({
                where: { id: existing.id },
                data: { content, versionReason: versionReason || "Manuell bearbeitet" },
            })
            : await prisma.promptTemplate.create({
                data: {
                    isPublished: true,
                    templateType,
                    content,
                    versionReason: versionReason || "Erstellt",
                },
            });

        return NextResponse.json({ template });
    } catch (error) {
        console.error("Error saving PromptTemplate:", error);
        return NextResponse.json({ error: "Fehler beim Speichern" }, { status: 500 });
    }
}
