"use client";

import { useEffect, useState } from "react";

import { EndpointMetric, ModelInfoPayload, ModelMetricsPayload, api } from "../../lib/api";

function pct(x: number | null | undefined) {
  return x == null ? "—" : `${(x * 100).toFixed(1)}%`;
}

/** Horizontal value bar (0..1) colored by a quality threshold. */
function MetricBar({ value, warnBelow = 0.5 }: { value: number | null | undefined; warnBelow?: number }) {
  if (value == null) return <span className="text-gray-600">—</span>;
  const w = Math.max(0, Math.min(1, value)) * 100;
  const color = value < warnBelow ? "#FB6F70" : value < 0.7 ? "#FBBF24" : "#34D399";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
      </div>
      <span className="font-mono text-xs tabular-nums" style={{ color }}>
        {pct(value)}
      </span>
    </div>
  );
}

function MetricRow({ m }: { m: EndpointMetric }) {
  const met = m.metrics;
  const lowSens = met != null && met.sensitivity != null && met.sensitivity < 0.3;
  return (
    <tr className="border-t border-border/50">
      <td className="px-4 py-3">
        <div className="font-medium">{m.label_th}</div>
        <div className="text-xs text-gray-500">
          {m.label_en} · {m.oecd_tg}
        </div>
      </td>
      <td className="px-4 py-3 text-center font-mono tabular-nums">
        {met ? met.auc?.toFixed(3) ?? "—" : "—"}
      </td>
      <td className="px-4 py-3">
        <MetricBar value={met?.balanced_accuracy} />
      </td>
      <td className="px-4 py-3">
        <MetricBar value={met?.sensitivity} warnBelow={0.3} />
      </td>
      <td className="px-4 py-3">
        <MetricBar value={met?.specificity} />
      </td>
      <td className="px-4 py-3 text-center font-mono text-xs text-gray-400">
        {met ? `${met.n_train}/${met.n_test}` : "—"}
        {lowSens && <span className="ml-1" title="sensitivity ต่ำ">⚠️</span>}
      </td>
    </tr>
  );
}

export default function ModelsPage() {
  const [metrics, setMetrics] = useState<ModelMetricsPayload | null>(null);
  const [info, setInfo] = useState<ModelInfoPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getModelMetrics(), api.getModelInfo()])
      .then(([m, i]) => {
        setMetrics(m);
        setInfo(i);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const anyLowSens = metrics?.endpoints.some(
    (m) => m.metrics?.sensitivity != null && m.metrics.sensitivity < 0.3,
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">
          โมเดล &amp; ความน่าเชื่อถือ
        </h1>
        <p className="mt-1 text-xs text-gray-500">
          ความโปร่งใสของแบบจำลอง QSAR ตามหลักการ OECD 5 ข้อ
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Validation metrics */}
      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold">
          ผลการตรวจสอบความถูกต้อง (Validation)
        </h2>
        {metrics && !metrics.available && (
          <p className="mb-3 text-sm text-amber-300">{metrics.note_th}</p>
        )}
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-elevated/40 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Endpoint</th>
                  <th className="px-4 py-3 font-medium">ROC-AUC</th>
                  <th className="px-4 py-3 text-left font-medium">Balanced Acc</th>
                  <th className="px-4 py-3 text-left font-medium">Sensitivity</th>
                  <th className="px-4 py-3 text-left font-medium">Specificity</th>
                  <th className="px-4 py-3 font-medium">Train/Test</th>
                </tr>
              </thead>
              <tbody>
                {metrics?.endpoints.map((m) => <MetricRow key={m.endpoint} m={m} />)}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          ประเมินด้วย 5-fold stratified cross-validation + held-out test set 20%
        </p>

        {anyLowSens && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-200/90">
            <span className="font-semibold">หมายเหตุความโปร่งใส:</span>{" "}
            บาง endpoint มีค่า sensitivity ต่ำเนื่องจากชุดข้อมูลขนาดเล็กและ class imbalance
            (positive น้อย) — ระบบจึงเหมาะกับการ <span className="font-semibold">คัดกรองเบื้องต้น</span>{" "}
            และควรใช้ผลร่วมกับ structural alerts + ระดับความเชื่อมั่น ไม่ใช้แทนการทดสอบจริง
          </div>
        )}
      </section>

      {/* Methodology */}
      {info && (
        <section className="mb-8 grid gap-6 md:grid-cols-2">
          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <span>⚙️</span> วิธีการ (Methodology)
            </h3>
            <dl className="space-y-1.5 text-sm text-gray-300">
              <MethodRow label="อัลกอริทึม" value={String(info.methodology.algorithm)} />
              <MethodRow label="ฟีเจอร์" value={String(info.methodology.features)} />
              <MethodRow
                label="Applicability Domain"
                value={String(info.methodology.applicability_domain)}
              />
              <MethodRow label="Validation" value={String(info.methodology.validation)} />
            </dl>
            <h4 className="mb-1 mt-4 text-sm font-medium">Confidence 3 ชั้น</h4>
            <ul className="space-y-1 text-xs text-gray-400">
              {(info.methodology.confidence_layers as string[])?.map((l, i) => (
                <li key={l} className="flex gap-2">
                  <span className="font-mono text-brand/70">L{i + 1}</span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <span>📋</span> หลักการ OECD QSAR 5 ข้อ
            </h3>
            <ol className="space-y-2 text-sm text-gray-300">
              {info.oecd_principles.map((p, i) => (
                <li key={p} className="flex gap-3 leading-snug">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand/15 font-mono text-[11px] text-brand">
                    {i + 1}
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {info && (
        <p className="border-t border-border pt-4 text-xs text-gray-500">{info.disclaimer_th}</p>
      )}
    </main>
  );
}

function MethodRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <span className="text-gray-500">{label}:</span>
      <span>{value}</span>
    </div>
  );
}
