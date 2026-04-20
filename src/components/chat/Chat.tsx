"use client";

import type React from "react";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ReactNode } from "react";
import {
  Send,
  Loader2,
  WifiOff,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Cloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WelcomeDialog } from "@/components/chat/WelcomeDialog";
import { useBotContext } from "@/components/bot-preferences/BotContextProvider";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { UserProfile } from "@/types/user";
import { ChatMessage } from "@/types/chat";
import { Session } from "@/types/session";
import { ScrollArea } from "@/components/ui/scroll-area";
import { extractJsonFromResponse } from "@/lib/profile-extractor";
import { debounce } from "lodash";
import { useToast } from "@/hooks/use-toast";
import WHO5Assessment from "@/components/assessment/WHO5Assessment";
import GoalFeedbackDialog from "@/components/feedback/GoalFeedbackDialog";


interface AiUserProfile {
  demographic: Record<string, unknown>;
  personality_traits: Record<string, unknown>;
  challenges: Record<string, unknown>;
  emotional_state: string | null;
  feedback: Record<string, unknown>;
}


const STORAGE_KEY_MESSAGES = "cached_chat_messages";
const STORAGE_KEY_SESSION = "cached_session_id";
const STORAGE_KEY_PHASE = "cached_chat_phase";
const STORAGE_KEY_SYNC_STATUS = "chat_sync_status";
const STORAGE_KEY_LAST_SYNC = "chat_last_sync";
const STORAGE_KEY_LAST_INDEX = "chat_last_synced_index";

//type for sync status
type SyncStatus = {
  syncing: boolean;
  lastSyncedAt: number | null;
  pendingChanges: boolean;
  error: string | null;
};

//interface for session objects
interface SessionWithPhase extends Session {
  currentPhase?: string;
}


//recognizes phase marker formats and make it return the phase if found
const hasProfileData = (message: string): string | null => {
  // Check for explicit phase markers
  if (message.includes("[GOAL_SETTING_PHASE]")) {
    return "goal_setting";
  }
  if (message.includes("[ONGOING_PHASE]")) {
    return "ongoing_conversation";
  }
  if (message.includes("[Phase ") || message.includes("[PHASE ")) {
    // Try to extract phase number
    const phaseMatch = message.match(/\[(?:Phase|PHASE)\s+(\d+)\]/);
    if (phaseMatch && phaseMatch[1]) {
      const phaseNum = parseInt(phaseMatch[1], 10);
      if (phaseNum === 1) return "introduction";
      if (phaseNum === 2) return "exploration"; // Changed to exploration for Phase 2
      if (phaseNum >= 3) return "action_planning"; // Changed to action_planning for Phase 3+
    }
  }

  // Check for expanded phase markers
  if (message.includes("[INTRODUCTION_PHASE]")) return "introduction";
  if (message.includes("[EXPLORATION_PHASE]")) return "exploration";
  if (message.includes("[ACTION_PLANNING_PHASE]")) return "action_planning";

  // Enhanced detection for goal setting phase
  if (
    // Look for goal setting-specific indicators
    (message.includes("goal") || message.includes("Goal")) &&
    (message.includes("SMART") ||
      message.includes("specific") ||
      message.includes("measurable") ||
      message.includes("achievable") ||
      message.includes("relevant") ||
      message.includes("time-bound"))
  ) {
    return "goal_setting";
  }

  // Check for sentences that typically appear in goal setting
  if (
    message.includes("Let's set a goal") ||
    message.includes("Let's establish a goal") ||
    message.includes("set a SMART goal") ||
    message.includes("create a SMART goal") ||
    message.includes("goal that you'd like to achieve") ||
    (message.includes("goal") && message.includes("would like to work on"))
  ) {
    return "goal_setting";
  }

  return null;
};

//helper function for streaming text
// const streamReader = async (
//   stream: ReadableStream,
//    onChunk: (chunk: string) => void,
//   onToolCall?: (toolName: string, payload?: any) => void
// ): Promise<string> => {
//   const reader = stream.getReader();
//   const decoder = new TextDecoder();
//   let result = "";
//   let buffer = "";

//   try {
//     while (true) {
//       const { done, value } = await reader.read();
//       if (done) break;

//       // Decode the chunk
//       buffer += decoder.decode(value, { stream: true });

//       // Process the SSE format data
//       const lines = buffer.split("\n");
//       let partialLine = "";

//       // Check if the last line is incomplete (no newline at the end)
//       if (lines.length > 0 && !buffer.endsWith("\n")) {
//         partialLine = lines.pop() || "";
//       }

//       buffer = partialLine; // Keep any partial line for the next iteration

//       let messageText = "";

//       for (const line of lines) {
//         if (!line.trim()) continue; // Skip empty lines
//         try {
//           const lower = line.toLowerCase();
//           if (lower.includes("saveprofile") || /\"saveProfile\"/.test(line)) {
//             let payload: any = undefined;
//             try {
//               const m = line.match(/\{[\s\S]*\}/);
//               if (m) payload = JSON.parse(m[0]);
//             } catch {}
//             // onToolCall && onToolCall("saveProfile", payload);
//             if (onToolCall) {
//               onToolCall("saveProfile", payload);
//             }
//           }
//         } catch {}

//           try {
//           const chunkMatches = line.match(/\d+:"([^"]*)"/g);
//           if (chunkMatches) {
//             for (const chunk of chunkMatches) {
//               const textMatch = chunk.match(/\d+:"([^"]*)"/);
//               if (textMatch && textMatch[1]) {
//                 messageText += textMatch[1];
//               }
//             }
//           }

//           else if (line.startsWith("data: ")) {
//             const data = line.slice(6).trim();
//             if (data) {
              
//               if (data.startsWith("{")) {
//                 try {
//                   const parsed = JSON.parse(data);
//                   if (parsed.text) {
//                     messageText += parsed.text;
//                   }
//                 } catch (err) {
//                   // Log the error for debugging
//                   console.error("JSON parsing error in stream reader:", err);
//                   // If JSON parsing fails, use the data as is
//                   // Strip any non-text markers
//                   const cleanData = data.replace(/^f:.*?\}\s*/, "");
//                   messageText += cleanData;
//                 }
//               } else {
//                 // Handle plain text data
//                 messageText += data;
//               }
//             }
//           }
//           // Handle the specific format seen in the error message
//           else if (line.startsWith("f:")) {
//             const cleanLine = line.replace(/^f:.*?\}\s*/, "");
//             const textMatches = cleanLine.match(/\d+:"([^"]*)"/g);
//             if (textMatches) {
//               for (const chunk of textMatches) {
//                 const textMatch = chunk.match(/\d+:"([^"]*)"/);
//                 if (textMatch && textMatch[1]) {
//                   messageText += textMatch[1];
//                 }
//               }
//             } else {
//               // If no digit-prefixed quotes are found, try to extract the rest of the text
//               const cleanText = cleanLine
//                 .replace(/^[a-z]:\{.*?\}\s*/g, "") // Remove any metadata like format markers
//                 .replace(/\s*[a-z]:\{.*?\}\s*/g, ""); // Remove any other metadata

//               if (cleanText.trim()) {
//                 messageText += cleanText;
//               }
//             }
//           } else {
//             // For any other line format, try to salvage text content
//             // Remove any metadata markers first
//             const cleanText = line
//               .replace(/^[a-z]:\{.*?\}\s*/g, "")
//               .replace(/\s*[a-z]:\{.*?\}\s*/g, "");

//             if (cleanText.trim()) {
//               messageText += cleanText;
//             }
//           }
//         } catch (error) {
//           console.warn("Error parsing line:", line, error);
//         }
//       }

//       if (messageText) {
//         result += messageText;
//         onChunk(result); 
//       }
//     }
//   } finally {
//     reader.releaseLock();
//   }

//   // final cleanup of the result to remove any remaining metadata
//   const finalCleanedResult = result
//     .replace(/f:\{.*?\}\s*/g, "") // Remove message ID metadata
//     .replace(/\s*e:\{.*?\}\s*/g, "") // Remove ending metadata
//     .replace(/\s*d:\{.*?\}\s*/g, ""); // Remove additional metadata

//   if (finalCleanedResult) {
//   onChunk(finalCleanedResult);
// }

//   return finalCleanedResult;
// };

const streamReader = async (
  stream: ReadableStream,
  onChunk: (chunk: string) => void,
  onToolCall?: (toolName: string, payload?: any) => void
): Promise<string> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let buffer = "";
  let didCallSaveProfile = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode the chunk
      buffer += decoder.decode(value, { stream: true });

      // Process the SSE format data
      const lines = buffer.split("\n");
      let partialLine = "";

      // Check if the last line is incomplete (no newline at the end)
      if (lines.length > 0 && !buffer.endsWith("\n")) {
        partialLine = lines.pop() || "";
      }

      buffer = partialLine; // Keep any partial line for the next iteration

      let messageText = "";

      for (const line of lines) {
        if (!line.trim()) continue; // Skip empty lines

        // Handle tool calls first - but don't let them pollute messageText
        try {
          const lower = line.toLowerCase();
          if (lower.includes("saveprofile") || /\"saveProfile\"/.test(line)) {
            if (!didCallSaveProfile) {
              didCallSaveProfile = true; // prevent duplicate acks per stream
              let payload: any = undefined;
              try {
                const m = line.match(/\{[\s\S]*\}/);
                if (m) payload = JSON.parse(m[0]);
              } catch {}
              if (onToolCall) {
                onToolCall("saveProfile", payload);
              }
            }
            // Skip this line for text processing since it's just tool call JSON
            continue;
          }
        } catch {}

        try {
          const chunkMatches = line.match(/\d+:"([^"]*)"/g);
          if (chunkMatches) {
            for (const chunk of chunkMatches) {
              const textMatch = chunk.match(/\d+:"([^"]*)"/);
              if (textMatch && textMatch[1]) {
                messageText += textMatch[1];
              }
            }
          }

          else if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data) {
              if (data.startsWith("{")) {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.text) {
                    messageText += parsed.text;
                  }
                } catch (err) {
                  // Log the error for debugging
                  console.error("JSON parsing error in stream reader:", err);
                  // If JSON parsing fails, use the data as is
                  // Strip any non-text markers
                  const cleanData = data.replace(/^f:.*?\}\s*/, "");
                  messageText += cleanData;
                }
              } else {
                // Handle plain text data
                messageText += data;
              }
            }
          }
          // Handle the specific format seen in the error message
          else if (line.startsWith("f:")) {
            const cleanLine = line.replace(/^f:.*?\}\s*/, "");
            const textMatches = cleanLine.match(/\d+:"([^"]*)"/g);
            if (textMatches) {
              for (const chunk of textMatches) {
                const textMatch = chunk.match(/\d+:"([^"]*)"/);
                if (textMatch && textMatch[1]) {
                  messageText += textMatch[1];
                }
              }
            } else {
              // If no digit-prefixed quotes are found, try to extract the rest of the text
              const cleanText = cleanLine
                .replace(/^[a-z]:\{.*?\}\s*/g, "") // Remove any metadata like format markers
                .replace(/\s*[a-z]:\{.*?\}\s*/g, ""); // Remove any other metadata

              if (cleanText.trim()) {
                messageText += cleanText;
              }
            }
          } else {
            // For any other line format, try to salvage text content
            // Remove any metadata markers first
            const cleanText = line
              .replace(/^[a-z]:\{.*?\}\s*/g, "")
              .replace(/\s*[a-z]:\{.*?\}\s*/g, "");

            if (cleanText.trim()) {
              messageText += cleanText;
            }
          }
        } catch (error) {
          console.warn("Error parsing line:", line, error);
        }
      }

      if (messageText) {
        result += messageText;
        onChunk(result); 
      }
    }
  } finally {
    reader.releaseLock();
  }

  // final cleanup of the result to remove any remaining metadata
  const finalCleanedResult = result
    .replace(/f:\{.*?\}\s*/g, "") // Remove message ID metadata
    .replace(/\s*e:\{.*?\}\s*/g, "") // Remove ending metadata
    .replace(/\s*d:\{.*?\}\s*/g, ""); // Remove additional metadata

  if (finalCleanedResult) {
    onChunk(finalCleanedResult);
  }

  return finalCleanedResult;
};


// const MessageContent = ({ content }: { content: string }) => {
//   // Clean the content - remove trailing backslashes, metadata, and system information
//   const processedContent = content
//     // Basic content cleaning

    
//     .replace(/\\n/g, "\n") // Convert escaped newlines to actual newlines
//     .replace(/\n\n/g, "\n\n") // Ensure paragraph breaks
//     .replace(/\\$/gm, "") // Remove trailing backslashes on each line

//     .replace(/^\d+:\{"toolCallId".*$/gm, "")
//     .replace(/^\d+:\{.*?"saveProfile".*$/gm, "")
    
//     // Remove any remaining tool call artifacts
//     .replace(/\{"toolCallId":.*?\}/g, "")
//     // Remove JSON metadata
//     .replace(/["\\]+isContinued["\\]*:[ \t]*(true|false)[,\\}]+/gi, "")
//     .replace(/\\{2,}/g, "\\") // Reduce excessive escaping
//     .replace(/\\n/g, "\n")     // Convert \n to real newlines
//     .replace(/[\\}{]+$/, "")

