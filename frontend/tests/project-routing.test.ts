import assert from "node:assert/strict";
import test from "node:test";

import { parseProjectRouteId } from "../src/lib/project-routing.ts";

test("accepts only positive safe integer project route IDs", () => {
  assert.equal(parseProjectRouteId("1"), 1);
  assert.equal(parseProjectRouteId("0012"), 12);
  assert.equal(parseProjectRouteId(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
});

test("rejects missing, malformed, non-positive, and unsafe project IDs", () => {
  for (const value of [null, undefined, "", " ", "0", "-1", "+1", "1.5", "1e2", "abc"]) {
    assert.equal(parseProjectRouteId(value), null);
  }
  assert.equal(parseProjectRouteId("9007199254740992"), null);
});
