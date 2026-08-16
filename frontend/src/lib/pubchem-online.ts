import {
  ApiError,
  ApiTimeoutError,
  type IngredientRegistryItem,
} from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function errorDetail(response: Response): Promise<string | null> {
  const body = await response.text();
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    return typeof parsed.detail === "string" ? parsed.detail : body;
  } catch {
    return body;
  }
}

/**
 * Resolve an exact SMILES identity through the backend PubChem resolver.
 *
 * The returned registry row may remain verification_status=pending. This client
 * only resolves identity/structure for runtime screening; it does not review or
 * promote toxicity evidence.
 */
export async function lookupIngredientInPubChemBySmiles(
  smiles: string,
  signal?: AbortSignal,
  timeoutMs = 20000,
): Promise<IngredientRegistryItem> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${API}/api/substances/pubchem-online/lookup-smiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smiles: smiles.trim(), refresh: false }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError(
        response.status,
        response.statusText,
        await errorDetail(response),
      );
    }
    return (await response.json()) as IngredientRegistryItem;
  } catch (cause) {
    if (timedOut && !signal?.aborted) throw new ApiTimeoutError(timeoutMs);
    throw cause;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
