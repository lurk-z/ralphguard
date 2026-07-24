import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSESSMENT_POLL_MAX_AGE_MS,
  assessmentPollDelay,
  assessmentPollExpired,
  assessmentPollResponseIsCurrent,
} from "../src/lib/assessment-polling.ts";

test("backs off failed assessment polling with an upper bound", () => {
  assert.equal(assessmentPollDelay(0), 1_500);
  assert.equal(assessmentPollDelay(1), 3_000);
  assert.equal(assessmentPollDelay(2), 6_000);
  assert.equal(assessmentPollDelay(20), 15_000);
  assert.equal(assessmentPollDelay(-1), 1_500);
});

test("expires invalid and over-age assessment jobs", () => {
  const now = Date.parse("2026-07-21T12:00:00.000Z");
  assert.equal(assessmentPollExpired("invalid", now), true);
  assert.equal(
    assessmentPollExpired(
      new Date(now - ASSESSMENT_POLL_MAX_AGE_MS + 1).toISOString(),
      now,
    ),
    false,
  );
  assert.equal(
    assessmentPollExpired(
      new Date(now - ASSESSMENT_POLL_MAX_AGE_MS).toISOString(),
      now,
    ),
    true,
  );
});

test("accepts polling responses only for the same job and formula signature", () => {
  const snapshot = { jobId: "job-new", inputSignature: "formula-v2" };
  assert.equal(
    assessmentPollResponseIsCurrent(snapshot, "job-new", "formula-v2"),
    true,
  );
  assert.equal(
    assessmentPollResponseIsCurrent(snapshot, "job-old", "formula-v2"),
    false,
  );
  assert.equal(
    assessmentPollResponseIsCurrent(snapshot, "job-new", "formula-v1"),
    false,
  );
  assert.equal(assessmentPollResponseIsCurrent(null, "job-new", "formula-v2"), false);
});
