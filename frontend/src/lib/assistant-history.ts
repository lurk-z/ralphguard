const HISTORY_VERSION = 1 as const;
const HISTORY_KEY_PREFIX = `ralphguard:assistant-history:v${HISTORY_VERSION}:`;
const MAX_MESSAGES = 80;
const MAX_TEXT_LENGTH = 20_000;
const MAX_FORMULA_ITEMS = 100;

export type PersistedFormulaItem = {
  name?: string;
  smiles: string;
  concentration: number;
};

export type PersistedAssistantMessage = {
  role: "user" | "ai";
  text: string;
  formula?: PersistedFormulaItem[];
  acted?: number;
};

type AssistantHistoryPayload = {
  version: typeof HISTORY_VERSION;
  messages: PersistedAssistantMessage[];
};

type HistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assistantHistoryKey(projectId: number | null): string {
  const scope = Number.isSafeInteger(projectId) && Number(projectId) > 0
    ? `project:${projectId}`
    : "standalone";
  return `${HISTORY_KEY_PREFIX}${scope}`;
}

function normalizeFormula(value: unknown): PersistedFormulaItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: PersistedFormulaItem[] = [];
  for (const raw of value.slice(0, MAX_FORMULA_ITEMS)) {
    if (!isRecord(raw) || typeof raw.smiles !== "string") continue;
    const smiles = raw.smiles.trim().slice(0, 2_000);
    const concentration = Number(raw.concentration);
    if (!smiles || !Number.isFinite(concentration)) continue;
    items.push({
      smiles,
      concentration: Math.min(100, Math.max(0, concentration)),
      ...(typeof raw.name === "string" && raw.name.trim()
        ? { name: raw.name.trim().slice(0, 200) }
        : {}),
    });
  }
  return items.length ? items : undefined;
}

function normalizeMessage(value: unknown): PersistedAssistantMessage | null {
  if (!isRecord(value) || (value.role !== "user" && value.role !== "ai")) return null;
  if (typeof value.text !== "string") return null;
  const text = value.text.slice(0, MAX_TEXT_LENGTH);
  if (!text.trim()) return null;
  const formula = normalizeFormula(value.formula);
  const acted = Number(value.acted);
  return {
    role: value.role,
    text,
    ...(formula ? { formula } : {}),
    ...(Number.isSafeInteger(acted) && acted > 0 ? { acted: Math.min(acted, 100) } : {}),
  };
}

function normalizeMessages(values: unknown): PersistedAssistantMessage[] {
  if (!Array.isArray(values)) return [];
  return values
    .slice(-MAX_MESSAGES)
    .map(normalizeMessage)
    .filter((message): message is PersistedAssistantMessage => message !== null);
}

export function loadAssistantHistory(
  storage: Pick<HistoryStorage, "getItem"> | null,
  key: string,
): PersistedAssistantMessage[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const payload = JSON.parse(raw) as Partial<AssistantHistoryPayload>;
    return payload.version === HISTORY_VERSION ? normalizeMessages(payload.messages) : [];
  } catch {
    return [];
  }
}

export function saveAssistantHistory(
  storage: Pick<HistoryStorage, "setItem"> | null,
  key: string,
  messages: unknown[],
): boolean {
  if (!storage) return false;
  try {
    const payload: AssistantHistoryPayload = {
      version: HISTORY_VERSION,
      messages: normalizeMessages(messages),
    };
    storage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearAssistantHistory(
  storage: Pick<HistoryStorage, "removeItem"> | null,
  key: string,
): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage may be unavailable in private browsing or restricted contexts.
  }
}
