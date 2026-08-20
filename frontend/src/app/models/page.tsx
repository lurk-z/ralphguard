"use client";

import { useEffect, useState } from "react";

import { EndpointMetric, ModelInfoPayload, ModelMetricsPayload, api, apiErrorMessage } from "../../lib/api";
import { isAbortError, logRequestFailure } from "../../lib/request-reliability";

function pct(x: number | null | undefined) {
  return x == null ? "—" : `${(x * 100).toFixed(1)}%`;
}

type EvidenceSourceItem = {
  provider?: string;
  role?: string;
  status?: string;
  description_th?: string;
  configured_sources?: Record<string, string>;
};

type ExtendedModelInfo = ModelInfoPayload & {
  data_integrity_policy?: Record<string, string>;
  evidence_sources?: Record<string, EvidenceSourceItem>;
  validation_status?: Record<
    string,
    { status: string; description_th: string }
  >;
  training_integrity?: {
    generated_at?: string;
    ready_for_retraining?: boolean;
    endpoints?: Record<string, unknown>;
  } | null;
};

const STATUS_LABEL: Record<string, string> = {
  complete: "เสร็จแล้ว",
  tooling_available: "มีเครื่องมือตรวจแล้ว",
  planned: "ขั้นถัดไป",
  not_completed: "ยังไม่เสร็จ",
};

