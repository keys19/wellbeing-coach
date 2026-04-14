// import { JsonValue, JsonObject } from "./types";

// /**
//  * Attempts to clean up malformed JSON strings
//  * @param jsonStr The potentially malformed JSON string
//  * @returns A cleaned version that may be parseable
//  */
// function preprocessJson(jsonStr: string): string {
//     console.log("Raw JSON before preprocessing:", jsonStr);

//     // Handle newlines and normalize the JSON string
//     let cleaned = jsonStr.replace(/\\n/g, ' ').trim();

//     // Fix the specific collegeYear\Senior\major pattern seen in errors
//     if (cleaned.match(/{ ?\\?"collegeYear"\\\\? "Senior"\\\\? "major"\\\\? \\\\\\\\?Computer Science\\\\\\\\? }/)) {
//         return '{"collegeYear":"Senior","major":"Computer Science"}';
//     }

//     // Handle the case where we have properties separated by backslashes instead of proper JSON format
//     if (cleaned.match(/\\([a-zA-Z_]+)\\\\? \\([a-zA-Z_]+)\\\\?/)) {
//         // Replace backslash property patterns with proper JSON format
//         cleaned = cleaned.replace(/\\([a-zA-Z_]+)\\\\? \\([a-zA-Z_]+)\\\\?/g, '"$1":"$2",');
//         cleaned = cleaned.replace(/\\([a-zA-Z_]+)\\\\? \\\\\\\\([a-zA-Z_\s]+)\\\\\\\\?/g, '"$1":"$2"');

//         // Ensure it starts and ends with braces
//         if (!cleaned.startsWith('{')) cleaned = '{' + cleaned;
//         if (!cleaned.endsWith('}')) cleaned = cleaned + '}';

//         // Fix trailing commas
//         cleaned = cleaned.replace(/,\s*}/g, '}');
//     }

//     try {
//         // Try to parse as valid JSON first
//         JSON.parse(cleaned);
//         return cleaned;
//     } catch {
//         // If the first attempt failed, proceed with more aggressive cleaning

//         // First handle escaped backslashes 
//         cleaned = cleaned.replace(/\\\\/g, '\\');

//         // Handle escaped quotes
//         cleaned = cleaned.replace(/\\"/g, '"');

//         // Fix property names with backslashes
//         cleaned = cleaned.replace(/\\([a-zA-Z_]+)\\/g, '"$1"');

//         // Fix property-value pairs with backslashes
//         cleaned = cleaned.replace(/"(\w+)"\\+(\w+)\\+/g, '"$1":"$2",');

//         // Add missing colons between property names and values
//         cleaned = cleaned.replace(/"([^"]+)"\s+"([^"]+)"/g, '"$1":"$2"');

//         // Fix missing commas between properties
//         cleaned = cleaned.replace(/"([^"]+)"\s*"([^"]+)"/g, '"$1","$2"');

//         // Add missing quotes around property names
//         cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

//         // Add missing quotes around string values
//         cleaned = cleaned.replace(/:\s*([a-zA-Z][a-zA-Z0-9_\s-]*[a-zA-Z0-9])([,}])/g, ':"$1"$2');

//         try {
//             // Try parsing the cleaned JSON
//             JSON.parse(cleaned);
//             console.log("Successfully cleaned JSON:", cleaned);
//             return cleaned;
//         } catch (e) {
//             console.error("Failed to parse cleaned JSON:", e);
//             console.log("Attempting last-resort cleanup for specific patterns");

//             // Fix specific patterns - last resort
//             if (cleaned.includes('collegeYear') && cleaned.includes('major')) {
//                 const extracted: Record<string, string> = {};

//                 // Try to extract collegeYear
//                 const yearMatch = cleaned.match(/"?collegeYear"?\\*:?\\*"?([^",}\\]+)"?/);
//                 if (yearMatch) extracted['collegeYear'] = yearMatch[1];

//                 // Try to extract major
//                 const majorMatch = cleaned.match(/"?major"?\\*:?\\*"?([^",}\\]+)"?/);
//                 if (majorMatch) extracted['major'] = majorMatch[1];

//                 if (Object.keys(extracted).length > 0) {
//                     console.log("Created simplified JSON with extracted values:", extracted);
//                     return JSON.stringify(extracted);
//                 }
//             }

//             console.error("All cleanup attempts failed, returning empty object");
//             return "{}";
//         }
//     }
// }

// export function extractJsonFromResponse(response: string): JsonValue | null {
//     try {
//         console.log("Attempting to extract JSON from response:", response.substring(0, 200) + "...")

