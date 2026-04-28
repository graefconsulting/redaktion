import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { name, category, shortDescription, usps, productUrl } = body;

        if (!name || !category) {
            return NextResponse.json({ error: "Name und Kategorie sind erforderlich" }, { status: 400 });
        }

        const product = await prisma.product.update({
            where: { id },
            data: {
                name,
                category,
                shortDescription: shortDescription || null,
                usps: usps || null,
                productUrl: productUrl || null,
            },
        });
        return NextResponse.json({ product });
    } catch (error) {
        console.error("Error updating product:", error);
        return NextResponse.json({ error: "Fehler beim Aktualisieren" }, { status: 500 });
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await prisma.product.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Error deleting product:", error);
        return NextResponse.json({ error: "Fehler beim Löschen" }, { status: 500 });
    }
}
