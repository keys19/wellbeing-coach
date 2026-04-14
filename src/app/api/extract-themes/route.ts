import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { auth } from "@clerk/nextjs/server";
import { extractJsonFromResponse } from "@/lib/profile-extractor";

//helper fucntion
function extractFirstJson(text: string): string | null {
  if (!text) return null;

  // 1) Prefer fenced ```json blocks
  const fence = /```json\s*([\s\S]*?)\s*```/i.exec(text);
  if (fence?.[1]) {
    return fence[1].trim();
  }

  // 2) Try existing shared extractor if available
  try {
    const extracted = (extractJsonFromResponse as any)?.(text);
    if (extracted && typeof extracted === "object") {
      return JSON.stringify(extracted);
    }
  } catch {
    // ignore
  }

  // 3) Fallback: slice from first "{" to last "}"
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return text.slice(first, last + 1).trim();
  }

  return null;
}

//
// export async function POST(req: NextRequest) {
//   try {
//     // Verify that the user is authenticated
//     const { userId } = await auth();
//     if (!userId) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     // Parse the request body
//     const body = await req.json();
//     const { formattedHistory, systemPrompt } = body;

//     if (!formattedHistory || !systemPrompt) {
//       return NextResponse.json(
//         { error: "Missing required fields" },
//         { status: 400 }
//       );
//     }

//     //analysis
//     const response = await generateText({
//       model: openai("gpt-4o"),
//       temperature: 0.2,
//       messages: [
//         { role: "system", content: `${systemPrompt}\n\nYou MUST respond with a single JSON object only. No prose, no preamble, and no backticks.` },
//         { role: "user", content: formattedHistory },
        
//       ],
//         providerOptions: {
//         openai: {
//           response_format: { type: "json_object" },
//         },
//       },
//     });

//     console.log("Raw Response: ", response.text);

//     // Try to parse the response text as JSON (robustly)
// try {
//   const cleanedText = response.text.replace(/^\s*[\r\n]/gm, "").trim();

//   const extracted = extractFirstJson(cleanedText);
//   if (!extracted) {
//     throw new Error("No JSON object found in model output.");
//   }

//   let analysis: any;
//   try {
//     analysis = JSON.parse(extracted);
//   } catch {
//     // last-ditch: remove trailing commas before } or ]
//     const safe = extracted.replace(/,\s*([}\]])/g, "$1");
//     analysis = JSON.parse(safe);
//   }

  
//   //normalize to always return { themes: string[] }
// let themes: string[] = [];
// if (Array.isArray(analysis)) {
//   themes = analysis;
// } else if (analysis && Array.isArray((analysis as any).themes)) {
//   themes = (analysis as any).themes;
// } else if (analysis && typeof analysis === "object") {
//   // try to coerce common shapes like { "themes": [...]} or {"0":"..."} etc.
//   const vals = Object.values(analysis as Record<string, unknown>);
//   themes = vals
//     .flatMap(v =>
//       Array.isArray(v) ? v : typeof v === "string" ? [v] : []
//     )
//     .filter((x): x is string => typeof x === "string");
// }

// return NextResponse.json({ themes });
// } catch (parseErr) {
//   console.error("Failed to parse AI response as JSON:", parseErr);
//   return NextResponse.json(
//     {
//       error: "Failed to parse AI JSON. Ensure the model replies with a pure JSON object.",
//       details: (parseErr as Error).message,
//     },
//     { status: 500 }
//   );
// }
//   } catch (error) {
//     console.error("Error analyzing communication style:", error);
//    return NextResponse.json(
//   { error: "Failed to analyze communication style", details: (error as Error).message },
//   { status: 500 }
// );
//   }
// }


export async function POST(req: NextRequest) {
  try {
    // ---- Auth ----
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ---- Input ----
    const body = await req.json();
    const { formattedHistory, systemPrompt } = body;
    if (!formattedHistory || !systemPrompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // ---- Call model (ask for strict JSON) ----
    const response = await generateText({
      model: openai("gpt-4o"),
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            `${systemPrompt}\n\n` +
            `Return ONLY this JSON object (no prose, no code fences): ` +
            `{"themes":["<theme1>","<theme2>","<theme3>","<theme4>"]}`,
        },
        { role: "user", content: formattedHistory },
      ],
      providerOptions: {
        openai: {
          // Encourages a single JSON object
          response_format: { type: "json_object" },
        },
      },
    });

    const raw = (response?.text ?? "").trim();
    console.log("Raw Response: ", raw);

    // ---- Robust parsing & normalization ----
    // 1) Strip ```json ... ``` if present
    const defenced = raw.replace(/```(?:json)?\s*|\s*```/gi, "").trim();

    // 2) Try parse directly; else grab first {...} or [...] block
    let parsed: any;
    try {
      parsed = JSON.parse(defenced);
    } catch {
      const match = defenced.match(/\{[\s\S]*\}|$begin:math:display$[\\s\\S]*$end:math:display$/);
      if (!match) {
        return NextResponse.json(
          { error: "No JSON found in model output." },
          { status: 422 }
        );
      }
      // Last-ditch: remove trailing commas
      const safe = match[0].replace(/,\s*([}\]])/g, "$1");
      parsed = JSON.parse(safe);
    }

    // 3) Normalize to { themes: string[] }
    let themes: string[] | null = null;

    if (Array.isArray(parsed)) {
      themes = parsed.map(String);
    } else if (parsed && Array.isArray(parsed.themes)) {
      themes = parsed.themes.map(String);
    } else if (parsed && typeof parsed === "object") {
      // Coerce common odd shapes: { "0":"..", "1":".." } or { "list":[...] }
      const vals = Object.values(parsed as Record<string, unknown>);
      const flattened = vals.flatMap(v =>
        Array.isArray(v) ? v
        : typeof v === "string" ? [v]
        : []
      );
      if (flattened.length) themes = flattened.map(String);
    }

    if (!themes || themes.length === 0) {
      return NextResponse.json(
        { error: "Malformed or empty themes." },
        { status: 422 }
      );
    }

    return NextResponse.json({ themes }); // 200
  } catch (error: any) {
    console.error("Error analyzing communication style:", error);
    return NextResponse.json(
      {
        error: "Failed to analyze communication style",
        details: error?.message ?? "Server error",
      },
      { status: 500 }
    );
  }
}