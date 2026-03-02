"use client"

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowRight, ImageIcon, RefreshCw, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import Image from "next/image";
import { FacebookPostHeader } from "@/components/shared/FacebookPostHeader";
import { getDateForWeekday } from "@/lib/dateUtils";

interface ImageAsset {
    id: string;
    url: string;
    source: string;
}

interface PostSlot {
    id: string;
    category: string;
    selectedContent?: string;
    selectedImagePrompt?: string;
    imageInstruction?: string;
    imageModel?: string;
    images: ImageAsset[];
    weekday?: string;
}

interface TaskData {
    id: string;
    type: string;
    status: string;
    errorMessage?: string;
    postSlot?: PostSlot;
    startedAt?: string;
    finishedAt?: string;
}

export default function GenerateImagesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: weekPlanId } = use(params);
    const router = useRouter();

    const [tasks, setTasks] = useState<TaskData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isStarting, setIsStarting] = useState(false);
    const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({});
    const [regenerationInstructions, setRegenerationInstructions] = useState<Record<string, string>>({});
    const [isRegenerating, setIsRegenerating] = useState<Record<string, boolean>>({});
    const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});
    const [isSelectingImage, setIsSelectingImage] = useState<Record<string, boolean>>({});
    const [weekPlan, setWeekPlan] = useState<{ year: number, week: number } | null>(null);

    // Polling interval for updates
    useEffect(() => {
        let active = true;
        const poll = async () => {
            try {
                const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/render`, { cache: 'no-store' });
                if (res.ok && active) {
                    const data = await res.json();
                    setTasks(data.tasks || []);
                    setWeekPlan(data.weekPlan || null);
                    if (isLoading) setIsLoading(false);
                }
            } catch (e) {
                console.error("Failed to fetch render tasks:", e);
                if (isLoading) setIsLoading(false);
            }
        };

        // Poll immediately, then every 3 seconds
        poll();
        const interval = setInterval(poll, 3000);
        return () => { active = false; clearInterval(interval); };
    }, [weekPlanId, isLoading]);

    // Attempt to start generic missing tasks
    useEffect(() => {
        let mounted = true;
        const startMissing = async () => {
            setIsStarting(true);
            try {
                const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/render`, { method: "POST" });
                // We don't really need to do much with the response as polling will catch new tasks.
            } catch (e) {
                console.error("Failed to trigger missing render tasks", e);
            } finally {
                if (mounted) setIsStarting(false);
            }
        };

        // Delay it slightly to let initially loaded tasks populate
        const timeout = setTimeout(startMissing, 1000);
        return () => { mounted = false; clearTimeout(timeout); };
    }, [weekPlanId]);


    const togglePromptExpand = (slotId: string) => {
        setExpandedPrompts(prev => ({ ...prev, [slotId]: !prev[slotId] }));
    };

    const handleInstructionChange = (slotId: string, instruction: string) => {
        setRegenerationInstructions(prev => ({ ...prev, [slotId]: instruction }));
    };

    const handleRegenerate = async (postSlotId: string) => {
        setIsRegenerating(prev => ({ ...prev, [postSlotId]: true }));
        try {
            const instruction = regenerationInstructions[postSlotId];

            // If the user provided new instructions, we don't just re-render, 
            // we have to re-generate the PROMPT first (Phase 6).
            if (instruction && instruction.trim().length > 0) {
                // We send it to Phase 6 API, so the UI should ideally redirect back to Phase 6 or handle it here.
                // For now, we will submit it to Phase 6 to generate new ideas, and the user must go back to Phase 6 to select them.
                const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/image`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ postSlotId, instruction })
                });
                if (res.ok) {
                    // Redirect back to Phase 6 to pick the new prompt
                    router.push(`/plan/${weekPlanId}/images`);
                    return;
                }
            } else {
                // Normal Phase 7 (image only) re-render
                const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/render`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ postSlotId })
                });
                if (!res.ok) {
                    console.error("Regeneration trigger failed");
                }
            }
        } catch (e) {
            console.error("Failed to request regeneration", e);
        } finally {
            setIsRegenerating(prev => ({ ...prev, [postSlotId]: false }));
        }
    };

    const fetchTasks = async () => {
        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/render`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setTasks(data.tasks || []);
                setWeekPlan(data.weekPlan || null);
            }
        } catch (e) {
            console.error("Failed to fetch tasks", e);
        }
    };

    const handleSelectImage = async (postSlotId: string, selectedImageId: string) => {
        setIsSelectingImage(prev => ({ ...prev, [selectedImageId]: true }));
        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/render/select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postSlotId, selectedImageId })
            });

            if (res.ok) {
                await fetchTasks();
            } else {
                alert("Fehler beim Auswählen des Bildes.");
            }
        } catch (e) {
            console.error("Select image error:", e);
            alert("Fehler beim Auswählen des Bildes.");
        } finally {
            setIsSelectingImage(prev => ({ ...prev, [selectedImageId]: false }));
        }
    };

    const handleDelete = async (postSlotId: string) => {
        setIsDeleting(prev => ({ ...prev, [postSlotId]: true }));
        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/render?postSlotId=${postSlotId}`, {
                method: 'DELETE'
            });
            if (!res.ok) {
                console.error("Failed to delete image");
            }
        } catch (e) {
            console.error("Error deleting image", e);
        } finally {
            setIsDeleting(prev => ({ ...prev, [postSlotId]: false }));
        }
    };

    const isAllComplete = tasks.length > 0 && tasks.every(t => t.status === "success");

    return (
        <div className="container mx-auto py-8 max-w-5xl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <ImageIcon className="w-8 h-8 text-primary" />
                        Generierung & Auswahl
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Die KI generiert jetzt deine Bilder. Das kann einen Moment dauern.
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
                    const isSuccess = task.status === "success";
                    const isFailed = task.status === "failed";
                    const isExpanded = !!expandedPrompts[slot.id];

                    // On success, show all images for this slot
                    const generatedImages = (isSuccess && slot.images && slot.images.length > 0) ? slot.images : [];
                    const hasImages = generatedImages.length > 0;

                    return (
                        <Card key={task.id} className={`relative overflow-hidden border-border/50 shadow-sm ${task.status === 'success' ? 'border-gray-300' : 'border-gray-300 border-dashed opacity-90'}`}>
                            <FacebookPostHeader datePrefix={weekPlan && slot?.weekday ? getDateForWeekday(weekPlan.year, weekPlan.week, slot.weekday) : (slot?.weekday || "")} />
                            <CardHeader className="bg-muted/30 border-b">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Badge variant="secondary">{slot.category}</Badge>
                                            {slot.imageModel === 'nano-banana-pro' && (
                                                <Badge variant="outline" className="text-xs">
                                                    Pro
                                                </Badge>
                                            )}
                                        </div>
                                        <CardTitle className="text-xl">Finales Beitragsbild</CardTitle>
                                        <div className="mt-2 text-sm text-muted-foreground break-words max-w-3xl">
                                            <strong>Verwendete(r) Prompt(s):</strong>
                                            <div className="relative mt-1 bg-background p-3 rounded-md border text-xs font-mono whitespace-pre-wrap">
                                                <div className={isExpanded ? "" : "line-clamp-2"}>
                                                    {slot.selectedImagePrompt}
                                                </div>
                                                {slot.selectedImagePrompt && slot.selectedImagePrompt.length > 150 && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 mt-2 px-2 text-xs w-full flex justify-center"
                                                        onClick={() => togglePromptExpand(slot.id)}
                                                    >
                                                        {isExpanded ? <><ChevronUp className="w-3 h-3 mr-1" /> Weniger anzeigen</> : <><ChevronDown className="w-3 h-3 mr-1" /> Mehr anzeigen</>}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        {isPending && (
                                            <Badge variant="outline" className="text-blue-500 flex items-center gap-1">
                                                <Loader2 className="w-3 h-3 animate-spin" /> {task.status === "queued" ? "In Warteschlange..." : "Wird generiert..."}
                                            </Badge>
                                        )}
                                        {isFailed && (
                                            <Badge variant="destructive" className="flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" /> Fehler
                                            </Badge>
                                        )}
                                        {isSuccess && (
                                            <Badge className="bg-teal-500 hover:bg-teal-600 flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> Fertig
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6">
                                {isPending ? (
                                    <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-4 bg-muted/10 rounded-xl border border-dashed border-border/50">
                                        <div className="relative">
                                            <ImageIcon className="w-12 h-12 text-primary/20" />
                                            <Loader2 className="w-12 h-12 animate-spin text-primary absolute top-0 left-0" />
                                        </div>
                                        <p className="font-medium">Kie.ai rendert dein(e) Bild(er)...</p>
                                        <p className="text-sm opacity-70 text-center max-w-md">Dies kann je nach Anzahl, Modell ({slot.imageModel}) und Auflösung einige Sekunden bis zu einer Minute in Anspruch nehmen.</p>
                                    </div>
                                ) : isFailed ? (
                                    <div className="h-64 flex flex-col items-center justify-center text-destructive gap-4 bg-destructive/5 rounded-xl border border-dashed border-destructive/20">
                                        <AlertCircle className="w-12 h-12 opacity-50" />
                                        <p className="font-medium">Fehler bei der Generierung</p>
                                        <p className="text-sm opacity-70 max-w-md text-center">
                                            {task.errorMessage || "Ein unbekannter Fehler ist bei Kie.ai aufgetreten."}
                                        </p>
                                        <div className="mt-4 flex gap-2">
                                            <Button variant="outline" onClick={() => handleRegenerate(slot.id)} disabled={isRegenerating[slot.id]} className="border-destructive/20 hover:bg-destructive/10">
                                                {isRegenerating[slot.id] ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                                Erneut versuchen
                                            </Button>
                                        </div>
                                    </div>
                                ) : isSuccess && hasImages ? (
                                    <div className="flex flex-col md:flex-row gap-8">
                                        <div className="flex-1 max-w-md relative rounded-xl overflow-hidden group">
                                            {generatedImages.length === 1 ? (
                                                <div className="relative aspect-square border shadow-sm rounded-xl overflow-hidden border-[#1877F2] ring-2 ring-[#1877F2]">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={generatedImages[0].url}
                                                        alt="Generiertes Bild"
                                                        className="w-full h-full object-contain bg-muted/20"
                                                    />
                                                    <div className="absolute top-3 right-3 bg-white rounded-full px-3 py-1.5 shadow-md flex items-center gap-1.5 border border-[#1877F2]">
                                                        <CheckCircle2 className="w-4 h-4 text-[#1877F2]" />
                                                        <span className="text-xs font-bold text-[#1877F2]">Ausgewählt</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {generatedImages.map((img: any) => (
                                                        <div key={img.id} className="relative group aspect-square border-2 border-transparent hover:border-[#1877F2] rounded-md overflow-hidden cursor-pointer" onClick={() => handleSelectImage(slot.id, img.id)}>
                                                            <img
                                                                src={img.url}
                                                                alt="Generiertes Bild"
                                                                className="w-full h-full object-contain bg-muted/20"
                                                            />
                                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-1.5 shadow-sm text-[#1877F2]">
                                                                {isSelectingImage[img.id] ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 flex flex-col justify-center gap-6">
                                            <div className="bg-teal-500/10 text-teal-700 p-4 rounded-lg flex items-start gap-3 border border-teal-500/20">
                                                <CheckCircle2 className="w-5 h-5 mt-0.5" />
                                                <div>
                                                    <h4 className="font-medium mb-1">Bild erfolgreich generiert!</h4>
                                                    <p className="text-sm opacity-90">
                                                        {generatedImages.length > 1
                                                            ? "Wähle das beste Bild aus den generierten Optionen aus, indem du mit der Maus darüber fährst."
                                                            : "Das finale Bild ist bereit für den Social Media Export."}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="pt-4 border-t space-y-4">
                                                <div>
                                                    <p className="text-sm font-medium mb-1">Nicht zufrieden mit dem Ergebnis?</p>
                                                    <p className="text-xs text-muted-foreground mb-3">Du kannst das Bild mit dem selben Prompt neu berechnen lassen, oder neue Anweisungen eingeben. Wenn du Anweisungen eingibst, geht es zurück zur Bildideen-Seite.</p>
                                                </div>

                                                <div className="bg-muted/30 p-3 rounded-lg border space-y-3">
                                                    <Textarea
                                                        placeholder="Optional: Änderungswünsche an den Prompt (z.B. 'Mach es moderner, zeige eine Person im Hintergrund')"
                                                        className="text-sm h-20 bg-background"
                                                        value={regenerationInstructions[slot.id] || ""}
                                                        onChange={(e) => handleInstructionChange(slot.id, e.target.value)}
                                                    />
                                                    <Button variant="secondary" onClick={() => handleRegenerate(slot.id)} disabled={isRegenerating[slot.id] || isDeleting[slot.id]} className="w-full">
                                                        {isRegenerating[slot.id] ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                                        {regenerationInstructions[slot.id]?.length > 0 ? "Idee anpassen (geht zurück zu Bildideen)" : "Bild neu berechnen"}
                                                    </Button>
                                                    <Button variant="outline" onClick={() => handleDelete(slot.id)} disabled={isDeleting[slot.id] || isRegenerating[slot.id]} className="w-full text-red-600 hover:bg-gray-50 border-gray-300">
                                                        {isDeleting[slot.id] ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                                                        Bild endgültig löschen
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : isSuccess && !hasImages ? (
                                    <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-4 bg-muted/10 rounded-xl border border-dashed border-border/50">
                                        <Trash2 className="w-12 h-12 opacity-50" />
                                        <p className="font-medium">Bild wurde gelöscht</p>
                                        <div className="mt-4 flex flex-col gap-2 max-w-sm w-full">
                                            <Button onClick={() => handleRegenerate(slot.id)} disabled={isRegenerating[slot.id] || isDeleting[slot.id]}>
                                                {isRegenerating[slot.id] ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                                Neu generieren
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-32 flex items-center justify-center text-muted-foreground">
                                        Unbekannter Status.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}

                {isLoading && (
                    <div className="text-center py-20 text-muted-foreground">
                        <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin opacity-50" />
                        <p>Lade Produktions-Warteschlange...</p>
                    </div>
                )}

                {!isLoading && tasks.length === 0 && (
                    <div className="text-center py-20 text-muted-foreground border-dashed border-2 rounded-xl border-neutral-200">
                        <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <h3 className="text-xl font-medium text-neutral-800 mb-2">Die Produktion kann gestartet werden</h3>
                        <p className="mb-6">Klicke auf den Button, um alle Bilder für deine Posts zu generieren.</p>
                        <Button onClick={() => window.location.reload()} disabled={isStarting}>
                            {isStarting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Jetzt generieren
                        </Button>
                    </div>
                )}
            </div>

            {/* Sticky Bottom Bar */}
            <div className="sticky bottom-0 z-50 mt-8 pb-4">
                <div className="bg-white border rounded-xl p-4 shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.1)] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={() => router.push(`/plan/${weekPlanId}/images`)} className="text-neutral-800 bg-white shadow-sm border-gray-300 hover:bg-neutral-50 px-6 h-12">
                            Zurück zu Bildideen
                        </Button>
                    </div>
                    <div className="flex items-center gap-3 hidden md:flex">
                        <span className="text-neutral-600 font-medium">
                            {!isAllComplete ? "Bitte warte bis alle Bilder generiert sind" : "Für jeden Post ein Bild auswählen"}
                        </span>
                    </div>
                    <Button
                        className="bg-teal-600 hover:bg-teal-700 text-white min-w-[200px] h-12 text-base font-semibold shadow-md gap-2 flex items-center justify-center"
                        disabled={!isAllComplete}
                        onClick={() => router.push(`/plan/${weekPlanId}/overview`)}
                    >
                        Bilder speichern & Weiter
                        <ArrowRight className="h-5 w-5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
