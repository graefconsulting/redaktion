import { prisma } from "@/lib/db";
import EinstellungenClient from "./EinstellungenClient";

export default async function EinstellungenPage() {
    const [brand, templates, products] = await Promise.all([
        prisma.brandConfig.findFirst({
            where: { isPublished: true },
            orderBy: { createdAt: "desc" },
        }),
        prisma.promptTemplate.findMany({
            where: { isPublished: true },
            orderBy: { templateType: "asc" },
        }),
        prisma.product.findMany({
            orderBy: { createdAt: "asc" },
        }),
    ]);

    return (
        <EinstellungenClient
            initialBrand={brand}
            initialTemplates={templates}
            initialProducts={products}
        />
    );
}
