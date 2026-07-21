export type RequestLease = {
  signal: AbortSignal;
  isCurrent: () => boolean;
};

export type LatestRequestGate = {
  start: () => RequestLease;
  cancel: () => void;
};

/**
 * Owns at most one request. Starting a new request aborts the previous one and
 * stale completions can be rejected with `lease.isCurrent()`.
 */
export function createLatestRequestGate(): LatestRequestGate {
  let generation = 0;
  let controller: AbortController | null = null;

  return {
    start() {
      controller?.abort();
      controller = new AbortController();
      const ownGeneration = ++generation;
      const ownController = controller;
      return {
        signal: ownController.signal,
        isCurrent: () =>
          generation === ownGeneration &&
          controller === ownController &&
          !ownController.signal.aborted,
      };
    },
    cancel() {
      generation += 1;
      controller?.abort();
      controller = null;
    },
  };
}

export function isAbortError(cause: unknown): boolean {
  return (
    (cause instanceof DOMException && cause.name === "AbortError") ||
    (cause instanceof Error && cause.name === "AbortError")
  );
}

/** Log only operational metadata. Response bodies, request payloads and keys
 * are deliberately excluded so diagnostics cannot leak secrets. */
export function logRequestFailure(scope: string, cause: unknown): void {
  if (isAbortError(cause)) return;
  const status =
    typeof cause === "object" && cause !== null && "status" in cause
      ? Number((cause as { status?: unknown }).status)
      : null;
  const errorName = cause instanceof Error ? cause.name : typeof cause;
  console.error(`[RalphGuard] ${scope}`, {
    error: errorName,
    ...(Number.isFinite(status) ? { status } : {}),
  });
}