//         // First try to find JSON within markdown code blocks
//         const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
//         if (codeBlockMatch && codeBlockMatch[1]) {
//             console.log("Found JSON in code block:", codeBlockMatch[1].substring(0, 100) + "...")
//             try {
//                 // Try with standard parsing first
//                 const parsed = JSON.parse(codeBlockMatch[1])
//                 console.log("Successfully parsed JSON from code block")
//                 return parsed
//             } catch (e) {
//                 console.error("Failed to parse JSON from code block, attempting to clean:", e)
//                 try {
//                     // Try to clean up malformed JSON
//                     const cleaned = preprocessJson(codeBlockMatch[1])
//                     console.log("Cleaned JSON:", cleaned)
//                     const parsed = JSON.parse(cleaned)
//                     console.log("Successfully parsed cleaned JSON from code block")
//                     return parsed
//                 } catch (cleanErr) {
//                     console.error("Failed to parse cleaned JSON from code block:", cleanErr)
//                     console.error("Raw JSON content:", codeBlockMatch[1])
//                 }
//             }
//         }

//         // If no JSON in code blocks, look for a complete JSON object in the text
//         // This regex looks for a complete JSON object with balanced braces
//         const jsonRegex = /\{(?:[^{}]|(?:\{[^{}]*\}))*\}/
//         const textMatch = response.match(jsonRegex)

//         if (textMatch) {
//             console.log("Found potential JSON object in text:", textMatch[0].substring(0, 100) + "...")
//             try {
//                 // Try with standard parsing first
//                 const parsed = JSON.parse(textMatch[0])
//                 console.log("Successfully parsed JSON from text")
//                 return parsed
//             } catch (e) {
//                 console.error("Failed to parse JSON from text, attempting to clean:", e)
//                 try {
//                     // Try to clean up malformed JSON
//                     const cleaned = preprocessJson(textMatch[0])
//                     console.log("Cleaned JSON:", cleaned)
//                     const parsed = JSON.parse(cleaned)
//                     console.log("Successfully parsed cleaned JSON from text")
//                     return parsed
//                 } catch (cleanErr) {
//                     console.error("Failed to parse cleaned JSON from text:", cleanErr)
//                     console.error("Raw JSON content:", textMatch[0])
//                 }
//             }
//         }

//         // If we still haven't found valid JSON, try to find any JSON-like structure
//         const anyJsonMatch = response.match(/\{[\s\S]*?\}/)
//         if (anyJsonMatch) {
//             console.log("Found potential JSON-like structure:", anyJsonMatch[0].substring(0, 100) + "...")
//             try {
//                 // Try with standard parsing first
//                 const parsed = JSON.parse(anyJsonMatch[0])
//                 console.log("Successfully parsed JSON-like structure")
//                 return parsed
//             } catch (e) {
//                 console.error("Failed to parse JSON-like structure, attempting to clean:", e)
//                 try {
//                     // Try to clean up malformed JSON
//                     const cleaned = preprocessJson(anyJsonMatch[0])
//                     console.log("Cleaned JSON:", cleaned)
//                     const parsed = JSON.parse(cleaned)
//                     console.log("Successfully parsed cleaned JSON from text")
//                     return parsed
//                 } catch (cleanErr) {
//                     console.error("Failed to parse cleaned JSON-like structure:", cleanErr)
//                     console.error("Raw content:", anyJsonMatch[0])
//                 }
//             }
//         }

//         console.log("No valid JSON found in response")
//         return null
//     } catch (error) {
//         console.error("Error extracting JSON:", error)
//         return null
//     }
// }

// export function mergeProfiles(existingProfile: JsonObject, newProfile: JsonObject): JsonObject {
//     if (!newProfile) return existingProfile
//     if (!existingProfile) return newProfile

//     console.log("Merging profiles:", {
//         existingKeys: Object.keys(existingProfile),
//         newKeys: Object.keys(newProfile),
//     })

//     const result = { ...existingProfile }

//     // Recursively merge objects
//     for (const [key, value] of Object.entries(newProfile)) {
//         if (value === null) continue

//         // Convert Date objects to ISO strings
//         if (value instanceof Date) {
//             result[key] = value.toISOString()
//             continue
//         }

//         if (
//             typeof value === "object" &&
//             !Array.isArray(value) &&
//             result[key] &&
//             typeof result[key] === "object" &&
//             !Array.isArray(result[key])
//         ) {
//             result[key] = mergeProfiles(result[key] as JsonObject, value as JsonObject)
//         } else {
//             result[key] = value
//         }
//     }

//     return result
// }

//2

import { JsonValue, JsonObject } from "./types";

/**
 * Attempts to clean up malformed JSON strings
 * @param jsonStr The potentially malformed JSON string
 * @returns A cleaned version that may be parseable
 */
