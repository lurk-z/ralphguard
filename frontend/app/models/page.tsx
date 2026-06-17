"use client";

import { useEffect, useState } from "react";

import { EndpointMetric, ModelInfoPayload, ModelMetricsPayload, api } from "../../lib/api";

function pct(x: number | null | undefined) {
  return x == null ? "—" : `${(x * 100).toFixed(1)}%`;
}

function MetricRow({ m }: { m: EndpointMetric }) {
  const met = m.metrics;
  return (
    <tr className="border-t border-border/60">
      <td className="py-2 px-3">
        <div className="font-medium">{m.label_th}</div>
        <div className="text-xs text-gray-500">{m.label_en} · {m.oecd_tg}</div>
      </td>
      <td className="py-2 px-3 font-mono text-center">{met ? met.auc?.toFixed(3) ?? "—" : "—"}</td>
      <td className="py-2 px-3 font-mono text-center">{pct(met?.balanced_accuracy)}</td>
      <td className="py-2 px-3 font-mono text-center">{pct(met?.sensitivity)}</td>
      <td className="py-2 px-3 font-mono text-center">{pct(met?.specificity)}</td>
      <td className="py-2 px-3 font-mono text-center text-gray-400">
        {met ? `${met.n_train}/${met.n_test}` : "—"}
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

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      <nav className="flex gap-4 text-sm mb-3">
        <a href="/" className="text-gray-400 hover:text-brand">หน้าแรก</a>
        <a href="/assess" className="text-gray-400 hover:text-brand">ประเมิน</a>
        <a href="/history" className="text-gray-400 hover:text-brand">ประวัติ</a>
        <a href="/models" className="text-brand">โมเดล &amp; ความน่าเชื่อถือ</a>
      </nav>

      <header className="mb-5">
        <h1 className="text-2xl font-display font-semibold">โมเดล &amp; ความน่าเชื่อถือ</h1>
        <p className="text-xs text-gray-500 mt-1">
          ความโปร่งใสของแบบจำลอง QSAR ตามหลักการ OECD 5 ข้อ
        </p>
      </header>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {/* Validation metrics */}
      <section className="mb-8">
        <h2 className="text-lg font-display font-semibold mb-3">ผลการตรวจสอบความถูกต้อง (Validation)</h2>
        {metrics && !metrics.available && (
          <p className="text-sm text-amber-300 mb-3">{metrics.note_th}</p>
        )}
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-panel text-xs text-gray-500">
              <tr>
                <th className="py-2 px-3 text-left">Endpoint</th>
                <th className="py-2 px-3">ROC-AUC</th>
                <th className="py-2 px-3">Balanced Acc</th>
                <th className="py-2 px-3">Sensitivity</th>
                <th className="py-2 px-3">Specificity</th>
                <th className="py-2 px-3">Train/Test</th>
              </tr>
            </thead>
            <tbody>
              {metrics?.endpoints.map((m) => <MetricRow key={m.endpoint} m={m} />)}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          ประเมินด้วย 5-fold stratified cross-validation + held-out test set 20%
        </p>
      </section>

      {/* Methodology */}
      {info && (
        <section className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="p-4 rounded-lg bg-panel border border-border">
            <h3 className="font-semibold mb-2">วิธีการ (Methodology)</h3>
            <dl className="text-sm space-y-1 text-gray-300">
              <div><span className="text-gray-500">อัลกอริทึม:</span> {String(info.methodology.algorithm)}</div>
              <div><span className="text-gray-500">ฟีเจอร์:</span> {String(info.methodology.features)}</div>
              <div><span className="text-gray-500">Applicability Domain:</span> {String(info.methodology.applicability_domain)}</div>
              <div><span className="text-gray-500">Validation:</span> {String(info.methodology.validation)}</div>
            </dl>
            <h4 className="font-medium mt-3 mb-1 text-sm">Confidence 3 ชั้น</h4>
            <ul className="text-xs text-gray-400 list-disc list-inside space-y-0.5">
              {(info.methodology.confidence_layers as string[])?.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>

          <div className="p-4 rounded-lg bg-panel border border-border">
            <h3 className="font-semibold mb-2">หลักการ OECD QSAR 5 ข้อ</h3>
            <ul className="text-sm text-gray-300 space-y-1.5">
              {info.oecd_principles.map((p) => (
                <li key={p} className="leading-snug">{p}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {info && (
        <p className="text-xs text-gray-500 pt-4 border-t border-border">{info.disclaimer_th}</p>
      )}
    </main>
  );
}
