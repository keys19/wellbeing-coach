import type { Message } from "ai"

export async function analyzeCommunicationStyle(messages: Message[]) {
    // Only analyze if we have enough user messages
    const userOnly = messages.filter((m) => m.role === "user" && m.content?.trim());
    if (userOnly.length < 3) return null

    // Build a transcript containing ONLY the user's lines (to avoid leaking coach style)
    const formattedHistory = userOnly
        .map((msg) => `User: ${msg.content}`)
        .join("\n");

    // Derive simple metrics to help the model disambiguate without defaulting
    const wordsPerMsg = userOnly.map((m) => (m.content || "").trim().split(/\s+/).filter(Boolean).length);
    const avgWords = wordsPerMsg.length ? Math.round(wordsPerMsg.reduce((a, b) => a + b, 0) / wordsPerMsg.length) : 0;
    const exclCount = userOnly.reduce((acc, m) => acc + ((m.content || "").match(/!/g)?.length || 0), 0);
    const numTokens = userOnly.reduce((acc, m) => acc + ((m.content || "").match(/\b\d+(\.\d+)?\b/g)?.length || 0), 0);
    const totalTokens = userOnly.reduce((acc, m) => acc + ((m.content || "").split(/\s+/).filter(Boolean).length), 0);
    const numericRatio = totalTokens ? +(numTokens / totalTokens).toFixed(3) : 0;
    const metricsSummary = `User messages: ${userOnly.length}; avg_words_per_msg: ${avgWords}; exclamations_total: ${exclCount}; numeric_token_ratio: ${numericRatio}`;

    const systemPrompt = `You are analyzing a user's communication style for coaching personalization.
ONLY consider lines that start with "User:" in the transcript provided. Ignore any "Coach:" lines.

Use the transcript as primary evidence and the derived metrics below as tie‑breakers. Do not default to "casual", "short", "neutral", or "experience-based" unless the transcript clearly supports it.

Categories and guidance:
- Tone: "formal" (polite forms, complete sentences, minimal slang) vs "casual" (slang, contractions, informal phrasing).
- Length: "short" (typically ≤ 12 words per message) vs "long" (> 12 words on average).
- Emotional style: "expressive" (emotion words, emojis, exclamations, self‑disclosure) vs "neutral" (matter‑of‑fact, low affect).
- Thinking style: "data-driven" (numbers, structure, explicit reasoning, references) vs "experience-based" (anecdotes, personal examples, intuitive language).

Metrics (hints, not rules): ${metricsSummary}

Return a single compact JSON object with exactly these keys and values:
{"tone": "formal|casual", "length": "short|long", "emotional_style": "expressive|neutral", "thinking_style": "data-driven|experience-based"}

Output ONLY JSON (no prose).`

    try {
        // Instead of using the environment variable directly, make a request to the server
        // to handle the AI analysis with the API key
        // const response = await fetch('/api/analyze-communication', {
        //     method: 'POST',
        //     headers: {
        //         'Content-Type': 'application/json',
        //     },
        //     body: JSON.stringify({
        //         formattedHistory,
        //         systemPrompt
        //     }),
        // });

        // Light retry to handle occasional 404/5xx during initial load
        let response: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            response = await fetch('/api/analyze-communication', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                cache: 'no-store',
                body: JSON.stringify({
                    formattedHistory,
                    systemPrompt
                }),
            }).catch((e) => {
                console.warn('[CommStyle] network error', e);
                return new Response(null, { status: 0 });
            });

        // if (!response.ok) {
        //     throw new Error(`API request failed with status ${response.status}`);
        if (response.ok) break;
            if (response.status === 404 || response.status >= 500 || response.status === 0) {
                // 300ms, 600ms backoff
                await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
                continue;
            }
            break;
        }

                if (!response || !response.ok) {
            console.warn('[CommStyle] API non-200; skipping analysis', { status: response?.status });
            return null; // graceful fallback so dashboard doesn’t crash
        }

        const data = await response.json().catch(() => null);
        return (data && data.analysis) ? data.analysis : null;
    } catch (error) {
        console.error("Error analyzing communication style:", error);
        return null;
    }
}

