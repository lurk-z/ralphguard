import assert from "node:assert/strict";
import test from "node:test";

import {
  assistantHistoryKey,
  clearAssistantHistory,
  loadAssistantHistory,
  saveAssistantHistory,
} from "../src/lib/assistant-history.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

test("assistant history uses a separate key for each project", () => {
  assert.notEqual(assistantHistoryKey(12), assistantHistoryKey(13));
  assert.notEqual(assistantHistoryKey(12), assistantHistoryKey(null));
});

test("assistant history survives storage round trips and strips executable actions", () => {
  const storage = memoryStorage();
  const key = assistantHistoryKey(12);
  assert.equal(saveAssistantHistory(storage, key, [
    { role: "user", text: "ช่วยดูสูตรนี้" },
    {
      role: "ai",
      text: "ได้ครับ",
      actions: [{ type: "clear" }],
      typing: true,
      formula: [{ name: "Water", smiles: "O", concentration: 90 }],
    },
  ]), true);

  assert.deepEqual(loadAssistantHistory(storage, key), [
    { role: "user", text: "ช่วยดูสูตรนี้" },
    {
      role: "ai",
      text: "ได้ครับ",
      formula: [{ name: "Water", smiles: "O", concentration: 90 }],
    },
  ]);

  clearAssistantHistory(storage, key);
  assert.deepEqual(loadAssistantHistory(storage, key), []);
});

test("assistant history ignores malformed storage", () => {
  const storage = memoryStorage();
  const key = assistantHistoryKey(null);
  storage.setItem(key, "not json");
  assert.deepEqual(loadAssistantHistory(storage, key), []);
});
