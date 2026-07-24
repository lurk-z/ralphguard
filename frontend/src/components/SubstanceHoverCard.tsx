"use client";

import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  api,
  substanceDepictionUrl,
  type SubstanceProfile,
} from "@/lib/api";
import { resolveCatalogSubstance, substanceInfo } from "@/lib/catalog";
import { SemanticIcon } from "@/components/SemanticIcon";

const PROFILE_CACHE = new Map<string, SubstanceProfile>();
const ENDPOINT_TH: Record<string, string> = {
  skin: "ระคายเคืองผิว",
  eye: "ระคายเคืองตา",
  sens: "แพ้สัมผัส",
  acute: "พิษเฉียบพลัน",
};
const TYPE_TH: Record<string, string> = {
  defined_single_substance: "สารโมเลกุลเดี่ยว",
  salt: "เกลือ",
  polymer: "พอลิเมอร์",
  silicone: "ซิลิโคน",
  botanical_extract: "สารสกัดพืช",
  mixture: "สารผสม",
  fragrance: "น้ำหอม/สารแต่งกลิ่น",
  UVCB: "สารองค์ประกอบแปรผัน",
  inorganic: "สารอนินทรีย์",
  unknown_composition: "ไม่ทราบองค์ประกอบแน่นอน",
};

type Position = { left: number; top: number; width: number };

