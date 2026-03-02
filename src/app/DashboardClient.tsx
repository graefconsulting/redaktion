"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Edit2, Eye, Copy, Trash2, Download, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";

interface WeekPlanSummary {
    id: string;
    year: number;
    week: number;
    status: string;
    postCount: number;
}

interface FinalizedPost {
    id: string;
    weekPlanId: string;
    weekPlanYear: number;
    weekPlanWeek: number;
    category: string;
    content: string;
    imageUrl: string | null;
    createdAt: Date;
}

interface DashboardClientProps {
    initialWeekPlans: WeekPlanSummary[];
    finalizedPosts: FinalizedPost[];
    upcomingWeeksOptions: { year: number, week: number, label: string, dateRange: string }[];
}

export default function DashboardClient({ initialWeekPlans, finalizedPosts, upcomingWeeksOptions }: DashboardClientProps) {
    const router = useRouter();

    const [weekPlans, setWeekPlans] = useState(initialWeekPlans);

    // New Week Dialog
    const [newWeekDialogOpen, setNewWeekDialogOpen] = useState(false);
    const [selectedNewWeek, setSelectedNewWeek] = useState<string>("");
    const [isCreating, setIsCreating] = useState(false);

    // Duplicate Dialog
    const [duplicateDialogOpen, setDuplicateDialogOpen] = useState<string | null>(null);
    const [selectedDuplicateWeek, setSelectedDuplicateWeek] = useState<string>("");
    const [includeContent, setIncludeContent] = useState(false);
    const [isDuplicating, setIsDuplicating] = useState(false);

    // Delete Dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleCreateNewWeek = async () => {
        if (!selectedNewWeek) return;
        setIsCreating(true);
        const [year, week] = selectedNewWeek.split("-");
        try {
            const res = await fetch("/api/week-plans", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ year: parseInt(year), week: parseInt(week) })
            });
            if (res.ok) {
                const data = await res.json();
                router.push(`/plan/${data.plan.id}/research`);
            } else {
                alert("Fehler beim Erstellen.");
            }
        } catch (e) {
            console.error(e);
            alert("Fehler beim Erstellen.");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDuplicate = async () => {
        if (!duplicateDialogOpen || !selectedDuplicateWeek) return;
        setIsDuplicating(true);
        const [targetYear, targetWeek] = selectedDuplicateWeek.split("-");

        try {
            const res = await fetch(`/api/week-plans/${duplicateDialogOpen}/duplicate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetYear, targetWeek, includeContent })
            });

            if (res.ok) {
                const data = await res.json();
                router.push(`/plan/${data.newPlanId}/research`);
            } else {
                const err = await res.json();
                alert(err.error || "Fehler beim Duplizieren.");
            }
        } catch (e) {
            console.error(e);
            alert("Fehler beim Duplizieren.");
        } finally {
            setIsDuplicating(false);
            setDuplicateDialogOpen(null);
        }
    };

    const handleDelete = async () => {
        if (!deleteDialogOpen) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/week-plans/${deleteDialogOpen}`, {
                method: "DELETE"
            });
            if (res.ok) {
                setWeekPlans(prev => prev.filter(p => p.id !== deleteDialogOpen));
                setDeleteDialogOpen(null);
                router.refresh();
            } else {
                alert("Fehler beim Löschen.");
            }
        } catch (e) {
            console.error(e);
            alert("Fehler beim Löschen.");
        } finally {
            setIsDeleting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "draft":
                return <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">Entwurf / In Arbeit</Badge>;
            case "finalized":
                return <Badge variant="secondary" className="bg-teal-100 text-teal-800 hover:bg-teal-100">Abgeschlossen</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 mt-4 pb-24">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-teal-900 tracking-tight">Redaktionspläne</h2>
                    <p className="text-neutral-500 mt-2">Verwalte deine wöchentlichen Redaktionspläne für Social Media.</p>
                </div>
                <Button
                    className="bg-teal-600 hover:bg-teal-700 text-white shadow-md"
                    onClick={() => {
                        setSelectedNewWeek("");
                        setNewWeekDialogOpen(true);
                    }}
                >
                    <Plus className="w-4 h-4 mr-2" /> Neue Woche planen
                </Button>
            </div>

            {/* Week List */}
            <Card className="border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 font-medium border-r border-gray-100">Woche</th>
                                <th className="px-6 py-4 font-medium border-r border-gray-100">Plattform</th>
                                <th className="px-6 py-4 font-medium border-r border-gray-100">Beiträge</th>
                                <th className="px-6 py-4 font-medium border-r border-gray-100">Status</th>
                                <th className="px-6 py-4 font-medium text-right">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {weekPlans.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                        Noch keine Wochenpläne erstellt.
                                    </td>
                                </tr>
                            ) : (
                                weekPlans.map((plan) => (
                                    <tr key={plan.id} className="bg-white border-b hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap border-r border-gray-100">
                                            KW {plan.week} <span className="text-gray-400 font-normal">({plan.year})</span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 border-r border-gray-100">
                                            Facebook
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 border-r border-gray-100">
                                            {plan.postCount} Posts {plan.status === 'finalized' ? 'geplant' : 'in Bearbeitung'}
                                        </td>
                                        <td className="px-6 py-4 border-r border-gray-100">
                                            {getStatusBadge(plan.status)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0 border border-gray-200 bg-white">
                                                        <MoreVertical className="h-4 w-4 text-gray-700" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => router.push(plan.status === 'finalized' ? `/plan/${plan.id}/overview` : `/plan/${plan.id}/research`)}>
                                                        {plan.status === 'finalized' ? (
                                                            <><Eye className="mr-2 h-4 w-4" /> Ansehen</>
                                                        ) : (
                                                            <><Edit2 className="mr-2 h-4 w-4" /> Bearbeiten</>
                                                        )}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem disabled>
                                                        <Download className="mr-2 h-4 w-4" /> Exportieren (Demnächst)
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => {
                                                        setIncludeContent(false);
                                                        setSelectedDuplicateWeek("");
                                                        setDuplicateDialogOpen(plan.id);
                                                    }}>
                                                        <Copy className="mr-2 h-4 w-4" /> Duplizieren
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                                        onClick={() => setDeleteDialogOpen(plan.id)}
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" /> Löschen
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Finalized Posts List (Optional requirement fulfilled) */}
            {finalizedPosts.length > 0 && (
                <div className="pt-8">
                    <h3 className="text-xl font-bold text-teal-900 tracking-tight mb-4">Abgeschlossene Posts</h3>
                    <Card className="border-gray-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 font-medium border-r border-gray-100">Datum</th>
                                        <th className="px-6 py-4 font-medium w-16 border-r border-gray-100">Bild</th>
                                        <th className="px-6 py-4 font-medium border-r border-gray-100">Kategorie</th>
                                        <th className="px-6 py-4 font-medium border-r border-gray-100">Text (Vorschau)</th>
                                        <th className="px-6 py-4 font-medium">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {finalizedPosts.map((post) => (
                                        <tr key={post.id} className="bg-white border-b hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-3 font-medium text-gray-900 whitespace-nowrap border-r border-gray-100">
                                                KW {post.weekPlanWeek} <span className="text-gray-400 font-normal">({post.weekPlanYear})</span>
                                            </td>
                                            <td className="px-6 py-3 border-r border-gray-100">
                                                {post.imageUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={post.imageUrl} alt="Thumbnail" className="w-10 h-10 rounded border object-cover" />
                                                ) : (
                                                    <div className="w-10 h-10 bg-gray-100 rounded border flex items-center justify-center">
                                                        <span className="text-[10px] text-gray-400">Kein</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-3 text-gray-600 border-r border-gray-100">
                                                <Badge variant="outline" className="bg-white">{post.category}</Badge>
                                            </td>
                                            <td className="px-6 py-3 text-gray-600 border-r border-gray-100">
                                                <div className="max-w-md truncate" title={post.content}>
                                                    {post.content || "Kein Text..."}
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-gray-600">
                                                <span className="flex items-center text-teal-600 text-xs font-medium">
                                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Geplant
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* Dialogs */}

            {/* New Week Dialog */}
            <Dialog open={newWeekDialogOpen} onOpenChange={setNewWeekDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Neue Kalenderwoche planen</DialogTitle>
                        <DialogDescription>
                            Wähle eine zukünftige Kalenderwoche für den neuen Redaktionsplan.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Zielwoche</label>
                            <Select value={selectedNewWeek} onValueChange={setSelectedNewWeek}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Woche auswählen..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {upcomingWeeksOptions.map((w) => {
                                        const weekStr = `${w.year}-${w.week}`;
                                        const exists = weekPlans.some(p => p.year === w.year && p.week === w.week);
                                        return (
                                            <SelectItem key={weekStr} value={weekStr} disabled={exists}>
                                                {w.label} {exists ? "(Bereits belegt)" : ""} <span className="text-gray-400 ml-2">({w.dateRange})</span>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNewWeekDialogOpen(false)} disabled={isCreating}>Abbrechen</Button>
                        <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleCreateNewWeek} disabled={!selectedNewWeek || isCreating}>
                            {isCreating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Planung starten
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Duplicate Dialog */}
            <Dialog open={!!duplicateDialogOpen} onOpenChange={(open) => !open && setDuplicateDialogOpen(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Woche duplizieren</DialogTitle>
                        <DialogDescription>
                            Erstelle eine Kopie dieses Wochenplans für eine neue Kalenderwoche.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Zielwoche (darf nicht existieren)</label>
                            <Select value={selectedDuplicateWeek} onValueChange={setSelectedDuplicateWeek}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Woche auswählen..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {upcomingWeeksOptions.map((w) => {
                                        const weekStr = `${w.year}-${w.week}`;
                                        const exists = weekPlans.some(p => p.year === w.year && p.week === w.week);
                                        return (
                                            <SelectItem key={weekStr} value={weekStr} disabled={exists}>
                                                {w.label} {exists ? "(Bereits belegt)" : ""} <span className="text-gray-400 ml-2">({w.dateRange})</span>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-medium">Was soll übernommen werden?</label>

                            <div className="flex gap-2">
                                <div
                                    className={`flex-1 border rounded-lg p-3 cursor-pointer transition-colors ${!includeContent ? 'border-teal-500 bg-teal-50/30 ring-1 ring-teal-500 ring-offset-1' : 'hover:bg-gray-50'}`}
                                    onClick={() => setIncludeContent(false)}
                                >
                                    <div className="font-medium text-sm mb-1 text-gray-900">Nur Struktur</div>
                                    <div className="text-xs text-gray-500">Kopiert Wochentage und Kategorien. Neue Texte und Bilder werden generiert.</div>
                                </div>
                                <div
                                    className={`flex-1 border rounded-lg p-3 cursor-pointer transition-colors ${includeContent ? 'border-teal-500 bg-teal-50/30 ring-1 ring-teal-500 ring-offset-1' : 'hover:bg-gray-50'}`}
                                    onClick={() => setIncludeContent(true)}
                                >
                                    <div className="font-medium text-sm mb-1 text-gray-900">Struktur & Inhalte</div>
                                    <div className="text-xs text-gray-500">Kopiert alles 1:1. Alle Texte, Entwürfe und Bilder werden exakt übernommen.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDuplicateDialogOpen(null)} disabled={isDuplicating}>Abbrechen</Button>
                        <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleDuplicate} disabled={!selectedDuplicateWeek || isDuplicating}>
                            {isDuplicating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Woche duplizieren
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <Dialog open={!!deleteDialogOpen} onOpenChange={(open) => !open && setDeleteDialogOpen(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Woche wirklich löschen?</DialogTitle>
                        <DialogDescription className="text-red-600 pt-2 font-medium">
                            Achtung: Dies löscht den gesamten Wochenplan inklusive aller Beiträge, Bilder und Entwürfe unwiderruflich aus der Datenbank.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(null)} disabled={isDeleting}>Abbrechen</Button>
                        <Button variant="destructive" className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={isDeleting}>
                            {isDeleting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            Ja, endgültig löschen
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}
