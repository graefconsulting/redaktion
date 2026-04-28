"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Save, Plus, Pencil, Trash2, Check, AlertCircle, Loader2 } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BrandConfig {
    id: string;
    toneAndVoice: string | null;
    doAndDont: string | null;
    visualGuidelines: string | null;
    salesIntensity: string | null;
    targetAudience: string | null;
    optionalFocus: string | null;
    ctaGuidelines: string | null;
    versionReason: string;
}

interface PromptTemplate {
    id: string;
    templateType: string;
    content: string;
    versionReason: string;
}

interface Product {
    id: string;
    name: string;
    category: string;
    shortDescription: string | null;
    usps: string | null;
    productUrl: string | null;
}

interface Props {
    initialBrand: BrandConfig | null;
    initialTemplates: PromptTemplate[];
    initialProducts: Product[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TEMPLATE_LABELS: Record<string, string> = {
    research_general: "Recherche (Allgemein)",
    research_seasonal: "Recherche (Saisonal)",
    briefing_generation: "Briefing-Generierung",
    content_generation: "Content-Generierung",
    image_idea_generation: "Bildideen-Generierung",
    image_prompt_generation: "Bild-Prompt-Generierung",
};

const CATEGORIES = [
    "Gesundheit",
    "Nahrungsergänzungsmittel",
    "Wasser",
    "Sport",
    "Saisonalität",
];

const emptyProduct = { name: "", category: "Nahrungsergänzungsmittel", shortDescription: "", usps: "", productUrl: "" };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SaveStatus({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
    if (status === "saving") return <span className="flex items-center gap-1 text-sm text-neutral-500"><Loader2 className="h-3 w-3 animate-spin" /> Speichern...</span>;
    if (status === "saved") return <span className="flex items-center gap-1 text-sm text-teal-600"><Check className="h-3 w-3" /> Gespeichert</span>;
    if (status === "error") return <span className="flex items-center gap-1 text-sm text-red-500"><AlertCircle className="h-3 w-3" /> Fehler</span>;
    return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EinstellungenClient({ initialBrand, initialTemplates, initialProducts }: Props) {

    // ── Brand DNA State ────────────────────────────────────────────────────────
    const [brand, setBrand] = useState<Omit<BrandConfig, "id" | "versionReason">>({
        toneAndVoice: initialBrand?.toneAndVoice ?? "",
        doAndDont: initialBrand?.doAndDont ?? "",
        visualGuidelines: initialBrand?.visualGuidelines ?? "",
        salesIntensity: initialBrand?.salesIntensity ?? "",
        targetAudience: initialBrand?.targetAudience ?? "",
        optionalFocus: initialBrand?.optionalFocus ?? "",
        ctaGuidelines: initialBrand?.ctaGuidelines ?? "",
    });
    const [brandStatus, setBrandStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

    // ── Prompt Templates State ─────────────────────────────────────────────────
    const [templates, setTemplates] = useState<Record<string, string>>(
        Object.fromEntries(initialTemplates.map(t => [t.templateType, t.content]))
    );
    const [templateStatus, setTemplateStatus] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});

    // ── Products State ─────────────────────────────────────────────────────────
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [productDialog, setProductDialog] = useState<"add" | Product | null>(null);
    const [deleteDialog, setDeleteDialog] = useState<Product | null>(null);
    const [productForm, setProductForm] = useState(emptyProduct);
    const [productSaving, setProductSaving] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // ── Brand DNA Handlers ─────────────────────────────────────────────────────

    const saveBrand = async () => {
        setBrandStatus("saving");
        try {
            const res = await fetch("/api/settings/brand", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...brand, versionReason: "Manuell bearbeitet" }),
            });
            if (!res.ok) throw new Error();
            setBrandStatus("saved");
            setTimeout(() => setBrandStatus("idle"), 3000);
        } catch {
            setBrandStatus("error");
            setTimeout(() => setBrandStatus("idle"), 3000);
        }
    };

    // ── Prompt Template Handlers ───────────────────────────────────────────────

