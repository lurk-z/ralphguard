// Parsing for the assistant's replies.
//
// backend/app/api/chat.py instructs the model to append machine-readable blocks
// to an otherwise human answer:
//
//   <action>[{"type":"set_concentration","name":"Ethanol","concentration":8}]</action>
//   <formula>[{"name":"Glycerin","smiles":"OCC(O)CO","concentration":5}]</formula>
//
// `<action>` is the agent: commands to carry out. `<formula>` is a suggestion
// for the user to import. Both must be stripped from the text before it is
// shown — the prompt promises the user never sees the JSON.
import type { FormulaItem } from "./api";

/** One agent command. Shapes vary by `type`; the executor validates each. */
export type AssistantAction = { type?: string } & Record<string, unknown>;

export type AssistantReply = {
  /** The answer with both blocks removed — safe to render and to read aloud. */
  text: string;
  actions: AssistantAction[];
  /** A suggested formula to offer as an import, if the reply carried one. */
  formula?: FormulaItem[];
};

function cut(text: string, tag: string): { rest: string; json?: unknown } {
  const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return { rest: text };
  let json: unknown;
  try {
    json = JSON.parse(m[1].trim());
  } catch {
    // A malformed block is dropped rather than shown as raw JSON.
  }
  return { rest: text.replace(m[0], "").trim(), json };
}

export function parseAssistantReply(answer: string): AssistantReply {
  const f = cut(answer, "formula");
  const a = cut(f.rest, "action");

  const formula = Array.isArray(f.json)
    ? (f.json as Record<string, unknown>[])
        .filter((x) => x && x.smiles)
        .map((x) => ({
          name: String(x.name ?? ""),
          smiles: String(x.smiles),
          concentration: Number(x.concentration) || 0,
        }))
    : undefined;

  return {
    text: a.rest,
    actions: Array.isArray(a.json) ? (a.json as AssistantAction[]) : [],
    formula: formula?.length ? formula : undefined,
  };
}

/**
 * A reply's suggested formula, tolerating a model that ignores instructions to
 * answer with only <formula> and uses <action>[{"type":"set_formula","items":
 * [...]}]</action> (or create_formula) instead — optimizeFormula's prompt asks
 * strictly for <formula>, but nothing enforces that on the model's side.
 */
export function extractFormula(answer: string): FormulaItem[] {
  const reply = parseAssistantReply(answer);
  if (reply.formula?.length) return reply.formula;

  const withItems = reply.actions.find((a) => Array.isArray(a.items));
  if (!withItems) return [];
  return (withItems.items as unknown[])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !!(x as Record<string, unknown>).smiles)
    .map((x) => ({
      name: String(x.name ?? ""),
      smiles: String(x.smiles),
      concentration: Number(x.concentration) || 0,
    }));
}
