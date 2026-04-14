import type { Message } from "ai"

export async function extractThemes(messages: Message[]) {
    // Only analyze if we have enough messages
    if (messages.length < 3) return null

    // Format the conversation history for analysis
    const formattedHistory = messages
        .filter((msg) => msg.role !== "system")
        .map((msg) => `${msg.role === "assistant" ? "Coach" : "User"}: ${msg.content}`)
        .join("\n")

    const systemPrompt = `You can extract mental health related themes for users based on their conversation history with a coach. The themes should be short and relevant. 
    Examples of themes: "Building Consistent Habits" and "Stress Reduction Techniques"
    Please read the conversation properly and think about the emerging themes.
    Return four different themes in a valid array. If it is not valid, please re-generate your response.`

    try {
        // Instead of using the environment variable directly, make a request to the server
        // to handle the AI analysis with the API key
        const response = await fetch('/api/extract-themes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                formattedHistory,
                systemPrompt
            }),
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        // return data.analysis;
        if ('themes' in data) {
          return data.themes; // it's an array of themes
        }

        if ('analysis' in data) {
          return data.analysis; // it's a structured analysis object
        }

    } catch (error) {
        console.error("Error analyzing communication style:", error);
        return null;
    }
}
