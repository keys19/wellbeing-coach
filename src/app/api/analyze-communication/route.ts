import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { auth } from "@clerk/nextjs/server";

export async function POST(req: NextRequest) {
    try {
        // Verify that the user is authenticated
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Parse the request body
        const body = await req.json();
        const { formattedHistory, systemPrompt } = body;

        if (!formattedHistory || !systemPrompt) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        // Generate analysis using the AI SDK with the server's API key
        const response = await generateText({
            model: openai("gpt-4o"),
            temperature: 0.2,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: formattedHistory },
            ],
        });

        // Extract JSON from response
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            return NextResponse.json({ analysis });
        }

        return NextResponse.json(
            { error: "Failed to extract analysis from response" },
            { status: 500 }
        );
    } catch (error) {
        console.error("Error analyzing communication style:", error);
        return NextResponse.json(
            { error: "Failed to analyze communication style" },
            { status: 500 }
        );
    }
} 