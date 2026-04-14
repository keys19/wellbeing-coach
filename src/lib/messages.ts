import { ChatMessage } from "@/types/chat";

export async function saveMessages(messages: ChatMessage[]) {
    try {
        const response = await fetch("/api/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ messages }),
        });

        if (!response.ok) {
            throw new Error("Failed to save messages");
        }
    } catch (error) {
        console.error("Error saving messages:", error);
    }
} 