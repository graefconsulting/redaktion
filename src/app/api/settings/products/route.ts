import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
    try {
        const products = await prisma.product.findMany({
            orderBy: { createdAt: "asc" },
        });
        return NextResponse.json({ products });
    } catch (error) {
        console.error("Error fetching products:", error);
        return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, category, shortDescription, usps, productUrl } = body;

        if (!name || !category) {
            return NextResponse.json({ error: "Name und Kategorie sind erforderlich" }, { status: 400 });
        }

        const product = await prisma.product.create({
            data: {
                name,
                category,
                shortDescription: shortDescription || null,
                usps: usps || null,
                productUrl: productUrl || null,
            },
        });
        return NextResponse.json({ product }, { status: 201 });
    } catch (error) {
        console.error("Error creating product:", error);
        return NextResponse.json({ error: "Fehler beim Erstellen" }, { status: 500 });
    }
}
