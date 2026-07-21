import assert from "node:assert/strict";
import test from "node:test";

import { ApiError, ApiTimeoutError, api, apiErrorMessage } from "../src/lib/api.ts";

test("API methods forward a caller abort signal to fetch", async () => {
  const originalFetch = globalThis.fetch;
  let receivedSignal: AbortSignal | null = null;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    receivedSignal = init?.signal ?? null;
    return new Promise<Response>((_resolve, reject) => {
      if (receivedSignal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      receivedSignal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  }) as typeof fetch;

  try {
    const controller = new AbortController();
    const request = api.listProjects(controller.signal);
    controller.abort();
    await assert.rejects(request, (cause: unknown) => {
      return cause instanceof Error && cause.name === "AbortError";
    });
    const forwardedSignal = receivedSignal as AbortSignal | null;
    assert.equal(forwardedSignal?.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("timeout errors have an actionable Thai message", () => {
  assert.equal(
    apiErrorMessage(new ApiTimeoutError(12000), "โหลดข้อมูลไม่สำเร็จ"),
    "โหลดข้อมูลไม่สำเร็จ: หมดเวลาการเชื่อมต่อเซิร์ฟเวอร์",
  );
});

test("project creation returns the backend project and never invents a local fallback", async () => {
  const originalFetch = globalThis.fetch;
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestInit = init;
    return new Response(
      JSON.stringify({
        id: 42,
        name: "Safety Lab",
        description: null,
        created_at: "2026-07-21T00:00:00Z",
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const project = await api.createProject("Safety Lab");
    assert.equal(project.id, 42);
    assert.equal(project.name, "Safety Lab");
    assert.equal(requestInit?.method, "POST");
    assert.equal(JSON.parse(String(requestInit?.body)).name, "Safety Lab");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("project creation surfaces backend failure instead of returning a fake project", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ detail: "database unavailable" }), {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  try {
    await assert.rejects(api.createProject("Safety Lab"), (cause: unknown) => {
      return cause instanceof ApiError && cause.status === 503;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
