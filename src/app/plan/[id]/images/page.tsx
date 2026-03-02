"use client"

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, Loader2, ArrowRight, UserPlus, Image as ImageIcon, Link as LinkIcon, RefreshCw, CheckCircle2, Settings2 } from "lucide-react";
import { FacebookPostHeader } from "@/components/shared/FacebookPostHeader";
import { getDateForWeekday } from "@/lib/dateUtils";

interface PostSlot {
    id: string;
    category: string;
    userInstruction?: string;
    selectedBriefing?: string;
    selectedContent?: string;
    selectedImagePrompt?: string;
    referenceImageUrl?: string;
    imageInstruction?: string;
    imageModel?: string;
    imageFormat?: string;
    imageSize?: string;
    imageResolution?: string;
    weekday?: string;
}

interface TaskData {
    id: string;
    type: string;
    category: string;
    status: string;
    resultJson?: string;
    postSlot?: PostSlot;
}

export default function ImageIdeasPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: weekPlanId } = use(params);
    const router = useRouter();

    const [tasks, setTasks] = useState<TaskData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedVariantIndices, setSelectedVariantIndices] = useState<Record<string, number[]>>({});
    const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({});
    const [referenceUrls, setReferenceUrls] = useState<Record<string, string>>({});
    const [instructions, setInstructions] = useState<Record<string, string>>({});
    const [imageModels, setImageModels] = useState<Record<string, string>>({});
    const [imageFormats, setImageFormats] = useState<Record<string, string>>({});
    const [imageSizes, setImageSizes] = useState<Record<string, string>>({});
    const [imageResolutions, setImageResolutions] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState<Record<string, boolean>>({});
    const [weekPlan, setWeekPlan] = useState<{ year: number, week: number } | null>(null);

    // Load initial tasks
    useEffect(() => {
        let mounted = true;
        async function loadInitial() {
            try {
                const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/image`, { cache: 'no-store' });
                if (res.ok && mounted) {
                    const data = await res.json();
                    setTasks(data.tasks || []);
                    setWeekPlan(data.weekPlan || null);
                }
            } catch (e) {
                console.error("Failed to fetch image tasks:", e);
            } finally {
                if (mounted) setIsLoading(false);
            }
        }
        loadInitial();
        return () => { mounted = false; };
    }, [weekPlanId]);

    // Polling interval
    useEffect(() => {
        const activeTasks = tasks.some(t => t.status === "queued" || t.status === "running");
        if (activeTasks) {
            let active = true;
            const poll = async () => {
                try {
                    const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/image`, { cache: 'no-store' });
                    if (res.ok && active) {
                        const data = await res.json();
                        setTasks(data.tasks || []);
                        setWeekPlan(data.weekPlan || null);

                        // Clear regenerating flags for newly successful tasks
                        const newRegenState = { ...isRegenerating };
                        data.tasks.forEach((t: TaskData) => {
                            if (t.status === "success" || t.status === "failed") {
                                delete newRegenState[t.postSlot!.id];
                            }
                        });
                        setIsRegenerating(newRegenState);
                    }
                } catch {
                    // ignore
                }
            };
            const interval = setInterval(poll, 3000);
            return () => { active = false; clearInterval(interval); };
        }
    }, [tasks, weekPlanId, isRegenerating]);

    // Handle initial populations
    useEffect(() => {
        tasks.forEach(task => {
            if (task.status === "success" && task.postSlot && task.resultJson && !editedPrompts[task.postSlot.id]) {
                try {
                    const parsed = JSON.parse(task.resultJson);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        let textToSet = parsed[0].description;
                        let indicesToSet: number[] = [];
                        let refUrlToSet = task.postSlot.referenceImageUrl || "";
                        let instructionToSet = task.postSlot.imageInstruction || "";

                        if (task.postSlot.selectedImagePrompt) {
                            textToSet = task.postSlot.selectedImagePrompt;
                            // Pre-select the tab if it matches an exact variant
                            parsed.forEach((v: any, idx: number) => {
                                if (textToSet.includes(v.description.trim())) {
                                    indicesToSet.push(idx);
                                }
                            });
                        } else {
                            indicesToSet = [0];
                        }

                        setEditedPrompts(prev => ({
                            ...prev,
                            [task.postSlot!.id]: textToSet
                        }));
                        setSelectedVariantIndices(prev => ({
                            ...prev,
                            [task.postSlot!.id]: indicesToSet
                        }));
                        setReferenceUrls(prev => ({
                            ...prev,
                            [task.postSlot!.id]: refUrlToSet
                        }));
                        setInstructions(prev => ({
                            ...prev,
                            [task.postSlot!.id]: instructionToSet
                        }));
                        setImageModels(prev => ({ ...prev, [task.postSlot!.id]: task.postSlot!.imageModel || "nano-banana" }));
                        setImageFormats(prev => ({ ...prev, [task.postSlot!.id]: task.postSlot!.imageFormat || "jpeg" }));
                        setImageSizes(prev => ({ ...prev, [task.postSlot!.id]: task.postSlot!.imageSize || "1:1" }));
                        setImageResolutions(prev => ({ ...prev, [task.postSlot!.id]: task.postSlot!.imageResolution || "1K" }));
                    }
                } catch (e) {
                    console.error("Failed to parse variants", e);
                }
            }
        });
    }, [tasks, editedPrompts]);

    const handleToggleVariant = (postSlotId: string, variantIndex: number, allVariants: any[]) => {
        setSelectedVariantIndices(prev => {
            const current = prev[postSlotId] || [];
            const isSelected = current.includes(variantIndex);

            // MULTI SELECT (Restore ability to select multiple variants)
            let next: number[];
            if (isSelected) {
                // Unselect
                next = current.filter(i => i !== variantIndex);
                if (next.length === 0) next = [variantIndex]; // Keep at least one optionally
            } else {
                next = [...current, variantIndex].sort((a, b) => a - b);
            }

            // Construct the selected text
            const combinedText = next.map(idx => allVariants[idx].description).join('\n\n---\n\n');

            // Set the corresponding text area to only show this single prompt
            setEditedPrompts(prevPrompts => ({ ...prevPrompts, [postSlotId]: combinedText }));

            return { ...prev, [postSlotId]: next };
        });
    };

    const handleTextChange = (postSlotId: string, text: string) => {
        setEditedPrompts(prev => ({ ...prev, [postSlotId]: text }));
        // If they edit manually, we could theoretically set variantIdx to -1
    };

    const handleRefUrlChange = (postSlotId: string, url: string) => {
        setReferenceUrls(prev => ({ ...prev, [postSlotId]: url }));
    };

    const handleInstructionChange = (postSlotId: string, instruction: string) => {
        setInstructions(prev => ({ ...prev, [postSlotId]: instruction }));
    };

    const handleRegenerate = async (postSlotId: string) => {
        setIsRegenerating(prev => ({ ...prev, [postSlotId]: true }));
        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postSlotId, instruction: instructions[postSlotId] })
            });
            if (!res.ok) {
                console.error("Regeneration failed");
                setIsRegenerating(prev => {
                    const next = { ...prev };
                    delete next[postSlotId];
                    return next;
                });
            }
        } catch (e) {
            console.error("Failed to request regeneration", e);
            setIsRegenerating(prev => {
                const next = { ...prev };
                delete next[postSlotId];
                return next;
            });
        }
    };

    const handleSaveAndContinue = async () => {
        const selections = Object.keys(editedPrompts).map(postSlotId => ({
            postSlotId,
            selectedImagePrompt: editedPrompts[postSlotId],
            referenceImageUrl: referenceUrls[postSlotId] || null,
            imageModel: imageModels[postSlotId] || "nano-banana",
            imageFormat: imageFormats[postSlotId] || "jpeg",
            imageSize: imageSizes[postSlotId] || "1:1",
            imageResolution: imageResolutions[postSlotId] || "1K"
        }));

        if (selections.length === 0) return;

        setIsSaving(true);
        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/save-image`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ selections })
            });

            if (res.ok) {
                // Determine next correct page (Phase 7 - actual generation!)
                router.push(`/plan/${weekPlanId}/generate`);
            } else {
                console.error("Failed to save image ideas");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const isAllComplete = tasks.length > 0 && tasks.every(t => t.status === "success");

    return (
        <div className="container mx-auto py-8 max-w-5xl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <ImageIcon className="w-8 h-8 text-primary" />
                        Bildideen & Referenzen
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Wähle für jeden Post eine passende Bildidee oder lade ein Referenzbild (z.B. Produktfoto) hoch.
                    </p>
                </div>
                <div className="flex gap-4">
                </div>
            </div>

            <div className="space-y-12">
                {tasks.map((task) => {
                    const slot = task.postSlot;
                    if (!slot) return null;

                    const isPending = task.status === "queued" || task.status === "running" || isRegenerating[slot.id];
                    let variants: any[] = [];
                    if (task.status === "success" && task.resultJson && !isRegenerating[slot.id]) {
                        try {
                            variants = JSON.parse(task.resultJson);
                        } catch { }
                    }

                    return (
                        <Card key={task.id} className={`relative overflow-hidden border-border/50 shadow-sm ${task.status === 'success' ? 'border-gray-300' : 'border-gray-300 border-dashed opacity-90'}`}>
                            <FacebookPostHeader datePrefix={weekPlan && slot?.weekday ? getDateForWeekday(weekPlan.year, weekPlan.week, slot.weekday) : (slot?.weekday || "")} />
                            <CardHeader className="bg-muted/30 border-b">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Badge variant="secondary">{slot.category}</Badge>
                                        </div>
                                        <CardTitle className="text-xl">Bild-Konzept</CardTitle>
                                        <CardDescription className="line-clamp-2 mt-2 break-words max-w-3xl">
                                            <strong>Finale Copy:</strong> {slot.selectedContent}
                                        </CardDescription>
                                    </div>
                                    <div>
                                        {isPending && (
                                            <Badge variant="outline" className="text-blue-500 flex items-center gap-1">
                                                <Loader2 className="w-3 h-3 animate-spin" /> Ideen werden erzeugt...
                                            </Badge>
                                        )}
                                        {task.status === "failed" && (
                                            <Badge variant="destructive">Fehler bei Generierung</Badge>
                                        )}
                                        {task.status === "success" && !isRegenerating[slot.id] && (
                                            <Badge className="bg-green-500">Generiert</Badge>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6">
                                {isPending ? (
                                    <div className="h-48 flex items-center justify-center text-muted-foreground flex-col gap-4">
                                        <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
                                        <p>Die KI entwickelt visuelle Konzepte für diesen Post...</p>
                                    </div>
                                ) : (
                                    variants.length > 0 && (
                                        <div className="space-y-6">
                                            <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                                {variants.map((v, i) => {
                                                    const isSelected = (selectedVariantIndices[slot.id] || []).includes(i);
                                                    return (
                                                        <button
                                                            key={i}
                                                            onClick={() => handleToggleVariant(slot.id, i, variants)}
                                                            className={`flex flex-col items-start p-4 whitespace-normal text-left h-full border rounded-xl transition-all ${isSelected ? 'bg-[#1877F2] border-[#1877F2] text-white shadow-sm ring-1 ring-[#1877F2]' : 'bg-white border-gray-300 hover:bg-gray-50 text-neutral-800'}`}
                                                        >
                                                            <div className="flex justify-between items-center w-full mb-2">
                                                                <strong className={`block ${isSelected ? 'text-white' : 'text-neutral-700'}`}>{v.variantName}</strong>
                                                                {isSelected && <CheckCircle2 className="w-5 h-5 text-white" />}
                                                            </div>
                                                            <span className={`text-sm leading-snug line-clamp-3 ${isSelected ? 'text-white/90' : 'text-neutral-500'}`}>{v.concept}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <div className="space-y-4 mt-8">
                                                <label className="text-sm font-medium text-muted-foreground">Finaler Bild/Prompt-Text (editierbar):</label>
                                                {(() => {
                                                    const combinedPrompt = editedPrompts[slot.id] || "";
                                                    const promptsArray = combinedPrompt.split(/\n*\s*---\s*\n*/).filter(Boolean);
                                                    if (promptsArray.length === 0) promptsArray.push("");

                                                    return promptsArray.map((promptText, idx) => (
                                                        <div key={idx} className="mb-4">
                                                            <div className="text-xs font-semibold text-neutral-500 mb-2">Bildidee {idx + 1}</div>
                                                            <Textarea
                                                                className="w-full min-h-[120px] resize-y text-base p-4 leading-relaxed bg-muted/20"
                                                                value={promptText}
                                                                onChange={(e) => {
                                                                    const newArr = [...promptsArray];
                                                                    newArr[idx] = e.target.value;
                                                                    handleTextChange(slot.id, newArr.join('\n\n---\n\n'));
                                                                }}
                                                            />
                                                        </div>
                                                    ));
                                                })()}
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium flex items-center gap-2">
                                                        <LinkIcon className="w-4 h-4 text-muted-foreground" />
                                                        Referenzbild (Optional URL für Produktfotos)
                                                    </label>
                                                    <Input
                                                        placeholder="https://example.com/produkt.jpg"
                                                        value={referenceUrls[slot.id] || ""}
                                                        onChange={(e) => handleRefUrlChange(slot.id, e.target.value)}
                                                    />
                                                </div>

                                                <div className="space-y-2 bg-muted/20 p-4 rounded-md border border-border/50">
                                                    <label className="text-sm font-medium text-muted-foreground">Bildidee anpassen</label>
                                                    <div className="flex gap-2">
                                                        <Input
                                                            placeholder="z.B. Mach es moderner und technischer..."
                                                            className="flex-1 bg-background"
                                                            value={instructions[slot.id] || ""}
                                                            onChange={(e) => handleInstructionChange(slot.id, e.target.value)}
                                                        />
                                                        <Button
                                                            variant="secondary"
                                                            onClick={() => handleRegenerate(slot.id)}
                                                            disabled={isRegenerating[slot.id]}
                                                        >
                                                            {isRegenerating[slot.id] ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                                            Neu Erstellen
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-muted/10 border rounded-lg p-5 space-y-4">
                                                <h4 className="text-sm font-semibold flex items-center gap-2">
                                                    <Settings2 className="w-4 h-4 text-primary" />
                                                    Bild-Einstellungen (Kie.ai)
                                                </h4>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-muted-foreground">KI Modell</label>
                                                        <Select value={imageModels[slot.id] || "nano-banana"} onValueChange={(val) => setImageModels(prev => ({ ...prev, [slot.id]: val }))}>
                                                            <SelectTrigger className="bg-background"><SelectValue placeholder="Modell wählen" /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="nano-banana">Nano Banana</SelectItem>
                                                                <SelectItem value="nano-banana-pro">Nano Banana Pro</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-muted-foreground">Format</label>
                                                        <Select value={imageFormats[slot.id] || "jpeg"} onValueChange={(val) => setImageFormats(prev => ({ ...prev, [slot.id]: val }))}>
                                                            <SelectTrigger className="bg-background"><SelectValue placeholder="Format wählen" /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="jpeg">JPEG</SelectItem>
                                                                <SelectItem value="png">PNG</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-muted-foreground">Bildgröße</label>
                                                        <Select value={imageSizes[slot.id] || "1:1"} onValueChange={(val) => setImageSizes(prev => ({ ...prev, [slot.id]: val }))}>
                                                            <SelectTrigger className="bg-background"><SelectValue placeholder="Größe wählen" /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="1:1">1:1 (Quadratisch)</SelectItem>
                                                                <SelectItem value="9:16">9:16 (Story/Reel)</SelectItem>
                                                                <SelectItem value="16:9">16:9 (Landschaft)</SelectItem>
                                                                <SelectItem value="3:4">3:4</SelectItem>
                                                                <SelectItem value="4:3">4:3</SelectItem>
                                                                <SelectItem value="3:2">3:2</SelectItem>
                                                                <SelectItem value="2:3">2:3</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-muted-foreground">Auflösung (Nur Pro)</label>
                                                        <Select
                                                            value={imageResolutions[slot.id] || "1K"}
                                                            onValueChange={(val) => setImageResolutions(prev => ({ ...prev, [slot.id]: val }))}
                                                            disabled={(imageModels[slot.id] || "nano-banana") !== "nano-banana-pro"}
                                                        >
                                                            <SelectTrigger className="bg-background disabled:opacity-50"><SelectValue placeholder="Auflösung" /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="1K">1K</SelectItem>
                                                                <SelectItem value="2K">2K</SelectItem>
                                                                <SelectItem value="4K">4K</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                            </div>

                                        </div>
                                    )
                                )}
                            </CardContent>
                        </Card>
                    );
                })}

                {isLoading && (
                    <div className="text-center py-20 text-muted-foreground">
                        <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin opacity-50" />
                        <p>Lade Bild-Konzepte...</p>
                    </div>
                )}
                {!isLoading && tasks.length === 0 && (
                    <div className="text-center py-20 text-muted-foreground border-dashed border-2 rounded-xl border-neutral-200">
                        <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <h3 className="text-xl font-medium text-neutral-800 mb-2">Noch keine Post-Texte fixiert</h3>
                        <p className="mb-6">Bitte schließe zuerst Phase 5 (Content) ab und speichere deine Texte, bevor du Bildideen generieren lässt.</p>
                        <Button onClick={() => router.push(`/plan/${weekPlanId}/content`)} variant="outline">
                            Zurück zu Phase 5 (Content)
                        </Button>
                    </div>
                )}
            </div>

            {/* Sticky Bottom Bar */}
            {(tasks.length > 0) && (
                <div className="sticky bottom-0 z-50 mt-8 pb-4">
                    <div className="bg-white border rounded-xl p-4 shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.1)] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Button variant="outline" onClick={() => router.push(`/plan/${weekPlanId}/content`)} className="text-neutral-800 bg-white shadow-sm border-gray-300 hover:bg-neutral-50 px-6 h-12">
                                Zurück
                            </Button>
                        </div>
                        <div className="flex items-center gap-3 hidden md:flex">
                            <span className="text-neutral-600 font-medium">Bilder anfordern</span>
                            {!isAllComplete && <Badge variant="outline" className="text-neutral-500">Warte auf KI...</Badge>}
                        </div>
                        <Button
                            className="bg-teal-600 hover:bg-teal-700 text-white min-w-[200px] h-12 text-base font-semibold shadow-md flex items-center justify-center gap-2"
                            disabled={!isAllComplete || isSaving}
                            onClick={handleSaveAndContinue}
                        >
                            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                            {isSaving ? "Bestätige..." : "Ideen bestätigen & Generieren"}
                            {!isSaving && <ImageIcon className="w-5 h-5 ml-1" />}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