function MetricRow({ m }: { m: EndpointMetric }) {
  const met = m.metrics;
  const total = (met?.n_pos ?? 0) + (met?.n_neg ?? 0);
  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2 font-medium">
          {m.label_th}
          {m.status === "candidate" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">Candidate</span>}
          {m.status === "not_trained" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">ยังไม่เทรน</span>}
        </div>
        <div className="text-xs text-ink2/55">{m.label_en}{m.oecd_tg ? ` · ${m.oecd_tg}` : " · evidence-defined endpoint"}</div>
      </td>
      <td className="px-3 py-2 text-center font-mono">
        {met ? `${total} (${met.n_pos ?? "—"}/${met.n_neg ?? "—"})` : "—"}
      </td>
      <td className="px-3 py-2 text-center font-mono">{met ? met.auc?.toFixed(3) ?? "—" : "—"}</td>
      <td className="px-3 py-2 text-center font-mono">{pct(met?.balanced_accuracy)}</td>
      <td className="px-3 py-2 text-center font-mono">{pct(met?.sensitivity)}</td>
      <td className="px-3 py-2 text-center font-mono">{pct(met?.specificity)}</td>
      <td className="px-3 py-2 text-center font-mono">{met?.mcc?.toFixed(3) ?? "—"}</td>
      <td className="px-3 py-2 text-center font-mono">{met?.threshold?.toFixed(2) ?? "—"}</td>
    </tr>
  );
}

export default function ModelsPage() {
  const [metrics, setMetrics] = useState<ModelMetricsPayload | null>(null);
  const [info, setInfo] = useState<ModelInfoPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.getModelMetrics(controller.signal),
      api.getModelInfo(controller.signal),
    ])
      .then(([m, i]) => {
        setMetrics(m);
        setInfo(i);
      })
      .catch((cause) => {
        if (isAbortError(cause)) return;
        logRequestFailure("load model reliability", cause);
        setError(apiErrorMessage(cause, "โหลดข้อมูลโมเดลไม่สำเร็จ"));
      });
    return () => controller.abort();
  }, []);

  const extendedInfo = info as ExtendedModelInfo | null;
  const integrityPolicy = extendedInfo?.data_integrity_policy ?? {};
  const evidenceSources = extendedInfo?.evidence_sources ?? {};
  const validationStatus = extendedInfo?.validation_status ?? {};

  return (
    <main className="mx-auto min-h-screen max-w-6xl p-4 sm:p-6">
      <nav className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <a href="/" className="text-ink2/65 hover:text-brand">หน้าแรก</a>
        <a href="/assess" className="text-ink2/65 hover:text-brand">ประเมิน</a>
        <a href="/skin-viewer" className="text-ink2/65 hover:text-brand">โมเดลผิว 3D</a>
        <a href="/history" className="text-ink2/65 hover:text-brand">ประวัติ</a>
        <a href="/models" className="text-brand">โมเดล &amp; ความน่าเชื่อถือ</a>
      </nav>

      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold">โมเดล &amp; ความน่าเชื่อถือ</h1>
        <p className="mt-1 text-xs text-ink2/55">
          แสดงวิธีสร้าง QSAR, หลักฐานที่ใช้ฝึก, วิธีป้องกัน data leakage และสถานะ validation ตามที่ทำได้จริงในระบบ
        </p>
      </header>

      {error && <p className="mb-4 text-sm text-rose-400">{error}</p>}

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold">ผลการตรวจสอบความถูกต้อง (Validation)</h2>
            <p className="mt-1 text-xs text-ink2/55">
              N แสดงจำนวนสารทั้งหมด และวงเล็บเป็น Positive/Negative ของ endpoint นั้น
            </p>
          </div>
          <span className="rounded-full border border-border bg-panel px-3 py-1 text-[11px] text-ink2/65">
            Internal validation · 5-fold OOF
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-panel text-xs text-ink2/55">
              <tr>
                <th className="px-3 py-2 text-left">Endpoint</th>
                <th className="px-3 py-2">N (Pos/Neg)</th>
                <th className="px-3 py-2">ROC-AUC</th>
                <th className="px-3 py-2">Balanced Acc</th>
                <th className="px-3 py-2">Sensitivity</th>
                <th className="px-3 py-2">Specificity</th>
                <th className="px-3 py-2">MCC</th>
                <th className="px-3 py-2">Threshold</th>
              </tr>
            </thead>
            <tbody>
              {metrics?.endpoints.map((m) => <MetricRow key={m.endpoint} m={m} />)}
            </tbody>
          </table>
        </div>

        {metrics?.note_th && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            {metrics.note_th}
          </div>
        )}
      </section>

      {extendedInfo && (
        <section className="mb-8 grid gap-5 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-panel p-4">
            <h3 className="mb-2 font-semibold">วิธีการ (Methodology)</h3>
            <dl className="space-y-2 text-sm text-gray-300">
              <div><span className="text-ink2/55">อัลกอริทึม:</span> {String(extendedInfo.methodology.algorithm)}</div>
              <div><span className="text-ink2/55">ฟีเจอร์:</span> {String(extendedInfo.methodology.features)}</div>
              <div><span className="text-ink2/55">Applicability Domain:</span> {String(extendedInfo.methodology.applicability_domain)}</div>
              <div><span className="text-ink2/55">Validation:</span> {String(extendedInfo.methodology.validation)}</div>
            </dl>
            <h4 className="mb-1 mt-4 text-sm font-medium">Confidence 4 ชั้น</h4>
            <ul className="list-inside list-disc space-y-1 text-xs text-ink2/65">
              {(extendedInfo.methodology.confidence_layers as string[])?.map((layer) => (
                <li key={layer}>{layer}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-panel p-4">
            <h3 className="mb-2 font-semibold">หลักการ OECD QSAR 5 ข้อ</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              {extendedInfo.oecd_principles.map((principle) => (
                <li key={principle} className="leading-snug">{principle}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {Object.keys(evidenceSources).length > 0 && (
        <section className="mb-8">
          <h2 className="font-display text-lg font-semibold">แหล่งข้อมูลและบทบาทของแต่ละแหล่ง</h2>
          <p className="mt-1 text-xs text-ink2/55">
            แยกแหล่งโครงสร้าง, แหล่ง evidence, เครื่องมือ chemistry และเครื่องมือ machine learning ออกจากกัน เพื่อให้ trace ได้ว่าค่าแต่ละส่วนเกิดจากไหน
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {Object.entries(evidenceSources).map(([key, item]) => (
              <article key={key} className="rounded-lg border border-border bg-panel p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-brand">{key.replaceAll("_", " ")}</div>
                {(item.provider || item.status) && (
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {item.provider ?? item.status}
                  </div>
                )}
                {item.role && <p className="mt-1 text-sm leading-relaxed text-ink2/75">{item.role}</p>}
                {item.description_th && <p className="mt-1 text-sm leading-relaxed text-ink2/75">{item.description_th}</p>}
                {item.configured_sources && (
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-ink2/65">
                    {Object.entries(item.configured_sources).map(([endpoint, source]) => (
                      <li key={endpoint}><span className="font-semibold">{endpoint}:</span> {source}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {Object.keys(integrityPolicy).length > 0 && (
        <section className="mb-8">
          <h2 className="font-display text-lg font-semibold">ความถูกต้องของข้อมูลฝึกและการป้องกัน Data Leakage</h2>
          <p className="mt-1 text-xs text-ink2/55">
            แยก “โครงสร้างสารจาก PubChem” ออกจาก “หลักฐานความเป็นพิษที่ใช้เป็น label” เพื่อไม่ให้ข้อมูลที่ไม่มีผลทดลองถูกตีความเป็นผลลบ
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {Object.entries(integrityPolicy).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-border bg-panel p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-brand">{key.replaceAll("_", " ")}</div>
                <p className="mt-1 text-sm leading-relaxed text-ink2/75">{value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {Object.keys(validationStatus).length > 0 && (
        <section className="mb-8">
          <h2 className="font-display text-lg font-semibold">สถานะหลักฐาน Validation</h2>
          <div className="mt-3 space-y-2">
            {Object.entries(validationStatus).map(([key, item]) => (
              <div key={key} className="flex flex-col gap-2 rounded-lg border border-border bg-panel p-3 sm:flex-row sm:items-start">
                <div className="min-w-48">
                  <div className="text-xs font-semibold text-foreground">{key.replaceAll("_", " ")}</div>
                  <span className="mt-1 inline-block rounded-full border border-border px-2 py-0.5 text-[10px] text-ink2/65">
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-ink2/70">{item.description_th}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {extendedInfo?.training_integrity && (
        <section className="mb-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <h2 className="font-semibold">Training Integrity Report พร้อมใช้งาน</h2>
          <p className="mt-1 text-xs leading-relaxed">
            ระบบพบรายงานที่สร้างโดยสคริปต์ตรวจข้อมูลฝึกแล้ว
            {extendedInfo.training_integrity.generated_at ? ` · ${extendedInfo.training_integrity.generated_at}` : ""}
          </p>
        </section>
      )}

      {extendedInfo && (
        <p className="border-t border-border pt-4 text-xs leading-relaxed text-ink2/55">
          {extendedInfo.disclaimer_th}
        </p>
      )}
    </main>
  );
}
