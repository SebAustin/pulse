/**
 * Key-gated Anthropic Claude client (F-05, A-25, A-26).
 *
 * If ANTHROPIC_API_KEY is absent or blank, all functions return null and
 * callers return 503 AI_UNAVAILABLE (F-05.3).
 * The UI hides AI features when the key is absent.
 */

import { config } from "../config";
import { log } from "../observability/log";

function isEnabled(): boolean {
  return Boolean(config.ANTHROPIC_API_KEY);
}

async function callClaude(prompt: string): Promise<string | null> {
  if (!isEnabled()) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.ANTHROPIC_MODEL,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      log.warn("Anthropic API error", { status: res.status });
      return null;
    }

    const json = (await res.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return json.content?.[0]?.text ?? null;
  } catch (err) {
    log.warn("Anthropic API call failed", { errorType: (err as Error).name });
    return null;
  }
}

/**
 * Generate 2–3 poll question suggestions for a topic (F-05.1).
 * Returns null if AI is unavailable or the call fails.
 */
export async function suggestPollQuestions(
  topic: string
): Promise<string[] | null> {
  if (!isEnabled()) return null;

  const prompt = `Generate exactly 3 engaging poll questions for a live event on the topic: "${topic}".
Return ONLY a JSON array of 3 strings, no explanation. Example: ["Question 1?", "Question 2?", "Question 3?"]`;

  const response = await callClaude(prompt);
  if (!response) return null;

  try {
    const parsed: unknown = JSON.parse(response.trim());
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      return (parsed as string[]).slice(0, 3);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate a sentiment summary for word-cloud submissions (F-05.2).
 * Returns null if AI is unavailable or the call fails.
 */
export async function generateWordCloudSentiment(
  words: string[]
): Promise<string | null> {
  if (!isEnabled()) return null;
  if (words.length === 0) return null;

  const wordList = words.slice(0, 50).join(", ");
  const prompt = `Here are the most common words submitted by live-event audience members: ${wordList}.
In 2-3 sentences, describe what themes and sentiment these words reflect. Be specific and insightful.`;

  return callClaude(prompt);
}

export { isEnabled as isAiEnabled };
