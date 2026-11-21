import { publicSteps } from "./chat-history.ts";

/** Existing JSON replies or newline-delimited public step events followed by one final answer. */
export async function readChatResponse(response: Response, onStep: (label: string) => void): Promise<string> {
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const body = await response.json();
    for (const step of publicSteps(body.public_steps)) onStep(step);
    if (typeof body.answer !== "string") throw new Error("Missing answer");
    return body.answer;
  }
  if (!response.body) throw new Error("Missing chat stream");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let count = 0;
  let answer: string | undefined;
  function consume(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "error") throw new Error("Chat request failed");
    if (event.type === "step" && answer === undefined && count < 30 && typeof event.label === "string" && event.label.trim()) {
      count++;
      onStep(event.label.slice(0, 500));
    }
    if (event.type === "final" && typeof event.answer === "string") answer = event.answer;
  }
  try {
    while (answer === undefined) {
      const { value, done } = await reader.read();
      if (done) { consume(buffer); break; }
      const lines = (buffer + value).split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) consume(line);
    }
    if (answer === undefined) throw new Error("Incomplete chat response");
    return answer;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
