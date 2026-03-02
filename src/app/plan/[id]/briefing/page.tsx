"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, AlertCircle, ArrowRight, FileText } from "lucide-react";
import { FacebookPostHeader } from "@/components/shared/FacebookPostHeader";
import { getDateForWeekday } from "@/lib/dateUtils";

type Variant = {
    angle: string;
    briefingText: string;
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
        weekday?: string;
    } | null;
};

export default function BriefingPage() {
    const params = useParams();
    const router = useRouter();
    const weekPlanId = params.id as string;

    const [tasks, setTasks] = useState<TaskData[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [weekPlan, setWeekPlan] = useState<{ year: number, week: number } | null>(null);

    // State to hold the final edited briefing text for each post slot
    // map key: postSlotId
    const [editedBriefings, setEditedBriefings] = useState<Record<string, string>>({});

    // State to track which variant index (0,1,2) the user currently looks at for a given post slot
    const [selectedVariantIdx, setSelectedVariantIdx] = useState<Record<string, number>>({});

    // Hints for targeted briefing refresh
    const [refreshHints, setRefreshHints] = useState<Record<string, string>>({});

    const fetchTasks = async () => {
        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/briefing`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setTasks(data.tasks || []);
                setWeekPlan(data.weekPlan || null);
            }
        } catch (e) {
            console.error("Failed to fetch Briefing tasks", e);
        }
    };

    useEffect(() => {
        let mounted = true;
        async function loadInitial() {
            try {
                const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/briefing`, { cache: 'no-store' });
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
                    const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/briefing`, { cache: 'no-store' });
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
            if (task.status === "success" && task.postSlot && task.resultJson && !editedBriefings[task.postSlot.id]) {
                try {
                    const parsed = JSON.parse(task.resultJson);
                    if (parsed.variants && Array.isArray(parsed.variants) && parsed.variants.length > 0) {
                        let textToSet = parsed.variants[0].briefingText;
                        let idxToSet = 0;

                        if (task.postSlot.selectedBriefing) {
                            textToSet = task.postSlot.selectedBriefing;
                            // Find which variant it matches to pre-select the tab
                            const foundIdx = parsed.variants.findIndex((v: any) => v.briefingText.trim() === task.postSlot!.selectedBriefing!.trim());
                            if (foundIdx !== -1) {
                                idxToSet = foundIdx;
                            } else {
                                idxToSet = -1; // edited manually, no exact variant matched
                            }
                        }

                        setEditedBriefings(prev => ({
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
    }, [tasks, editedBriefings]);

    const handleSelectVariant = (postSlotId: string, variantIndex: number, text: string) => {
        setSelectedVariantIdx(prev => ({ ...prev, [postSlotId]: variantIndex }));
        setEditedBriefings(prev => ({ ...prev, [postSlotId]: text }));
    };

    const handleTextChange = (postSlotId: string, text: string) => {
        setEditedBriefings(prev => ({ ...prev, [postSlotId]: text }));
    };

    const handleSaveAndContinue = async () => {
        const selections = Object.keys(editedBriefings).map(postSlotId => ({
            postSlotId,
            selectedBriefing: editedBriefings[postSlotId]
        }));

        if (selections.length === 0) return;

        setIsSaving(true);
        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/save-briefing`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ selections })
            });

            if (res.ok) {
                // Submit briefings to trigger content background jobs
                const transitionRes = await fetch(`/api/week-plans/${weekPlanId}/submit-briefing`, {
                    method: "POST"
                });

                if (transitionRes.ok) {
                    router.push(`/plan/${weekPlanId}/content`);
                } else {
                    alert("Briefings gespeichert, aber Fehler beim Starten der Content-Generierung.");
                    setIsSaving(false);
                }
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(`Fehler beim Speichern: ${errorData.error || res.statusText}`);
                setIsSaving(false);
            }
        } catch (e) {
            console.error("Error saving briefings", e);
            alert("Netzwerkfehler beim Speichern.");
            setIsSaving(false);
        }
    };

    const handleRefreshBriefing = async (postSlotId: string) => {
        try {
            const reqBody = {
                postSlotId,
                customHint: refreshHints[postSlotId] || ""
            };
            const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/briefing`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reqBody)
            });
            if (res.ok) {
                setRefreshHints(prev => ({ ...prev, [postSlotId]: "" }));
                const newEdited = { ...editedBriefings };
                delete newEdited[postSlotId];
                setEditedBriefings(newEdited);

                // Pick up the new task immediately to resume polling
                await fetchTasks();
            } else {
                alert("Fehler beim Neu-Generieren des Briefings.");
            }
        } catch (e) {
            console.error("Error refreshing briefing", e);
            alert("Netzwerkfehler beim Neu-Generieren.");
        }
    };

    // Ready if all tasks have succeed (or failed)
    const isReadyToProceed = tasks.length > 0 && tasks.every(t => t.status === "success" || t.status === "failed") && Object.keys(editedBriefings).length > 0;

    return (
        <div className="max-w-5xl mx-auto space-y-8 mt-4 pb-24">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-teal-900 tracking-tight">Post-Briefings</h2>
                    <p className="text-neutral-500 mt-2">
                        Die KI entwickelt nun zu jedem deiner ausgewählten Themen 3 unterschiedliche Perspektiven (Briefing-Varianten). Wähle die beste Variante aus und pass sie bei Bedarf an.
                    </p>
                </div>
            </div>

            {tasks.length === 0 ? (
                <Card className="p-8 text-center text-neutral-500 border-dashed">
                    Keine Briefings gefunden. Bitte ordne erst auf der Research-Seite Themen zu und klicke auf "Weiter zum Briefing".
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
                                            {status === "running" && <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 font-normal"><RefreshCw className="mr-2 h-3 w-3 animate-spin" /> KI generiert Varianten</Badge>}
                                            {status === "success" && <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-100 font-normal"><CheckCircle2 className="mr-1 h-3 w-3" /> Erfolgreich</Badge>}
                                            {status === "failed" && <Badge variant="destructive" className="font-normal"><AlertCircle className="mr-1 h-3 w-3" /> Fehler</Badge>}
                                        </div>
                                    </div>

                                    {/* Targeted regeneration input */}
                                    {postSlot?.id && (status === "success" || status === "failed") && (
                                        <div className="mt-4 flex gap-2 w-full">
                                            <input
                                                type="text"
                                                placeholder="Dieses Briefing neu generieren (optional: Ausrichtung für KI mitgeben)..."
                                                className="flex-1 rounded-md border border-neutral-300 text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                value={refreshHints[postSlot.id] || ""}
                                                onChange={e => setRefreshHints(prev => ({ ...prev, [postSlot.id]: e.target.value }))}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRefreshBriefing(postSlot.id);
                                                }}
                                            />
                                            <Button size="sm" variant="outline" className="text-teal-700 border-teal-200 hover:bg-teal-50 h-auto py-2" onClick={() => handleRefreshBriefing(postSlot.id)}>
                                                <RefreshCw className="h-4 w-4 mr-2" /> Neu generieren
                                            </Button>
                                        </div>
                                    )}
                                </CardHeader>

                                <div className="w-full bg-white relative">
                                    {status === "failed" && <div className="p-6 text-red-500 bg-red-50/30 text-sm">{task.errorMessage || "JSON konnte nicht geparst werden."}</div>}

                                    {(status === "queued" || status === "running") && (
                                        <div className="flex flex-col items-center justify-center p-14 text-neutral-400 space-y-4">
                                            <FileText className="h-10 w-10 animate-bounce text-indigo-300" />
                                            <span className="animate-pulse font-medium text-neutral-500">Konzipiere 3 mögliche Post-Angles...</span>
                                        </div>
                                    )}

                                    {status === "success" && variants.length > 0 && postSlot && (
                                        <div className="p-6 flex flex-col md:flex-row gap-6">

                                            {/* Left column: Variant selection tabs */}
                                            <div className="w-full md:w-1/3 space-y-3">
                                                <h4 className="text-sm font-semibold text-neutral-700 mb-4 tracking-wider">Perspektive auswählen</h4>
                                                {variants.map((v, idx) => {
                                                    const isSelected = selectedVariantIdx[postSlot.id] === idx;
                                                    return (
                                                        <button
                                                            key={idx}
                                                            onClick={() => handleSelectVariant(postSlot.id, idx, v.briefingText)}
                                                            className={`w-full text-left p-4 rounded-lg border transition-all ${isSelected ? 'bg-[#1877F2] border-[#1877F2] shadow-sm text-white' : 'bg-white border-gray-300 hover:bg-gray-50 text-neutral-800'}`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className={`font-semibold ${isSelected ? 'text-white' : 'text-neutral-700'}`}>{v.angle}</span>
                                                                {isSelected && <CheckCircle2 className="h-4 w-4 text-white" />}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Right column: Editor */}
                                            <div className="w-full md:w-2/3 border rounded-xl overflow-hidden bg-white flex flex-col shadow-sm">
                                                <div className="bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-500 border-b flex justify-between">
                                                    <span>Briefing-Text (editierbar)</span>
                                                    <span>{selectedVariantIdx[postSlot.id] !== undefined ? variants[selectedVariantIdx[postSlot.id]]?.angle : ''}</span>
                                                </div>
                                                <Textarea
                                                    value={editedBriefings[postSlot.id] || ""}
                                                    onChange={(e) => handleTextChange(postSlot.id, e.target.value)}
                                                    className="border-0 focus-visible:ring-0 rounded-none shadow-none min-h-[220px] text-sm leading-relaxed p-4 resize-y bg-neutral-50/50"
                                                    placeholder="Briefing-Text..."
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
            )}

            {/* Sticky Bottom Bar */}
            {(tasks.length > 0) && (
                <div className="sticky bottom-0 z-50 mt-8 pb-4">
                    <div className="bg-white border rounded-xl p-4 shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.1)] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Button variant="outline" onClick={() => router.push(`/plan/${weekPlanId}/research`)} className="text-neutral-800 bg-white shadow-sm border-gray-300 hover:bg-neutral-50 px-6 h-12">
                                Zurück
                            </Button>
                        </div>
                        <div className="flex items-center gap-3 hidden md:flex">
                            <span className="text-neutral-600 font-medium">Für jeden Post eine Perspektive auswählen</span>
                            {!isReadyToProceed && <Badge variant="outline" className="text-neutral-500">Warte auf KI...</Badge>}
                        </div>
                        <Button
                            className="bg-teal-600 hover:bg-teal-700 text-white min-w-[200px] h-12 text-base font-semibold shadow-md gap-2"
                            disabled={!isReadyToProceed || isSaving}
                            onClick={handleSaveAndContinue}
                        >
                            {isSaving ? <RefreshCw className="h-5 w-5 animate-spin" /> : null}
                            {isSaving ? "Speichere..." : "Briefings speichern & Weiter"}
                            {!isSaving && <ArrowRight className="h-5 w-5" />}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
