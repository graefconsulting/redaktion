"use client"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, Edit3, Save, AlertTriangle, ArrowRight, UserCircle2 } from "lucide-react";
import { FacebookPostHeader } from "@/components/shared/FacebookPostHeader";
import { getDateForWeekday } from "@/lib/dateUtils";

interface SlotData {
    id: string;
    category: string;
    weekday: string;
    content: string;
    imagePrompt: string;
    imageUrl: string | null;
    imageId: string | null;
}

type SlotStatus = "pending" | "confirmed" | "rejected";

export default function OverviewClient({ weekPlanId, initialSlots, isFinalized, weekPlan }: { weekPlanId: string, initialSlots: SlotData[], isFinalized: boolean, weekPlan: { year: number, week: number } }) {
    const router = useRouter();
    const [slots, setSlots] = useState<SlotData[]>(initialSlots);
    const [statuses, setStatuses] = useState<Record<string, SlotStatus>>(() => {
        const init: Record<string, SlotStatus> = {};
        initialSlots.forEach(s => init[s.id] = "pending");
        return init;
    });

    const [reworkOpen, setReworkOpen] = useState<Record<string, boolean>>({});
    const [textInstruction, setTextInstruction] = useState<Record<string, string>>({});
    const [imageInstruction, setImageInstruction] = useState<Record<string, string>>({});

    const [isReworkingText, setIsReworkingText] = useState<Record<string, boolean>>({});
    const [isReworkingImage, setIsReworkingImage] = useState<Record<string, boolean>>({});

    const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null);
    const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);

    // Image polling state
    const [pollTaskId, setPollTaskId] = useState<Record<string, string | null>>({});

    // Poll for image generation if we have a task ID
    useEffect(() => {
        const pollingSlots = Object.entries(pollTaskId).filter(([_, taskId]) => taskId !== null);
        if (pollingSlots.length === 0) return;

        let active = true;
        const poll = async () => {
            try {
                const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/render`, { cache: 'no-store' });
                if (!res.ok || !active) return;
                const data = await res.json();

                let foundFinished = false;
                const tasks = data.tasks || [];

                for (const [slotId, taskId] of pollingSlots) {
                    const task = tasks.find((t: any) => t.id === taskId || t.relatedPostId === slotId);
                    if (task && task.status === "success" && task.postSlot?.images?.length > 0) {
                        // Image generation finished! Update slot UI
                        setSlots(prev => prev.map(s => {
                            if (s.id === slotId) {
                                return { ...s, imageUrl: task.postSlot.images[task.postSlot.images.length - 1].url };
                            }
                            return s;
                        }));
                        setPollTaskId(prev => ({ ...prev, [slotId]: null }));
                        setIsReworkingImage(prev => ({ ...prev, [slotId]: false }));
                        foundFinished = true;
                    } else if (task && task.status === "failed") {
                        alert("Fehler bei der Bildgenerierung: " + (task.errorMessage || "Unbekannt"));
                        setPollTaskId(prev => ({ ...prev, [slotId]: null }));
                        setIsReworkingImage(prev => ({ ...prev, [slotId]: false }));
                    }
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        };

        const interval = setInterval(poll, 3000);
        return () => { active = false; clearInterval(interval); };
    }, [pollTaskId, weekPlanId]);


    // When finalized, the posts are read-only
    const renderFinalized = () => {
        return (
            <div className="container mx-auto py-8 max-w-4xl pb-24">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-center">Wochenübersicht</h1>
                    <Button variant="outline" className="text-neutral-600">Exportieren (Demnächst)</Button>
                </div>

                <div className="space-y-12">
                    {slots.map((slot, index) => (
                        <Card key={slot.id} className="transition-all duration-300 border-gray-300">
                            {/* Facebook Style Preview */}
                            <div className="p-4 sm:p-6 pb-2 bg-transparent rounded-t-xl overflow-hidden flex justify-center">
                                <div className="max-w-[500px] w-full mx-auto border border-border/50 rounded-lg overflow-hidden bg-white shadow-sm">
                                    <FacebookPostHeader postNumber={index + 1} datePrefix={getDateForWeekday(weekPlan.year, weekPlan.week, slot.weekday)} />

                                    {slot.imageUrl ? (
                                        <div className="relative bg-muted border-y">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={slot.imageUrl} alt="Post Bild" className="w-full aspect-square object-cover" />
                                        </div>
                                    ) : (
                                        <div className="relative bg-muted aspect-square flex items-center justify-center border-y">
                                            <p className="text-muted-foreground">Kein Bild vorhanden</p>
                                        </div>
                                    )}

                                    <div className="p-4 text-[15px] whitespace-pre-wrap font-sans text-gray-900">
                                        {slot.content}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>

                <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.1)] z-50">
                    <div className="max-w-5xl mx-auto flex items-center justify-between">
                        <Button variant="outline" onClick={() => router.push(`/`)} className="text-neutral-600 bg-white shadow-sm hover:bg-neutral-50 px-6">
                            Zurück zum Dashboard
                        </Button>
                    </div>
                </div>
            </div>
        );
    };

    if (isFinalized) {
        return renderFinalized();
    }

    const handleConfirm = (id: string) => {
        setStatuses(prev => ({ ...prev, [id]: "confirmed" }));
    };

    const handleReject = (id: string) => {
        setStatuses(prev => ({ ...prev, [id]: "rejected" }));
    };

    const handleOpenRework = (id: string) => {
        // Reset status to pending when opening rework
        setStatuses(prev => ({ ...prev, [id]: "pending" }));
        setReworkOpen(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleReworkText = async (id: string) => {
        const instr = textInstruction[id] || "";
        if (!instr.trim()) return;

        setIsReworkingText(prev => ({ ...prev, [id]: true }));
        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/rework/text`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ postSlotId: id, reworkInstruction: instr })
            });

            if (res.ok) {
                const data = await res.json();
                setSlots(prev => prev.map(s => s.id === id ? { ...s, content: data.newContent } : s));
                setTextInstruction(prev => ({ ...prev, [id]: "" }));
            } else {
                alert("Fehler beim Überarbeiten des Textes.");
            }
        } catch (e) {
            console.error(e);
            alert("Ein Fehler ist aufgetreten.");
        } finally {
            setIsReworkingText(prev => ({ ...prev, [id]: false }));
        }
    };

    const handleReworkImage = async (id: string) => {
        const instr = imageInstruction[id] || "";
        if (!instr.trim()) return;

        setIsReworkingImage(prev => ({ ...prev, [id]: true }));
        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/rework/prompt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ postSlotId: id, reworkInstruction: instr })
            });

            if (res.ok) {
                const data = await res.json();
                // Set the specific taskId to poll
                setPollTaskId(prev => ({ ...prev, [id]: data.taskId }));
                setImageInstruction(prev => ({ ...prev, [id]: "" }));
            } else {
                alert("Fehler beim Starten der Bild-Überarbeitung.");
                setIsReworkingImage(prev => ({ ...prev, [id]: false }));
            }
        } catch (e) {
            console.error(e);
            alert("Ein Fehler ist aufgetreten.");
            setIsReworkingImage(prev => ({ ...prev, [id]: false }));
        }
    };

    const finalizeWeek = async () => {
        setIsFinalizing(true);
        try {
            const confirmedIds = Object.entries(statuses).filter(([_, st]) => st === "confirmed").map(([id, _]) => id);
            const rejectedIds = Object.entries(statuses).filter(([_, st]) => st === "rejected").map(([id, _]) => id);

            const res = await fetch(`/api/week-plans/${weekPlanId}/finalize`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    confirmedSlotIds: confirmedIds,
                    rejectedSlotIds: rejectedIds
                })
            });

            if (res.ok) {
                setFinalizeDialogOpen(false);
                // Redirect back to dashboard where they can see it as locked
                setTimeout(() => {
                    router.push('/');
                }, 1000); // slight delay for DB cleanup logic init
            } else {
                alert("Fehler beim Abschließen der Woche.");
                setIsFinalizing(false);
            }
        } catch (e) {
            console.error(e);
            alert("Fehler aufgetreten.");
            setIsFinalizing(false);
        }
    };

    const totalSlots = slots.length;
    const processedSlots = Object.values(statuses).filter(s => s !== "pending").length;
    const allProcessed = totalSlots > 0 && processedSlots === totalSlots;

    return (
        <div className="container mx-auto py-8 max-w-4xl pb-24">

            <div className="mb-0">
                <h1 className="text-3xl font-bold mb-4 text-center">Finale Bestätigung</h1>

                {/* Notice Banner */}
                {!allProcessed && (
                    <div className="bg-amber-50 border-amber-200 border p-4 rounded-lg flex items-start gap-4 mb-8">
                        <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-amber-900">
                            <p className="font-semibold mb-1">Bitte bestätige oder lehne jeden Post ab.</p>
                            <p className="text-sm">Beim Abschließen der Woche werden alle nicht verwendeten Entwürfe, Textvarianten und Bilder unwiderruflich gelöscht. Nur die bestätigten Inhalte bleiben erhalten.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Removed top Progress Bar - Moved to sticky footer */}

            <div className="space-y-12 mt-8">
                {slots.map((slot, index) => {
                    const status = statuses[slot.id];
                    const isConfirmed = status === "confirmed";
                    const isRejected = status === "rejected";
                    const isReworking = !!reworkOpen[slot.id];

                    return (
                        <Card
                            key={slot.id}
                            className={`transition-all duration-300 ${isConfirmed ? 'bg-teal-50/10 border-gray-300 shadow-sm' :
                                isRejected ? 'opacity-50 grayscale bg-muted border-dashed border-gray-300' :
                                    'border-gray-300'
                                }`}
                        >
                            <div className="flex justify-end p-4 pb-0">
                                {isConfirmed && <Badge className="bg-teal-500">Bestätigt</Badge>}
                                {isRejected && <Badge variant="secondary">Abgelehnt</Badge>}
                            </div>

                            {/* Facebook Style Preview */}
                            <div className="p-4 sm:p-6 pb-2 border-b bg-transparent rounded-t-xl overflow-hidden flex justify-center">
                                <div className="max-w-[500px] w-full mx-auto border border-border/50 rounded-lg overflow-hidden bg-white shadow-sm">
                                    <FacebookPostHeader postNumber={index + 1} datePrefix={getDateForWeekday(weekPlan.year, weekPlan.week, slot.weekday)} />

                                    {/* Post Image */}
                                    {slot.imageUrl ? (
                                        <div className="relative bg-muted border-y">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={slot.imageUrl} alt="Post Bild" className="w-full aspect-square object-cover" />
                                        </div>
                                    ) : (
                                        <div className="relative bg-muted aspect-square flex items-center justify-center border-y">
                                            <p className="text-muted-foreground">Kein Bild vorhanden</p>
                                        </div>
                                    )}

                                    {/* Post Text */}
                                    <div className="p-4 text-[15px] whitespace-pre-wrap font-sans text-gray-900">
                                        {slot.content}
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <CardFooter className="bg-transparent p-4 flex gap-3 flex-col sm:flex-row">
                                <Button
                                    variant="outline"
                                    className={`flex-1 hover:text-red-600 text-red-600 border-gray-300 bg-white hover:bg-red-50`}
                                    onClick={() => handleReject(slot.id)}
                                >
                                    <XCircle className="w-4 h-4 mr-2" /> Ablehnen
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => handleOpenRework(slot.id)}
                                    className={`flex-1 border-gray-300 bg-white ${isReworking ? "bg-teal-50 text-teal-700 hover:bg-teal-100" : "text-neutral-800 hover:bg-neutral-50"}`}
                                >
                                    <Edit3 className="w-4 h-4 mr-2" /> Überarbeiten
                                </Button>
                                <Button
                                    className={`flex-1 bg-teal-600 hover:bg-teal-700 text-white shadow-md ${isConfirmed ? 'ring-2 ring-offset-2 ring-teal-500' : ''}`}
                                    onClick={() => handleConfirm(slot.id)}
                                >
                                    <CheckCircle2 className="w-4 h-4 mr-2" /> Bestätigen
                                </Button>
                            </CardFooter>

                            {/* Inline Rework Section */}
                            {isReworking && (
                                <div className="border-t bg-slate-50 p-6 space-y-6 animate-in slide-in-from-top-2">
                                    <div className="bg-primary/10 text-primary-foreground border border-primary/20 p-3 rounded-md text-sm text-primary mb-4">
                                        <strong>Hinweis:</strong> Nicht übernommene Varianten werden beim Abschließen der Woche gelöscht.
                                    </div>

                                    {/* Text Rework */}
                                    <div className="space-y-3">
                                        <h4 className="font-semibold text-sm">Text überarbeiten</h4>
                                        <Textarea
                                            placeholder="Was soll am Text geändert werden? (z.B. Mach es kürzer und lustiger)"
                                            value={textInstruction[slot.id] || ""}
                                            onChange={(e) => setTextInstruction(prev => ({ ...prev, [slot.id]: e.target.value }))}
                                            className="bg-white"
                                        />
                                        <Button
                                            variant="secondary"
                                            onClick={() => handleReworkText(slot.id)}
                                            disabled={isReworkingText[slot.id]}
                                        >
                                            {isReworkingText[slot.id] ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                            Text neu generieren
                                        </Button>
                                    </div>

                                    {/* Image Rework */}
                                    <div className="space-y-3 pt-4 border-t">
                                        <h4 className="font-semibold text-sm">Bild überarbeiten</h4>
                                        <Textarea
                                            placeholder="Was soll am Bild geändert werden? (z.B. Zeige statt einem blauen Ball einen grünen Apfel)"
                                            value={imageInstruction[slot.id] || ""}
                                            onChange={(e) => setImageInstruction(prev => ({ ...prev, [slot.id]: e.target.value }))}
                                            className="bg-white"
                                        />
                                        <Button
                                            variant="secondary"
                                            onClick={() => handleReworkImage(slot.id)}
                                            disabled={isReworkingImage[slot.id] || pollTaskId[slot.id] !== undefined && pollTaskId[slot.id] !== null}
                                        >
                                            {(isReworkingImage[slot.id] || pollTaskId[slot.id]) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                            {(isReworkingImage[slot.id] || pollTaskId[slot.id]) ? "Bild wird generiert (kann etwas dauern)..." : "Bild neu generieren"}
                                        </Button>
                                    </div>

                                    <div className="text-xs text-muted-foreground text-right mt-2">
                                        Nach der Überarbeitung das Bestätigen oben nicht vergessen!
                                    </div>
                                </div>
                            )}

                        </Card>
                    );
                })}
            </div>

            {/* Finalize Dialog */}
            <Dialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Woche wirklich abschließen?</DialogTitle>
                        <DialogDescription className="pt-4 text-amber-700 font-medium">
                            Die Woche wird jetzt abgeschlossen. Alle nicht verwendeten Textvarianten, Entwürfe und Bilder werden unwiderruflich gelöscht. Abgelehnte Posts werden entfernt.
                            <br /><br />
                            Diese Aktion kann nicht rückgängig gemacht werden.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0 mt-4">
                        <Button variant="outline" onClick={() => setFinalizeDialogOpen(false)} disabled={isFinalizing}>Abbrechen</Button>
                        <Button variant="default" className="bg-teal-600 hover:bg-teal-700" onClick={finalizeWeek} disabled={isFinalizing}>
                            {isFinalizing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Ja, Woche abschließen
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Sticky Bottom Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.1)] z-50">
                <div className="max-w-5xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={() => router.push(`/plan/${weekPlanId}/generate`)} className="text-neutral-800 bg-white shadow-sm border-gray-300 hover:bg-neutral-50 px-6 h-12">
                            Zurück zur Bildauswahl
                        </Button>
                    </div>
                    <div className="flex items-center gap-3 hidden md:flex mx-auto">
                        <span className="text-neutral-600 font-medium">
                            <span className="text-xl font-bold px-1">{processedSlots}</span> von {totalSlots} Posts bearbeitet
                        </span>
                    </div>
                    <Button
                        className="bg-teal-600 hover:bg-teal-700 text-white min-w-[200px] h-12 text-base font-semibold shadow-md gap-2 flex items-center justify-center shrink-0 ml-auto"
                        disabled={!allProcessed || isFinalizing}
                        onClick={() => setFinalizeDialogOpen(true)}
                    >
                        {isFinalizing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        {isFinalizing ? "Speichere..." : "Woche abschließen und speichern"}
                    </Button>
                </div>
            </div>

        </div>
    );
}
