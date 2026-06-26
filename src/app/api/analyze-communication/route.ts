// import { NextRequest, NextResponse } from "next/server";
// import { openai } from "@ai-sdk/openai";
// import { generateText } from "ai";
// import { auth } from "@clerk/nextjs/server";

// export async function POST(req: NextRequest) {
//     try {
//         // Verify that the user is authenticated
//         const { userId } = await auth();
//         if (!userId) {
//             return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//         }

//         // Parse the request body
//         const body = await req.json();
//         const { formattedHistory, systemPrompt } = body;

//         if (!formattedHistory || !systemPrompt) {
//             return NextResponse.json(
//                 { error: "Missing required fields" },
//                 { status: 400 }
//             );
//         }

//         // Generate analysis using the AI SDK with the server's API key
//         const response = await generateText({
//             model: openai("gpt-4o"),
//             temperature: 0.2,
//             messages: [
//                 { role: "system", content: systemPrompt },
//                 { role: "user", content: formattedHistory },
//             ],
//         });

//         // Extract JSON from response
//         const jsonMatch = response.text.match(/\{[\s\S]*\}/);
//         if (jsonMatch) {
//             const analysis = JSON.parse(jsonMatch[0]);
//             return NextResponse.json({ analysis });
//         }

//         return NextResponse.json(
//             { error: "Failed to extract analysis from response" },
//             { status: 500 }
//         );
//     } catch (error) {
//         console.error("Error analyzing communication style:", error);
//         return NextResponse.json(
//             { error: "Failed to analyze communication style" },
//             { status: 500 }
//         );
//     }
// } 

import { NextRequest, NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { auth } from "@clerk/nextjs/server";

const openRouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { formattedHistory, systemPrompt } = body;

    if (!formattedHistory || !systemPrompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const response = await generateText({
      model: openRouter("openai/gpt-4o"),
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: formattedHistory },
      ],
    });

    // Extract JSON from response
    const defenced = (response.text ?? "").trim()
      .replace(/[`]{3}(?:json)?\s*|\s*[`]{3}/gi, "").trim();

    let analysis: any = null;
    try {
      analysis = JSON.parse(defenced);
    } catch {
      const match = defenced.match(/\{[\s\S]*\}/);
      if (match) {
        const safe = match[0].replace(/,\s*([}\]])/g, "$1");
        analysis = JSON.parse(safe);
      }
    }

    if (!analysis) {
      return NextResponse.json(
        { error: "Failed to extract analysis from response" },
        { status: 500 }
      );
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Error analyzing communication style:", error);
    return NextResponse.json(
      { error: "Failed to analyze communication style" },
      { status: 500 }
    );
  }
}