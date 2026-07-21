import assert from "node:assert/strict";
import test from "node:test";

import {
  createLatestRequestGate,
  isAbortError,
  logRequestFailure,
} from "../src/lib/request-reliability.ts";

test("starting a newer request aborts and invalidates the previous lease", () => {
  const gate = createLatestRequestGate();
  const first = gate.start();
  assert.equal(first.isCurrent(), true);

  const second = gate.start();
  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.signal.aborted, false);
  assert.equal(second.isCurrent(), true);
});

test("cancelling a request gate aborts the active lease", () => {
  const gate = createLatestRequestGate();
  const lease = gate.start();
  gate.cancel();

  assert.equal(lease.signal.aborted, true);
  assert.equal(lease.isCurrent(), false);
});

test("abort errors are recognized and intentionally not logged", () => {
  const calls: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => calls.push(args);
  try {
    const aborted = new Error("navigation changed");
    aborted.name = "AbortError";
    assert.equal(isAbortError(aborted), true);
    logRequestFailure("test request", aborted);
    assert.equal(calls.length, 0);
  } finally {
    console.error = original;
  }
});

test("request logs include operational metadata but exclude secret-bearing messages", () => {
  const calls: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => calls.push(args);
  try {
    const cause = Object.assign(new Error("API_KEY=must-not-appear"), { status: 503 });
    logRequestFailure("model request", cause);

    assert.equal(calls.length, 1);
    assert.equal(JSON.stringify(calls[0]).includes("must-not-appear"), false);
    assert.deepEqual(calls[0][1], { error: "Error", status: 503 });
  } finally {
    console.error = original;
  }
});
