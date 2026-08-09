"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { SemanticIcon } from "@/components/SemanticIcon";
import { substanceDepictionUrl, type IngredientRegistryItem } from "@/lib/api";

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
  subtitle = "กรอกชื่อสารหรือ SMILES อย่างน้อยหนึ่งช่อง",
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

  return (
    <div
      className="fixed inset-0 z-[120] grid animate-in place-items-center bg-slate-900/30 p-4 fade-in-0 duration-150 backdrop-blur-sm motion-reduce:animate-none"
      onClick={() => !busy && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-[min(94vw,440px)] animate-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
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
            disabled={busy}
            aria-label="ปิด"
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-wait disabled:opacity-50"
          >
            <SemanticIcon name="x" className="size-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
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
                setSuggestionsOpen(true);
              }}
              placeholder="เช่น Ethanol หรือ Glycerin"
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
                    กำลังค้นหาสาร…
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
                  <div className="px-2.5 py-2 text-[11px] text-slate-400">ไม่พบชื่อสารที่ตรงกัน</div>
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
              onChange={(event) => onSmilesChange(event.target.value)}
              placeholder="เช่น CCO"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-800 outline-none transition-colors placeholder:font-sans placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
          </label>

          <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-4 text-slate-500">
            ระบบจะใช้ชื่อและ SMILES ที่ยืนยันแล้วจากฐานข้อมูล ความเข้มข้นของสารใหม่จะเริ่มที่ 0%
          </div>

          {error && (
            <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] leading-4 text-rose-700">
              <SemanticIcon name="alert" className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={busy}
            className="h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "กำลังตรวจสอบ…" : submitLabel}
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
