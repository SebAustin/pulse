/**
 * Key-gated OpenAI client (optional AI assist — A-25, A-26).
 *
 * If OPENAI_API_KEY is absent or blank, all functions return null and callers
 * return 503 AI_UNAVAILABLE. The UI hides AI features when the key is absent.
 *
 * The call is made server-side from a Node.js Route Handler, so the API key
 * never reaches the browser and no browser CSP `connect-src` entry is needed.
 */

import { config } from "../config";
import { log } from "../observability/log";

function isEnabled(): boolean {
  return Boolean(config.OPENAI_API_KEY);
}

/** Single-prompt completion via the OpenAI Chat Completions API. */
async function callOpenAI(prompt: string): Promise<string | null> {
  if (!isEnabled()) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.OPENAI_MODEL,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      log.warn("OpenAI API error", { status: res.status });
      return null;
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    log.warn("OpenAI API call failed", { errorType: (err as Error).name });
    return null;
  }
}

/**
 * Generate 3 poll question suggestions for a topic (F-05.1).
 * Returns null if AI is unavailable or the call fails.
 */
export async function suggestPollQuestions(
  topic: string
): Promise<string[] | null> {
  if (!isEnabled()) return null;

  const prompt = `Generate exactly 3 engaging poll questions for a live event on the topic: "${topic}".
Return ONLY a JSON array of 3 strings, no explanation. Example: ["Question 1?", "Question 2?", "Question 3?"]`;

  const response = await callOpenAI(prompt);
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

  return callOpenAI(prompt);
}

export { isEnabled as isAiEnabled };