//     // Remove all phase markers (even if they're in the middle of content)
//     .replace(/\s*\[(?:Phase|PHASE) \d+\]\s*/g, "")
//     .replace(
//       /\s*\[(?:ONGOING|EXPLORATION|ACTION_PLANNING|GOAL_SETTING|INTRODUCTION)_PHASE\]\s*/g,
//       ""
//     )

//     // Remove profile summaries that might still appear
//     .replace(
//       /Here's what I know about you so far:[\s\S]*?(Let's|Now|I'll|Moving)/i,
//       "$1"
//     )
//     .replace(
//       /Based on our conversation, I've learned that:[\s\S]*?(Let's|Now|I'll|Moving)/i,
//       "$1"
//     )
//     .replace(
//       /Based on our conversation so far,[\s\S]*?(Let's|Now|I'll|Moving)/i,
//       "$1"
//     )
//     .replace(
//       /I've gathered the following information about you:[\s\S]*?(Let's|Now|I'll|Moving)/i,
//       "$1"
//     )
//     .replace(/Your profile indicates[\s\S]*?(Let's|Now|I'll|Moving)/i, "$1")

//     // Clean up any remaining JSON data
//     .replace(/```json[\s\S]*?```/g, "")

//     // Fix specific dangling phrases
//     .replace(
//       /How do these steps and solutions resonate with you.*$/g,
//       function (match) {
//         if (match.includes("isContinued")) {
//           return "How do these steps and solutions resonate with you?";
//         }
//         return match;
//       }
//     )
   
//   .replace(/[\s,]*\\?isContinued\\?(?:true|false)\b/gi, "")
//   .replace(/[\s,]*isContinued\s*:?[\s]*(?:true|false)\b/gi, "")
//     .trim();

//     // const finalContent = processedContent.length > 0 
//     // ? processedContent 
//     // : "Got it! Noted! Shall we continue?";
//       const finalContent = processedContent;
//   if (!finalContent || !finalContent.trim()) {
//     return null; // don't render empty/filler bubbles
//   }

//   return (
//     <div className="markdown-content">
//       <ReactMarkdown
//         remarkPlugins={[remarkGfm]}
//         components={{
//           a: (props) => (
//             <a {...props} target="_blank" rel="noopener noreferrer" />
//           ),
//           pre: (props) => (
//             <div className="pre-container">
//               <pre {...props} />
//             </div>
//           ),
//           // Add proper handling for other markdown elements
//           p: (props) => <p className="mb-3" {...props} />,
//           ul: (props) => <ul className="list-disc ml-6 mb-3" {...props} />,
//           ol: (props) => <ol className="list-decimal ml-6 mb-3" {...props} />,
//           li: (props) => <li className="mb-1" {...props} />,
//         }}
//       >
//         {finalContent}
//       </ReactMarkdown>
//     </div>
//   );
// };

