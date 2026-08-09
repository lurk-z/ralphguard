"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import ManualSubstanceModal from "@/components/ManualSubstanceModal";
import SubstanceHoverCard from "@/components/SubstanceHoverCard";
import { SemanticIcon, type SemanticIconName } from "@/components/SemanticIcon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  api,
  apiErrorMessage,
  substanceDepictionUrl,
  type IngredientRegistryItem,
  type SubstanceProfile,
} from "@/lib/api";
import { SUBSTANCE_LIBRARY } from "@/lib/catalog";
import { isAbortError } from "@/lib/request-reliability";
import { searchManualSubstanceSuggestions } from "@/lib/manual-substance";
import {
  findSystemSubstanceMatch,
  loadFavoriteSubstanceKeys,
  loadLocalSubstances,
  localSubstanceKey,
  mergeSubstanceLibrary,
  normalizedSmiles,
  saveFavoriteSubstanceKeys,
  saveLocalSubstances,
  type LibrarySubstance,
  type LocalSubstance,
} from "@/lib/substance-library-local";

type SubstanceLibraryPageProps = {
  active: boolean;
  activeFormulaName?: string;
  selectedItems: { smiles: string; concentration: number }[];
  onToggleFormula: (item: {
    name: string;
    smiles: string;
    concentration: number;
  }) => void;
};

type VirtualEntry =
  | { kind: "header"; id: string; label: string; count: number; icon: SemanticIconName }
  | { kind: "substance"; id: string; item: LibrarySubstance };

type EditorDraft = {
  mode: "create" | "edit";
  id?: string;
  name: string;
  smiles: string;
};

const REGISTRY_CATEGORY = "สารจากฐานข้อมูลที่ยืนยันแล้ว";
const FAVORITE_CATEGORY = "รายการโปรด";
const PROFILE_CACHE = new Map<string, SubstanceProfile | null>();
const ROW_HEIGHT = 86;
const HEADER_HEIGHT = 44;
const OVERSCAN_PX = 420;
const GRID_GAP = 10;
const GRID_MIN_CARD_WIDTH = 250;

const CATEGORY_OPTIONS = Array.from(
  new Set([...SUBSTANCE_LIBRARY.map((group) => group.category), REGISTRY_CATEGORY, "สารที่เพิ่มเอง", FAVORITE_CATEGORY]),
);

const browserStorage = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const stableNameSort = (left: LibrarySubstance, right: LibrarySubstance) =>
  left.name.localeCompare(right.name, "th", { sensitivity: "base" });

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

