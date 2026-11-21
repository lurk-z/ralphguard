import { BAND_TH, type EndpointOutcome } from "./assessment";
import { stationEndpoint, type StationEndpointId } from "./endpoints";
import type { RevisionFinding } from "./revision";

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("th-TH");

/** Findings the user may carry into a revision, built only from what the trays actually returned. */
export function findingsFromOutcomes(outcomes: Partial<Record<StationEndpointId, EndpointOutcome>>): RevisionFinding[] {
  const out: RevisionFinding[] = [];
  for (const [ep, o] of Object.entries(outcomes) as [StationEndpointId, EndpointOutcome][]) {
    const label = stationEndpoint(ep).labelTh;
    if (o.kind === "result") {
      out.push({
        id: `${ep}:score`,
        endpoint: ep,
        textTh: `${label}: คะแนนคัดกรอง ${fmt(o.score)}/100 (${BAND_TH[o.band]})${o.confidence ? ` ความเชื่อมั่น ${o.confidence.level}` : ""}`,
      });
      for (const s of o.flagged) {
        out.push({
          id: `${ep}:flag:${s.name}`,
          endpoint: ep,
          textTh: `${s.name}${s.concentration != null ? ` (${fmt(s.concentration)}%)` : ""} ถูกแบบจำลองชี้ว่าเสี่ยงด้าน${label} (คะแนนสาร ${fmt(s.score)})`,
        });
      }
    } else if (o.kind === "insufficient" || o.kind === "unavailable") {
      out.push({ id: `${ep}:${o.kind}`, endpoint: ep, textTh: `${label}: ${o.reasonTh}` });
    }
  }
  return out;
}
