import assert from "node:assert/strict";
import test from "node:test";

import { latestCompletedAssessment } from "../src/lib/report-selection.ts";

const summary = (
  id: string,
  status: "queued" | "running" | "completed" | "failed",
  completedAt: string | null,
) => ({
  id,
  status,
  region: "face",
  project_id: 1,
  n_substances: 1,
  created_at: completedAt || "2026-07-21T00:00:00Z",
  completed_at: completedAt,
});

test("selects the newest completed assessment instead of the newest pending job", () => {
  const selected = latestCompletedAssessment([
    summary("queued-newest", "queued", null),
    summary("completed-old", "completed", "2026-07-20T10:00:00Z"),
    summary("completed-new", "completed", "2026-07-21T10:00:00Z"),
  ]);
  assert.equal(selected?.id, "completed-new");
});

test("does not invent a report when no assessment completed", () => {
  assert.equal(
    latestCompletedAssessment([
      summary("queued", "queued", null),
      summary("failed", "failed", null),
    ]),
    null,
  );
});