export default function SubstanceLibraryPage({
  active,
  activeFormulaName,
  selectedItems,
  onToggleFormula,
}: SubstanceLibraryPageProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [registryItems, setRegistryItems] = useState<IngredientRegistryItem[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [reloadRequest, setReloadRequest] = useState(0);
  const [localItems, setLocalItems] = useState<LocalSubstance[]>([]);
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [editor, setEditor] = useState<EditorDraft | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibrarySubstance | null>(null);
  const inactiveCardClickCountRef = useRef(0);
  const debouncedQuery = useDebouncedValue(query.trim().toLocaleLowerCase(), 180);
  const editorSuggestions = useMemo(
    () => searchManualSubstanceSuggestions(registryItems, editor?.name || ""),
    [editor?.name, registryItems],
  );

  useEffect(() => {
    if (!active) {
      setToolbarHost(null);
      return;
    }
    setToolbarHost(document.getElementById("substance-library-toolbar-host"));
  }, [active]);

  useEffect(() => {
    const storage = browserStorage();
    setLocalItems(loadLocalSubstances(storage));
    setFavoriteKeys(loadFavoriteSubstanceKeys(storage));
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!active || registryItems.length) return;
    const controller = new AbortController();
    let alive = true;
    setRegistryLoading(true);
    setRegistryError(null);

    const loadRegistry = async () => {
      const collected: IngredientRegistryItem[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const page = await api.listIngredientRegistry("verified", pageSize, offset, controller.signal);
        collected.push(...page);
        if (page.length < pageSize) break;
      }
      if (alive) setRegistryItems(collected);
    };

    loadRegistry()
      .catch((cause: unknown) => {
        if (!alive || isAbortError(cause)) return;
        setRegistryError(apiErrorMessage(cause, "โหลดคลังสารไม่สำเร็จ"));
      })
      .finally(() => {
        if (alive) setRegistryLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [active, registryItems.length, reloadRequest]);

  const libraryItems = useMemo(
    () => mergeSubstanceLibrary(SUBSTANCE_LIBRARY, registryItems, localItems),
    [localItems, registryItems],
  );
  const selectedConcentrationBySmiles = useMemo(
    () => new Map(selectedItems.map((item) => [normalizedSmiles(item.smiles), item.concentration])),
    [selectedItems],
  );
  const favoriteSet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);
  const categories = useMemo(() => {
    const available = new Set(libraryItems.map((item) => item.category));
    const localCategory = available.delete("สารที่เพิ่มเอง") ? ["สารที่เพิ่มเอง"] : [];
    const favoriteCategory = libraryItems.some((item) => favoriteSet.has(item.key)) ? [FAVORITE_CATEGORY] : [];
    const curatedOrder = SUBSTANCE_LIBRARY.map((group) => group.category).filter((name) => available.delete(name));
    return [
      ...localCategory,
      ...favoriteCategory,
      ...curatedOrder,
      ...Array.from(available).sort((a, b) => a.localeCompare(b, "th")),
    ];
  }, [favoriteSet, libraryItems]);
  const categoryIconByName = useMemo(
    () => new Map<string, SemanticIconName>([
      ...SUBSTANCE_LIBRARY.map((group) => [group.category, group.icon] as [string, SemanticIconName]),
      [REGISTRY_CATEGORY, "beaker"],
      ["สารที่เพิ่มเอง", "pencil"],
      [FAVORITE_CATEGORY, "star"],
    ]),
    [],
  );
  const selectedCategoryIcon = category === "all"
    ? "beaker"
    : categoryIconByName.get(category) || "package";

  useEffect(() => {
    if (category !== "all" && !categories.includes(category)) setCategory("all");
  }, [categories, category]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of libraryItems) {
      if (
        debouncedQuery &&
        !`${item.name} ${item.smiles} ${item.category} ${item.molecularFormula || ""}`
          .toLocaleLowerCase()
          .includes(debouncedQuery)
      ) {
        continue;
      }
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
      if (favoriteSet.has(item.key)) {
        counts.set(FAVORITE_CATEGORY, (counts.get(FAVORITE_CATEGORY) || 0) + 1);
      }
    }
    return counts;
  }, [debouncedQuery, favoriteSet, libraryItems]);

  const matchingItems = useMemo(() => {
    return libraryItems.filter((item) => {
      if (category === FAVORITE_CATEGORY && !favoriteSet.has(item.key)) return false;
      if (category !== "all" && category !== FAVORITE_CATEGORY && item.category !== category) return false;
      if (!debouncedQuery) return true;
      return `${item.name} ${item.smiles} ${item.category} ${item.molecularFormula || ""}`
        .toLocaleLowerCase()
        .includes(debouncedQuery);
    });
  }, [category, debouncedQuery, favoriteSet, libraryItems]);

  const virtualEntries = useMemo(() => {
    const entries: VirtualEntry[] = [];
    const displayedConcentration = (item: LibrarySubstance) =>
      selectedConcentrationBySmiles.get(normalizedSmiles(item.smiles)) ?? item.concentration;
    const addGroup = (label: string, items: LibrarySubstance[]) => {
      if (!items.length) return;
      entries.push({
        kind: "header",
        id: `header:category:${label}`,
        label,
        count: items.length,
        icon: categoryIconByName.get(label) || "package",
      });
      for (const item of items.sort((left, right) =>
        displayedConcentration(right) - displayedConcentration(left) || stableNameSort(left, right)
      )) {
        entries.push({ kind: "substance", id: item.key, item });
      }
    };

    if (category === FAVORITE_CATEGORY) {
      addGroup(FAVORITE_CATEGORY, matchingItems);
      return entries;
    }

    if (category !== "all") {
      addGroup(category, matchingItems);
      return entries;
    }

    addGroup("สารที่เพิ่มเอง", matchingItems.filter((item) => item.category === "สารที่เพิ่มเอง"));
    addGroup(
      FAVORITE_CATEGORY,
      matchingItems.filter((item) => favoriteSet.has(item.key)),
    );
    for (const categoryName of categories) {
      if (categoryName === "สารที่เพิ่มเอง" || categoryName === FAVORITE_CATEGORY) continue;
      addGroup(
        categoryName,
        matchingItems.filter((item) => item.category === categoryName && !favoriteSet.has(item.key)),
      );
    }
    return entries;
  }, [categories, category, categoryIconByName, favoriteSet, matchingItems, selectedConcentrationBySmiles]);

  const persistLocalItems = useCallback((nextItems: LocalSubstance[]) => {
    saveLocalSubstances(browserStorage(), nextItems);
    setLocalItems(nextItems);
  }, []);

  const persistFavorites = useCallback((nextKeys: string[]) => {
    saveFavoriteSubstanceKeys(browserStorage(), nextKeys);
    setFavoriteKeys(nextKeys);
  }, []);

  const toggleFavorite = useCallback((item: LibrarySubstance) => {
    try {
      const nextKeys = favoriteSet.has(item.key)
        ? favoriteKeys.filter((key) => key !== item.key)
        : [item.key, ...favoriteKeys];
      persistFavorites(nextKeys);
      toast.success(
        favoriteSet.has(item.key)
          ? `นำ ${item.name} ออกจากรายการโปรดแล้ว`
          : `เพิ่ม ${item.name} ในรายการโปรดแล้ว`,
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "บันทึกรายการโปรดไม่สำเร็จ");
    }
  }, [favoriteKeys, favoriteSet, persistFavorites]);

  const toggleFormulaItem = useCallback((item: LibrarySubstance) => {
    if (!activeFormulaName) {
      inactiveCardClickCountRef.current += 1;
      if (inactiveCardClickCountRef.current >= 2) {
        inactiveCardClickCountRef.current = 0;
        toast.info("เลือกกล่องสูตรก่อนเพิ่มสาร");
      }
      return;
    }
    inactiveCardClickCountRef.current = 0;
    onToggleFormula({
      name: item.name,
      smiles: item.smiles,
      concentration: item.source === "local" ? 0 : item.concentration,
    });
  }, [activeFormulaName, onToggleFormula]);

  const openCreateEditor = () => {
    setEditor({ mode: "create", name: "", smiles: "" });
    setEditorError(null);
  };

  const openEditEditor = (item: LibrarySubstance) => {
    if (!item.localId) return;
    setEditor({
      mode: "edit",
      id: item.localId,
      name: item.name,
      smiles: item.smiles,
    });
    setEditorError(null);
  };

  const closeEditor = () => {
    if (editorBusy) return;
    setEditor(null);
    setEditorError(null);
  };

  const saveEditor = async () => {
    if (!editor || editorBusy) return;
    const name = editor.name.trim();
    const smiles = editor.smiles.trim();
    if (!name && !smiles) {
      setEditorError("กรุณาระบุชื่อสารหรือ SMILES อย่างน้อย 1 ช่อง");
      return;
    }
    if (registryLoading) {
      setEditorError("กำลังตรวจสอบคลังสารระบบ กรุณารอสักครู่แล้วลองใหม่");
      return;
    }
    if (registryError) {
      setEditorError("ยังตรวจสอบสารซ้ำกับระบบไม่ได้ กรุณาลองโหลดคลังสารใหม่ก่อน");
      return;
    }

    const controller = new AbortController();
    setEditorBusy(true);
    setEditorError(null);
    try {
      const validation = smiles ? await api.validateSmiles(smiles, controller.signal) : null;
      if (validation && !validation.valid) {
        setEditorError("SMILES ไม่ถูกต้อง กรุณาตรวจสอบโครงสร้างอีกครั้ง");
        return;
      }
      const canonicalSmiles = validation?.canonical?.trim() || smiles;
      const systemMatches = findSystemSubstanceMatch(libraryItems, name, canonicalSmiles);
      let systemMatch: LibrarySubstance | undefined;
      if (name && smiles) {
        const bothMatchSameItem = Boolean(
          systemMatches.nameMatch &&
          systemMatches.smilesMatch &&
          systemMatches.nameMatch.key === systemMatches.smilesMatch.key,
        );
        const eitherMatchesSystem = Boolean(systemMatches.nameMatch || systemMatches.smilesMatch);
        if (eitherMatchesSystem && !bothMatchSameItem) {
          setEditorError("ชื่อสารและ SMILES ไม่ตรงกัน หรือไม่มีข้อมูลคู่นี้ในฐานข้อมูล");
          return;
        }
        systemMatch = bothMatchSameItem ? systemMatches.nameMatch : undefined;
      } else {
        systemMatch = systemMatches.nameMatch || systemMatches.smilesMatch;
      }

      if (systemMatch) {
        setQuery(systemMatch.name);
        setCategory("all");
        setEditor(null);
        toast.info(`พบ ${systemMatch.name} ในคลังสารแล้ว`);
        return;
      }

      if (!name) {
        setEditorError("ไม่พบ SMILES นี้ในฐานข้อมูล กรุณาระบุชื่อสารเพื่อบันทึกเป็นสารที่เพิ่มเอง");
        return;
      }
      if (!canonicalSmiles) {
        setEditorError("ไม่พบชื่อสารนี้ในฐานข้อมูล กรุณาระบุ SMILES เพื่อบันทึกเป็นสารที่เพิ่มเอง");
        return;
      }

      const duplicateLocal = localItems.find(
        (item) =>
          item.id !== editor.id &&
          (normalizedSmiles(item.smiles) === canonicalSmiles ||
            item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()),
      );
      if (duplicateLocal) {
        setEditorError("สารนี้มีอยู่ในรายการที่เพิ่มเองแล้ว");
        return;
      }

      const now = new Date().toISOString();
      const existing = editor.id ? localItems.find((item) => item.id === editor.id) : undefined;
      const descriptorWeight = Number(
        validation?.descriptors?.MolWt ??
          validation?.descriptors?.mol_wt ??
          validation?.descriptors?.molecular_weight,
      );
      const nextItem: LocalSubstance = {
        id: existing?.id || crypto.randomUUID(),
        name,
        smiles: canonicalSmiles,
        category: existing?.category || "สารที่เพิ่มเอง",
        ...(Number.isFinite(descriptorWeight) && descriptorWeight > 0
          ? { molecularWeight: descriptorWeight }
          : existing?.molecularWeight != null
            ? { molecularWeight: existing.molecularWeight }
            : {}),
        ...(existing?.molecularFormula ? { molecularFormula: existing.molecularFormula } : {}),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      const nextItems = existing
        ? localItems.map((item) => (item.id === existing.id ? nextItem : item))
        : [nextItem, ...localItems];
      persistLocalItems(nextItems);
      setEditor(null);
      toast.success(existing ? `แก้ไข ${name} แล้ว` : `บันทึก ${name} ในสารที่เพิ่มเองแล้ว`);
    } catch (cause: unknown) {
      if (isAbortError(cause)) return;
      setEditorError(apiErrorMessage(cause, "ตรวจสอบสารไม่สำเร็จ"));
    } finally {
      setEditorBusy(false);
    }
  };

  const deleteLocalItem = () => {
    const target = deleteTarget;
    if (!target?.localId) return;
    try {
      persistLocalItems(localItems.filter((item) => item.id !== target.localId));
      persistFavorites(favoriteKeys.filter((key) => key !== localSubstanceKey(target.localId!)));
      setDeleteTarget(null);
      toast.success(`ลบ ${target.name} ออกจากสารที่เพิ่มเองแล้ว`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "ลบสารที่เพิ่มเองไม่สำเร็จ");
    }
  };

  return (
    <section
      aria-label="คลังสารเคมีทั้งหมด"
      className={`${active ? "flex" : "hidden"} absolute inset-0 z-50 min-h-0 flex-col bg-slate-50`}
    >
      {toolbarHost && createPortal(
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="shrink-0 text-[13px] font-semibold text-slate-700">
            <span className="whitespace-nowrap">คลังสารเคมีทั้งหมด</span>
          </div>

          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-brand/60 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand/10">
            <Search className="size-3.5 shrink-0 text-slate-400" />
            <span className="sr-only">ค้นหาสาร</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาชื่อสาร, INCI, SMILES หรือสูตรโมเลกุล"
              className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="ล้างคำค้นหา"
                className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              >
                <SemanticIcon name="x" className="size-3.5" />
              </button>
            )}
          </label>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-9 min-w-32 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:border-brand/40 hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20"
                aria-label={`กรองประเภทสาร: ${category === "all" ? "ทุกประเภท" : category}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <SemanticIcon name={selectedCategoryIcon} className="size-3.5 shrink-0 text-brand" />
                  <span className="truncate">{category === "all" ? "ทุกประเภท" : category}</span>
                </span>
                <SemanticIcon name="chevron-down" className="size-3.5 shrink-0 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="assess-scrollbar max-h-72 w-72 overflow-y-auto p-1.5">
                <DropdownMenuItem
                  onSelect={() => setCategory("all")}
                  className={`rounded-lg px-2.5 py-2 text-xs ${category === "all" ? "bg-teal-50 font-semibold text-brand" : "text-slate-700"}`}
                >
                  <SemanticIcon name="beaker" className="size-3.5" />
                  <span className="min-w-0 flex-1">ทุกประเภท</span>
                  <span className="ml-3 tabular-nums text-slate-400">
                    {Array.from(categoryCounts.entries())
                      .reduce((sum, [name, count]) => name === FAVORITE_CATEGORY ? sum : sum + count, 0)
                      .toLocaleString("th-TH")}
                  </span>
                </DropdownMenuItem>
                {categories.map((categoryName) => (
                  <DropdownMenuItem
                    key={categoryName}
                    onSelect={() => setCategory(categoryName)}
                    className={`rounded-lg px-2.5 py-2 text-xs ${category === categoryName ? "bg-teal-50 font-semibold text-brand" : "text-slate-700"}`}
                  >
                    <SemanticIcon name={categoryIconByName.get(categoryName) || "package"} className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate">{categoryName}</span>
                    <span className="ml-3 tabular-nums text-slate-400">
                      {(categoryCounts.get(categoryName) || 0).toLocaleString("th-TH")}
                    </span>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={openCreateEditor}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2"
          >
            <Plus className="size-4" />
            เพิ่มสารเปล่า
          </button>
        </div>,
        toolbarHost,
      )}

      {registryError && (
        <div className="mx-5 mt-3 flex shrink-0 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{registryError} — ยังแสดงสารพื้นฐานและสารที่เพิ่มเองได้</span>
          <button
            type="button"
            onClick={() => {
              setRegistryError(null);
              setRegistryItems([]);
              setReloadRequest((value) => value + 1);
            }}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 font-medium hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <RotateCcw className="size-3.5" />
            ลองใหม่
          </button>
        </div>
      )}

      {!storageReady ? (
        <div className="grid min-h-0 flex-1 place-items-center text-sm text-slate-400">
          <Loader2 className="mb-2 size-5 animate-spin text-brand" />
          กำลังเตรียมคลังสาร…
        </div>
      ) : virtualEntries.length ? (
        <VirtualSubstanceList
          entries={virtualEntries}
          favoriteSet={favoriteSet}
          selectedConcentrationBySmiles={selectedConcentrationBySmiles}
          activeFormulaName={activeFormulaName}
          onToggleFavorite={toggleFavorite}
          onToggleFormula={toggleFormulaItem}
          onEditLocal={openEditEditor}
          onDeleteLocal={setDeleteTarget}
        />
      ) : (
        <LibraryEmptyState
          query={query}
          category={category}
          onClear={() => {
            setQuery("");
            setCategory("all");
          }}
          onCreate={openCreateEditor}
        />
      )}

      {editor && (
        <LocalSubstanceEditor
          draft={editor}
          busy={editorBusy}
          error={editorError}
          suggestions={editorSuggestions}
          suggestionsLoading={registryLoading}
          onChange={setEditor}
          onSelectSuggestion={(item) => {
            setEditor((current) => current ? {
              ...current,
              name: item.inci_name || item.canonical_name,
              smiles: item.canonical_smiles?.trim() || "",
            } : current);
            setEditorError(null);
          }}
          onClose={closeEditor}
          onSave={saveEditor}
        />
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ลบสารที่เพิ่มเอง?</AlertDialogTitle>
            <AlertDialogDescription>
              จะลบ {deleteTarget?.name || "สารนี้"} ออกจากคลัง Local แต่สารที่อยู่ในสูตรเดิมจะยังคงอยู่
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={deleteLocalItem} className="bg-rose-600 hover:bg-rose-700">
              ลบสาร
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function VirtualSubstanceList({
  entries,
  favoriteSet,
  selectedConcentrationBySmiles,
  activeFormulaName,
  onToggleFavorite,
  onToggleFormula,
  onEditLocal,
  onDeleteLocal,
}: {
  entries: VirtualEntry[];
  favoriteSet: Set<string>;
  selectedConcentrationBySmiles: Map<string, number>;
  activeFormulaName?: string;
  onToggleFavorite: (item: LibrarySubstance) => void;
  onToggleFormula: (item: LibrarySubstance) => void;
  onEditLocal: (item: LibrarySubstance) => void;
  onDeleteLocal: (item: LibrarySubstance) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [viewportWidth, setViewportWidth] = useState(900);
  const columnCount = Math.max(
    1,
    Math.floor((viewportWidth - 40 + GRID_GAP) / (GRID_MIN_CARD_WIDTH + GRID_GAP)),
  );

  const layout = useMemo(() => {
    let offset = 0;
    const rows: Array<
      | { kind: "header"; id: string; entry: Extract<VirtualEntry, { kind: "header" }>; offset: number; size: number }
      | { kind: "items"; id: string; items: LibrarySubstance[]; offset: number; size: number }
    > = [];
    let pendingItems: LibrarySubstance[] = [];

    const flushItems = () => {
      for (let index = 0; index < pendingItems.length; index += columnCount) {
        const items = pendingItems.slice(index, index + columnCount);
        rows.push({
          kind: "items",
          id: `grid:${items[0].key}`,
          items,
          offset,
          size: ROW_HEIGHT,
        });
        offset += ROW_HEIGHT;
      }
      pendingItems = [];
    };

    for (const entry of entries) {
      if (entry.kind === "substance") {
        pendingItems.push(entry.item);
        continue;
      }
      flushItems();
      rows.push({ kind: "header", id: entry.id, entry, offset, size: HEADER_HEIGHT });
      offset += HEADER_HEIGHT;
    }
    flushItems();

    return { rows, totalHeight: offset };
  }, [columnCount, entries]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(entry.contentRect.height);
      setViewportWidth(entry.contentRect.width);
    });
    observer.observe(viewport);
    setViewportHeight(viewport.clientHeight);
    setViewportWidth(viewport.clientWidth);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && viewport.scrollTop > layout.totalHeight) viewport.scrollTop = 0;
  }, [layout.totalHeight]);

  const visibleRows = useMemo(() => {
    const start = Math.max(0, scrollTop - OVERSCAN_PX);
    const end = scrollTop + viewportHeight + OVERSCAN_PX;
    return layout.rows.filter((row) => row.offset + row.size >= start && row.offset <= end);
  }, [layout.rows, scrollTop, viewportHeight]);

  return (
    <div
      ref={viewportRef}
      className="assess-scrollbar min-h-0 flex-1 overflow-y-auto bg-slate-50 px-5 pb-6 pt-3"
      onScroll={(event) => {
        const nextTop = event.currentTarget.scrollTop;
        if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
        frameRef.current = window.requestAnimationFrame(() => setScrollTop(nextTop));
      }}
    >
      <div className="relative mx-auto max-w-[94rem]" style={{ height: layout.totalHeight }}>
        {visibleRows.map((row) => (
          <div
            key={row.id}
            className="absolute inset-x-0"
            style={{ height: row.size, transform: `translateY(${row.offset}px)` }}
          >
            {row.kind === "header" ? (
              <div className="flex h-full items-center gap-2 px-1 pt-1 text-xs font-semibold text-slate-600">
                <SemanticIcon name={row.entry.icon} className="size-3.5 shrink-0 text-brand" />
                <span className="shrink-0">{row.entry.label}</span>
                <span aria-hidden className="ml-1 h-px min-w-6 flex-1 bg-slate-200" />
                <span className="shrink-0 font-normal tabular-nums text-slate-400">
                  {row.entry.count.toLocaleString("th-TH")} รายการ
                </span>
              </div>
            ) : (
              <div
                className="grid h-full gap-2 py-1"
                style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
              >
                {row.items.map((item) => (
                  <SubstanceRow
                    key={item.key}
                    item={item}
                    favorite={favoriteSet.has(item.key)}
                    selectedConcentration={selectedConcentrationBySmiles.get(normalizedSmiles(item.smiles))}
                    activeFormulaName={activeFormulaName}
                    onToggleFavorite={onToggleFavorite}
                    onToggleFormula={onToggleFormula}
                    onEditLocal={onEditLocal}
                    onDeleteLocal={onDeleteLocal}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const SubstanceRow = memo(function SubstanceRow({
  item,
  favorite,
  selectedConcentration,
  activeFormulaName,
  onToggleFavorite,
  onToggleFormula,
  onEditLocal,
  onDeleteLocal,
}: {
  item: LibrarySubstance;
  favorite: boolean;
  selectedConcentration?: number;
  activeFormulaName?: string;
  onToggleFavorite: (item: LibrarySubstance) => void;
  onToggleFormula: (item: LibrarySubstance) => void;
  onEditLocal: (item: LibrarySubstance) => void;
  onDeleteLocal: (item: LibrarySubstance) => void;
}) {
  const profile = useVisibleSubstanceProfile(item);
  const molecularFormula = item.molecularFormula || profile?.molecular_formula || "—";
  const selected = selectedConcentration != null;
  const displayedConcentration = selected ? selectedConcentration : item.concentration;
  const toggleFormula = () => onToggleFormula(item);

  return (
    <SubstanceHoverCard
      name={item.name}
      smiles={item.smiles}
      openOnContextMenu
      contextMenuOnly
      className="h-full"
    >
      <div
        role="button"
        tabIndex={activeFormulaName ? 0 : -1}
        aria-pressed={selected}
        aria-label={selected ? `นำ ${item.name} ออกจากสูตร` : `เพิ่ม ${item.name} ลงสูตร`}
        title="คลิกซ้ายเพื่อเพิ่มหรือนำออก · คลิกขวาเพื่อดูรายละเอียด"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("[data-substance-action]")) return;
          toggleFormula();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleFormula();
        }}
        className={`group flex h-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 ${
          selected
            ? "cursor-pointer border-brand/50 bg-teal-50/70 ring-1 ring-brand/10"
            : activeFormulaName
              ? "cursor-pointer border-slate-200 bg-white hover:border-brand/30 hover:bg-teal-50/30"
              : "cursor-default border-slate-200 bg-white"
        }`}
      >
        <SubstanceThumbnail name={item.name} smiles={item.smiles} />
        <div className="min-w-0 flex-1 overflow-hidden">
          <span className="line-clamp-2 max-h-8 text-[13px] font-medium leading-4 text-slate-800" title={item.name}>{item.name}</span>
          <span className="mt-1.5 block truncate font-mono text-[10px] text-slate-500" title="Molecular Formula">
            {molecularFormula}
          </span>
        </div>

        <div data-substance-action className="flex shrink-0 items-center justify-end gap-1">
          {item.source === "local" && (
            <>
              <IconAction
                label={`แก้ไข ${item.name}`}
                onClick={() => onEditLocal(item)}
                className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
              >
                <Pencil className="size-3.5" />
              </IconAction>
              <IconAction
                label={`ลบ ${item.name}`}
                onClick={() => onDeleteLocal(item)}
                className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                danger
              >
                <Trash2 className="size-3.5" />
              </IconAction>
            </>
          )}
          <button
            type="button"
            data-substance-action
            aria-label={favorite ? `นำ ${item.name} ออกจากรายการโปรด` : `เพิ่ม ${item.name} ในรายการโปรด`}
            title={favorite ? `นำ ${item.name} ออกจากรายการโปรด` : `เพิ่ม ${item.name} ในรายการโปรด`}
            aria-pressed={favorite}
            onClick={() => onToggleFavorite(item)}
            className={`group/star grid size-8 place-items-center bg-transparent p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 ${favorite ? "opacity-100 text-amber-500" : "text-slate-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-amber-500 focus-visible:opacity-100 focus-visible:text-amber-500"}`}
          >
            <Star className={`size-4 transition-colors ${favorite ? "fill-current" : "fill-none group-hover/star:fill-current"}`} />
          </button>
          <span className={`min-w-10 text-right text-sm font-semibold tabular-nums ${selected ? "text-brand" : "text-slate-600"}`}>
            {displayedConcentration}%
          </span>
        </div>
      </div>
    </SubstanceHoverCard>
  );
});

function IconAction({
  label,
  pressed,
  disabled,
  danger,
  className = "",
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  danger?: boolean;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-substance-action
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 ${
        disabled
          ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
          : danger
            ? "border-transparent text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-800"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function SubstanceThumbnail({ name, smiles }: { name: string; smiles: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [smiles]);
  return (
    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
      {!failed && smiles ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={substanceDepictionUrl(smiles)}
          alt={`โครงสร้างโมเลกุลของ ${name}`}
          loading="lazy"
          width={48}
          height={48}
          className="size-full object-contain p-1"
          onError={() => setFailed(true)}
        />
      ) : (
        <SemanticIcon name="flask" className="size-3.5 text-slate-300" />
      )}
    </span>
  );
}

function useVisibleSubstanceProfile(item: LibrarySubstance) {
  const needsProfile = item.source === "system" && !item.molecularFormula;
  const cacheKey = `${item.name.trim().toLocaleLowerCase()}|${normalizedSmiles(item.smiles)}`;
  const [profile, setProfile] = useState<SubstanceProfile | null>(() => PROFILE_CACHE.get(cacheKey) || null);

  useEffect(() => {
    if (!needsProfile || PROFILE_CACHE.has(cacheKey)) {
      setProfile(PROFILE_CACHE.get(cacheKey) || null);
      return;
    }
    const controller = new AbortController();
    api.getSubstanceProfile(item.name, item.smiles, controller.signal)
      .then((value) => {
        PROFILE_CACHE.set(cacheKey, value);
        setProfile(value);
      })
      .catch((cause: unknown) => {
        if (isAbortError(cause)) return;
        PROFILE_CACHE.set(cacheKey, null);
      });
    return () => controller.abort();
  }, [cacheKey, item.name, item.smiles, needsProfile]);

  return profile;
}

function LibraryEmptyState({
  query,
  category,
  onClear,
  onCreate,
}: {
  query: string;
  category: string;
  onClear: () => void;
  onCreate: () => void;
}) {
  const filtered = Boolean(query || category !== "all");
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-teal-50 text-brand">
          <SemanticIcon name="flask" className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-slate-800">
          ไม่พบสารที่ค้นหา
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
          {filtered ? "ลองเปลี่ยนคำค้นหา ประเภท หรือขอบเขตที่เลือก" : "เพิ่มสารที่ยังไม่มีในคลังเพื่อใช้งานในโปรเจกต์บนเครื่องนี้"}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {filtered && (
            <button type="button" onClick={onClear} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">
              ล้างตัวกรอง
            </button>
          )}
          <button type="button" onClick={onCreate} className="h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">
            เพิ่มสารเปล่า
          </button>
        </div>
      </div>
    </div>
  );
}

function LocalSubstanceEditor({
  draft,
  busy,
  error,
  suggestions,
  suggestionsLoading,
  onChange,
  onSelectSuggestion,
  onClose,
  onSave,
}: {
  draft: EditorDraft;
  busy: boolean;
  error: string | null;
  suggestions: IngredientRegistryItem[];
  suggestionsLoading: boolean;
  onChange: (draft: EditorDraft) => void;
  onSelectSuggestion: (item: IngredientRegistryItem) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ManualSubstanceModal
      title={draft.mode === "edit" ? "แก้ไขสารที่เพิ่มเอง" : "เพิ่มสารเปล่า"}
      subtitle="กรอกชื่อสารหรือ SMILES อย่างน้อยหนึ่งช่อง"
      submitLabel={draft.mode === "edit" ? "ตรวจสอบและบันทึก" : "ตรวจสอบและเพิ่ม"}
      name={draft.name}
      smiles={draft.smiles}
      busy={busy}
      error={error}
      suggestions={suggestions}
      suggestionsLoading={suggestionsLoading}
      onNameChange={(value) => onChange({ ...draft, name: value })}
      onSmilesChange={(value) => onChange({ ...draft, smiles: value })}
      onSelectSuggestion={onSelectSuggestion}
      onClose={onClose}
      onSubmit={onSave}
    />
  );
}
