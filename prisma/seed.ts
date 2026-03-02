import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Seeding database...");

    // 1. Initial Brand DNA based on health-rise.de
    const existingBrand = await prisma.brandConfig.findFirst();
    if (!existingBrand) {
        await prisma.brandConfig.create({
            data: {
                isPublished: true,
                toneAndVoice: "Professionell, empathisch, wissenschaftlich fundiert, aber leicht verständlich. Die Ansprache erfolgt respektvoll (wir/Sie oder respektvolles 'Du' je nach Zielgruppen-Fokus).",
                doAndDont: "DO: Faktenbasierte Aussagen treffen, Mehrwert bieten, gesundheitliche Zusammenhänge erklären.\\nDONT: Heilversprechen abgeben, reißerische Sprache verwenden, medizinische Panikmache.",
                visualGuidelines: "Clean, modern, vertrauensvoll. Hauptfarben analog zur Website (oft Blau-/Grün-Töne für Gesundheit). Helle, freundliche Bildsprache.",
                salesIntensity: "Subtil bis beratend. Der Fokus liegt auf Aufklärung und Lösungsanbietung, nicht auf hartem Abverkauf.",
                targetAudience: "Gesundheitsbewusste Menschen, Personen mit spezifischen Beschwerden (z.B. Nährstoffmangel, Stress), Sportler und Best-Ager.",
                ctaGuidelines: "Einladend und serviceorientiert (z.B. 'Erfahre mehr', 'Lass dich beraten', 'Jetzt entdecken').",
                versionReason: "Initiale Brand DNA basierend auf health-rise.de",
            },
        });
        console.log("Created initial BrandConfig");
    } else {
        console.log("BrandConfig already exists");
    }

    // 2. Initial English Prompt Templates for LLMs
    const templates = [
        {
            templateType: "research_general",
            content: "Act as an expert social media researcher for a health brand. Target Audience: {{targetAudience}}. Category: {{category}}.\\nResearch the most current, engaging, and scientifically relevant topics for this week. Provide a list of highly relevant post ideas. Output strictly in German.",
        },
        {
            templateType: "research_seasonal",
            content: "Act as an expert social media researcher for a health brand. Calendar Week: {{weekNumber}}. Target Audience: {{targetAudience}}.\\nIdentify current seasonal health occasions (e.g., flu season, new year resolutions, spring fatigue) relevant to this specific week and bridge them with general health topics. Output strictly in German.",
        },
        {
            templateType: "briefing_generation",
            content: "You are a master social media strategist. Create a post briefing based on this topic: {{topic}}.\\nBrand Tone: {{toneAndVoice}}.\\nDo/Donts: {{doAndDont}}.\\nProduct context (if any): {{productInfo}}.\\nGenerate 3 distinctly different creative angles (e.g., Myth-busting, Educational, Story-driven) for a Facebook post. Output strictly in German.",
        },
        {
            templateType: "content_generation",
            content: "You are an expert copywriter. Write the final Facebook post text based on this briefing: {{briefing}}.\\nBrand Tone: {{toneAndVoice}}.\\nSales Intensity: {{salesIntensity}}.\\nCTA Guidelines: {{ctaGuidelines}}.\\nProvide 3 different variants. Include emojis appropriately but professionally. Include 3-5 relevant hashtags. Output strictly in German.",
        },
        {
            templateType: "image_idea_generation",
            content: "You are an art director. Based on this post text: {{content}}, suggest 3 distinctly different conceptual image ideas suitable for Facebook.\\nVisual Guidelines: {{visualGuidelines}}.\\nDescribe the scene, mood, and elements in detail. Output strictly in German.",
        },
        {
            templateType: "image_prompt_generation",
            content: "Convert the following conceptual image idea into a highly technical, comma-separated image generation prompt suitable for a diffusion model (like Midjourney/Stable Diffusion).\\nIdea: {{imageIdea}}.\\nVisual Style Required: {{visualGuidelines}}.\\nIMPORTANT: The output MUST be entirely in English and highly optimized for AI image rendering. Do not include introductory text, just the raw prompt.",
        },
    ];

    for (const t of templates) {
        const existing = await prisma.promptTemplate.findFirst({
            where: { templateType: t.templateType },
        });
        if (!existing) {
            await prisma.promptTemplate.create({
                data: {
                    isPublished: true,
                    templateType: t.templateType,
                    content: t.content,
                    versionReason: "Initial english templates",
                },
            });
            console.log(`Created PromptTemplate: ${t.templateType}`);
        } else {
            console.log(`PromptTemplate ${t.templateType} already exists`);
        }
    }

    // 3. Dummy Products for Health Rise
    const dummyProducts = [
        {
            name: "Premium Elektrolyt-Wasser",
            category: "Wasser",
            shortDescription: "Erfrischendes stilles Wasser mit wertvollen Elektrolyten angereichert.",
            usps: "Perfekte Hydration nach dem Sport, kalorienfrei, ideal für den Sommer, unterstützt die Regeneration.",
            productUrl: "https://health-rise.de/produkte/elektrolyt-wasser"
        },
        {
            name: "Vitamin D3 + K2 Tropfen",
            category: "Nahrungsergänzungsmittel",
            shortDescription: "Hochdosierte Vitamin D3 + K2 Tropfen für Immunsystem und Knochen.",
            usps: "Optimale Bioverfügbarkeit, sonnenunabhängige Versorgung, trägt zum Erhalt normaler Knochen bei.",
            productUrl: "https://health-rise.de/produkte/d3-k2-tropfen"
        },
        {
            name: "Magnesium Komplex",
            category: "Nahrungsergänzungsmittel",
            shortDescription: "Leicht verwertbarer Magnesium-Komplex gegen Müdigkeit.",
            usps: "Verringert Müdigkeit und Erschöpfung, unterstützt die Muskelfunktion, hochdosiert und gut verträglich.",
            productUrl: "https://health-rise.de/produkte/magnesium"
        },
        {
            name: "Gelenk-Aktiv Kapseln",
            category: "Nahrungsergänzungsmittel",
            shortDescription: "Spezielle Nährstoffkombination für Gelenke und Knorpel.",
            usps: "Mit Glucosamin und Chondroitin, für mehr Beweglichkeit im Alltag, ideal für Sportler und Best-Ager.",
            productUrl: "https://health-rise.de/produkte/gelenk-aktiv"
        }
    ];

    for (const p of dummyProducts) {
        const existing = await prisma.product.findFirst({
            where: { name: p.name },
        });
        if (!existing) {
            await prisma.product.create({
                data: p,
            });
            console.log(`Created Dummy Product: ${p.name}`);
        } else {
            console.log(`Product ${p.name} already exists`);
        }
    }

    console.log("Seeding complete.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
