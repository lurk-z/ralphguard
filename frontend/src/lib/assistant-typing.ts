export const ASSISTANT_MIN_THINK_MS = 650;
export const ASSISTANT_TYPING_INTERVAL_MS = 32;
export const ASSISTANT_MAX_TYPING_STEPS = 100;

export function assistantThinkDelay(elapsedMs: number): number {
  return Math.max(0, ASSISTANT_MIN_THINK_MS - Math.max(0, elapsedMs));
}

function splitGraphemes(text: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
}

/**
 * Builds cumulative text frames while keeping long answers below a reasonable
 * animation duration. Grapheme segmentation prevents Thai combining marks and
 * emoji from being split into broken intermediate characters.
 */
export function assistantTypingFrames(text: string): string[] {
  const graphemes = splitGraphemes(text);
  if (graphemes.length === 0) return [];

  const batchSize = Math.max(1, Math.ceil(graphemes.length / ASSISTANT_MAX_TYPING_STEPS));
  const frames: string[] = [];
  for (let end = batchSize; end < graphemes.length; end += batchSize) {
    frames.push(graphemes.slice(0, end).join(""));
  }
  frames.push(text);
  return frames;
}
