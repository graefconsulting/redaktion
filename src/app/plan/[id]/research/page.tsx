"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, AlertCircle, ArrowRight, BrainCircuit, Plus, Trash2 } from "lucide-react";

const CATEGORIES = ["Gesundheit", "Nahrungsergänzungsmittel", "Wasser", "Sport", "Saisonalität"];

type TaskData = {
    id: string;
    category: string;
    status: "queued" | "running" | "success" | "failed";
    resultJson?: string;
    errorMessage?: string;
};

export default function ResearchPage() {
    const params = useParams();
    const router = useRouter();
    const weekPlanId = params.id as string;

    const [tasks, setTasks] = useState<TaskData[]>([]);
    const [isStarting, setIsStarting] = useState(false);

    // Category selection state
    const [selectedCategories, setSelectedCategories] = useState<string[]>(CATEGORIES);
    const [globalHints, setGlobalHints] = useState("");

    // Tracking checks in the results table: key is `${cat}-ai-${idx}` or `${cat}-custom-${idx}`
    const [checkedTopics, setCheckedTopics] = useState<Record<string, boolean>>({});

    // Custom topics added by user manually per category
    const [customTopics, setCustomTopics] = useState<Record<string, { title: string, description: string }[]>>({});
    const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

    // Hints for targeted category refresh
    const [refreshHints, setRefreshHints] = useState<Record<string, string>>({});

    // Weekdays mapped to topic keys, e.g., "Gesundheit-ai-0" -> "Montag"
    const [topicWeekdays, setTopicWeekdays] = useState<Record<string, string>>({});

    const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
    const globallyAssignedDays = new Set(Object.values(topicWeekdays).filter(Boolean));

    const isPolling = tasks.some(t => t.status === "queued" || t.status === "running");

    // Determine if we should show selection view or results view
    // If we have tasks (even completed ones), we are in results view.
    const hasStartedResearch = tasks.length > 0 || isStarting;

    const fetchTasks = async () => {
        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/research`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setTasks(data.tasks || []);
                if (data.tasks && data.tasks.length > 0) {
                    const activeCats = data.tasks.map((t: TaskData) => t.category);
                    setSelectedCategories(activeCats);
                }
                if (data.globalHints !== undefined) {
                    setGlobalHints(data.globalHints);
                }
            }
        } catch (e) {
            console.error("Failed to fetch tasks", e);
        }
    };

    useEffect(() => {
        let mounted = true;
        async function loadInitial() {
            try {
                const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/research`, { cache: 'no-store' });
                if (res.ok && mounted) {
                    const data = await res.json();
                    setTasks(data.tasks || []);

                    if (data.tasks && data.tasks.length > 0) {
                        const activeCats = data.tasks.map((t: TaskData) => t.category);
                        setSelectedCategories(activeCats);
                    }

                    if (data.globalHints !== undefined) {
                        setGlobalHints(data.globalHints);
                    }

                    if (data.postSlots && data.postSlots.length > 0 && data.tasks && data.tasks.length > 0) {
                        const newChecked: Record<string, boolean> = {};
                        const newWeekdays: Record<string, string> = {};
                        const newCustoms: Record<string, { title: string, description: string }[]> = {};

                        data.postSlots.forEach((slot: any) => {
                            const cat = slot.category;
                            const instr = slot.userInstruction || "";

                            // Extract title
                            const titleMatch = instr.match(/Titel: (.*?)\nBeschreibung:/);
                            let title = "";
                            let desc = "";
                            if (titleMatch && titleMatch[1]) {
                                title = titleMatch[1].trim();
                                const descMatch = instr.split('\nBeschreibung: ')[1];
                                desc = descMatch ? descMatch.trim() : "";
                            } else {
                                title = instr; // Fallback
                            }

                            // Check AI list
                            const task = data.tasks.find((t: any) => t.category === cat && t.status === "success" && t.resultJson);
                            let aiIdx = -1;
                            if (task) {
                                try {
                                    const parsed = JSON.parse(task.resultJson);
                                    if (parsed.topics && Array.isArray(parsed.topics)) {
                                        aiIdx = parsed.topics.findIndex((t: any) => t.title === title);
                                    }
                                } catch { }
                            }

                            let key = "";
                            if (aiIdx !== -1) {
                                key = `${cat}-ai-${aiIdx}`;
                            } else {
                                if (!newCustoms[cat]) newCustoms[cat] = [];
                                const cIdx = newCustoms[cat].length;
                                key = `${cat}-custom-${cIdx}`;
                                newCustoms[cat].push({ title, description: desc });
                            }

                            if (key) {
                                newChecked[key] = true;
                                if (slot.weekday) {
                                    newWeekdays[key] = slot.weekday;
                                }
                            }
                        });

                        setCheckedTopics(newChecked);
                        setTopicWeekdays(newWeekdays);
                        setCustomTopics(newCustoms);
                    }
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
                    const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/research`, { cache: 'no-store' });
                    if (res.ok && active) {
                        const data = await res.json();
                        setTasks(data.tasks || []);
                    }
                } catch {
                    // ignore
                }
            };
            const interval = setInterval(poll, 3000);
            return () => { active = false; clearInterval(interval); };
        }
    }, [tasks, weekPlanId]);

    const handleStartResearch = async () => {
        if (selectedCategories.length === 0) return;

        setIsStarting(true);
        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/research`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ categories: selectedCategories })
            });

            if (res.ok) {
                await fetchTasks();
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(`Fehler beim Starten der KI: ${errorData.error || res.statusText}`);
            }
        } catch (e) {
            console.error("Error starting research", e);
            alert("Netzwerkfehler beim Starten der KI.");
        } finally {
            setIsStarting(false);
        }
    };

    const handleRestartResearch = async () => {
        if (!confirm("Achtung: Dadurch werden die bestehenden Ergebnisse gelöscht und du kannst neue Kategorien wählen. Fortfahren?")) return;

        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/research`, { method: "DELETE" });
            if (res.ok) {
                setTasks([]);
                setCheckedTopics({});
                setCustomTopics({});
                setRefreshHints({});
                setSelectedCategories(CATEGORIES); // Reset to default all
            }
        } catch (e) {
            console.error("Error restarting", e);
            alert("Fehler beim Zurücksetzen.");
        }
    };

    const handleRefreshCategory = async (cat: string) => {
        try {
            const reqBody = {
                categories: [cat],
                customHints: { [cat]: refreshHints[cat] || "" }
            };
            const res = await fetch(`/api/week-plans/${weekPlanId}/tasks/research`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reqBody)
            });
            if (res.ok) {
                // Clear the input and existing checks for this category
                setRefreshHints(prev => ({ ...prev, [cat]: "" }));
                const newChecks = { ...checkedTopics };
                Object.keys(newChecks).forEach(k => {
                    if (k.startsWith(`${cat}-ai-`)) delete newChecks[k];
                });
                setCheckedTopics(newChecks);
                await fetchTasks();
            } else {
                alert("Fehler beim Neu-Generieren der Kategorie.");
            }
        } catch (e) {
            console.error("Error refreshing category", e);
            alert("Netzwerkfehler beim Neu-Generieren.");
        }
    };

    const handleAddCustomTopic = (cat: string) => {
        const title = (customInputs[cat] || "").trim();
        if (!title) return;

        setCustomTopics(prev => ({
            ...prev,
            [cat]: [...(prev[cat] || []), { title, description: "Manuell hinzugefügtes Thema" }]
        }));

        setCustomInputs(prev => ({ ...prev, [cat]: "" }));

        // Auto-check the newly added topic
        const newIdx = (customTopics[cat]?.length || 0);
        const key = `${cat}-custom-${newIdx}`;
        setCheckedTopics(prev => ({ ...prev, [key]: true }));
    };

    const totalSelected = Object.values(checkedTopics).filter(Boolean).length;

    const handleSubmitToBriefing = async () => {
        if (totalSelected === 0) return;
        setIsStarting(true); // Re-use the starting state for loading

        // Construct the payload of selected topics
        const selectedPayload: { title: string, description: string, category: string, weekday: string }[] = [];

        for (const cat of selectedCategories) {
            // Check AI topics
            const task = tasks.find(t => t.category === cat);
            if (task && task.resultJson && task.status === "success") {
                try {
                    const parsed = JSON.parse(task.resultJson);
                    if (parsed.topics && Array.isArray(parsed.topics)) {
                        parsed.topics.forEach((topic: any, idx: number) => {
                            const key = `${cat}-ai-${idx}`;
                            if (checkedTopics[key]) {
                                selectedPayload.push({
                                    title: topic.title,
                                    description: topic.description,
                                    category: cat,
                                    weekday: topicWeekdays[key] || ""
                                });
                            }
                        });
                    }
                } catch {
                    // ignore parse errors here
                }
            }

            // Check custom topics
            const catCustoms = customTopics[cat] || [];
            catCustoms.forEach((topic, idx) => {
                const key = `${cat}-custom-${idx}`;
                if (checkedTopics[key]) {
                    selectedPayload.push({
                        title: topic.title,
                        description: topic.description,
                        category: cat,
                        weekday: topicWeekdays[key] || ""
                    });
                }
            });
        }

        // Validate weekdays
        const missingDays = selectedPayload.filter(p => !p.weekday);
        if (missingDays.length > 0) {
            alert("Bitte weise jedem ausgewählten Post einen Wochentag zu.");
            setIsStarting(false);
            return;
        }

        try {
            const res = await fetch(`/api/week-plans/${weekPlanId}/submit-research`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topics: selectedPayload, globalHints })
            });

            if (res.ok) {
                router.push(`/plan/${weekPlanId}/briefing`);
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(`Fehler beim Speichern der Briefings: ${errorData.error || res.statusText}`);
                setIsStarting(false);
            }
        } catch (e) {
            console.error("Error submitting to briefing", e);
            alert("Netzwerkfehler beim Weitergehen.");
            setIsStarting(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 mt-4 pb-24">

            {!hasStartedResearch ? (
                // -----------------------------------------------------
                // STEP 1: CATEGORY SELECTION VIEW
                // -----------------------------------------------------
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-3xl font-bold text-teal-900 tracking-tight">Research & KI-Brainstorming</h2>
                            <p className="text-neutral-500 mt-2">
                                Welche Kategorien sollen recherchiert werden? Wähle die Themenbereiche für diese Woche aus.
                            </p>
                        </div>
                        <Button variant="outline" onClick={() => router.push('/')} className="text-neutral-600 bg-white shadow-sm hover:bg-neutral-50 hidden sm:flex">
                            Zurück zur Wochenplanung
                        </Button>
                    </div>

                    <Card className="border-gray-300 shadow-sm mt-6 bg-white overflow-hidden">
                        <CardHeader className="bg-neutral-50/50 border-b pb-4">
                            <CardTitle className="text-xl text-neutral-800">Kategorie-Auswahl</CardTitle>
                            <CardDescription>Die ausgewählten Kategorien werden vom KI-Agenten parallel recherchiert.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="flex flex-wrap gap-4 mb-8">
                                {CATEGORIES.map(cat => (
                                    <label key={cat} className={`flex items-center space-x-3 border rounded-lg px-5 py-4 cursor-pointer transition-colors shadow-sm ${selectedCategories.includes(cat) ? 'bg-teal-50 border-teal-300' : 'bg-white border-gray-300 hover:bg-gray-50'}`}>
                                        <input
                                            type="checkbox"
                                            checked={selectedCategories.includes(cat)}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedCategories(prev => [...prev, cat]);
                                                else setSelectedCategories(prev => prev.filter(c => c !== cat));
                                            }}
                                            className="h-5 w-5 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                                        />
                                        <span className={`font-medium ${selectedCategories.includes(cat) ? 'text-teal-900' : 'text-neutral-700'}`}>{cat}</span>
                                    </label>
                                ))}
                            </div>

                            <div className="space-y-3 pt-6 border-t border-neutral-100">
                                <label className="text-sm font-semibold text-neutral-800">Allgemeine Hinweise für diese KW (Optional)</label>
                                <p className="text-sm text-neutral-500">Gibt es diese Woche eine spezielle Aktion (z.B. Black Friday, Firmenjubiläum)?</p>
                                <Textarea
                                    placeholder="Notiere hier Hinweise, die die KI berücksichtigen soll..."
                                    value={globalHints}
                                    onChange={(e) => setGlobalHints(e.target.value)}
                                    className="bg-white border-neutral-300 focus:border-teal-500 min-h-[100px]"
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="bg-neutral-50/50 border-t p-4 flex justify-end">
                            <Button
                                onClick={handleStartResearch}
                                disabled={selectedCategories.length === 0 || isStarting}
                                className="bg-teal-600 hover:bg-teal-700 text-white shadow-md gap-2 px-8"
                                size="lg"
                            >
                                {isStarting ? <RefreshCw className="h-5 w-5 animate-spin" /> : <BrainCircuit className="h-5 w-5" />}
                                {isStarting ? "KI startet..." : "KI-Research starten"}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            ) : (
                // -----------------------------------------------------
                // STEP 2: TABLE RESULTS VIEW
                // -----------------------------------------------------
                <div className="space-y-6">
                    <div className="flex justify-between items-center bg-white p-5 rounded-xl border shadow-sm sticky top-4 z-20">
                        <div>
                            <h2 className="text-2xl font-bold text-teal-900 tracking-tight">Ergebnisse des KI-Researchs</h2>
                            <p className="text-sm text-neutral-500 mt-1">Wähle die besten Themen-Ideen für deine Posts aus und ordne ihnen einen Wochentag zu.</p>
                        </div>
                        <div className="flex gap-3">
                            <Button onClick={handleRestartResearch} variant="outline" className="text-red-600 border-gray-300 hover:bg-gray-50 bg-white transition-colors">
                                <Trash2 className="mr-2 h-4 w-4" /> Research verwerfen
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-8">
                        {selectedCategories.map(cat => {
                            const task = tasks.find(t => t.category === cat);
                            if (!task) return null; // Wait until task exists before rendering
                            const status = task.status;

                            let parsedTopics: Array<{ title: string, description: string }> = [];
                            if (task.resultJson && status === "success") {
                                try {
                                    const parsed = JSON.parse(task.resultJson);
                                    if (parsed.topics && Array.isArray(parsed.topics)) {
                                        parsedTopics = parsed.topics;
                                    }
                                } catch {
                                    // parsing failed, will show error in UI
                                }
                            }

                            const catCustoms = customTopics[cat] || [];
                            const checksForCat = Object.keys(checkedTopics).filter(k => k.startsWith(cat) && checkedTopics[k]).length;

                            return (
                                <Card key={cat} className={`flex flex-col border overflow-hidden ${status === 'success' ? 'border-gray-300 shadow-sm' : 'border-gray-300 border-dashed opacity-90'}`}>
                                    <CardHeader className="py-4 border-b bg-neutral-50/80">
                                        <div className="flex justify-between items-center">
                                            <CardTitle className="text-xl text-neutral-800 font-semibold">{cat}</CardTitle>
                                            <div className="flex items-center gap-3">
                                                {status === "queued" && <Badge variant="secondary" className="bg-blue-100 text-blue-700 font-normal">Wird vorbereitet</Badge>}
                                                {status === "running" && <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 font-normal"><RefreshCw className="mr-2 h-3 w-3 animate-spin" /> KI arbeitet ...</Badge>}
                                                {status === "success" && <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-200 font-normal"><CheckCircle2 className="mr-1 h-3 w-3" /> Research abgeschlossen</Badge>}
                                                {status === "failed" && <Badge variant="destructive" className="font-normal"><AlertCircle className="mr-1 h-3 w-3" /> API Fehler</Badge>}
                                            </div>
                                        </div>

                                        {/* Targeted regeneration input */}
                                        {(status === "success" || status === "failed") && (
                                            <div className="mt-4 flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Gegebenenfalls KI-Richtung vorgeben (z.B. 'Fokus auf Senioren')..."
                                                    className="flex-1 rounded-md border border-neutral-300 text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                    value={refreshHints[cat] || ""}
                                                    onChange={e => setRefreshHints(prev => ({ ...prev, [cat]: e.target.value }))}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRefreshCategory(cat);
                                                    }}
                                                />
                                                <Button size="sm" variant="outline" className="text-teal-700 border-teal-200 hover:bg-teal-50 h-auto py-2" onClick={() => handleRefreshCategory(cat)}>
                                                    <RefreshCw className="h-4 w-4 mr-2" /> Neu generieren
                                                </Button>
                                            </div>
                                        )}
                                    </CardHeader>

                                    <div className="w-full bg-white">
                                        {status === "failed" && <div className="p-6 text-red-500 bg-red-50/30 text-sm border-b">{task.errorMessage || "JSON konnte nicht geparst werden."}</div>}
                                        {(status === "queued" || status === "running") && (
                                            <div className="flex flex-col items-center justify-center p-14 text-neutral-400 space-y-4 border-b">
                                                <BrainCircuit className="h-10 w-10 animate-pulse text-indigo-300" />
                                                <span className="animate-pulse font-medium text-neutral-500">Analysiere aktuelle Themen für "{cat}"...</span>
                                            </div>
                                        )}
                                        {status === "success" && (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="bg-teal-50/30 border-b border-teal-100/50 text-teal-900/70 text-sm font-semibold">
                                                            <th className="p-4 w-16 text-center">Wählen</th>
                                                            <th className="p-4 w-1/3">Titel des Themas</th>
                                                            <th className="p-4">Relevanz / Begründung</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {parsedTopics.length === 0 ? (
                                                            <tr><td colSpan={3} className="p-6 text-center text-red-500 bg-red-50 text-sm">Das Format der KI-Antwort war ungültig (Kein JSON-Array gefunden). Bitte neu starten.</td></tr>
                                                        ) : (
                                                            parsedTopics.map((topic, idx) => {
                                                                const key = `${cat}-ai-${idx}`;
                                                                return (
                                                                    <tr key={key} className={`border-b border-neutral-100 transition-colors ${checkedTopics[key] ? 'bg-teal-50/50' : 'hover:bg-neutral-50'}`}>
                                                                        <td className="p-4 text-center align-middle">
                                                                            <input
                                                                                type="checkbox"
                                                                                className="h-5 w-5 rounded border-neutral-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                                                                                checked={!!checkedTopics[key]}
                                                                                onChange={(e) => setCheckedTopics(prev => ({ ...prev, [key]: e.target.checked }))}
                                                                            />
                                                                        </td>
                                                                        <td className="p-4 align-middle font-medium text-neutral-800">{topic.title}</td>
                                                                        <td className="p-4 align-middle text-neutral-600 text-sm leading-relaxed">{topic.description}</td>
                                                                    </tr>
                                                                );
                                                            })
                                                        )}

                                                        {catCustoms.map((topic, idx) => {
                                                            const key = `${cat}-custom-${idx}`;
                                                            return (
                                                                <tr key={key} className={`border-b border-neutral-100 transition-colors ${checkedTopics[key] ? 'bg-teal-50/50' : 'hover:bg-neutral-50'}`}>
                                                                    <td className="p-4 text-center align-middle">
                                                                        <input
                                                                            type="checkbox"
                                                                            className="h-5 w-5 rounded border-neutral-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                                                                            checked={!!checkedTopics[key]}
                                                                            onChange={(e) => setCheckedTopics(prev => ({ ...prev, [key]: e.target.checked }))}
                                                                        />
                                                                    </td>
                                                                    <td className="p-4 align-middle font-medium text-indigo-900">{topic.title}</td>
                                                                    <td className="p-4 align-middle text-indigo-700/60 text-sm italic">{topic.description}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {/* Row for adding custom topic */}
                                        <div className="bg-neutral-50/50 p-4 border-b flex gap-3 items-center w-full">
                                            <div className="w-16"></div> {/* Spacer for checkbox column */}
                                            <input
                                                type="text"
                                                placeholder="Eigenes Thema zu dieser Kategorie hinzufügen..."
                                                className="flex-1 rounded-md border-neutral-300 text-sm py-2 px-3 shadow-sm focus:border-teal-500 focus:ring-teal-500"
                                                value={customInputs[cat] || ""}
                                                onChange={(e) => setCustomInputs(prev => ({ ...prev, [cat]: e.target.value }))}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleAddCustomTopic(cat);
                                                }}
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="bg-white text-neutral-700"
                                                onClick={() => handleAddCustomTopic(cat)}
                                                disabled={!(customInputs[cat] || "").trim()}
                                            >
                                                <Plus className="h-4 w-4 mr-1" /> Hinzufügen
                                            </Button>
                                        </div>
                                    </div>

                                    {status === "success" && checksForCat > 0 && (
                                        <div className="bg-neutral-50/80 px-4 py-4 border-t border-neutral-200">
                                            <div className="flex items-center justify-between mb-4">
                                                <h4 className="text-sm font-semibold text-teal-900">
                                                    Wochentage für {checksForCat} gewählte {checksForCat === 1 ? 'Thema' : 'Themen'} festlegen:
                                                </h4>
                                            </div>
                                            <div className="space-y-3">
                                                {/* Map over all checked keys for this category */}
                                                {Object.keys(checkedTopics).filter(k => k.startsWith(cat) && checkedTopics[k]).map(key => {
                                                    // Find the title for this key to display it
                                                    let title = "Thema";
                                                    if (key.includes('-ai-')) {
                                                        const idx = parseInt(key.split('-ai-')[1]);
                                                        title = parsedTopics[idx]?.title || "Thema";
                                                    } else {
                                                        const idx = parseInt(key.split('-custom-')[1]);
                                                        title = catCustoms[idx]?.title || "Thema";
                                                    }

                                                    const currentDay = topicWeekdays[key] || "";

                                                    return (
                                                        <div key={key} className="bg-white p-3 rounded-md border flex flex-col xl:flex-row xl:items-center justify-between gap-3 shadow-sm">
                                                            <span className="text-sm font-medium text-neutral-700 truncate max-w-md" title={title}>
                                                                Passender Tag für: <span className="text-indigo-900 italic">{title}</span>
                                                            </span>
                                                            <div className="flex flex-wrap gap-1.5 shrink-0">
                                                                {WEEKDAYS.map((day) => {
                                                                    const isSelected = currentDay === day;
                                                                    const isAssignedElsewhere = globallyAssignedDays.has(day) && !isSelected;

                                                                    return (
                                                                        <button
                                                                            key={day}
                                                                            onClick={() => {
                                                                                setTopicWeekdays(prev => ({
                                                                                    ...prev,
                                                                                    [key]: isSelected ? "" : day
                                                                                }));
                                                                            }}
                                                                            disabled={isAssignedElsewhere}
                                                                            title={isAssignedElsewhere ? "Dieser Tag ist bereits belegt" : ""}
                                                                            className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${isSelected
                                                                                ? 'bg-teal-100 text-teal-800 shadow-sm ring-1 ring-teal-300'
                                                                                : isAssignedElsewhere
                                                                                    ? 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed opacity-60 line-through'
                                                                                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                                                                                }`}
                                                                        >
                                                                            {day.substring(0, 2)}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Sticky Bottom Bar for Next Step. Only visible when results are showing */}
            {(hasStartedResearch) && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.1)] z-50">
                    <div className="max-w-5xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Button variant="outline" onClick={() => router.push('/')} className="text-neutral-600 bg-white shadow-sm hover:bg-neutral-50 px-6">
                                Zurück zur Übersicht
                            </Button>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-neutral-600 font-medium whitespace-nowrap">
                                Gesamt: <span className="text-xl font-bold text-teal-700">{totalSelected}</span> Posts geplant
                            </span>
                            {totalSelected === 0 && <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 border border-orange-200 rounded ml-2">Bitte mindestens ein Thema auswählen</span>}
                        </div>
                        <Button
                            className="bg-teal-600 hover:bg-teal-700 text-white min-w-[200px] h-12 text-base font-semibold shadow-md gap-2"
                            disabled={totalSelected === 0 || isStarting}
                            onClick={handleSubmitToBriefing}
                        >
                            {isStarting ? <RefreshCw className="h-5 w-5 animate-spin" /> : null}
                            {isStarting ? "Erstelle Briefings..." : "Weiter zum Briefing"}
                            {!isStarting && <ArrowRight className="h-5 w-5" />}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