const MessageContent = ({ content }: { content: string }) => {
  // First, check if this content is mostly tool call JSON - if so, don't render it
  const isToolCallOnly = /^\s*\d+:\s*\{.*"toolCallId".*\}\s*$/.test(content.trim()) ||
    /^\s*\{.*"saveProfile".*\}\s*$/.test(content.trim()) ||
    content.trim().startsWith('{"toolCallId"') ||
    (content.includes('"saveProfile"') && content.includes('"toolCallId"') && content.replace(/[{}",:\s\d]/g, '').length <= 50);

  if (isToolCallOnly) {
    return null; // Don't render tool-call-only messages
  }

  // Clean the content - remove trailing backslashes, metadata, and system information
  const processedContent = content
    // Basic content cleaning
    .replace(/\\n/g, "\n") // Convert escaped newlines to actual newlines
    .replace(/\n\n/g, "\n\n") // Ensure paragraph breaks
    .replace(/\\$/gm, "") // Remove trailing backslashes on each line

    // More aggressive tool call removal
    .replace(/^\d+:\s*\{.*?"toolCallId".*?\}\s*$/gm, "")
    .replace(/^\d+:\s*\{.*?"saveProfile".*?\}\s*$/gm, "")
    .replace(/\{.*?"toolCallId".*?\}/g, "")
    .replace(/\{.*?"saveProfile".*?\}/g, "")

    // Remove JSON metadata
    .replace(/["\\]+isContinued["\\]*:[ \t]*(true|false)[,\\}]+/gi, "")
    .replace(/\\{2,}/g, "\\") // Reduce excessive escaping
    .replace(/\\n/g, "\n")     // Convert \n to real newlines
    .replace(/[\\}{]+$/, "")

    // Remove all phase markers (even if they're in the middle of content)
    .replace(/\s*\[(?:Phase|PHASE) \d+\]\s*/g, "")
    .replace(
      /\s*\[(?:ONGOING|EXPLORATION|ACTION_PLANNING|GOAL_SETTING|INTRODUCTION)_PHASE\]\s*/g,
      ""
    )

    // Remove profile summaries that might still appear
    .replace(
      /Here's what I know about you so far:[\s\S]*?(Let's|Now|I'll|Moving)/i,
      "$1"
    )
    .replace(
      /Based on our conversation, I've learned that:[\s\S]*?(Let's|Now|I'll|Moving)/i,
      "$1"
    )
    .replace(
      /Based on our conversation so far,[\s\S]*?(Let's|Now|I'll|Moving)/i,
      "$1"
    )
    .replace(
      /I've gathered the following information about you:[\s\S]*?(Let's|Now|I'll|Moving)/i,
      "$1"
    )
    .replace(/Your profile indicates[\s\S]*?(Let's|Now|I'll|Moving)/i, "$1")

    // Clean up any remaining JSON data
    .replace(/```json[\s\S]*?```/g, "")

    // Fix specific dangling phrases
    .replace(
      /How do these steps and solutions resonate with you.*$/g,
      function (match) {
        if (match.includes("isContinued")) {
          return "How do these steps and solutions resonate with you?";
        }
        return match;
      }
    )
    .replace(/[\s,]*\\?isContinued\\?(?:true|false)\b/gi, "")
    .replace(/[\s,]*isContinued\s*:?[\s]*(?:true|false)\b/gi, "")
    // Final cleanup - remove any lines that are just numbers and colons (streaming artifacts)
    .replace(/^\d+:\s*$/gm, "") // Remove lines like "5:" with nothing after
    .replace(/^\d+:\s*[{}"\s]*$/gm, "") // Remove lines like "5: {}" or "5: """
    .trim();

  const finalContent = processedContent;

  // Only hide if the bubble is just bare JSON/brackets (keep numbers like 7/10, short acks like "ok")
  if (!finalContent || !finalContent.trim()) {
    return null; // still drop truly empty
  }
  const looksLikeBareJson = /^\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*$/.test(finalContent) && finalContent.length < 50;
  if (looksLikeBareJson) {
    return null;
  }

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          pre: (props) => (
            <div className="pre-container">
              <pre {...props} />
            </div>
          ),
          // Add proper handling for other markdown elements
          p: (props) => <p className="mb-3" {...props} />,
          ul: (props) => <ul className="list-disc ml-6 mb-3" {...props} />,
          ol: (props) => <ol className="list-decimal ml-6 mb-3" {...props} />,
          li: (props) => <li className="mb-1" {...props} />,
        }}
      >
        {finalContent}
      </ReactMarkdown>
    </div>
  );
};

const checkAllGoalsCompleted = async (): Promise<boolean> => {
  try {
    const response = await fetch("/api/goals", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      // response body might be empty or non-JSON
    }

    if (!response.ok) {
      console.warn(
        " /api/goals returned non-200",
        response.status,
        data?.error || data || "(no body)"
      );
      return false; // keep UI stable
    }

    const goals = data?.goals?.mental_health_goals ?? [];
    if (!Array.isArray(goals) || goals.length === 0) return false;

    const allCompleted = goals.every(
      (goal: { completed?: boolean }) => Boolean(goal?.completed)
    );

    return allCompleted;
  } catch (error) {
    console.error("Error checking goals completion status:", error);
    return false;
  }
};


function withStableIndexes(list: ChatMessage[]): ChatMessage[] {
  const nonSystem = list.filter(m => m.role !== "system");
  return nonSystem.map((m, i) => ({
    ...m,
    messageIndex: typeof m.messageIndex === "number" ? m.messageIndex : i,
  }));
}

function nextLocalIndex(list: ChatMessage[]): number {
  return list.filter(m => m.role !== "system").length;
}

const stripEmptyAssistant = (list: ChatMessage[]) =>
  list.filter(m => !(m.role === "assistant" && (m.content ?? "").trim() === ""));


//for auto acknowledgment
type ToolKind = "save_goals" | "save_progress" | "save_bevs" | "save_intro" | "save_profile_generic";
function inferToolKind(payload: any, currentPhase?: string): ToolKind {
  console.log("=== inferToolKind DEBUG ===");
  console.log("payload:", payload);
  console.log("currentPhase:", currentPhase);
  
  if (!payload || typeof payload !== "object") {
    console.log("Returning save_profile_generic - no payload");
    return "save_profile_generic";
  }

  // Extract the actual arguments from the payload
  const args = payload.args || payload;
  console.log("args:", args);
  
  if (!args || typeof args !== "object") {
    console.log("Returning save_profile_generic - no args");
    return "save_profile_generic";
  }
  
  // Check for BEVS by looking for BEVS-specific structure
  if ("bevs" in args && args.bevs) {
    const bevs = args.bevs;
    if (bevs.domains || bevs.assessments || bevs.currentStep === "done") {
      console.log("Returning save_bevs - detected BEVS completion");
      return "save_bevs";
    }
  }
  
  // Use current phase for other scenarios
  if (currentPhase === "introduction") {
    if ("demographic" in args || 
        "personality_traits" in args || 
        "mental_health_profile" in args) {
      console.log("Returning save_intro - intro phase with profile data");
      return "save_intro";
    }
  }
  
  if (currentPhase === "goal_setting") {
    console.log("Returning save_goals - goal_setting phase");
    return "save_goals";
  }
  
  if (currentPhase === "action_planning") {
    if ("mental_health_goals" in args && Array.isArray(args.mental_health_goals)) {
      const goals = args.mental_health_goals;
      const hasProgressUpdate = goals.some((g: any) => 
        (typeof g.progress === "number" && g.progress > 0) || 
        g.completed === true ||
        g.lastUpdated
      );
      const result = hasProgressUpdate ? "save_progress" : "save_goals";
      console.log(`Returning ${result} - action_planning with goals, hasProgressUpdate:`, hasProgressUpdate);
      return result;
    }
    console.log("Returning save_progress - default for action_planning");
    return "save_progress";
  }
  
  // Fallback analysis
  if ("mental_health_goals" in args && Array.isArray(args.mental_health_goals)) {
    const goals = args.mental_health_goals;
    const hasProgressUpdate = goals.some((g: any) => 
      typeof g.progress === "number" || g.completed === true || g.lastUpdated
    );
    return hasProgressUpdate ? "save_progress" : "save_goals";
  }
  
  if ("demographic" in args || 
      "personality_traits" in args || 
      "mental_health_profile" in args) {
    return "save_intro";
  }
  
  console.log("Returning save_profile_generic - fallback");
  return "save_profile_generic";
}
function ackFor(kind: ToolKind) {
  switch (kind) {
    case "save_goals":    return "Got it — saving your goal now.";
    case "save_progress": return "Noted! I'm updating your progress.";
    case "save_bevs":     return "On it — saving your values results. One moment";
    case "save_intro":    return "Thank you!! I'm saving your intro details.";
    default:               return "Working on that now, Can we proceed?";
  }
}
function doneFor(kind: ToolKind) {
  switch (kind) {
    case "save_goals":    return "Saved. Are you feeling motivated for this?";
    case "save_progress": return "Got it, noted! Anything else on your mind?";
    case "save_bevs":     return "All set — values saved. Ready to continue when you are!";
    case "save_intro":    return "Saved your intro! Shall we continue?";
    default:               return "Done! Anything else I can help with?";
  }
}




export default function ChatPage() {
  const { user, isLoaded } = useUser();
  const rawBufferRef = useRef<ChatMessage[]>([]);
  const newlyCreatedRef = useRef(false);
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const { botPreferences, isLoading: isLoadingBotPreferences } =
    useBotContext();
  const [latestSession, setLatestSession] = useState(null);
  const [isMounted, setIsMounted] = useState(false);


  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Keep the userProfile state for UI purposes
  const [aiUserProfile, setAiUserProfile] = useState<AiUserProfile>({
    demographic: {},
    personality_traits: {},
    challenges: {},
    emotional_state: null,
    feedback: {},
  });


  const [currentPhase, setCurrentPhase] = useState<string>("introduction");

  // Track assessment state
  const [showWHO5Assessment, setShowWHO5Assessment] = useState(false);
  const [lastAssessmentDate, setLastAssessmentDate] = useState<Date | null>(
    null
  );
  const [assessmentCount, setAssessmentCount] = useState(0);

  const lastForceSyncTimeRef = useRef<number>(0);
  const lastSyncedIndexRef = useRef<number>(-1);
  const [messagesFullyLoaded, setMessagesFullyLoaded] = useState(false);

  // Track goal feedback dialog state
  const [showGoalFeedback, setShowGoalFeedback] = useState(false);
  const [completedGoalDescription, setCompletedGoalDescription] =
    useState<string>("");

  // const [initialState] = useState(() => {
  //   try {
  //     if (typeof window !== "undefined") {
  //       const cachedSessionId = localStorage.getItem(STORAGE_KEY_SESSION);
  //       const cachedMessages = localStorage.getItem(STORAGE_KEY_MESSAGES);
  //       const cachedPhase = localStorage.getItem(STORAGE_KEY_PHASE);

  //       if (cachedSessionId && cachedMessages) {
  //         const parsedMessages = JSON.parse(cachedMessages) as ChatMessage[];
          
  //         if (cachedPhase) {
  //           setCurrentPhase(cachedPhase);
  //         }

  //         try {
  //           const li = localStorage.getItem(STORAGE_KEY_LAST_INDEX);
  //           if (li) lastSyncedIndexRef.current = parseInt(li, 10);
  //         } catch {}

  //         return {
  //           messages: parsedMessages,
  //           sessionId: cachedSessionId,
  //         };
  //       }
  //     }
  //   } catch (error) {
  //     console.error("Error pre-loading cached state:", error);
  //   }

  //   // If no cached messages, create initial welcome message
  //   const welcomeMessage: ChatMessage = {
  //     id: `welcome-${Date.now()}`,
  //     role: "assistant",
  //     content: `Hello there! I'm your wellbeing coach. How are you feeling today? I'm here to offer you emotional support and help you achieve your goals. I will be asking you a few questions to get to know you better - these are just a one time thing!`,
  //     messageIndex: 0,
  //     createdAt: new Date().toISOString(),
  //   };

  //   return {
  //     messages: [welcomeMessage],
  //     sessionId: null,
  //   };
  // });

const [messages, setMessages] = useState<ChatMessage[]>([]);
const [sessionId, setSessionId] = useState<string | null>(null);

useEffect(() => {
  try {
    const cachedSessionId = localStorage.getItem(STORAGE_KEY_SESSION);
    const cachedMessages = localStorage.getItem(STORAGE_KEY_MESSAGES);
    const cachedPhase = localStorage.getItem(STORAGE_KEY_PHASE);

    if (cachedSessionId && cachedMessages) {
      const parsedMessages = JSON.parse(cachedMessages) as ChatMessage[];

      setSessionId(cachedSessionId);
      setMessages(parsedMessages);

      if (cachedPhase) {
        setCurrentPhase(cachedPhase);
      }

      try {
        const li = localStorage.getItem(STORAGE_KEY_LAST_INDEX);
        if (li) lastSyncedIndexRef.current = parseInt(li, 10);
      } catch {}
      
      return;
    }
  } catch (error) {
    console.error("Error loading cached state:", error);
  }

  // fallback welcome message
  const welcomeMessage: ChatMessage = {
    id: `welcome-${Date.now()}`,
    role: "assistant",
    content: `Hello there! I'm your wellbeing coach. How are you feeling today? I'm here to offer you emotional support and help you achieve your goals. I will be asking you a few questions to get to know you better - these are just a one time thing!`,
    messageIndex: 0,
    createdAt: new Date().toISOString(),
  };

  setMessages([welcomeMessage]);
  setSessionId(null);
}, []);

  const compareMessages = (a: ChatMessage, b: ChatMessage) => {
    const ai = Number.isFinite(a.messageIndex as any) ? (a.messageIndex as number) : undefined;
    const bi = Number.isFinite(b.messageIndex as any) ? (b.messageIndex as number) : undefined;

    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;

    const at = a.createdAt ? new Date(a.createdAt as any).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt as any).getTime() : 0;
    if (at !== bt) return at - bt;

    return String(a.id).localeCompare(String(b.id));
  };

  // Get initial state for messages
  // const [messages, setMessages] = useState<ChatMessage[]>(
  //   initialState.messages
  // );

  // Always-upto-date reference to messages for unmount/route-change flushes
  const latestMessagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);


  // --- TOOL ACKNOWLEDGEMENT REFS & INSERT HELPER ---
  const toolAckIdRef = useRef<string | null>(null);
  const lastToolKindRef = useRef<ToolKind | null>(null);
  // Track if saveProfile tool was called this turn (prevents auto-continue loops)
  const sawSaveProfileThisTurnRef = useRef(false);
  // Track if visible assistant text was streamed this turn (prevents duplicate "Saved" lines)
  const streamProducedVisibleRef = useRef(false);

  const onToolCallHandler = useCallback((toolName: string, payload?: any) => {
    try {
      const kind = inferToolKind(payload, currentPhaseRef.current);
      lastToolKindRef.current = kind;

      if (toolName === "saveProfile") {
        sawSaveProfileThisTurnRef.current = true; // mark that this turn executed a save
      }

      if (!toolAckIdRef.current) {
        const ack = ackFor(kind);
        toolAckIdRef.current = insertAssistant(ack, { toolAck: true, kind });
      }
    } catch (e) {
      console.warn("onToolCallHandler failed", e);
    }
  }, []);

  const finalizeToolAck = useCallback(() => {
    const id = toolAckIdRef.current;
    if (!id) return;
    const kind = lastToolKindRef.current || "save_profile_generic";

    // If the stream already produced visible text (and likely overwrote the ack),
    // do not inject another "Saved" line. Just clear the refs.
    if (streamProducedVisibleRef.current) {
      toolAckIdRef.current = null;
      lastToolKindRef.current = null;
      streamProducedVisibleRef.current = false;
      return;
    }

    setMessages(prev => prev.map(m => (m.id === id ? { ...m, content: doneFor(kind) } : m)));
    toolAckIdRef.current = null;
    lastToolKindRef.current = null;
    streamProducedVisibleRef.current = false;
  }, []);

  function insertAssistant(content: string, meta?: any) {
    if (meta?.toolAck && toolAckIdRef.current) return toolAckIdRef.current;
    const msg = {
      id: `asst-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      role: "assistant" as const,
      content,
      createdAt: new Date().toISOString(),
      meta,
    };
    setMessages(prev => [...prev, msg]);
    setSyncStatus(p => ({ ...p, pendingChanges: true }));
    return msg.id;
  }
  


useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY_MESSAGES);
    if (cached) {
      const parsed = JSON.parse(cached);
      rawBufferRef.current = parsed;
      // console.log("Loaded cached messages into buffer:", parsed);
    }
  }, []);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Add a loading state for messages
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);

  // Add state for sync status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    syncing: false,
    lastSyncedAt: null,
    pendingChanges: false,
    error: null,
  });

  // Add state for online status
  const [isOnline, setIsOnline] = useState<boolean>(true);




  // Add the toast hook
  const { toast } = useToast();


// Keep latest values in refs so the debounced function doesn't get recreated
const isOnlineRef = useRef(isOnline);
const currentPhaseRef = useRef(currentPhase);
const currentSessionRef = useRef<SessionWithPhase | null>(null);
const streamingMessageRef = useRef<string | null>(null);

useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
useEffect(() => { currentPhaseRef.current = currentPhase; }, [currentPhase]);
useEffect(() => { currentSessionRef.current = currentSession as SessionWithPhase | null; }, [currentSession]);


const computeDelta = (withIndex: ChatMessage[]) => {
  const base = typeof lastSyncedIndexRef.current === "number"
    ? lastSyncedIndexRef.current
    : -1;
  return withIndex.filter(m =>
    typeof m.messageIndex === "number" && (m.messageIndex as number) > base
  );
};

const debouncedSyncMessages = useMemo(() => {
  return debounce(
    async (messagesToSync: ChatMessage[], retryCount = 0): Promise<void> => {
      if (isStreamingRef.current) return;
      const session = currentSessionRef.current;
      if (!session || !user || !isOnlineRef.current) {
        setSyncStatus((p) => ({ ...p, pendingChanges: true }));
        return;
      }
      if (session.id.startsWith("temp-")) {
        setSyncStatus((p) => ({ ...p, pendingChanges: true }));
        return;
      }

      try {
        setSyncStatus((p) => ({ ...p, syncing: true, error: null }));

        // Prepare outgoing payload: strip system/empty and ensure stable indexes
        const base = stripEmptyAssistant(messagesToSync.filter((m) => m.role !== "system"));
        const withIndex = withStableIndexes(base);
              
        const delta = computeDelta(withIndex);
        console.log("Syncing messages:", delta.map(m => ({ 
  id: m.id, 
  contentLength: (m.content || '').length,
  contentPreview: (m.content || '').substring(0, 100)
})));
        if (delta.length === 0) {
          setSyncStatus((p) => ({ ...p, syncing: false, pendingChanges: false }));
          return;
        }
        
        // Batch large deltas to small requests
        const BATCH_SIZE = 40;
        const batches: ChatMessage[][] = [];
        for (let i = 0; i < delta.length; i += BATCH_SIZE) {
          batches.push(delta.slice(i, i + BATCH_SIZE));
        }
                let sentMaxIndex = lastSyncedIndexRef.current;

        for (const batch of batches) {
          const approxBytes = (() => { try { return JSON.stringify({ messages: batch, currentPhase: currentPhaseRef.current }).length; } catch { return 0; } })();
          console.log("[Sync] POST batch", {
            sessionId: session.id,
            count: batch.length,
            approxBytes,
            fromIndex: sentMaxIndex + 1,
          });

          const res = await fetch(`/api/sessions/${session.id}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: batch, currentPhase: currentPhaseRef.current }),
            credentials: "same-origin",
          });

          const raw = await res.text();
          let data: any = null; try { data = raw ? JSON.parse(raw) : null; } catch {}

          if (!res.ok) {
            const msg = data?.error || raw || res.statusText || `HTTP ${res.status}`;
            if (data?.error === "Database conflict detected - please try again" && retryCount < 3) {
              const backoff = Math.pow(2, retryCount) * 750;
              console.warn(`[Sync] Conflict; retrying in ${backoff}ms (attempt ${retryCount + 1}/3)`);
              await new Promise(r => setTimeout(r, backoff));
              setTimeout(() => {
                try { debouncedSyncMessages(stripEmptyAssistant(messagesToSync), (retryCount + 1) as any); } catch {}
              }, 0);
              return;
            }
            // console.error("[Sync] Save failed", { status: res.status, msg, sessionId: session.id });
            setSyncStatus((p) => ({ ...p, syncing: false, error: `Sync failed (${res.status}): ${msg}`, pendingChanges: true }));
            return;
          }
          
          // success for this batch → advance high-water mark
          for (const m of batch) {
            if (typeof m.messageIndex === "number") {
              sentMaxIndex = Math.max(sentMaxIndex, m.messageIndex as number);
            }
          }
        }

                // All batches OK — persist last synced index
        lastSyncedIndexRef.current = sentMaxIndex;
        try { localStorage.setItem(STORAGE_KEY_LAST_INDEX, String(sentMaxIndex)); } catch {}


        const now = Date.now();
        const newState = { syncing: false, lastSyncedAt: now, pendingChanges: false, error: null as string | null };
        setSyncStatus(newState);
        localStorage.setItem(STORAGE_KEY_LAST_SYNC, now.toString());
        localStorage.setItem(STORAGE_KEY_SYNC_STATUS, JSON.stringify(newState));
      } catch (err) {
                const name = (err as any)?.name || "";
        const message = (err as any)?.message || String(err);
        const isAbort = name === "AbortError";
        if (isAbort) {
          console.warn("[Sync] Request aborted (likely page hide/unload)");
          setSyncStatus((p) => ({ ...p, syncing: false, pendingChanges: true }));
          return;
        }
        console.error("[Sync] Network/unknown error while saving", { name, message, err });
        if (retryCount < 3 && err instanceof TypeError) {
          const backoff = Math.pow(2, retryCount) * 750;
          await new Promise(r => setTimeout(r, backoff));
                      // Re-schedule the debounced call without chaining the same promise
                     setTimeout(() => {
            try { debouncedSyncMessages(stripEmptyAssistant(messagesToSync), (retryCount + 1) as any); } catch {}
          }, 0);
          return; 
        }
        setSyncStatus((p) => ({ ...p, syncing: false, error: err instanceof Error ? err.message : "Unknown error", pendingChanges: true }));
      }
    },
    1000
  );
 
}, [user]); // stays stable across online/phase changes



  const saveMessagesToDatabase = useCallback(
  async (messagesToSave: ChatMessage[]) => {
    if (!currentSession || !user) {
      console.log("No session or user - skipping database save");
      return;
    }

    // Skip temp sessions but don't block other session formats
    if (currentSession.id.startsWith("temp-")) {
      console.log("Temporary session - skipping database save");
      return;
    }
    
    // Remove the strict MongoDB ObjectId validation or make it more flexible
    // if (!isValidMongoObjectId(currentSession.id)) {
    //   console.warn("Invalid session ID (not syncing):", currentSession.id);
    //   return;
    // }
    
    console.log("Saving to database - Session:", currentSession.id, "Messages:", messagesToSave.length);
    const cleaned = stripEmptyAssistant(messagesToSave);
    // Save to localStorage immediately for optimistic updates
    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(cleaned));
      if (currentSession.id) {
        localStorage.setItem(STORAGE_KEY_SESSION, currentSession.id);
      }
      if (currentPhase) {
        localStorage.setItem(STORAGE_KEY_PHASE, currentPhase);
      }
    } catch (error) {
      console.error("Error saving to localStorage:", error);
    }

    // Use the debounced sync function for database updates
    debouncedSyncMessages(messagesToSave);
  },
  [currentSession, user, currentPhase, debouncedSyncMessages]
);


   const forceSyncMessages = useCallback(
      async (
      rawMessages?: ChatMessage[],
      retryCount: number = 0
    ): Promise<boolean | void> => {
      const currentMessages =
        rawMessages && rawMessages.length > 0 ? rawMessages : [...messages];

          if (!currentSession || !user || !isOnline || currentMessages.length === 0) {
        return false;
      }

         if (currentSession.id.startsWith("temp-")) {
        console.log("Can't force sync for temporary session");
        return false;
      }


    debouncedSyncMessages.cancel();

    try {
      setSyncStatus((prev) => ({ ...prev, syncing: true, error: null }));

        const base = stripEmptyAssistant(currentMessages.filter((m) => m.role !== "system"));
        const withIndex = withStableIndexes(base);

        const delta = computeDelta(withIndex);
        if (delta.length === 0) {
          setSyncStatus((prev) => ({ ...prev, syncing: false, pendingChanges: false }));
          return true;
        }
        const BATCH_SIZE = 40;
        const batches: ChatMessage[][] = [];
        for (let i = 0; i < delta.length; i += BATCH_SIZE) {
          batches.push(delta.slice(i, i + BATCH_SIZE));
        }

  

          let sentMaxIndex = lastSyncedIndexRef.current;

          for (const batch of batches) {
          const approxBytes = (() => { try { return JSON.stringify({ messages: batch, currentPhase }).length; } catch { return 0; } })();
          console.log("[ForceSync] POST batch", { sessionId: currentSession.id, count: batch.length, approxBytes, fromIndex: sentMaxIndex + 1 });


                  const response = await fetch(`/api/sessions/${currentSession.id}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: batch, currentPhase }),
                        credentials: "same-origin",
          });

                  const raw = await response.text();
          let data: any = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

                if (!response.ok) {
            if (data?.error === "Database conflict detected - please try again" && retryCount < 3) {
              console.log(`Force sync: Conflict; retrying (${retryCount + 1}/3)...`);
              if (retryCount === 0) {
                toast({ title: "Sync conflict detected", description: "Retrying automatically...", variant: "default" });
              }
              const backoffTime = Math.pow(2, retryCount) * 1000;
              await new Promise((resolve) => setTimeout(resolve, backoffTime));
              return forceSyncMessages(rawMessages, retryCount + 1);
            }

      // Update sync status
          toast({ title: "Sync failed", description: data?.error || `Server error: ${response.status}`, variant: "destructive" });
            throw new Error(data?.error || `Failed to sync: ${response.status} ${response.statusText}`);
          }


          
          for (const m of batch) {
            if (typeof m.messageIndex === "number") {
              sentMaxIndex = Math.max(sentMaxIndex, m.messageIndex as number);
            }
          }
        }

         // Persist last synced index
        lastSyncedIndexRef.current = sentMaxIndex;
        try { localStorage.setItem(STORAGE_KEY_LAST_INDEX, String(sentMaxIndex)); } catch {}

        // Update sync status
        const now = Date.now();
        const newSyncStatus = {
          syncing: false,
          lastSyncedAt: now,
          pendingChanges: false,
          error: null,
        };

              setSyncStatus(newSyncStatus);
        localStorage.setItem(STORAGE_KEY_SYNC_STATUS, JSON.stringify(newSyncStatus));
        localStorage.setItem(STORAGE_KEY_LAST_SYNC, now.toString());

              console.log("Messages force synced to database");
        // toast({ title: "Sync successful", description: "Messages saved to database", variant: "success" });
        // Do not clear the cached transcript here; we keep it for offline continuity
        lastForceSyncTimeRef.current = Date.now();

             return true;
      } catch (error) {
        console.error("Error force syncing messages:", error);
      
        // Retry on network errors
        if (retryCount < 3 && error instanceof TypeError) {
          console.log(`Force sync: Network error detected, retrying (${retryCount + 1}/3)...`);
          if (retryCount === 0) {
            toast({ title: "Network error", description: "Retrying connection...", variant: "default" });
          }
          const backoffTime = Math.pow(2, retryCount) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
          return forceSyncMessages(rawMessages, retryCount + 1);
        }

                setSyncStatus((prev) => ({
          ...prev,
          syncing: false,
          error: error instanceof Error ? error.message : "Unknown error",
          pendingChanges: true,
        }));

        toast({ title: "Sync failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
        return false;
      }
          },
    [
      currentSession?.id,
      user?.id,
      isOnline,
      currentPhase,
      debouncedSyncMessages,
      toast,
      messages.length,
    ]
  );

 
  
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      // Initial check
      setIsOnline(navigator.onLine);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  // Load sync status from localStorage during initialization
  useEffect(() => {
    if (typeof window !== "undefined" && isMounted) {
      try {
        const storedSyncStatus = localStorage.getItem(STORAGE_KEY_SYNC_STATUS);
        if (storedSyncStatus) {
          setSyncStatus(JSON.parse(storedSyncStatus));
        }
      } catch (error) {
        console.error("Error loading sync status:", error);
      }
    }
  }, [isMounted]);

  // Sync messages whenever they change (with optimistic updates)
  // useEffect(() => {
  //   // if (isMounted && messages.length > 0 && currentSession) {
  //       const justForceSynced = Date.now() - lastForceSyncTimeRef.current < 5000;

  //   if (isMounted && messages.length > 0 && currentSession && !justForceSynced) {
  //     // First, always update localStorage immediately (optimistic update)
  //     try {
  //       localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
  //       if (currentSession.id) {
  //         localStorage.setItem(STORAGE_KEY_SESSION, currentSession.id);
  //       }
  //       if (currentPhase) {
  //         localStorage.setItem(STORAGE_KEY_PHASE, currentPhase);
  //       }

  //       // Mark that there are pending changes to sync
  //       setSyncStatus((prev) => ({ ...prev, pendingChanges: true }));
  //     } catch (error) {
  //       console.error("Error saving to localStorage:", error);
  //     }

  //     // Skip server writes while the assistant is streaming to avoid conflicts
  //     if (isStreamingRef.current) {
  //       console.log("[Sync] Skipping debounced sync (streaming in progress)");
  //       return;
  //     }
  //     console.log("[Sync] Debounced sync scheduled. messages=", messages.length);
  //     // Then attempt to sync with the server (debounced)
  //     // debouncedSyncMessages(messages, currentSession as SessionWithPhase);
  //     debouncedSyncMessages(stripEmptyAssistant(messages));
  //   }
  // }, [
  //   messages,
  //   isMounted,
  //   currentSession?.id,
  //   currentPhase,
  //   debouncedSyncMessages,
  // ]);
const skipSyncRef = useRef(false);

useEffect(() => {
  const justForceSynced = Date.now() - lastForceSyncTimeRef.current < 5000;

  if (isStreamingRef.current) {
    console.log("[Sync] Skipping - streaming in progress");
    return;
  }

  if (isMounted && messages.length > 0 && currentSession && !justForceSynced) {
    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
      if (currentSession.id) {
        localStorage.setItem(STORAGE_KEY_SESSION, currentSession.id);
      }
      if (currentPhase) {
        localStorage.setItem(STORAGE_KEY_PHASE, currentPhase);
      }
      setSyncStatus((prev) => ({ ...prev, pendingChanges: true }));
    } catch (error) {
      console.error("Error saving to localStorage:", error);
    }

    console.log("[Sync] Debounced sync scheduled. messages=", messages.length);
    debouncedSyncMessages(stripEmptyAssistant(messages));
  }
}, [
  messages,
  isMounted,
  currentSession?.id,
  currentPhase,
  debouncedSyncMessages,
]);



  // Retry syncing when coming back online
  useEffect(() => {
    if (
      isOnline &&
      syncStatus.pendingChanges &&
      messages.length > 0 &&
      currentSession
    ) {
      console.log("Back online, retrying message sync");
      // debouncedSyncMessages(messages, currentSession as SessionWithPhase);
      debouncedSyncMessages(stripEmptyAssistant(messages));
    }
  }, [
    isOnline,
    syncStatus.pendingChanges,
    messages,
    currentSession,
    debouncedSyncMessages,
  ]);



    
// validate cached session id once on mount 
useEffect(() => {
  let aborted = false;

  (async () => {
    if (typeof window === "undefined") return;

    const cachedId = localStorage.getItem(STORAGE_KEY_SESSION);
    if (!cachedId) return;

    try {
      const res = await fetch(`/api/sessions/${cachedId}`);
      if (aborted) return;

      if (res.status === 404) {
        // cached id points to a deleted/missing session — clear cache
        console.warn("⚠️ Cached session not found. Clearing cache.");
        localStorage.removeItem(STORAGE_KEY_SESSION);
        localStorage.removeItem(STORAGE_KEY_MESSAGES);
        localStorage.removeItem(STORAGE_KEY_PHASE);
        return;
      }

      if (!res.ok) {
        console.error("Session lookup failed:", await res.text());
        return; 
      }

      const sess = await res.json();
      setCurrentSession(sess);

      if (sess?.currentPhase) {
        setCurrentPhase(sess.currentPhase);
        try {
          localStorage.setItem(STORAGE_KEY_PHASE, sess.currentPhase);
        } catch {}
      }
    } catch (e) {
      console.error("Failed to validate cached session:", e);
      
    }
  })();

  return () => {
    aborted = true;
  };
}, []); 


// ---- helpers used by the orchestration effect ----
// Creates a fresh server session and seeds local cache
async function createNewSession() {
  try {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user?.id,
        initialPhase: currentPhase || "introduction",
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "Failed to create session");
    }

    const newSession = data.session || data;
    setCurrentSession(newSession);
    setIsLoadingMessages(false);

    try {
      localStorage.setItem(STORAGE_KEY_SESSION, newSession.id);
      const existing = localStorage.getItem(STORAGE_KEY_MESSAGES);
      if (!existing) {
        localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify([]));
      }
      if (currentPhase) {
        localStorage.setItem(STORAGE_KEY_PHASE, currentPhase);
      }
    } catch {}

    // mark that this is a truly new session
    newlyCreatedRef.current = true;

    await loadSessionMessages(newSession.id);
  } catch (err) {
    console.error("Failed to create session:", err);
  }
}

async function loadSessionMessages(sessionId: string) {
  let didLoadFromServer = false;

  try {
    const [messagesResponse, sessionResponse] = await Promise.all([
  fetch(`/api/sessions/${sessionId}/messages`),
  fetch(`/api/sessions/${sessionId}`)
]);

    if (messagesResponse.ok) {
      const messagesData = await messagesResponse.json();

      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json();
        if (sessionData?.currentPhase) {
          setCurrentPhase(sessionData.currentPhase);
          try {
            localStorage.setItem(STORAGE_KEY_PHASE, sessionData.currentPhase);
          } catch {}
        }
      }

      if (Array.isArray(messagesData?.messages) && messagesData.messages.length) {
        // Sort by messageIndex, fallback to createdAt
        const sorted = [...messagesData.messages].sort((a: any, b: any) => {
          if (typeof a.messageIndex === "number" && typeof b.messageIndex === "number") {
            return a.messageIndex - b.messageIndex;
          }
          if (a.createdAt && b.createdAt) {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          }
          return 0;
        });


        const formatted: ChatMessage[] = sorted.map((m: any): ChatMessage => ({
          id: m.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          role: m.role === "user" ? "user" : "assistant",
          content: String(m.content ?? ""),
          messageIndex: typeof m.messageIndex === "number" ? m.messageIndex : undefined,
          createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : undefined,
        }));

        const maxIdx = formatted.reduce((acc, m) =>
  Math.max(acc, typeof m.messageIndex === "number" ? m.messageIndex : -1), -1);

lastSyncedIndexRef.current = maxIdx;
try { localStorage.setItem(STORAGE_KEY_LAST_INDEX, String(maxIdx)); } catch {}

        const newMessages: ChatMessage[] = [...formatted];

        setMessages(prev => {
        const userMessages = prev.filter(m => m.role === "user");
        if (userMessages.length > 0) {
          return prev;
        }
        return newMessages;
      });
        rawBufferRef.current = newMessages;
        setIsLoadingMessages(false);
        didLoadFromServer = true;

        try {
          localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(newMessages));
          localStorage.setItem(STORAGE_KEY_SESSION, sessionId);
        } catch {}
      } else {
        setIsLoadingMessages(false);
      }
    } else {
      console.error("Error loading messages:", await messagesResponse.text());
      setIsLoadingMessages(false);

      // after determining server returned no messages for this session
  lastSyncedIndexRef.current = -1;
  try { localStorage.setItem(STORAGE_KEY_LAST_INDEX, String(-1)); } catch {}

    }
  } catch (err) {
    console.error("Error loading session messages:", err);
    setIsLoadingMessages(false);
  }

  // Fallback to cache only if server returned nothing
  if (!didLoadFromServer) {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_MESSAGES);
      if (cached) {
        const parsed = JSON.parse(cached) as ChatMessage[];
        setMessages(parsed);
        rawBufferRef.current = parsed;
      }
    } catch {}
  }
}


useEffect(() => {
  async function getOrCreateSession() {
    if (!isLoaded || !user || !isMounted) return;

    // if validation already set one, stop
    if (currentSession?.id) {
      setIsLoadingMessages(false);
      return;
    }

    // if a cached id still exists, let the validator handle it
    const cachedId =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_SESSION) : null;
    if (cachedId) return;

    // otherwise: fetch latest or create
    try {
      const response = await fetch("/api/sessions?getLatest=true");
      if (response.ok) {
        const data = await response.json();
        if (data.latestSession) {
          setCurrentSession(data.latestSession);
          await loadSessionMessages(data.latestSession.id);
          return;
        }
      }
      await createNewSession();
    } catch (err) {
      console.error("Error managing chat session:", err);
      await createNewSession();
    }
  }

  getOrCreateSession();
}, [isLoaded, user?.id, isMounted, currentSession?.id]);

  // Fetch user profile from database - only on client side
  useEffect(() => {
    async function fetchUserProfile() {
      if (isLoaded && user && isMounted) {
        try {
          setIsLoadingProfile(true);
          const response = await fetch(`/api/user-profile?userId=${user.id}`);
          if (response.ok) {
            const data = await response.json();
            setUserProfile(data.profile);
          } else {
            console.error("Error fetching profile:", await response.text());
            // Continue with null profile, which will show the dialog
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
          // Continue with null profile, which will show the dialog
        } finally {
          setIsLoadingProfile(false);
        }
      } else if (isLoaded && !user) {
        setIsLoadingProfile(false);
      }
    }

    if (isMounted) {
      fetchUserProfile();
    }
  }, [isLoaded, user, isMounted]);

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !user && isMounted) {
      router.push("/sign-in");
    }
  }, [isLoaded, user, router, isMounted]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Automatically scroll to bottom when messages change
  // useEffect(() => {
  //   if (messagesEndRef.current) {
  //     messagesEndRef.current.scrollIntoView({
  //       behavior: "smooth",
  //       block: "end",
  //     });
  //   }
  // }, [messages]);


// useEffect(() => {
//   // Scroll to bottom when component mounts or messages are loaded from cache/server
//   if (isMounted && !isLoadingMessages && messages.length > 0) {
//     const timeoutId = setTimeout(() => {
//       if (messagesEndRef.current) {
//         messagesEndRef.current.scrollIntoView({
//           behavior: "auto", // Use "auto" instead of "smooth" for initial load
//           block: "end",
//         });
//       }
//     }, 100);

//     return () => clearTimeout(timeoutId);
//   }
// }, [isMounted, isLoadingMessages, messages.length]);

// tab switch handling
// useEffect(() => {
//   const handleVisibilityChange = () => {
//     if (!document.hidden && messages.length > 0) {
//       setTimeout(() => {
//         if (messagesEndRef.current) {
//           messagesEndRef.current.scrollIntoView({
//             behavior: "auto",
//             block: "end",
//           });
//         }
//       }, 200);
//     }
//   };

//   document.addEventListener('visibilitychange', handleVisibilityChange);
//   return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
// }, [messages.length]);




  // const handleCustomSubmit = async (e: React.FormEvent) => {
  //   e.preventDefault();
  //   if (input.trim()) {
  //     handleSubmit(e);
  //     // Immediate scroll when user sends a message
  //     setTimeout(() => {
  //       if (messagesEndRef.current) {
  //         messagesEndRef.current.scrollIntoView({
  //           behavior: "smooth",
  //           block: "end",
  //         });
  //       }
  //     }, 50);
  //   }
  // };


// const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto", retries = 5) => {
//   const attemptScroll = (attempt: number) => {
//     try {
//       const root = scrollAreaRef.current as HTMLElement | null;
//       if (!root) {
//         if (attempt > 0) {
//           setTimeout(() => attemptScroll(attempt - 1), 150); // Longer retry delay
//         }
//         return;
//       }

//       // Find the Radix ScrollArea viewport
//       const viewport = root.querySelector(
//         "[data-radix-scroll-area-viewport]"
//       ) as HTMLElement | null;

//       const target = viewport ?? root;

//       // Check if target has content to scroll
//       if (target.scrollHeight <= target.clientHeight) {
//         if (attempt > 0) {
//           setTimeout(() => attemptScroll(attempt - 1), 150);
//         }
//         return;
//       }

//       // Additional check: ensure messages are actually rendered
//       const messageElements = target.querySelectorAll('[class*="rounded-lg"]'); // Your message styling
//       if (messageElements.length === 0 && attempt > 0) {
//         setTimeout(() => attemptScroll(attempt - 1), 150);
//         return;
//       }

//       // Prefer scrollIntoView with the anchor
//       if (messagesEndRef.current) {
//         messagesEndRef.current.scrollIntoView({
//           behavior,
//           block: "end",
//         });
//       } else {
//         // Fallback: direct scroll
//         target.scrollTop = target.scrollHeight;
//       }
//     } catch (error) {
//       console.warn("Scroll attempt failed:", error);
//       if (attempt > 0) {
//         setTimeout(() => attemptScroll(attempt - 1), 150);
//       }
//     }
//   };

//   attemptScroll(retries);
// }, []);
const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto", retries = 8) => {
  const attemptScroll = (attempt: number) => {
    try {
      const root = scrollAreaRef.current as HTMLElement | null;
      if (!root) {
        if (attempt > 0) {
          setTimeout(() => attemptScroll(attempt - 1), 200);
        }
        return;
      }

      // Find the Radix ScrollArea viewport
      const viewport = root.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLElement | null;

      const target = viewport ?? root;

      // Force a layout recalculation to get accurate scrollHeight
      void target.offsetHeight;

      // Check if target has content to scroll
      if (target.scrollHeight <= target.clientHeight) {
        if (attempt > 0) {
          setTimeout(() => attemptScroll(attempt - 1), 200);
        }
        return;
      }

      // Additional check: ensure messages are actually rendered
      const messageElements = target.querySelectorAll('[class*="rounded-lg"]');
      if (messageElements.length === 0 && attempt > 0) {
        setTimeout(() => attemptScroll(attempt - 1), 200);
        return;
      }

      // Calculate the maximum scroll position
      const maxScroll = target.scrollHeight - target.clientHeight;
      
      // Scroll to the absolute bottom with a small buffer for safety
      target.scrollTop = maxScroll + 50;

      // Use multiple checks to ensure we're at the bottom
      if (attempt > 0) {
        // First check after a frame
        requestAnimationFrame(() => {
          void target.offsetHeight; // Force layout
          const currentMax = target.scrollHeight - target.clientHeight;
          if (target.scrollTop < currentMax - 5) {
            target.scrollTop = currentMax + 50;
          }
        });

        // Second check after a longer delay for markdown rendering
        setTimeout(() => {
          void target.offsetHeight; // Force layout
          const finalMax = target.scrollHeight - target.clientHeight;
          if (target.scrollTop < finalMax - 5) {
            target.scrollTop = finalMax + 50;
          }
        }, 200);
      }
    } catch (error) {
      console.warn("Scroll attempt failed:", error);
      if (attempt > 0) {
        setTimeout(() => attemptScroll(attempt - 1), 200);
      }
    }
  };

  attemptScroll(retries);
}, []);

useEffect(() => {
  // Don't scroll if not mounted, still loading, or messages not fully loaded
  if (!isMounted || isLoadingMessages || !messagesFullyLoaded) return;
  
  // Don't scroll if no messages
  if (messages.length === 0) return;

  // Determine the appropriate behavior and delay based on the scenario
  let behavior: ScrollBehavior = "auto";
  let delay = 100;

  // Check if this is initial load (no previous scroll position)
  const isInitialLoad = !document.hidden && 
    scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]")?.scrollTop === 0;

  if (isInitialLoad) {
    // Initial load needs more time and should be instant
    behavior = "auto";
    delay = 400; // Even longer delay for reload scenarios
  } else {
    // Subsequent messages can be smooth
    behavior = "smooth";
    delay = 100;
  }

  const timeoutId = setTimeout(() => {
    scrollToBottom(behavior);
  }, delay);

  return () => clearTimeout(timeoutId);
}, [isMounted, isLoadingMessages, messagesFullyLoaded, messages.length, scrollToBottom]);

useEffect(() => {
  if (!isLoadingMessages && messages.length > 0 && isMounted) {
    // Wait for next tick to ensure DOM is updated with all messages
    const timeoutId = setTimeout(() => {
      setMessagesFullyLoaded(true);
    }, 50);
    
    return () => clearTimeout(timeoutId);
  } else if (isLoadingMessages) {
    setMessagesFullyLoaded(false);
  }
}, [isLoadingMessages, messages.length, isMounted]);

//(tab switching) scroll
useEffect(() => {
  const handleVisibilityChange = () => {
    if (!document.hidden && messages.length > 0) {
      // When tab becomes visible, scroll after a delay to ensure rendering is complete
      setTimeout(() => {
        scrollToBottom("auto");
      }, 200);
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [messages.length, scrollToBottom]);

//immediate scroll for user actions
const handleCustomSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (input.trim()) {
    handleSubmit(e);
    
    // Immediate scroll when user sends a message
    setTimeout(() => {
      scrollToBottom("smooth");
    }, 50);
  }
};

  
const cleanForVisibility = (raw: string): string => {
  return String(raw || "")
    .replace(/\\n/g, "\n")
    .replace(/\n\n/g, "\n\n")
    .replace(/\\$/gm, "")
    .replace(/^\d+:\{"toolCallId".*$/gm, "")
    .replace(/^\d+:\{.*?"saveProfile".*$/gm, "")
    .replace(/\{"toolCallId":.*?\}/g, "")
    .replace(/["\\]+isContinued["\\]*:[ \t]*(true|false)[,\\}]+/gi, "")
    .replace(/\\{2,}/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/[\\}{]+$/, "")
    .replace(/\s*\[(?:Phase|PHASE) \d+\]\s*/g, "")
    .replace(/\s*\[(?:ONGOING|EXPLORATION|ACTION_PLANNING|GOAL_SETTING|INTRODUCTION)_PHASE\]\s*/g, "")
    .replace(/\s*\[UPDATED_GOALS\]\s*/g, "")
    .replace(/```json[\s\S]*?```/g, "")
    .replace(
      /Here's what I know about you so far:[\s\S]*?(Let's|Now|I'll|Moving)/i,
      "$1"
    )
    .replace(
      /Based on our conversation, I've learned that:[\s\S]*?(Let's|Now|I'll|Moving)/i,
      "$1"
    )
    .replace(
      /Based on our conversation so far,[\s\S]*?(Let's|Now|I'll|Moving)/i,
      "$1"
    )
    .replace(
      /I've gathered the following information about you:[\s\S]*?(Let's|Now|I'll|Moving)/i,
      "$1"
    )
    .replace(/Your profile indicates[\s\S]*?(Let's|Now|I'll|Moving)/i, "$1")
  .replace(/[\s,]*\\?isContinued\\?(?:true|false)\b/gi, "")
  .replace(/[\s,]*isContinued\s*:?[\s]*(?:true|false)\b/gi, "")
    .trim();
};

const normalizeText = (s?: string) =>
  String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

const uiMessages = useMemo(() => {
  // clean + filter
  const cleaned = messages
    .filter((m) => m.role !== "system" && m.role !== "tool")
    .map((m) => {
      const content = String(m.content ?? "")
        .replace(/\[(?:Phase|PHASE) \d+\]/g, "")
        .replace(/\[(?:ONGOING|EXPLORATION|ACTION_PLANNING|GOAL_SETTING|INTRODUCTION)_PHASE\]/g, "")
        .replace(/```json[\s\S]*?```/g, "")
        .replace(/([^.?!\n]*?)?\s*[,;.\-–—]*\s*here('?s| is)?\s*a summary of your profile( based on what you('ve)? shared)?[:]?\s*/gi, "")
        .replace(/Here's what I know about you so far:[\s\S]*?(Let's|Now|I'll|Moving)/i, "$1")
        .replace(/Based on our conversation, I've learned that:[\s\S]*?(Let's|Now|I'll|Moving)/i, "$1")
        .replace(/Based on our conversation so far,[\s\S]*?(Let's|Now|I'll|Moving)/i, "$1")
        .replace(/I've gathered the following information about you:[\s\S]*?(Let's|Now|I'll|Moving)/i, "$1")
        .replace(/\[(?:INTRODUCTION)_PHASE\]/g, "")
        .trim()
        .replace(/\n\s*\n/g, "\n\n");

      return { ...m, content };
    })
    .filter((m) => {
      const t = (m.content ?? "").trim();
      // Only drop truly empty after cleaning; KEEP numbers, punctuation, and short acks
      const tVisible = cleanForVisibility(t);
      return Boolean(tVisible);
    })
    .reduce((acc: ChatMessage[], m: ChatMessage) => {
      // Drop duplicate assistant messages by comparing with the most recent assistant bubble
      if (m.role === "assistant") {
        for (let i = acc.length - 1; i >= 0; i--) {
          const prev = acc[i];
          if (prev.role !== "assistant") continue; // skip user/system
          const curN = normalizeText(m.content);
          const prevN = normalizeText(prev.content);
          if (curN && curN === prevN) {
            // Same assistant text as the last assistant bubble -> drop
            return acc;
          }
          break; // stop after checking the most recent assistant
        }
      }
      acc.push(m);
      return acc;
    }, []);

  // sort ONCE, consistently
  return cleaned.slice();
}, [messages]);

  // Handle welcome dialog dismissal
  // const handleWelcomeDismiss = async (dontShowAgain: boolean) => {
  //   if (user) {
  //     try {
  //       // Always attempt to save the preference to ensure proper state synchronization
  //       const response = await fetch("/api/user-preferences", {
  //         method: "POST",
  //         headers: {
  //           "Content-Type": "application/json",
  //         },
  //         body: JSON.stringify({
  //           hideWelcomeDialog: dontShowAgain,
  //         }),
  //       });

  //       if (response.ok) {
  //         // Update local state
  //         setUserProfile((prev) => ({
  //           ...prev,
  //           hideWelcomeDialog: dontShowAgain,
  //         }));

  //         // Log success to help with debugging
  //         console.log(
  //           `Welcome dialog preference saved: hideWelcomeDialog=${dontShowAgain}`
  //         );

  //         // Save to localStorage as backup
  //         try {
  //           localStorage.setItem(
  //             "user_hide_welcome_dialog",
  //             dontShowAgain ? "true" : "false"
  //           );
  //         } catch (localStorageError) {
  //           console.error(
  //             "Error saving preference to localStorage:",
  //             localStorageError
  //           );
  //         }
  //       } else {
  //         console.error("Error updating preferences:", await response.text());
  //         toast({
  //           title: "Error saving preference",
  //           description: "Your preference could not be saved at this time.",
  //           variant: "destructive",
  //         });
  //       }
  //     } catch (error) {
  //       console.error("Error updating preferences:", error);
  //       toast({
  //         title: "Error saving preference",
  //         description: "There was a problem connecting to the server.",
  //         variant: "destructive",
  //       });
  //     }
  //   }
  // };
  // Handle welcome dialog dismissal
const handleWelcomeDismiss = async (dontShowAgain: boolean) => {
  // Try to persist preference, but do not block onboarding on failure
  try {
    if (user) {
      const response = await fetch("/api/user-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hideWelcomeDialog: dontShowAgain }),
      });

      if (response.ok) {
        // Update local state
        setUserProfile((prev) => ({
          ...prev,
          hideWelcomeDialog: dontShowAgain,
        }));

        console.log(
          `Welcome dialog preference saved: hideWelcomeDialog=${dontShowAgain}`
        );

        // LocalStorage backup
        try {
          localStorage.setItem(
            "user_hide_welcome_dialog",
            dontShowAgain ? "true" : "false"
          );
        } catch (localStorageError) {
          console.error("Error saving preference to localStorage:", localStorageError);
        }
      } else {
        console.error("Error updating preferences:", await response.text());
        toast?.({
          title: "Error saving preference",
          description: "Your preference could not be saved right now.",
          variant: "destructive",
        });
      }
    }
  } catch (error) {
    console.error("Error updating preferences:", error);
    toast?.({
      title: "Error saving preference",
      description: "There was a problem connecting to the server.",
      variant: "destructive",
    });
  } finally {
    // Always move user to Bot Preferences (onboarding step)
    // Use this query flag so BotPreferences knows it's onboarding
    router.push("/app/bot-preferences?fromOnboarding=1");
  }
};




  // // After loading messages, detect the current phase and sync with currentStage
  // useEffect(() => {
  //   if (messages.length > 0) {
  //     // Use the current stage detection logic to ensure consistency
  //     const detectedStage = messages.some(
  //       (m) =>
  //         m.content.includes("[Phase 3]") ||
  //         m.content.includes("[PHASE 3]") ||
  //         m.content.includes("[ACTION_PLANNING_PHASE]") ||
  //         m.content.includes("[ONGOING_PHASE]")
  //     )
  //       ? "action_planning"
  //       : messages.some(
  //           (m) =>
  //             m.content.includes("[Phase 2]") ||
  //             m.content.includes("[PHASE 2]") ||
  //             m.content.includes("[EXPLORATION_PHASE]")
  //         )
  //       ? "exploration"
  //       : messages.some(
  //           (m) =>
  //             m.content.includes("goal") &&
  //             (m.content.includes("SMART") ||
  //               m.content.includes("specific") ||
  //               m.content.includes("measurable") ||
  //               m.content.includes("achievable") ||
  //               m.content.includes("relevant") ||
  //               m.content.includes("time-bound") ||
  //               m.content.includes("Let's set a goal") ||
  //               m.content.includes("Let's establish a goal"))
  //         )
  //       ? "goal_setting"
  //       : "introduction";

  //     // Update the phase state
  //     setCurrentPhase(detectedStage);

  //     // Save the detected phase to localStorage
  //     try {
  //       localStorage.setItem(STORAGE_KEY_PHASE, detectedStage);
  //     } catch (error) {
  //       console.error("Error saving phase to localStorage:", error);
  //     }

  //     // Log the detected stage
  //     console.log(
  //       `Stage detection: "${detectedStage}" (from message analysis)`
  //     );
  //   }
  // }, [messages]);

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

 //helper

const saveToLocalStorageImmediate = useCallback(() => {
  if (!currentSession?.id) return;
  try {
    const nonSystem = messages.filter(m => m.role !== "system");
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(nonSystem));
    localStorage.setItem(STORAGE_KEY_SESSION, currentSession.id);
    if (currentPhase) localStorage.setItem(STORAGE_KEY_PHASE, currentPhase);
  } catch (err) {
    console.error("Failed to save to localStorage:", err);
  }
}, [messages, currentSession?.id, currentPhase]);

useEffect(() => {
  if (!user?.id || isLoading || !isMounted || messages.length === 0) return;
  
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role !== 'assistant') return;
  
  // Check raw content for phase markers (before MessageContent cleaning)
  const hasPhaseMarker = /\[(GOAL_SETTING_PHASE|ONGOING_PHASE|INTRODUCTION_PHASE|ACTION_PLANNING_PHASE)\]/.test(lastMessage.content);
  
  console.log("Checking for phase markers in:", lastMessage.content.substring(0, 200));
  console.log("Has phase marker:", hasPhaseMarker);
  
  if (!hasPhaseMarker) return;
  
  const timeoutId = setTimeout(async () => {
    try {
      const response = await fetch(`/api/user-profile?userId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.profile?.currentPhase && data.profile.currentPhase !== currentPhase) {
          console.log(`Phase updated: ${currentPhase} -> ${data.profile.currentPhase}`);
          setCurrentPhase(data.profile.currentPhase);
          localStorage.setItem(STORAGE_KEY_PHASE, data.profile.currentPhase);
        }
      }
    } catch (error) {
      console.error("Error syncing phase:", error);
    }
  }, 1000);

  return () => clearTimeout(timeoutId);
}, [messages.length, user?.id, isLoading, isMounted]);

useEffect(() => {
  if (typeof window === "undefined") return;

  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    try {
      // Always persist immediately
      saveToLocalStorageImmediate();

    // Try to push pending changes via sendBeacon (delta only)
    const session = currentSessionRef.current;
    if (session && !session.id.startsWith("temp-") && syncStatus.pendingChanges && isOnlineRef.current) {
      const base = stripEmptyAssistant(messages.filter((m) => m.role !== "system"));
      const withIndex = withStableIndexes(base);
      const delta = computeDelta(withIndex);
      if (delta.length > 0) {
        const payload = JSON.stringify({ messages: delta, currentPhase: currentPhaseRef.current });
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(`/api/sessions/${session.id}/messages`, blob);
      }

    }
  } catch {}
    if (syncStatus.pendingChanges) {
    e.preventDefault();
    e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
    return e.returnValue;
  }
  return undefined;
};


  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}, [messages, saveToLocalStorageImmediate, syncStatus.pendingChanges]);

useEffect(() => {
  if (typeof document === "undefined") return;

  const onHideOrPause = () => {
    try {
      saveToLocalStorageImmediate();
      debouncedSyncMessages.flush?.();
      if (!isStreamingRef.current) {
        // Don't start network sync on page hide; rely on beforeunload sendBeacon
        // and the next foreground resume to sync.
      } else {
        console.log("[Sync] Skipped visibility/pagehide sync (streaming)");
      }
    } catch (e) {
      console.warn("visibilitychange flush failed", e);
    }
  };

  document.addEventListener("visibilitychange", onHideOrPause);
  document.addEventListener("pagehide", onHideOrPause);
  return () => {
    document.removeEventListener("visibilitychange", onHideOrPause);
    document.removeEventListener("pagehide", onHideOrPause);
  };
}, [messages, saveToLocalStorageImmediate, debouncedSyncMessages]);

// Flush on component unmount (e.g., navigating away within the SPA)
useEffect(() => {
  return () => {
    try {
      saveToLocalStorageImmediate();
      debouncedSyncMessages.flush?.();
      const toSave = stripEmptyAssistant(latestMessagesRef.current.filter(m => m.role !== "system"));
      if (!isStreamingRef.current) {
  debouncedSyncMessages(toSave);
} else {
  console.log("[Sync] Skipped unmount sync (streaming)");
}
    } catch (e) {
      console.warn("unmount flush failed", e);
    }
  };
  // we intentionally depend only on stable callbacks
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [saveToLocalStorageImmediate, debouncedSyncMessages]);

const pathname = usePathname();
useEffect(() => {
  // When the route path changes, flush current state (cleanup of previous effect also runs)
  try {
    saveToLocalStorageImmediate();
    debouncedSyncMessages.flush?.();
    const toSave = stripEmptyAssistant(latestMessagesRef.current.filter(m => m.role !== "system"));
    if (!isStreamingRef.current) {
  debouncedSyncMessages(toSave);
} else {
  console.log("[Sync] Skipped routechange sync (streaming)");
}
  } catch (e) {
    console.warn("route-change flush failed", e);
  }
  // Cleanup will also run from the previous effect when the component unmounts
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pathname]);

// Pause server sync while tokens are streaming to avoid DB conflicts
const isStreamingRef = useRef(false);
// Prevent loops if a follow-up also ends up tool-only
const autoContinueGuardRef = useRef(false);

// Helper: build a cleaned transcript for follow-ups (only user/assistant, no tool acks or tool JSON)
const buildCleanTranscript = () => {
  return messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .filter(m => !(m.role === "assistant" && (m as any).meta?.toolAck))
    .map(m => ({
      role: m.role,
      content: String(m.content || "")
        .replace(/\[(?:UPDATED_GOALS|GOAL_SETTING_PHASE|ONGOING_PHASE|INTRODUCTION_PHASE|ACTION_PLANNING_PHASE)\]/g, "")
        .replace(/```json[\s\S]*?```/g, "")
        .replace(/\{\s*\"toolCallId\"[\s\S]*?\}/g, "")
        .replace(/\{[^{}]*\"saveProfile\"[^{}]*\}/g, "")
        .trim(),
    }));
};

// Request a natural follow-up assistant message when a turn was tool-only.
const autoContinueFollowUp = useCallback(async (baseIndex: number) => {
  if (sawSaveProfileThisTurnRef.current) {
    // Avoid follow-up loops when a tool-only save happened
    autoContinueGuardRef.current = false;
    return;
  }
  if (autoContinueGuardRef.current) return; // avoid chaining loops
  autoContinueGuardRef.current = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          ...buildCleanTranscript(),
          {
            role: "system",
            content:
              "Continue the conversation with ONE concise, user-facing message. Do not include JSON or ANY tool calls. If you called saveProfile previously in this turn, DO NOT call it again.",
          },
        ],
        userId: user?.id,
        sessionId: currentSession?.id,
        autoContinue: true, // optional flag if the server supports it
      }),
    });

    if (!response.ok) {
      // On failure we stay silent; user can type next
      return;
    }

    if (!response.body) return;

    let assistantMessageId: string | null = null;
    let assistantText = "";

    await streamReader(response.body, (fullTextSoFar: string) => {
      const visible = String(fullTextSoFar || "").trim();
      if (!visible) return;

      if (!assistantMessageId) {
        // Reuse the active ack bubble if present to prevent a second assistant bubble
        const reuseId = toolAckIdRef.current;
        assistantMessageId = reuseId || `msg-${Date.now()}-asst`;
        assistantText = visible;

        const initialAssistant: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: visible,
          messageIndex: baseIndex + 1,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => {
          if (reuseId) {
            return prev.map((m) => (m.id === reuseId ? initialAssistant : m));
          }
          return [...prev, initialAssistant];
        });
        if (!reuseId) rawBufferRef.current.push(initialAssistant);
        streamProducedVisibleRef.current = true;
        return;
      }

      assistantText = visible;
      const updatedMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: assistantText,
        messageIndex: baseIndex + 1,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMessageId ? updatedMessage : m))
      );
      rawBufferRef.current = rawBufferRef.current.map((m) =>
        m.id === assistantMessageId ? updatedMessage : m
      );
    });
    finalizeToolAck();
    sawSaveProfileThisTurnRef.current = false;
    streamProducedVisibleRef.current = false;
    if (autoContinueGuardRef.current) {
      setTimeout(() => saveToLocalStorageImmediate(), 0);
    }
  } catch {
    // swallow; UX falls back to waiting for user
  } finally {
    autoContinueGuardRef.current = false;
  }
}, [messages, user?.id, currentSession?.id, saveToLocalStorageImmediate, onToolCallHandler, finalizeToolAck]);


// const handleSubmit = async (e: React.FormEvent) => {
//   e.preventDefault();
//   if (!input.trim() || isLoading) return;

//   // Compute next two indexes
//   const baseIndex = nextLocalIndex(messages);

//   // User message with stable index
//   const userMessage: ChatMessage = {
//     id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
//     role: "user",
//     content: input.trim(),
//     messageIndex: baseIndex,
//     createdAt: new Date().toISOString(),
//   };

//   // // Assistant placeholder with next index
//   // const assistantMessageId = `msg-${Date.now()}-asst`;
//   // const assistantPlaceholder: ChatMessage = {
//   //   id: assistantMessageId,
//   //   role: "assistant",
//   //   content: "",
//   //   messageIndex: baseIndex + 1,
//   //   createdAt: new Date().toISOString(),
//   // };

//   // // Optimistic UI + cache
//   // setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
//   // rawBufferRef.current.push(userMessage, assistantPlaceholder);
//     // Optimistic UI: push only the USER message.
//   setMessages((prev) => [...prev, userMessage]);
//   rawBufferRef.current.push(userMessage);

//   setTimeout(() => saveToLocalStorageImmediate(), 0);
//   // We'll create the assistant message lazily on first visible token.
//   let assistantMessageId: string | null = null;
//   let assistantText = "";

//   setInput("");
//   setIsLoading(true);

//   try {
//     // Non-chat side-effect: goal progress (keep this)
//     await fetch("/api/goals/progress", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ messageContent: userMessage.content }),
//     });

//     const smallTranscript = [...messages, userMessage]
//   .filter(m => (m.role === "user" || m.role === "assistant"))
//   .filter(m => (m.content ?? "").trim() !== "")
//   .slice(-30);

//     // Ask backend to generate the reply (no DB writes here)
//     // const response = await fetch("/api/chat", {
//     //   method: "POST",
//     //   headers: { "Content-Type": "application/json" },
//     //   body: JSON.stringify({
//     //     messages: [...messages, userMessage],
//     //     userId: user?.id,
//     //     sessionId: currentSession?.id,
//     //   }),
//     // });


// const response = await fetch("/api/chat", {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     messages: smallTranscript,
//     userId: user?.id,
//     sessionId: currentSession?.id,
//   }),
// });

// const serverPhase = response.headers.get("X-Current-Phase");
// if (serverPhase && serverPhase !== currentPhase) {
//   console.log(`Phase updated from server: ${currentPhase} -> ${serverPhase}`);
//   setCurrentPhase(serverPhase);
//   localStorage.setItem(STORAGE_KEY_PHASE, serverPhase);
// }

//     if (!response.ok) {
//       const errorText =
//         (await response.text()) || "Sorry, something went wrong.";
//       const errorId = `msg-${Date.now()}-asst-error`;
//       const errorMessage: ChatMessage = {
//         id: errorId,
//         role: "assistant",
//         content: errorText,
//         messageIndex: baseIndex + 1,
//         createdAt: new Date().toISOString(),
//       };

//       // // Update the placeholder with the error
//       // setMessages((prev) =>
//       //   prev.map((m) => (m.id === assistantMessageId ? errorMessage : m))
//       // );
//       // rawBufferRef.current = rawBufferRef.current.map((m) =>
//       //   m.id === assistantMessageId ? errorMessage : m
//       // );
//       // Append a new assistant error message (no placeholder to update)
//       setMessages((prev) => [...prev, errorMessage]);
//       rawBufferRef.current.push(errorMessage);

//       // Cache immediately; debounced sync will handle persistence
//       setTimeout(() => saveToLocalStorageImmediate(), 0);
//       setIsLoading(false);
//       return;
//     }

//     // Stream assistant text into the same placeholder
//     if (response.body) {
//       const stream = response.body;
//       // let finalAssistantMessage: ChatMessage | null = null;

//       // --- tool ack state ---
//       toolAckIdRef.current = null;
//       lastToolKindRef.current = null;

//          await streamReader(
//         stream,
//         (fullTextSoFar: string) => {
//           const visible = String(fullTextSoFar || "").trim();
//           if (!visible) {
//             return; // do not create/update bubbles for tool-only or whitespace chunks
//           }

//           // Lazily create the assistant message on first visible token
//           if (!assistantMessageId) {
//             assistantMessageId = `msg-${Date.now()}-asst`;
//             assistantText = visible;

//             const initialAssistant: ChatMessage = {
//               id: assistantMessageId,
//               role: "assistant",
//               content: visible,
//               messageIndex: baseIndex + 1,
//               createdAt: new Date().toISOString(),
//             };

//             setMessages((prev) => [...prev, initialAssistant]);
//             rawBufferRef.current.push(initialAssistant);
//             return;
//           }

//           // Subsequent chunks: update the same assistant message
//           assistantText = visible;
//           const updatedMessage: ChatMessage = {
//             id: assistantMessageId,
//             role: "assistant",
//             content: assistantText,
//             messageIndex: baseIndex + 1,
//             createdAt: new Date().toISOString(),
//           };

//                     setMessages((prev) =>
//             prev.map((m) => (m.id === assistantMessageId ? updatedMessage : m))
//           );
//           rawBufferRef.current = rawBufferRef.current.map((m) =>
//             m.id === assistantMessageId ? updatedMessage : m
//           );
//         },
//         // onToolCall → insert optimistic ack immediately when saveProfile is detected
//         (toolName: string, payload?: any) => {
//           if (toolName !== "saveProfile") return;
//           if (toolAckIdRef.current) return; // already acked for this turn
//           const kind = inferToolKind(payload, currentPhase);
//           lastToolKindRef.current = kind;
//           toolAckIdRef.current = insertAssistant(ackFor(kind), { kind: "ack", tool: toolName, inferred: kind });
//         }
//       );



//       // Ensure cache reflects the final streamed content
//             // Persist only if an assistant message with visible text was created
//       if (assistantMessageId) {
//         setTimeout(() => saveToLocalStorageImmediate(), 0);
//       }
//       // If the turn was tool-only, immediately request a natural follow-up message
//       if (!assistantMessageId) {
//                 if (toolAckIdRef.current) {
//           const kind = lastToolKindRef.current || "save_profile_generic";
//           setTimeout(() => {
//             const ackId = toolAckIdRef.current;
//             setMessages(prev => {
//               const hasRealAssistantAfterAck = prev.slice().reverse().some(
//                 m => m.role === "assistant" && m.id !== ackId && !(m as any)?.meta?.kind
//               );
//               if (hasRealAssistantAfterAck) return prev;
//               return [
//                 ...prev,
//                 {
//                   id: `done-${Date.now()}`,
//                   role: "assistant" as const,
//                   content: doneFor(kind),
//                   createdAt: new Date().toISOString(),
//                   meta: { kind: "completion", tool: "saveProfile", inferred: kind },
//                 },
//               ];
//             });
//             setSyncStatus(p => ({ ...p, pendingChanges: true }));
//           }, 700);
//         }
//         await autoContinueFollowUp(baseIndex);
//       }
//     }
//   } catch (error) {
//     const errorText = "Network error. Please try again.";
//     const errorId = `msg-${Date.now()}-asst-error`;
//     const errorMessage: ChatMessage = {
//             id: errorId,
//       role: "assistant",
//       content: errorText,
//             messageIndex: baseIndex + 1,
//       createdAt: new Date().toISOString(),
//     };

//     // setMessages((prev) =>
//     //   prev.map((m) => (m.id === assistantMessageId ? errorMessage : m))
//     // );
//     // rawBufferRef.current = rawBufferRef.current.map((m) =>
//     //   m.id === assistantMessageId ? errorMessage : m
//     // );

//     // Cache immediately; debounced sync will persist later
//         setMessages((prev) => [...prev, errorMessage]);
//     rawBufferRef.current.push(errorMessage);
//     setTimeout(() => saveToLocalStorageImmediate(), 0);
//   } finally {
//     setIsLoading(false);
//   }
// };

// 1. Add this at the very beginning of your handleSubmit function

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!input.trim() || isLoading) return;

  const baseIndex = nextLocalIndex(messages);
  const userMessage: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    role: "user",
    content: input.trim(),
    messageIndex: baseIndex,
    createdAt: new Date().toISOString(),
  };

  setMessages((prev) => [...prev, userMessage]);
  rawBufferRef.current.push(userMessage);
  setTimeout(() => saveToLocalStorageImmediate(), 0);

  if (currentSession?.id && !currentSession.id.startsWith("temp-") && user) {
  const allMsgs = withStableIndexes(
    stripEmptyAssistant([...messages, userMessage].filter(m => m.role !== "system"))
  );
  const toSync = allMsgs.filter(m =>
    typeof m.messageIndex === "number" &&
    (m.messageIndex as number) > lastSyncedIndexRef.current
  );
  if (toSync.length > 0) {
    fetch(`/api/sessions/${currentSession.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: toSync, currentPhase }),
      credentials: "same-origin",
    }).then(async (res) => {
      if (res.ok) {
        lastSyncedIndexRef.current = userMessage.messageIndex as number;
        try {
          localStorage.setItem(STORAGE_KEY_LAST_INDEX, String(userMessage.messageIndex));
        } catch {}
      }
    }).catch(e => console.warn("[UserMsgSync] failed", e));
  }
}



  let assistantMessageId: string | null = null;
  let assistantText = "";

  setInput("");
  setIsLoading(true);
  isStreamingRef.current = true; 

  try {
    await fetch("/api/goals/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageContent: userMessage.content }),
    });

    const smallTranscript = [...messages, userMessage]
      .filter(m => (m.role === "user" || m.role === "assistant"))
      .filter(m => (m.content ?? "").trim() !== "")
      .slice(-30);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: smallTranscript,
        userId: user?.id,
        sessionId: currentSession?.id,
      }),
    });

    const serverPhase = response.headers.get("X-Current-Phase");
    if (serverPhase && serverPhase !== currentPhase) {
      setCurrentPhase(serverPhase);
      localStorage.setItem(STORAGE_KEY_PHASE, serverPhase);
    }

    if (!response.ok) {
      const errorText = (await response.text()) || "Sorry, something went wrong.";
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-asst-error`,
        role: "assistant",
        content: errorText,
        messageIndex: baseIndex + 1,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, errorMessage]);
      rawBufferRef.current.push(errorMessage);
      setTimeout(() => saveToLocalStorageImmediate(), 0);
      return;
    }

    if (!response.body) return;

    const stream = response.body;
    toolAckIdRef.current = null;
    lastToolKindRef.current = null;

   
    // await streamReader(
    //   stream,
    //   (fullTextSoFar: string) => {
    //     const visible = String(fullTextSoFar || "").trim();
    //     if (!visible) return;

    //     if (!assistantMessageId) {
    //       assistantMessageId = `msg-${Date.now()}-asst`;
    //       assistantText = visible;

    //       const initialAssistant: ChatMessage = {
    //         id: assistantMessageId,
    //         role: "assistant",
    //         content: visible,
    //         messageIndex: baseIndex + 1,
    //         createdAt: new Date().toISOString(),
    //       };

    //       setMessages((prev) => [...prev, initialAssistant]);
    //       rawBufferRef.current.push(initialAssistant);
    //       return;
    //     }

    //     assistantText = visible;
    //     const updatedMessage: ChatMessage = {
    //       id: assistantMessageId,
    //       role: "assistant",
    //       content: assistantText,
    //       messageIndex: baseIndex + 1,
    //       createdAt: new Date().toISOString(),
    //     };

    //     setMessages((prev) =>
    //       prev.map((m) => (m.id === assistantMessageId ? updatedMessage : m))
    //     );
    //     rawBufferRef.current = rawBufferRef.current.map((m) =>
    //       m.id === assistantMessageId ? updatedMessage : m
    //     );
    //   },
    //   onToolCallHandler
    // );
    
    await streamReader(
  stream,
  (fullTextSoFar: string) => {
    const visible = String(fullTextSoFar || "").trim();
    if (!visible) return;

    if (!assistantMessageId) {
      assistantMessageId = `msg-${Date.now()}-asst`;
      assistantText = visible;

      const initialAssistant: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: visible,
        messageIndex: baseIndex + 1,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, initialAssistant]);
      rawBufferRef.current.push(initialAssistant);
      
      // ADD THIS: Scroll when first chunk arrives
      requestAnimationFrame(() => {
        const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement;
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      });
      return;
    }

    assistantText = visible;
    const updatedMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: assistantText,
      messageIndex: baseIndex + 1,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) =>
      prev.map((m) => (m.id === assistantMessageId ? updatedMessage : m))
    );
    rawBufferRef.current = rawBufferRef.current.map((m) =>
      m.id === assistantMessageId ? updatedMessage : m
    );

    // ADD THIS: Scroll with each streaming chunk
    requestAnimationFrame(() => {
      const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement;
      if (viewport) {
        const isNearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
        if (isNearBottom) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      }
    });
  },
  onToolCallHandler
);
    finalizeToolAck();

    if (assistantMessageId) {
      setTimeout(() => saveToLocalStorageImmediate(), 0);
    }

  } catch (error) {
    const errorText = "Network error. Please try again.";
    const errorMessage: ChatMessage = {
      id: `msg-${Date.now()}-asst-error`,
      role: "assistant",
      content: errorText,
      messageIndex: baseIndex + 1,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, errorMessage]);
    rawBufferRef.current.push(errorMessage);
    setTimeout(() => saveToLocalStorageImmediate(), 0);
  }  finally {
    isStreamingRef.current = false;
    setIsLoading(false);
    
    setTimeout(async () => {
      await forceSyncMessages();
    }, 3000);
  }
};



  const SyncStatusIndicator = () => {
    let statusText = "Synced";
    let icon: ReactNode = null;

    if (!isOnline) {
      statusText = "Offline mode";
      icon = <WifiOff className="h-4 w-4 text-yellow-500" />;
    } else if (syncStatus.syncing) {
      statusText = "Syncing...";
      icon = <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    } else if (syncStatus.error) {
      statusText = "Sync error";
      icon = <AlertTriangle className="h-4 w-4 text-red-500" />;
    } else if (syncStatus.pendingChanges) {
      statusText = "Changes pending...";
      icon = <Cloud className="h-4 w-4 text-yellow-500" />;
    } else if (syncStatus.lastSyncedAt) {
      const lastSync = new Date(syncStatus.lastSyncedAt);
      statusText = `Synced at ${lastSync.toLocaleTimeString()}`;
      icon = <CheckCircle className="h-4 w-4 text-green-500" />;
    }

    // Create a proper handler function that calls forceSyncMessages
    const handleForceSyncClick = (e: React.MouseEvent) => {
      e.preventDefault();
      toast({
        title: "Sync started",
        description: "Attempting to sync messages...",
      });
      forceSyncMessages();
    };

    return (
      <div className="flex items-center text-xs text-muted-foreground gap-1 mt-1">
        {icon}
        <span>{statusText}</span>
        {syncStatus.error && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={handleForceSyncClick}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        )}
      </div>
    );
  };

  // Add this new useEffect after the other useEffects in the component
  useEffect(() => {
    // Only run this if we have a user and we're in the action_planning phase
    if (user?.id && currentPhase === "action_planning" && !isLoadingMessages) {
      // Check if all goals are completed
      const checkGoals = async () => {
        const completed = await checkAllGoalsCompleted();
        
        if (
          completed &&
          !messages.some(
            (m) =>
              m.content.includes(
                "Congratulations on completing all your goals"
              ) || m.content.includes("[GOAL_SETTING_PHASE]")
          )
        ) {
          // Create a congratulatory message that will trigger moving to goal setting phase
          const congratsMessage: ChatMessage = {
            id: `msg-${Date.now()}-system-allgoals`,
            role: "assistant",
            content: `[GOAL_SETTING_PHASE] Congratulations on completing all your goals! 🎉 This is a significant achievement in your mental health journey. Taking time to reflect on this accomplishment can help reinforce positive behaviors and boost your confidence.

What would you like to focus on next? I'm here to help you set new mental health goals that build on your success. Would you like to:

1. Create a new goal in a similar area to continue your progress?
2. Work on a different aspect of your mental health?
3. Develop a maintenance strategy for the improvements you've already made?

Let's talk about what you'd like to work on next.`,
          };

          // Add the message
          setMessages((prev) => [...prev, congratsMessage]);

          // Set the phase to goal_setting
          setCurrentPhase("goal_setting");
          try {
            localStorage.setItem(STORAGE_KEY_PHASE, "goal_setting");
          } catch (error) {
            console.error("Error saving phase to localStorage:", error);
          }

          // Save the messages including this new system message
          if (currentSession?.id) {
            try {
              await fetch(`/api/sessions/${currentSession.id}/messages`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  messages: [...messages, congratsMessage],
                  currentPhase: "goal_setting",
                }),
              });
            } catch (error) {
              console.error("Error saving all-goals-completed message:", error);
            }
          }
        }
      };

      checkGoals();
    }
  }, [user?.id, currentPhase, messages, isLoadingMessages, currentSession?.id]);

  //to check for existing assessments when user loads the chat
  useEffect(() => {
    const checkPreviousAssessments = async () => {
      if (isLoaded && user) {
        try {
          const response = await fetch(`/api/assessment/who5?limit=1`);
          if (response.ok) {
            const data = await response.json();
            if (data.assessments && data.assessments.length > 0) {
              // Set the date of the most recent assessment
              setLastAssessmentDate(new Date(data.assessments[0].createdAt));
              // Set the count of assessments taken
              setAssessmentCount(data.assessments.length);
            }
          }
        } catch (error) {
          console.error("Error checking previous assessments:", error);
        }
      }
    };

    if (isMounted) {
      checkPreviousAssessments();
    }
  }, [isLoaded, user, isMounted]);

  //added useEffect to sync messages when currentSession changes
useEffect(() => {
  if (
    currentSession &&
    !currentSession.id.startsWith("temp-") &&
    rawBufferRef.current.length > 0 &&
    newlyCreatedRef.current  // ADD THIS CHECK
  ) {
    console.log("New session available. Syncing cached messages...");
    newlyCreatedRef.current = false;  // ADD THIS - prevent repeat fires
    forceSyncMessages(stripEmptyAssistant(rawBufferRef.current));
  }
}, [currentSession]);

  const handleAssessmentComplete = (score: number, interpretation: string) => {
    // Update the local state
    setLastAssessmentDate(new Date());
    setAssessmentCount((prev) => prev + 1);


    const assessmentMessage: ChatMessage = {
      id: `msg-${Date.now()}-system-assessment`,
      role: "assistant",
      content: `I notice you've completed a well-being assessment. Your current well-being score is ${score}/100, which indicates a ${interpretation} level of well-being. ${
        interpretation === "poor" || interpretation === "low"
          ? "Would you like to discuss some strategies to improve your well-being?"
          : "That's great! Would you like to discuss how to maintain or further improve your well-being?"
      }`,
    };

    // Add the message to the chat
    setMessages((prev) => [...prev, assessmentMessage]);

    // Save to database
    if (currentSession?.id) {
      saveMessagesToDatabase([...messages, assessmentMessage]);
    }
  };


  const checkForCompletedGoal = (messageContent: string) => {
    // Check for phrases that indicate goal completion
    const completionPhrases = [
      "goal completed",
      "goal accomplished",
      "completed your goal",
      "achieved your goal",
      "finished your goal",
      "accomplished your goal",
      "completed successfully",
    ];

    
    const mentionsCompletion = completionPhrases.some((phrase) =>
      messageContent.toLowerCase().includes(phrase)
    );

    if (mentionsCompletion) {
      
      const sentences = messageContent.split(/[.!?]+/);
      for (const sentence of sentences) {
        if (
          completionPhrases.some((phrase) =>
            sentence.toLowerCase().includes(phrase)
          )
        ) {

          const goalSentence = sentences.find(
            (s) =>
              s.toLowerCase().includes("goal") &&
              !completionPhrases.some((p) => s.toLowerCase().includes(p))
          );

          if (goalSentence) {

            const goalDesc = goalSentence
              .trim()
              .replace(/^your goal (was|is|to) /i, "");
            setCompletedGoalDescription(goalDesc);
            setShowGoalFeedback(true);
            return;
          }
        }
      }

      // Fallback - use part of the completion message if we couldn't extract the goal
      setCompletedGoalDescription("your recent goal");
      setShowGoalFeedback(true);
    }
  };

  if (
    !isLoaded ||
    !user ||
    !isMounted ||
    isLoadingMessages
  ) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Update the currentStage detection logic to handle more phase formats with specific sub-phases
  const currentStage =
    messages.length > 0 &&
    messages.some(
      (m) =>
        m.content.includes("[Phase 3]") ||
        m.content.includes("[PHASE 3]") ||
        m.content.includes("[ACTION_PLANNING_PHASE]") ||
        m.content.includes("[ONGOING_PHASE]") // Recognize ONGOING_PHASE as action_planning
    )
      ? "action_planning"
      : messages.length > 0 &&
        messages.some(
          (m) =>
            m.content.includes("[Phase 2]") ||
            m.content.includes("[PHASE 2]") ||
            m.content.includes("[EXPLORATION_PHASE]")
        )
      ? "exploration"
      : messages.length > 0 &&
        messages.some(
          (m) =>
            m.content.includes("goal") &&
            (m.content.includes("SMART") ||
              m.content.includes("specific") ||
              m.content.includes("measurable") ||
              m.content.includes("achievable") ||
              m.content.includes("relevant") ||
              m.content.includes("time-bound") ||
              m.content.includes("Let's set a goal") ||
              m.content.includes("Let's establish a goal"))
        )
      ? "goal_setting"
      : "introduction";


  const getStageDisplayName = (stage: string) => {
    switch (stage) {
      case "introduction":
        return "Introduction";
      case "goal_setting":
        return "Goal Setting";
      case "exploration":
        return "Exploration";
      case "action_planning":
        return "Active Coaching";
      default:
        return (
          stage.charAt(0).toUpperCase() + stage.slice(1).replace(/_/g, " ")
        );
    }
  };

  const fixSmartGoalNumbering = (content: string): string => {
    // Clean trailing backslashes and JSON metadata
    const cleanedContent = content
      .replace(/\\$/gm, "") // Remove trailing backslashes
      .replace(/,"isContinued":(false|true)}}$/g, "") 
      .replace(/\s*{.*"isContinued":(false|true).*}$/g, ""); 

    // Original numbering fixes
    return cleanedContent.replace(
      /^(\d+)\.\s+/gm,
      (match, number) => `${number}. `
    );
  };

  

  return (
    <>
      {!isLoadingProfile && (
        <WelcomeDialog
          userProfile={userProfile}
          onDismiss={handleWelcomeDismiss}
        />
      )}

      <Card className="h-[75vh] flex flex-col">
        <CardHeader className="border-b p-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar
                className="h-8 w-8"
                key={`avatar-${botPreferences.botName}-${botPreferences.botImageUrl}`}
              >
                {botPreferences.botImageUrl ? (
                  <AvatarImage
                    src={botPreferences.botImageUrl}
                    alt={botPreferences.botName}
                  />
                ) : (
                  <AvatarImage src="/placeholder.svg?height=40&width=40" />
                )}
                <AvatarFallback>
                  {(botPreferences.botName || "A").charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span>{botPreferences.botName} - Wellbeing Coach</span>
            </div>

            {/* Display current coaching stage using the userProfile state */}
            <div className="text-sm font-normal text-muted-foreground">
              Stage: {getStageDisplayName(currentPhase)}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">

        <ScrollArea ref={scrollAreaRef}  className="flex-1 h-full">
          <div className="space-y-4 p-4">
            {uiMessages.map((message, index) => {
              const raw = message.role === "assistant"
                ? fixSmartGoalNumbering(message.content)
                : message.content;

              const visibleText = cleanForVisibility(raw);
              if (!visibleText) return null; // don't render an empty bubble

              return (
                <div
                  key={message.id ?? `msg-${message.messageIndex ?? "x"}-${index}`}
                  className={cn(
                    "flex flex-col rounded-lg p-4 overflow-hidden w-fit",
                    message.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground max-w-[80%] md:max-w-[70%]"
                      : "mr-auto bg-muted max-w-[90%] md:max-w-[80%]"
                  )}
                >
                  <div className="space-y-2 w-full">
                    <MessageContent content={visibleText} />
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
          <form
            onSubmit={handleCustomSubmit}
            className="border-t p-3 bg-background"
          >
            <div className="flex gap-3">
              <Textarea
                value={input}
                onChange={handleInputChange}
                placeholder="Type your message..."
                className="min-h-12 resize-none"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) {
                      handleSubmit(e);
                      // Immediate scroll when user sends a message
                      setTimeout(() => {
                        if (messagesEndRef.current) {
                          messagesEndRef.current.scrollIntoView({
                            behavior: "smooth",
                            block: "end",
                          });
                        }
                      }, 50);
                    }
                  }
                }}
              />
              <Button type="submit" size="icon" disabled={isLoading}>
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Disclaimer message */}
      <div className="mt-4 text-center text-sm text-muted-foreground">
        Wellbeing Chatbot could make mistakes. Please use with discretion.
      </div>

      <div className="hidden">
        {/* This div is not displayed but helps with the linter */}
        {aiUserProfile && JSON.stringify(aiUserProfile).length > 0 && (
          <span>Current profile information is available</span>
        )}
      </div>

      <SyncStatusIndicator />

      {/* Goal Feedback Dialog */}
      <GoalFeedbackDialog
        isOpen={showGoalFeedback}
        onClose={() => setShowGoalFeedback(false)}
        goalDescription={completedGoalDescription}
        sessionId={currentSession?.id}
      />

      {/* WHO-5 Assessment Dialog */}
      <WHO5Assessment
        isOpen={showWHO5Assessment}
        onClose={() => setShowWHO5Assessment(false)}
        sessionId={currentSession?.id}
        onComplete={handleAssessmentComplete}
      />
    </>
  );
}