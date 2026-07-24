export const ASSESSMENT_POLL_BASE_DELAY_MS = 1_500;
export const ASSESSMENT_POLL_MAX_DELAY_MS = 15_000;
export const ASSESSMENT_POLL_MAX_AGE_MS = 15 * 60 * 1_000;

export function assessmentPollDelay(failureCount: number): number {
  const safeFailures = Math.max(0, Math.min(10, Math.floor(failureCount)));
  return Math.min(
    ASSESSMENT_POLL_MAX_DELAY_MS,
    ASSESSMENT_POLL_BASE_DELAY_MS * 2 ** safeFailures,
  );
}

export function assessmentPollExpired(
  startedAt: string,
  nowMs = Date.now(),
): boolean {
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return true;
  return nowMs - startedMs >= ASSESSMENT_POLL_MAX_AGE_MS;
}

export function assessmentPollResponseIsCurrent(
  snapshot: { jobId?: string | null; inputSignature?: string } | null | undefined,
  expectedJobId: string,
  expectedInputSignature: string,
): boolean {
  return Boolean(
    snapshot &&
      snapshot.jobId === expectedJobId &&
      snapshot.inputSignature === expectedInputSignature,
  );
}