    const saveTemplate = async (type: string) => {
        setTemplateStatus(s => ({ ...s, [type]: "saving" }));
        try {
            const res = await fetch("/api/settings/prompts", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ templateType: type, content: templates[type] ?? "" }),
            });
            if (!res.ok) throw new Error();
            setTemplateStatus(s => ({ ...s, [type]: "saved" }));
            setTimeout(() => setTemplateStatus(s => ({ ...s, [type]: "idle" })), 3000);
        } catch {
            setTemplateStatus(s => ({ ...s, [type]: "error" }));
            setTimeout(() => setTemplateStatus(s => ({ ...s, [type]: "idle" })), 3000);
        }
    };

    // ── Product Handlers ───────────────────────────────────────────────────────

    const openAdd = () => {
        setProductForm(emptyProduct);
        setProductDialog("add");
    };

    const openEdit = (p: Product) => {
        setProductForm({
            name: p.name,
            category: p.category,
            shortDescription: p.shortDescription ?? "",
            usps: p.usps ?? "",
            productUrl: p.productUrl ?? "",
        });
        setProductDialog(p);
    };

    const saveProduct = async () => {
        setProductSaving(true);
        try {
            if (productDialog === "add") {
                const res = await fetch("/api/settings/products", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(productForm),
                });
                if (!res.ok) throw new Error();
                const data = await res.json();
                setProducts(prev => [...prev, data.product]);
            } else if (productDialog && typeof productDialog !== "string") {
                const res = await fetch(`/api/settings/products/${productDialog.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(productForm),
                });
                if (!res.ok) throw new Error();
                const data = await res.json();
                setProducts(prev => prev.map(p => p.id === data.product.id ? data.product : p));
            }
            setProductDialog(null);
        } catch {
            alert("Fehler beim Speichern des Produkts.");
        } finally {
            setProductSaving(false);
        }
    };

    const deleteProduct = async () => {
        if (!deleteDialog) return;
        setDeleteLoading(true);
        try {
            const res = await fetch(`/api/settings/products/${deleteDialog.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error();
            setProducts(prev => prev.filter(p => p.id !== deleteDialog.id));
            setDeleteDialog(null);
        } catch {
            alert("Fehler beim Löschen.");
        } finally {
            setDeleteLoading(false);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-neutral-900">Einstellungen</h1>
                <p className="text-sm text-neutral-500 mt-1">Brand DNA, KI-Prompts und Produkte verwalten</p>
            </div>

            <Tabs defaultValue="brand">
                <TabsList className="mb-6">
                    <TabsTrigger value="brand">Brand DNA</TabsTrigger>
                    <TabsTrigger value="prompts">Prompt Templates</TabsTrigger>
                    <TabsTrigger value="products">Produkte</TabsTrigger>
                </TabsList>

                {/* ── Brand DNA Tab ── */}
                <TabsContent value="brand">
                    <Card>
                        <CardHeader>
                            <CardTitle>Brand DNA</CardTitle>
                            <CardDescription>
                                Diese Werte fließen automatisch in jeden KI-generierten Post ein. Präzise Angaben = bessere Ergebnisse.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <BrandField
                                label="Tone & Voice"
                                hint="Wie klingt die Marke? (z.B. professionell, empathisch, wissenschaftlich)"
                                value={brand.toneAndVoice ?? ""}
                                onChange={v => setBrand(b => ({ ...b, toneAndVoice: v }))}
                            />
                            <BrandField
                                label="Do's & Don'ts"
                                hint="Was darf die Marke sagen / was nie? (eine Regel pro Zeile)"
                                value={brand.doAndDont ?? ""}
                                onChange={v => setBrand(b => ({ ...b, doAndDont: v }))}
                            />
                            <BrandField
                                label="Zielgruppe"
                                hint="Wer wird angesprochen? Alter, Interessen, Schmerzen"
                                value={brand.targetAudience ?? ""}
                                onChange={v => setBrand(b => ({ ...b, targetAudience: v }))}
                            />
                            <BrandField
                                label="Verkaufsintensität"
                                hint="Wie stark darf promotet werden? (subtil / beratend / direkt)"
                                value={brand.salesIntensity ?? ""}
                                onChange={v => setBrand(b => ({ ...b, salesIntensity: v }))}
                            />
                            <BrandField
                                label="CTA-Vorgaben"
                                hint="Welche Handlungsaufforderungen sind gewünscht? (z.B. 'Jetzt entdecken', 'Mehr erfahren')"
                                value={brand.ctaGuidelines ?? ""}
                                onChange={v => setBrand(b => ({ ...b, ctaGuidelines: v }))}
                            />
                            <BrandField
                                label="Visuelle Richtlinien"
                                hint="Farbwelt, Bildsprache, Stil — für Bildgenerierung"
                                value={brand.visualGuidelines ?? ""}
                                onChange={v => setBrand(b => ({ ...b, visualGuidelines: v }))}
                            />
                            <BrandField
                                label="Optionaler Fokus"
                                hint="Aktuelle Schwerpunkte, Kampagnen, Saisonthemen"
                                value={brand.optionalFocus ?? ""}
                                onChange={v => setBrand(b => ({ ...b, optionalFocus: v }))}
                            />

                            <div className="flex items-center gap-4 pt-2">
                                <Button onClick={saveBrand} disabled={brandStatus === "saving"} className="bg-teal-600 hover:bg-teal-700">
                                    <Save className="h-4 w-4 mr-2" />
                                    Brand DNA speichern
                                </Button>
                                <SaveStatus status={brandStatus} />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Prompt Templates Tab ── */}
                <TabsContent value="prompts">
                    <div className="space-y-4">
                        <p className="text-sm text-neutral-500">
                            Diese Prompts steuern jeden KI-Schritt. Platzhalter wie <code className="bg-neutral-100 px-1 rounded text-xs">{"{{topic}}"}</code> werden zur Laufzeit ersetzt.
                        </p>
                        {Object.entries(TEMPLATE_LABELS).map(([type, label]) => (
                            <Card key={type}>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-base">{label}</CardTitle>
                                            <CardDescription className="text-xs mt-1 font-mono">{type}</CardDescription>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <SaveStatus status={templateStatus[type] ?? "idle"} />
                                            <Button
                                                size="sm"
                                                onClick={() => saveTemplate(type)}
                                                disabled={templateStatus[type] === "saving"}
                                                className="bg-teal-600 hover:bg-teal-700"
                                            >
                                                <Save className="h-3 w-3 mr-1" />
                                                Speichern
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Textarea
                                        value={templates[type] ?? ""}
                                        onChange={e => setTemplates(t => ({ ...t, [type]: e.target.value }))}
                                        rows={8}
                                        className="font-mono text-xs resize-y"
                                        placeholder={`Prompt für ${label} eingeben...`}
                                    />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* ── Produkte Tab ── */}
                <TabsContent value="products">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-neutral-500">
                                {products.length} Produkt{products.length !== 1 ? "e" : ""} im System
                            </p>
                            <Button onClick={openAdd} className="bg-teal-600 hover:bg-teal-700">
                                <Plus className="h-4 w-4 mr-2" />
                                Produkt hinzufügen
                            </Button>
                        </div>

                        {products.length === 0 && (
                            <Card>
                                <CardContent className="py-12 text-center text-neutral-400 text-sm">
                                    Noch keine Produkte. Füge dein erstes Produkt hinzu.
                                </CardContent>
                            </Card>
                        )}

                        {products.map(p => (
                            <Card key={p.id}>
                                <CardContent className="py-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-semibold text-neutral-900 text-sm">{p.name}</span>
                                                <Badge variant="outline" className="text-xs">{p.category}</Badge>
                                            </div>
                                            {p.shortDescription && (
                                                <p className="text-xs text-neutral-500 mb-1">{p.shortDescription}</p>
                                            )}
                                            {p.usps && (
                                                <p className="text-xs text-neutral-400 truncate">USPs: {p.usps}</p>
                                            )}
                                            {p.productUrl && (
                                                <a href={p.productUrl} target="_blank" rel="noopener noreferrer"
                                                    className="text-xs text-teal-600 hover:underline mt-1 block truncate">
                                                    {p.productUrl}
                                                </a>
                                            )}
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                                                <Pencil className="h-3 w-3" />
                                            </Button>
                                            <Button size="sm" variant="outline" className="text-red-500 hover:text-red-600 hover:border-red-300"
                                                onClick={() => setDeleteDialog(p)}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            {/* ── Produkt Dialog (Add / Edit) ── */}
            <Dialog open={productDialog !== null} onOpenChange={open => !open && setProductDialog(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {productDialog === "add" ? "Neues Produkt" : "Produkt bearbeiten"}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Name *</Label>
                            <Input value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Omega-3 Kapseln Premium" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Kategorie *</Label>
                            <select
                                value={productForm.category}
                                onChange={e => setProductForm(f => ({ ...f, category: e.target.value }))}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Kurzbeschreibung</Label>
                            <Input value={productForm.shortDescription} onChange={e => setProductForm(f => ({ ...f, shortDescription: e.target.value }))} placeholder="1-2 Sätze über das Produkt" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>USPs</Label>
                            <Textarea
                                value={productForm.usps}
                                onChange={e => setProductForm(f => ({ ...f, usps: e.target.value }))}
                                rows={3}
                                placeholder="Alleinstellungsmerkmale, Vorteile, Besonderheiten..."
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Produkt-URL</Label>
                            <Input value={productForm.productUrl} onChange={e => setProductForm(f => ({ ...f, productUrl: e.target.value }))} placeholder="https://health-rise.de/produkte/..." />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setProductDialog(null)}>Abbrechen</Button>
                        <Button onClick={saveProduct} disabled={productSaving || !productForm.name || !productForm.category} className="bg-teal-600 hover:bg-teal-700">
                            {productSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Speichern
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Delete Confirmation Dialog ── */}
            <Dialog open={deleteDialog !== null} onOpenChange={open => !open && setDeleteDialog(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Produkt löschen?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-neutral-600">
                        <strong>{deleteDialog?.name}</strong> wird permanent gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialog(null)}>Abbrechen</Button>
                        <Button variant="destructive" onClick={deleteProduct} disabled={deleteLoading}>
                            {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                            Löschen
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── Sub-component: BrandField ────────────────────────────────────────────────

function BrandField({ label, hint, value, onChange }: {
    label: string;
    hint: string;
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div className="space-y-1.5">
            <Label className="font-medium">{label}</Label>
            <p className="text-xs text-neutral-400">{hint}</p>
            <Textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                rows={3}
                className="resize-y text-sm"
            />
        </div>
    );
}
