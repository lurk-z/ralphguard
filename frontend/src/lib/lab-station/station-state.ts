import { STATION_ENDPOINT_IDS, type StationEndpointId } from "./endpoints";

/**
 * Per-tray workflow state for one tested revision. One analyst works the station, so only one
 * tray is busy at a time; every busy phase blocks repeated clicks until it settles.
 *
 *   ready → testing → deciding ─keep→ storing → stored
 *                              └discard→ discarding → discarded
 * A failed store/discard returns to `deciding` with the error, so the same sample can be retried.
 */
export type TrayPhase = "ready" | "testing" | "deciding" | "storing" | "discarding" | "stored" | "discarded";

export type StationState = {
  phase: Record<StationEndpointId, TrayPhase>;
  error: Partial<Record<StationEndpointId, string>>;
  slot: Partial<Record<StationEndpointId, number>>;
  busy: StationEndpointId | null;
};

export type StationAction =
  | { type: "reset"; stored?: Partial<Record<StationEndpointId, number>> }
  | { type: "start"; endpoint: StationEndpointId }
  | { type: "tested"; endpoint: StationEndpointId }
  | { type: "decide"; endpoint: StationEndpointId; choice: "keep" | "discard" }
  | { type: "stored"; endpoint: StationEndpointId; slot: number }
  | { type: "discarded"; endpoint: StationEndpointId }
  | { type: "failed"; endpoint: StationEndpointId; messageTh: string };

export function initialStationState(stored: Partial<Record<StationEndpointId, number>> = {}): StationState {
  const phase = {} as Record<StationEndpointId, TrayPhase>;
  for (const id of STATION_ENDPOINT_IDS) phase[id] = stored[id] !== undefined ? "stored" : "ready";
  return { phase, error: {}, slot: { ...stored }, busy: null };
}

export function stationReducer(s: StationState, a: StationAction): StationState {
  switch (a.type) {
    case "reset":
      return initialStationState(a.stored);
    case "start":
      if (s.busy || s.phase[a.endpoint] !== "ready") return s;
      return { ...s, busy: a.endpoint, phase: { ...s.phase, [a.endpoint]: "testing" }, error: { ...s.error, [a.endpoint]: undefined } };
    case "tested":
      if (s.phase[a.endpoint] !== "testing") return s;
      return { ...s, busy: null, phase: { ...s.phase, [a.endpoint]: "deciding" } };
    case "decide":
      if (s.busy || s.phase[a.endpoint] !== "deciding") return s;
      return {
        ...s,
        busy: a.endpoint,
        phase: { ...s.phase, [a.endpoint]: a.choice === "keep" ? "storing" : "discarding" },
        error: { ...s.error, [a.endpoint]: undefined },
      };
    case "stored":
      if (s.phase[a.endpoint] !== "storing") return s;
      return { ...s, busy: null, phase: { ...s.phase, [a.endpoint]: "stored" }, slot: { ...s.slot, [a.endpoint]: a.slot } };
    case "discarded":
      if (s.phase[a.endpoint] !== "discarding") return s;
      return { ...s, busy: null, phase: { ...s.phase, [a.endpoint]: "discarded" } };
    case "failed": {
      const back: TrayPhase = s.phase[a.endpoint] === "testing" ? "ready" : "deciding";
      return { ...s, busy: null, phase: { ...s.phase, [a.endpoint]: back }, error: { ...s.error, [a.endpoint]: a.messageTh } };
    }
  }
}

export const isResolved = (p: TrayPhase) => p === "stored" || p === "discarded";
export const allResolved = (s: StationState) => STATION_ENDPOINT_IDS.every((id) => isResolved(s.phase[id]));