export default function SubstanceHoverCard({
  name,
  smiles,
  children,
  className,
}: {
  name?: string;
  smiles?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<SubstanceProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [position, setPosition] = useState<Position>({ left: 12, top: 12, width: 360 });
  const cleanSmiles = smiles?.trim() || "";
  const catalogMatch = resolveCatalogSubstance(name || "");
  const directInfo = substanceInfo(cleanSmiles);
  const curated = directInfo.info
    ? directInfo
    : substanceInfo(catalogMatch?.smiles || "");
  const cacheKey = `${name?.trim().toLowerCase() || ""}|${cleanSmiles}`;

  const placeCard = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 12;
    const gap = 10;
    const width = Math.min(380, window.innerWidth - margin * 2);
    const estimatedHeight = Math.min(540, window.innerHeight - margin * 2);
    let left = rect.right + gap;
    if (left + width > window.innerWidth - margin) left = rect.left - width - gap;
    if (left < margin) left = Math.max(margin, (window.innerWidth - width) / 2);
    const top = Math.max(
      margin,
      Math.min(rect.top, window.innerHeight - estimatedHeight - margin),
    );
    setPosition({ left, top, width });
  };

  const close = () => {
    setOpen(false);
  };

  useEffect(() => setImageFailed(false), [cleanSmiles]);

  useEffect(() => {
    if (!open || (!name?.trim() && !cleanSmiles)) return;
    const cached = PROFILE_CACHE.get(cacheKey);
    if (cached) {
      setProfile(cached);
      return;
    }
    setProfile(null);
    const controller = new AbortController();
    setLoading(true);
    api
      .getSubstanceProfile(name, cleanSmiles, controller.signal)
      .then((value) => {
        PROFILE_CACHE.set(cacheKey, value);
        setProfile(value);
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [cacheKey, cleanSmiles, name, open]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => placeCard();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !cardRef.current?.contains(target)) close();
    };
    document.addEventListener("pointerdown", closeFromOutside);
    return () => document.removeEventListener("pointerdown", closeFromOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", closeFromEscape);
    return () => document.removeEventListener("keydown", closeFromEscape);
  }, [open]);

  const toggleFromTrigger = (target: EventTarget | null) => {
    // Formula rows contain inputs/remove buttons and OCR rows contain a
    // checkbox. Those controls keep their original action; clicking the name or
    // any non-interactive part opens the molecule card.
    if ((target as HTMLElement | null)?.closest("button,input,select,textarea,a")) return;
    if (!open) placeCard();
    setOpen((current) => !current);
  };

  const depictionSmiles = profile?.canonical_smiles || cleanSmiles;
  const canDepict = Boolean(depictionSmiles && !imageFailed);

  return (
    <>
      <div
        ref={triggerRef}
        className={className}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => toggleFromTrigger(event.target)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          if ((event.target as HTMLElement).closest("button,input,select,textarea,a")) return;
          event.preventDefault();
          toggleFromTrigger(event.target);
        }}
        aria-controls={open ? tooltipId : undefined}
      >
        {children}
      </div>

      {open && typeof document !== "undefined" &&
        createPortal(
          <>
            <style>{`
              @keyframes sub-pop {
                0% { opacity: 0; transform: scale(0.55) translateX(-10px); }
                55% { opacity: 1; transform: scale(1.06) translateX(2px); }
                100% { opacity: 1; transform: scale(1) translateX(0); }
              }
              @media (prefers-reduced-motion: reduce) { .sub-pop { animation: none !important; } }
            `}</style>
          <aside
            ref={cardRef}
            id={tooltipId}
            role="dialog"
            aria-label={`ข้อมูลสาร ${profile?.canonical_name || name || "ไม่ระบุชื่อ"}`}
            className="sub-pop fixed z-[100] max-h-[calc(100vh-24px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-2xl"
            style={{ ...position, transformOrigin: "left center", animation: "sub-pop 0.34s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
          >
            <div className="flex items-start gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-teal-50 text-brand">
                <SemanticIcon name="flask" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800">
                  {profile?.canonical_name || name || "สารไม่ระบุชื่อ"}
                </div>
                {name && profile?.canonical_name && name !== profile.canonical_name && (
                  <div className="truncate text-[10px] text-slate-400">ชื่อที่พบ: {name}</div>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="ปิดข้อมูลสาร"
                className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 transition hover:scale-105 hover:bg-slate-200 hover:text-slate-800"
              >
                <SemanticIcon name="x" className="size-3.5" />
              </button>
            </div>

            <div className="mt-3 flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white">
              {canDepict ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={substanceDepictionUrl(depictionSmiles)}
                  alt={`โครงสร้างโมเลกุลของ ${profile?.canonical_name || name || "สาร"}`}
                  className="h-40 w-full object-contain p-2"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <div className="px-5 text-center text-xs leading-relaxed text-slate-400">
                  <SemanticIcon name="alert" className="mx-auto mb-1.5 size-5" />
                  ไม่มีโครงสร้างโมเลกุลเดี่ยวที่ยืนยันแล้วสำหรับวาดภาพ
                </div>
              )}
            </div>

            {loading && (
              <div className="mt-3 animate-pulse rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-400">
                กำลังโหลดข้อมูลสารที่ตรวจสอบได้…
              </div>
            )}

            {curated.info && (
              <div className="mt-3 rounded-xl bg-teal-50/70 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                  คุณสมบัติและบทบาทในสูตร
                </div>
                <div className="mt-1 text-xs leading-relaxed text-slate-700">{curated.info.role}</div>
                <div className="mt-1.5 flex gap-1.5 text-[11px] leading-relaxed text-amber-700">
                  <SemanticIcon name="alert" className="mt-0.5 size-3 shrink-0" />
                  <span>{curated.info.note}</span>
                </div>
              </div>
            )}

            {!curated.info && profile?.description && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  คำอธิบายสารจาก {profile.description_source || "PubChem"}
                </div>
                <p className="mt-1 line-clamp-5 text-[11px] leading-relaxed text-slate-600">
                  {profile.description}
                </p>
              </div>
            )}

            {!loading && !curated.info && !profile?.description && (
              <div className="mt-3 rounded-xl border border-dashed border-slate-200 p-3 text-[11px] leading-relaxed text-slate-500">
                ยังไม่มีข้อมูลบทบาทในเครื่องสำอางที่ผ่านการตรวจสอบ ระบบจึงไม่สร้างคำอธิบายฤทธิ์ขึ้นเอง
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              <InfoCell label="สูตรโมเลกุล" value={profile?.molecular_formula || "—"} />
              <InfoCell
                label="น้ำหนักโมเลกุล"
                value={profile?.molecular_weight != null ? `${profile.molecular_weight.toFixed(2)} g/mol` : "—"}
              />
              <InfoCell
                label="ประเภทสาร"
                value={TYPE_TH[profile?.substance_type || ""] || profile?.substance_type || "กำลังตรวจสอบ"}
              />
              <InfoCell
                label="การประเมิน"
                value={profile?.qsar_eligible === true ? "เข้า QSAR" : profile?.qsar_eligible === false ? "ไม่เข้า QSAR" : "ยังไม่ยืนยัน"}
              />
            </div>

            {(profile?.hazards.length ?? 0) > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-2.5">
                <div className="text-[10px] font-semibold text-slate-500">หลักฐานการจำแนก GHS ที่พบ</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {profile!.hazards.map((hazard) => (
                    <span
                      key={hazard.endpoint}
                      className={`rounded-full px-2 py-1 text-[9px] ${
                        hazard.verification === "pending"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {ENDPOINT_TH[hazard.endpoint] || hazard.endpoint}: {hazard.hazard_codes.join(", ") || "มีรายการ"}
                      {hazard.verification === "pending" ? " · รอตรวจ" : ` · ${hazard.source_count} แหล่ง`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2.5 truncate font-mono text-[9px] text-slate-400" title={depictionSmiles || undefined}>
              SMILES: {depictionSmiles || "ไม่มีโครงสร้างเดี่ยว"}
            </div>
          </aside>
          </>,
          document.body,
        )}
    </>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
      <div className="text-slate-400">{label}</div>
      <div className="mt-0.5 truncate font-medium text-slate-700" title={value}>{value}</div>
    </div>
  );
}
