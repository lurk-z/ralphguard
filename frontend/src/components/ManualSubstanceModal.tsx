"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { SemanticIcon } from "@/components/SemanticIcon";
import {
  api,
  apiErrorMessage,
  substanceDepictionUrl,
  type IngredientRegistryItem,
} from "@/lib/api";
import { rememberManualOnlineSubstance } from "@/lib/manual-substance";

type ManualSubstanceModalProps = {
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  name: string;
  smiles: string;
  busy: boolean;
  error: string | null;
  suggestions: IngredientRegistryItem[];
  suggestionsLoading?: boolean;
  onNameChange: (value: string) => void;
  onSmilesChange: (value: string) => void;
  onSelectSuggestion: (item: IngredientRegistryItem) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export default function ManualSubstanceModal({
  title = "เพิ่มสารเปล่า",
  subtitle = "กรอกชื่อสารหรือ SMILES อย่างน้อยหนึ่งช่อง · ถ้าไม่พบชื่อในคลัง ระบบจะค้น PubChem ให้อัตโนมัติ",
  submitLabel = "ตรวจสอบและเพิ่ม",
  name,
  smiles,
  busy,
  error,
  suggestions,
  suggestionsLoading = false,
  onNameChange,
  onSmilesChange,
  onSelectSuggestion,
  onClose,
  onSubmit,
}: ManualSubstanceModalProps) {
  const titleId = useId();
  const nameId = useId();
  const suggestionListId = useId();
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);

  const waiting = busy || onlineBusy;
  const visibleError = error || onlineError;

  const submitWithOnlineFallback = async () => {
    if (waiting) return;
    const cleanName = name.trim();
    const cleanSmiles = smiles.trim();

    // A supplied SMILES or a previously selected/cached suggestion can be
    // validated by the existing parent flow immediately. Online fallback is
    // intentionally name-driven so PubChem remains the identity resolver.
    if (!cleanName || cleanSmiles) {
      onSubmit();
      return;
    }

    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const candidate = await api.lookupIngredientInPubChem(cleanName);
      const problem = rememberManualOnlineSubstance(candidate);
      if (problem) {
        setOnlineError(problem);
        return;
      }

      // Populate the visible form for provenance/readability. The module cache
      // already makes the candidate available synchronously to the parent
      // resolver in this same submit cycle.
      onSelectSuggestion(candidate);
      setSuggestionsOpen(false);
      onSubmit();
    } catch (cause) {
      setOnlineError(
        apiErrorMessage(
          cause,
          "ไม่พบสารที่ใช้ประเมินได้จากฐานข้อมูลภายในหรือ PubChem",
        ),
      );
    } finally {
      setOnlineBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-900/30 p-3 backdrop-blur-sm animate-in fade-in-0 duration-150 motion-reduce:animate-none sm:p-4"
      onClick={() => !waiting && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[440px] animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none sm:max-h-[calc(100dvh-2rem)]"
        onSubmit={(event) => {
          event.preventDefault();
          void submitWithOnlineFallback();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-brand">
            <Plus className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-slate-800">{title}</h2>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={waiting}
            aria-label="ปิด"
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-wait disabled:opacity-50"
          >
            <SemanticIcon name="x" className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
          <div className="relative">
            <label htmlFor={nameId} className="mb-1.5 block text-xs font-medium text-slate-600">
              ชื่อสาร
            </label>
            <input
              id={nameId}
              autoFocus
              value={name}
              maxLength={300}
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestionsOpen && Boolean(name.trim())}
              aria-controls={suggestionListId}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => setSuggestionsOpen(false)}
              onChange={(event) => {
                onNameChange(event.target.value);
                setOnlineError(null);
                setSuggestionsOpen(true);
              }}
              placeholder="เช่น Ethanol หรือ Azelaic Acid"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/10"
            />

            {suggestionsOpen && name.trim() && (
              <div
                id={suggestionListId}
                role="listbox"
                className="assess-scrollbar absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
              >
                {suggestionsLoading ? (
                  <div className="flex items-center gap-2 px-2.5 py-2 text-[11px] text-slate-400">
                    <span className="size-2 animate-pulse rounded-full bg-brand" />
                    กำลังโหลดคลังสาร…
                  </div>
                ) : suggestions.length > 0 ? (
                  suggestions.map((item) => {
                    const displayName = item.inci_name || item.canonical_name;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => {
                          onSelectSuggestion(item);
                          setOnlineError(null);
                          setSuggestionsOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-teal-50 focus-visible:bg-teal-50 focus-visible:outline-none"
                      >
                        <SuggestionThumbnail name={displayName} smiles={item.canonical_smiles || ""} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-slate-700">{displayName}</span>
                          <span className="mt-0.5 block truncate font-mono text-[9px] text-slate-400">
                            {item.canonical_smiles}
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-2.5 py-2 text-[11px] leading-4 text-slate-400">
                    ไม่พบในคลังที่ยืนยันแล้ว · กด “{submitLabel}” เพื่อค้น PubChem
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 text-[10px] text-slate-400 before:h-px before:flex-1 before:bg-slate-200 after:h-px after:flex-1 after:bg-slate-200">
            หรือ
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">SMILES</span>
            <input
              value={smiles}
              maxLength={1000}
              spellCheck={false}
              onChange={(event) => {
                onSmilesChange(event.target.value);
                setOnlineError(null);
              }}
              placeholder="เช่น CCO"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-800 outline-none transition-colors placeholder:font-sans placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] leading-4 text-slate-500">
            <div className="font-medium text-slate-600">ลำดับการค้นหา: RalphGuard Registry → PubChem</div>
            <div className="mt-1">
              PubChem ใช้ยืนยันตัวตนและโครงสร้างเท่านั้น ระบบรับเข้า formula เฉพาะ defined single substance ที่ผ่านเกณฑ์ QSAR และเริ่มความเข้มข้นที่ 0%
            </div>
          </div>

          {visibleError && (
            <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] leading-4 text-rose-700">
              <SemanticIcon name="alert" className="mt-0.5 size-3.5 shrink-0" />
              <span>{visibleError}</span>
            </div>
          )}
        </div>

        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 px-4 py-3 sm:flex sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={waiting}
            className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={waiting}
            className="h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60"
          >
            {onlineBusy ? "กำลังค้น PubChem…" : busy ? "กำลังตรวจสอบ…" : submitLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}

function SuggestionThumbnail({ name, smiles }: { name: string; smiles: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
      {!failed && smiles ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={substanceDepictionUrl(smiles)}
          alt={`โครงสร้างโมเลกุลของ ${name}`}
          loading="lazy"
          width={32}
          height={32}
          className="size-full object-contain p-1"
          onError={() => setFailed(true)}
        />
      ) : (
        <SemanticIcon name="beaker" className="size-3 text-slate-300" />
      )}
    </span>
  );
}
