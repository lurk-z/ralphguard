import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSISTANT_MAX_TYPING_STEPS,
  ASSISTANT_MIN_THINK_MS,
  assistantThinkDelay,
  assistantTypingFrames,
} from "../src/lib/assistant-typing.ts";

test("assistant keeps a minimum visible thinking time", () => {
  assert.equal(assistantThinkDelay(0), ASSISTANT_MIN_THINK_MS);
  assert.equal(assistantThinkDelay(250), ASSISTANT_MIN_THINK_MS - 250);
  assert.equal(assistantThinkDelay(ASSISTANT_MIN_THINK_MS + 1_000), 0);
  assert.equal(assistantThinkDelay(-50), ASSISTANT_MIN_THINK_MS);
});

test("typing frames progressively reveal and preserve Thai text", () => {
  const answer = "กำลังวิเคราะห์สูตรให้ครับ 🧪";
  const frames = assistantTypingFrames(answer);

  assert.ok(frames.length > 1);
  assert.equal(frames.at(-1), answer);
  for (let index = 1; index < frames.length; index += 1) {
    assert.ok(frames[index].startsWith(frames[index - 1]));
  }
});

test("long answers have a bounded number of animation frames", () => {
  const answer = "ข้อความยาว ".repeat(500);
  const frames = assistantTypingFrames(answer);

  assert.ok(frames.length <= ASSISTANT_MAX_TYPING_STEPS);
  assert.equal(frames.at(-1), answer);
  assert.deepEqual(assistantTypingFrames(""), []);
});