export function preprocessJson(jsonStr: string): string {
  console.log("Raw JSON before preprocessing:", jsonStr);

  let cleaned = jsonStr.replace(/\\n/g, " ").trim();

  // Specific hard fix for known pattern
  if (
    cleaned.match(
      /{ ?\\?"collegeYear"\\\\? "Senior"\\\\? "major"\\\\? \\\\\\\\?Computer Science\\\\\\\\? }/
    )
  ) {
    return '{"collegeYear":"Senior","major":"Computer Science"}';
  }

  // Generic: backslash-separated props
  if (cleaned.match(/\\([a-zA-Z_]+)\\\\? \\([a-zA-Z_]+)\\\\?/)) {
    cleaned = cleaned.replace(
      /\\([a-zA-Z_]+)\\\\? \\([a-zA-Z_]+)\\\\?/g,
      '"$1":"$2",'
    );
    cleaned = cleaned.replace(
      /\\([a-zA-Z_]+)\\\\? \\\\\\\\([a-zA-Z_\s]+)\\\\\\\\?/g,
      '"$1":"$2"'
    );
  }

  // Aggressive fallback cleaning
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    cleaned = cleaned.replace(/\\\\/g, "\\");
    cleaned = cleaned.replace(/\\"/g, '"');

    cleaned = cleaned.replace(/\\([a-zA-Z_]+)\\/g, '"$1"');
    cleaned = cleaned.replace(/"(\w+)"\\+(\w+)\\+/g, '"$1":"$2",');

    // Add missing colons between name and value
    cleaned = cleaned.replace(/"([^"]+)"\s+"([^"]+)"/g, '"$1":"$2"');

    // Remove accidental double quote pairs with no colon
    cleaned = cleaned.replace(/"([^"]+)"\s*"([^"]+)"/g, '"$1":"$2"');

    // Add missing quotes around property names
    cleaned = cleaned.replace(
      /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
      '$1"$2":'
    );

    // Add missing quotes around bare word string values
    cleaned = cleaned.replace(
      /:\s*([a-zA-Z][a-zA-Z0-9_\s-]*[a-zA-Z0-9])([,}])/g,
      ':"$1"$2'
    );

    // Remove trailing commas
    cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");

    // Ensure braces
    if (!cleaned.startsWith("{")) cleaned = "{" + cleaned;
    if (!cleaned.endsWith("}")) cleaned = cleaned + "}";

    try {
      JSON.parse(cleaned);
      console.log("Successfully cleaned JSON:", cleaned);
      return cleaned;
    } catch (e) {
      console.error("Final JSON parse failed:", e);

      if (cleaned.includes("collegeYear") && cleaned.includes("major")) {
        const extracted: Record<string, string> = {};

        const yearMatch = cleaned.match(
          /"?collegeYear"?\\*:?\\*"?([^",}\\]+)"?/
        );
        if (yearMatch) extracted["collegeYear"] = yearMatch[1];

        const majorMatch = cleaned.match(/"?major"?\\*:?\\*"?([^",}\\]+)"?/);
        if (majorMatch) extracted["major"] = majorMatch[1];

        if (Object.keys(extracted).length > 0) {
          console.log("Created fallback JSON:", extracted);
          return JSON.stringify(extracted);
        }
      }

      return "{}";
    }
  }
}

export function extractJsonFromResponse(response: string): JsonValue | null {
  try {
    console.log(
      "Attempting to extract JSON from response:",
      response.substring(0, 200) + "..."
    );

    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch {
        const cleaned = preprocessJson(codeBlockMatch[1]);
        return JSON.parse(cleaned);
      }
    }

    const jsonRegex = /\{(?:[^{}]|(?:\{[^{}]*\}))*\}/;
    const textMatch = response.match(jsonRegex);
    if (textMatch) {
      try {
        return JSON.parse(textMatch[0]);
      } catch {
        const cleaned = preprocessJson(textMatch[0]);
        return JSON.parse(cleaned);
      }
    }

    const anyJsonMatch = response.match(/\{[\s\S]*?\}/);
    if (anyJsonMatch) {
      try {
        return JSON.parse(anyJsonMatch[0]);
      } catch {
        const cleaned = preprocessJson(anyJsonMatch[0]);
        return JSON.parse(cleaned);
      }
    }

    console.log("No valid JSON found");
    return null;
  } catch (error) {
    console.error("Error extracting JSON:", error);
    return null;
  }
}

export function mergeProfiles(
  existingProfile: JsonObject,
  newProfile: JsonObject
): JsonObject {
  if (!newProfile) return existingProfile;
  if (!existingProfile) return newProfile;

  const result = { ...existingProfile };

  for (const [key, value] of Object.entries(newProfile)) {
    if (value === null) continue;

    if (value instanceof Date) {
      result[key] = value.toISOString();
      continue;
    }

    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeProfiles(result[key] as JsonObject, value as JsonObject);
    } else {
      result[key] = value;
    }
  }

  return result;
}
