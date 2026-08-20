"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, apiErrorMessage, HerbalPlantDetail, HerbalPlantSummary } from "@/lib/api";
import SiteNav from "@/components/SiteNav";

export default function HerbsPage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<HerbalPlantSummary[]>([]);
  const [detail, setDetail] = useState<HerbalPlantDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api.searchHerbs("ก", controller.signal)
      .then(setRows)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setDetail(null);
    try {
      setRows(await api.searchHerbs(query));
    } catch (cause) {
      setError(apiErrorMessage(cause, "ค้นหาคลังสมุนไพรไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  async function selectHerb(id: number) {
    setLoading(true);
    setError("");
    try {
      setDetail(await api.getHerb(id));
    } catch (cause) {
      setError(apiErrorMessage(cause, "โหลดรายละเอียดสมุนไพรไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <SiteNav active="/herbs" />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold">คลังสมุนไพรไทย</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          แยกข้อมูลพืช วัตถุดิบ/สารสกัด และสารองค์ประกอบออกจากกันอย่างชัดเจน
          ระบบจะไม่แทนสารสกัดทั้งชนิดด้วย SMILES ของสารเดี่ยว
        </p>

        <form onSubmit={search} className="mt-6 flex gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อไทย อังกฤษ หรือชื่อวิทยาศาสตร์"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-teal-500"
          />
          <button disabled={loading || !query.trim()} className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
            {loading ? "กำลังค้นหา…" : "ค้นหา"}
          </button>
        </form>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">ผลการค้นหา ({rows.length})</h2>
            <div className="mt-3 space-y-2">
              {rows.map((row) => (
                <button key={row.id} onClick={() => selectHerb(row.id)} className="w-full rounded-xl border border-slate-200 p-3 text-left hover:border-teal-400 hover:bg-teal-50">
                  <div className="font-semibold">{row.thai_name}</div>
                  <div className="mt-1 text-xs italic text-slate-500">{row.accepted_scientific_name}</div>
                </button>
              ))}
              {!loading && rows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">ยังไม่พบรายการที่ตรงกัน</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            {!detail ? (
              <p className="text-sm text-slate-500">เลือกสมุนไพรเพื่อดูวัตถุดิบ สารองค์ประกอบ แหล่งอ้างอิง และ QSAR coverage</p>
            ) : (
              <>
                <h2 className="text-2xl font-bold">{detail.plant.thai_name}</h2>
                <p className="mt-1 italic text-slate-600">{detail.plant.accepted_scientific_name}</p>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["สารองค์ประกอบ", detail.coverage.known_constituents],
                    ["พบโครงสร้าง", detail.coverage.structure_resolved],
                    ["ประเมิน QSAR ได้", detail.coverage.qsar_assessed],
                    ["Coverage", `${detail.coverage.percentage}%`],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl bg-slate-100 p-3">
                      <div className="text-xl font-bold">{value}</div>
                      <div className="text-xs text-slate-500">{label}</div>
                    </div>
                  ))}
                </div>

                <h3 className="mt-7 font-semibold">วัตถุดิบและสารสกัด</h3>
                <div className="mt-2 space-y-2">
                  {detail.materials.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <span className="font-medium">{item.plant_part} · {item.material_type}</span>
                      <span className="ml-2 text-slate-500">{item.assessment_method === "compound_qsar" ? "สารเดี่ยว—QSAR" : "ประเมินจากหลักฐานพฤกษศาสตร์"}</span>
                    </div>
                  ))}
                </div>

                <h3 className="mt-7 font-semibold">สารองค์ประกอบ</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-slate-500"><tr><th className="py-2">ชื่อสาร</th><th>PubChem CID</th><th>โครงสร้าง</th><th>QSAR</th></tr></thead>
                    <tbody>{detail.constituents.map((item, index) => (
                      <tr key={`${item.name}-${index}`} className="border-t border-slate-100">
                        <td className="py-2 font-medium">{item.name}</td><td>{item.pubchem_cid ?? "—"}</td><td>{item.structure_resolved ? "Resolved" : "Unresolved"}</td><td>{item.qsar_eligible ? "พร้อม" : "ยังไม่พร้อม"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
