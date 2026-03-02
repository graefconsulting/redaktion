"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, AlertCircle, ArrowRight, FileText } from "lucide-react";
import { FacebookPostHeader } from "@/components/shared/FacebookPostHeader";
import { getDateForWeekday } from "@/lib/dateUtils";

type Variant = {
    tone: string;
    content: string;
};

type TaskData = {
    id: string;
    status: "queued" | "running" | "success" | "failed";
    resultJson?: string;
    errorMessage?: string;
    postSlot: {
        id: string;
        category: string;
        userInstruction: string;
        selectedBriefing: string | null;
        content: string | null;
        weekday?: string;
    } | null;
};

export default function ContentPage() {
    const params = useParams();
    const router = useRouter();
    const weekPlanId = params.id as string;

    const [tasks, setTasks] = useState<TaskData[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [weekPlan, setWeekPlan] = useState<{ year: number, week: number } | null>(null);

    // State to hold the final edited post content for each post slot
    // map key: postSlotId
    const [editedContents, setEditedContents] = useState<Record<string, string>>({});

    // State to track which variant index (0,1,2) the user currently looks at for a given post slot
    const [selectedVariantIdx, setSelectedVariantIdx] = useState<Record<string, number>>({});

    // Hints for targeted content refresh
    const [refreshHints, setRefreshHints] = useState<Record<string, string>>({});

    const fetchTasks = async () => {
        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/content`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setTasks(data.tasks || []);
                setWeekPlan(data.weekPlan || null);
            }
        } catch (e) {
            console.error("Failed to fetch Content tasks", e);
        }
    };

    useEffect(() => {
        let mounted = true;
        async function loadInitial() {
            try {
                const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/content`, { cache: 'no-store' });
                if (res.ok && mounted) {
                    const data = await res.json();
                    setTasks(data.tasks || []);
                    setWeekPlan(data.weekPlan || null);
                }
            } catch (e) {
                console.error(e);
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
                    const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/content`, { cache: 'no-store' });
                    if (res.ok && active) {
                        const data = await res.json();
                        setTasks(data.tasks || []);
                        setWeekPlan(data.weekPlan || null);
                    }
                } catch {
                    // ignore
                }
            };
            const interval = setInterval(poll, 3000);
            return () => { active = false; clearInterval(interval); };
        }
    }, [tasks, weekPlanId]);

    // Handle initial populations when a task succeeds
    useEffect(() => {
        tasks.forEach(task => {
            if (task.status === "success" && task.postSlot && task.resultJson && !editedContents[task.postSlot.id]) {
                try {
                    const parsed = JSON.parse(task.resultJson);
                    if (parsed.variants && Array.isArray(parsed.variants) && parsed.variants.length > 0) {
                        let textToSet = parsed.variants[0].content;
                        let idxToSet = 0;

                        if (task.postSlot.content) {
                            textToSet = task.postSlot.content;
                            // Find which variant it matches to pre-select the tab
                            const foundIdx = parsed.variants.findIndex((v: any) => v.content.trim() === task.postSlot!.content!.trim());
                            if (foundIdx !== -1) {
                                idxToSet = foundIdx;
                            } else {
                                idxToSet = -1; // edited manually, no exact variant matched
                            }
                        }

                        setEditedContents(prev => ({
                            ...prev,
                            [task.postSlot!.id]: textToSet
                        }));
                        setSelectedVariantIdx(prev => ({
                            ...prev,
                            [task.postSlot!.id]: idxToSet
                        }));
                    }
                } catch (e) {
                    console.error("Failed to parse variants", e);
                }
            }
        });
    }, [tasks, editedContents]);

    const handleSelectVariant = (postSlotId: string, variantIndex: number, text: string) => {
        setSelectedVariantIdx(prev => ({ ...prev, [postSlotId]: variantIndex }));
        setEditedContents(prev => ({ ...prev, [postSlotId]: text }));
    };

    const handleTextChange = (postSlotId: string, text: string) => {
        setEditedContents(prev => ({ ...prev, [postSlotId]: text }));
    };

    const handleSaveAndContinue = async () => {
        const selections = Object.keys(editedContents).map(postSlotId => ({
            postSlotId,
            content: editedContents[postSlotId]
        }));

        if (selections.length === 0) return;

        setIsSaving(true);
        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/submit-content`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: selections })
            });

            if (res.ok) {
                router.push(`/plan/${weekPlanId}/images`);
                // We do not immediately set isSaving false so the button stays locked during redirect
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(`Fehler beim Speichern: ${errorData.error || res.statusText}`);
                setIsSaving(false);
            }
        } catch (e) {
            console.error("Error saving content", e);
            alert("Netzwerkfehler beim Speichern.");
            setIsSaving(false);
        }
    };

    const handleRefreshContent = async (postSlotId: string) => {
        try {
            const reqBody = {
                postSlotId,
                customHint: refreshHints[postSlotId] || ""
            };
            const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/content`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reqBody)
            });
            if (res.ok) {
                setRefreshHints(prev => ({ ...prev, [postSlotId]: "" }));
                const newEdited = { ...editedContents };
                delete newEdited[postSlotId];
                setEditedContents(newEdited);

                // Pick up the new task immediately to resume polling
                await fetchTasks();
            } else {
                alert("Fehler beim Neu-Generieren des Contents.");
            }
        } catch (e) {
            console.error("Error refreshing content", e);
            alert("Netzwerkfehler beim Neu-Generieren.");
        }
    };

    // Ready if all tasks have succeed (or failed)
    const isReadyToProceed = tasks.length > 0 && tasks.every(t => t.status === "success" || t.status === "failed") && Object.keys(editedContents).length > 0;

    return (
        <div className="max-w-5xl mx-auto space-y-8 mt-4 pb-24">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-teal-900 tracking-tight">Content-Erstellung</h2>
                    <p className="text-neutral-500 mt-2">
                        Die KI erstellt nun aus deinen finalen Briefings 3 unterschiedliche Post-Varianten pro Thema. Diese unterscheiden sich vor allem in der Tonalität und der Häufigkeit von Emojis.
                    </p>
                </div>
            </div>

            {
                tasks.length === 0 ? (
                    <Card className="p-8 text-center text-neutral-500 border-dashed">
                        Keine Content-Tasks gefunden. Bitte schließe erst die Briefing-Phase ab.
                    </Card>
                ) : (
                    <div className="space-y-8">
                        {tasks.map((task, index) => {
                            const status = task.status;
                            const postSlot = task.postSlot;

                            // Parse topic info from userInstruction
                            let topicTitle = "Ungeklärtes Thema";
                            let topicDesc = "";
                            if (postSlot && postSlot.userInstruction) {
                                const lines = postSlot.userInstruction.split('\n');
                                topicTitle = lines.find(l => l.startsWith("Titel: "))?.replace("Titel: ", "") || "Thema " + (index + 1);
                                topicDesc = lines.find(l => l.startsWith("Beschreibung: "))?.replace("Beschreibung: ", "") || "";
                            }

                            let variants: Variant[] = [];
                            if (task.resultJson && status === "success") {
                                try {
                                    const parsed = JSON.parse(task.resultJson);
                                    if (parsed.variants && Array.isArray(parsed.variants)) {
                                        variants = parsed.variants;
                                    }
                                } catch { }
                            }

                            return (
                                <Card key={task.id} className={`flex flex-col border overflow-hidden ${status === 'success' ? 'border-gray-300 shadow-sm' : 'border-gray-300 border-dashed opacity-90'}`}>
                                    <FacebookPostHeader datePrefix={weekPlan && postSlot?.weekday ? getDateForWeekday(weekPlan.year, weekPlan.week, postSlot.weekday) : (postSlot?.weekday || "")} />
                                    <CardHeader className="py-4 border-b bg-neutral-50/80">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <CardTitle className="text-lg text-neutral-800 font-bold">{topicTitle}</CardTitle>
                                                </div>
                                                {topicDesc && <p className="text-sm text-neutral-500 truncate max-w-2xl">{topicDesc}</p>}
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                {status === "queued" && <Badge variant="secondary" className="bg-blue-100 text-blue-700 font-normal">Wartet...</Badge>}
                                                {status === "running" && <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 font-normal"><RefreshCw className="mr-2 h-3 w-3 animate-spin" /> KI schreibt Post-Texte</Badge>}
                                                {status === "success" && <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-100 font-normal"><CheckCircle2 className="mr-1 h-3 w-3" /> Erfolgreich</Badge>}
                                                {status === "failed" && <Badge variant="destructive" className="font-normal"><AlertCircle className="mr-1 h-3 w-3" /> Fehler</Badge>}
                                            </div>
                                        </div>

                                        {/* Targeted regeneration input */}
                                        {postSlot?.id && (status === "success" || status === "failed") && (
                                            <div className="mt-4 flex gap-2 w-full">
                                                <input
                                                    type="text"
                                                    placeholder="Diesen Content neu generieren (optional: Spezifische Wünsche zur Tonalität/Emojis mitgeben)..."
                                                    className="flex-1 rounded-md border border-neutral-300 text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                    value={refreshHints[postSlot.id] || ""}
                                                    onChange={e => setRefreshHints(prev => ({ ...prev, [postSlot.id]: e.target.value }))}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRefreshContent(postSlot.id);
                                                    }}
                                                />
                                                <Button size="sm" variant="outline" className="text-teal-700 border-teal-200 hover:bg-teal-50 h-auto py-2" onClick={() => handleRefreshContent(postSlot.id)}>
                                                    <RefreshCw className="h-4 w-4 mr-2" /> Neu generieren
                                                </Button>
                                            </div>
                                        )}
                                    </CardHeader>

                                    <div className="w-full bg-white relative">
                                        {status === "failed" && <div className="p-6 text-red-500 bg-red-50/30 text-sm">{task.errorMessage || "JSON konnte nicht geparst werden."}</div>}

                                        {(status === "queued" || status === "running") && (
                                            <div className="flex flex-col items-center justify-center p-14 text-neutral-400 space-y-4">
                                                <FileText className="h-10 w-10 animate-pulse text-indigo-300" />
                                                <span className="animate-pulse font-medium text-neutral-500">Tippe 3 verschiedene Entwürfe...</span>
                                            </div>
                                        )}

                                        {status === "success" && variants.length > 0 && postSlot && (
                                            <div className="p-6 flex flex-col xl:flex-row gap-6">

                                                {/* Left column: Variant selection tabs */}
                                                <div className="w-full xl:w-1/3 space-y-3">
                                                    <h4 className="text-sm font-semibold text-neutral-700 mb-4 tracking-wider">Tonalität wählen</h4>
                                                    {variants.map((v, idx) => {
                                                        const isSelected = selectedVariantIdx[postSlot.id] === idx;
                                                        return (
                                                            <button
                                                                key={idx}
                                                                onClick={() => handleSelectVariant(postSlot.id, idx, v.content)}
                                                                className={`w-full text-left p-4 rounded-lg border transition-all flex items-center justify-between ${isSelected ? 'bg-[#1877F2] border-[#1877F2] shadow-sm text-white' : 'bg-white border-gray-300 hover:bg-gray-50 text-neutral-800'}`}
                                                            >
                                                                <span className={`font-semibold ${isSelected ? 'text-white' : 'text-neutral-700'}`}>{v.tone}</span>
                                                                {isSelected && <CheckCircle2 className="h-4 w-4 text-white shrink-0 ml-3" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {/* Right column: Editor */}
                                                <div className="w-full xl:w-2/3 border rounded-xl overflow-hidden bg-white flex flex-col shadow-sm">
                                                    <div className="bg-neutral-100 px-4 py-3 text-xs font-semibold text-neutral-500 border-b flex justify-between items-center bg-gradient-to-r from-neutral-100 to-white">
                                                        <span>Post-Text (editierbar)</span>
                                                        <Badge variant="outline" className="text-neutral-600 border-gray-300 bg-white">
                                                            {selectedVariantIdx[postSlot.id] !== undefined ? variants[selectedVariantIdx[postSlot.id]]?.tone : ''}
                                                        </Badge>
                                                    </div>
                                                    <Textarea
                                                        value={editedContents[postSlot.id] || ""}
                                                        onChange={(e) => handleTextChange(postSlot.id, e.target.value)}
                                                        className="border-0 focus-visible:ring-0 rounded-none shadow-none min-h-[300px] text-sm leading-relaxed p-5 resize-y bg-neutral-50/30 font-medium text-neutral-800"
                                                        placeholder="Post-Text..."
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {status === "success" && variants.length === 0 && (
                                            <div className="p-6 text-center text-orange-500 bg-orange-50 text-sm">Das Format der KI-Antwort enthielt keine gültigen Varianten.</div>
                                        )}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )
            }

            {/* Sticky Bottom Bar */}
            {
                (tasks.length > 0) && (
                    <div className="sticky bottom-0 z-50 mt-8 pb-4">
                        <div className="bg-white border rounded-xl p-4 shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.1)] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Button variant="outline" onClick={() => router.push(`/plan/${weekPlanId}/briefing`)} className="text-neutral-800 bg-white shadow-sm border-gray-300 hover:bg-neutral-50 px-6 h-12">
                                    Zurück
                                </Button>
                            </div>
                            <div className="flex items-center gap-3 hidden md:flex">
                                <span className="text-neutral-600 font-medium">Für jeden Post eine Tonalität auswählen</span>
                                {!isReadyToProceed && <Badge variant="outline" className="text-neutral-500">Warte auf KI...</Badge>}
                            </div>
                            <Button
                                className="bg-teal-600 hover:bg-teal-700 text-white min-w-[200px] h-12 text-base font-semibold shadow-md gap-2"
                                disabled={!isReadyToProceed || isSaving}
                                onClick={handleSaveAndContinue}
                            >
                                {isSaving ? <RefreshCw className="h-5 w-5 animate-spin" /> : null}
                                {isSaving ? "Speichere..." : "Texte speichern & Weiter zu Bildern"}
                                {!isSaving && <ArrowRight className="h-5 w-5" />}
                            </Button>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
