import type { NextRequest } from "next/server"
import { streamText } from "ai"
import { openai } from "@ai-sdk/openai"
import { prisma, withRetry, initDatabase } from "@/lib/db/prisma"
import {mergeProfiles } from "@/lib/profile-extractor"
import { auth } from "@clerk/nextjs/server"
import { UserProfile } from "@prisma/client";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Type definition for message structure
interface ChatMessage {
    role: string;
    content: string;
    id?: string;
}

// Type definition for user profile data
interface UserProfileData {
    demographic?: Record<string, unknown>;
    personality_traits?: Record<string, unknown>;
    mental_health_profile?: Record<string, unknown>;
    challenges?: Record<string, unknown> | null;
    goals?: Record<string, unknown> | null;
    mental_health_goals?: Array<Record<string, unknown>>;
    commStyle?: Record<string, unknown> | null;
    feedback?: Record<string, unknown> | null;
    emotional_state?: unknown;
    age?: number | null;
    gender?: string | null;
    collegeYear?: string | null;
    major?: string | null;
    openMindedness?: number | null;
    conscientiousness?: number | null;
    extraversion?: number | null;
    agreeableness?: number | null;
    neuroticism?: number | null;
    emotionalAwareness?: string | null;
    copingStrategies?: string | null;
    motivationType?: string | null;
    id?: string;
    userId?: string;
    hideWelcomeDialog?: boolean | null;
    createdAt?: string;
    updatedAt?: string;
    [key: string]: unknown;
}

// Add JsonValue type definition to handle Prisma's JSON fields
type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [Key in string]?: JsonValue };
type JsonArray = JsonValue[];

// Initialize database connection
let dbInitialized = false

// Define the coaching phases
type CoachingPhase = "introduction" | "goal_setting" | "ongoing_conversation" | "bevs"

const COACH_NAME = "Taylor"
const COACH_GENDER = "Female"
// === BEVS constants ===
const BEVS_DOMAINS = ["Work/Studies", "Relationships", "Personal Growth/Health", "Leisure"] as const;
const BEVS_SCALE_MIN = 1;
const BEVS_SCALE_MAX = 7;
type BevsDomain = typeof BEVS_DOMAINS[number];


function safeErrorLog(message: string, error: unknown) {
    if (error instanceof Error) {
        console.error(message, error.message, error.stack)
    } else if (error === null) {
        console.error(message, "Error object is null")
    } else {
        console.error(message, String(error))
    }
}

// Get user profile from database
async function getUserProfile(userId: string) {
    if (!userId) {
        console.error("Cannot get user profile: userId is required")
        return null
    }

    try {
        console.log(`Fetching user profile for userId: ${userId}`)

        // First try to find the user profile directly with retry
        const profile = await withRetry(() =>
            prisma.userProfile.findUnique({
                where: { userId },
            }),
        )

        if (profile) {
            console.log(`Found profile for userId: ${userId}`)
            return profile
        }

        console.log(`No profile found for userId: ${userId}, checking if user exists`)

        // If no profile exists, check if the user exists with retry
        const user = await withRetry(() =>
            prisma.user.findUnique({
                where: { id: userId },
            }),
        )

        // If user doesn't exist, create one with retry
        if (!user) {
            console.log(`User ${userId} doesn't exist, creating new user`)
            await withRetry(() =>
                prisma.user.create({
                    data: {
                        id: userId,
                    },
                }),
            )
            console.log(`Created new user for userId: ${userId}`)
        } else {
            console.log(`User ${userId} exists but has no profile`)
        }

        return null
    } catch (error) {
        safeErrorLog(`Error getting user profile for userId ${userId}:`, error)
        return null
    }
}


// Put these helpers near the top (once)
const ALLOWED_GENDERS = new Set(["female", "male", "nonbinary", "unspecified"]);
function normalizeGender(g?: unknown) {
  const v = String(g ?? "").toLowerCase();
  return ALLOWED_GENDERS.has(v) ? v : "unspecified";
}
function bucketCollegeYear(y?: unknown) {
  const n = Number(y);
  if (!Number.isFinite(n)) return "unknown";
  if (n <= 1) return "1";
  if (n === 2) return "2";
  if (n === 3) return "3";
  return "4+";
}

function mapProfileToPrismaSchema(profileData: UserProfileData): Record<string, unknown> {
  const mappedData: Record<string, unknown> = {};

  // 1) DEMOGRAPHICS (accept nested or top-level → flatten to columns)
  const demo = (profileData.demographic ?? {}) as Record<string, unknown>;
  const ageVal =
    (profileData as any).age ?? demo.age;
  const genderVal =
    (profileData as any).gender ?? demo.gender;
  const collegeYearVal =
    (profileData as any).collegeYear ??
    (profileData as any).college_year ??
    demo.collegeYear ??
    (demo as any).college_year;
  const majorVal =
    (profileData as any).major ?? demo.major;

  if (ageVal !== undefined && ageVal !== null && String(ageVal).trim() !== "") {
    const n = Number.parseInt(String(ageVal), 10);
    if (Number.isFinite(n)) mappedData.age = n;
  }
  if (genderVal !== undefined && genderVal !== null) {
    mappedData.gender = normalizeGender(genderVal);
  }
  if (collegeYearVal !== undefined && collegeYearVal !== null) {
    mappedData.collegeYear = bucketCollegeYear(collegeYearVal);
  }
  if (majorVal !== undefined && majorVal !== null) {
    mappedData.major = String(majorVal);
  }

  // 2) PERSONALITY (→ numeric columns)
  const traits = (profileData.personality_traits ?? {}) as Record<string, unknown>;
  if (traits.openMindedness !== undefined) mappedData.openMindedness = parseTraitToFloat(String(traits.openMindedness));
  if (traits.conscientiousness !== undefined) mappedData.conscientiousness = parseTraitToFloat(String(traits.conscientiousness));
  if (traits.extraversion !== undefined) mappedData.extraversion = parseTraitToFloat(String(traits.extraversion));
  if (traits.agreeableness !== undefined) mappedData.agreeableness = parseTraitToFloat(String(traits.agreeableness));
  if (traits.neuroticism !== undefined) mappedData.neuroticism = parseTraitToFloat(String(traits.neuroticism));

  // 3) MENTAL HEALTH PROFILE (→ top-level text columns)
  const mh = (profileData.mental_health_profile ?? {}) as Record<string, unknown>;
  if (mh.emotionalAwareness !== undefined) mappedData.emotionalAwareness = String(mh.emotionalAwareness);
  if (mh.copingStrategies !== undefined) mappedData.copingStrategies = String(mh.copingStrategies);
  if (mh.motivationType !== undefined) mappedData.motivationType = String(mh.motivationType);

  // 4) GOALS (JSON column)
  if (profileData.goals) mappedData.goals = profileData.goals;

  // 5) Other JSON columns present in your schema
  if (profileData.challenges) mappedData.challenges = profileData.challenges;
  if (profileData.commStyle) mappedData.commStyle = profileData.commStyle;
  if (profileData.feedback) mappedData.feedback = profileData.feedback;

  // 6) BEVS JSON blob
  if ((profileData as any).bevs) mappedData.bevs = (profileData as any).bevs;

  // IMPORTANT: do NOT set mappedData.demographic or mappedData.mental_health_profile
  return mappedData;
}

// Helper function to convert trait descriptions to float values
function parseTraitToFloat(trait: string): number | null {
    if (!trait) return null

    const lowerTrait = trait.toLowerCase()

    if (lowerTrait.includes("high")) return 0.8
    if (lowerTrait.includes("moderate to high")) return 0.7
    if (lowerTrait.includes("moderate")) return 0.5
    if (lowerTrait.includes("low to moderate")) return 0.3
    if (lowerTrait.includes("low")) return 0.2

    // If we can't determine, return a middle value
    return 0.5
}

// Save user profile to database
async function saveUserProfile(userId: string, profileData: UserProfileData) {
    try {
        const existingProfile = await getUserProfile(userId) || {
            goals: { mental_health_goals: [] }
        };
        console.log(`Saving profile for user: ${userId}`, profileData);

       
        // Specifically handle mental_health_goals if present
if (Array.isArray(profileData.mental_health_goals)) {
  console.log(
    "Found mental_health_goals array in profile data:",
    profileData.mental_health_goals
  );

  // Load existing goals into a mutable structure
  const goalsObj: { mental_health_goals: Array<Record<string, any>> } = {
    mental_health_goals: [],
  };

  if (existingProfile.goals) {
    try {
      const parsed =
        typeof existingProfile.goals === "string"
          ? JSON.parse(existingProfile.goals as unknown as string)
          : existingProfile.goals;

      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as any).mental_health_goals)
      ) {
        goalsObj.mental_health_goals = (parsed as any)
          .mental_health_goals as Array<Record<string, any>>;
      }
    } catch (e) {
      console.error("Error parsing existing goals:", e);
    }
  }

  // Helper for matching goals by description (case/space tolerant)
  const norm = (s?: unknown) =>
    String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

  // Merge/Upsert each incoming goal
  const nowIso = new Date().toISOString();

  for (const goal of profileData.mental_health_goals) {
    if (!goal) continue;

    const incomingDesc = norm(goal.description);
    if (!incomingDesc) continue; // skip if no description

    const idx = goalsObj.mental_health_goals.findIndex(
      (g) => norm(g.description) === incomingDesc
    );

    // Build a clean, normalized goal payload
    const incoming: Record<string, any> = {
      description: String(goal.description ?? ""),
      measures: String(goal.measures ?? ""),
      timeframe: String(goal.timeframe ?? ""),
      steps: Array.isArray(goal.steps) ? goal.steps : [],
      obstacles: Array.isArray(goal.obstacles) ? goal.obstacles : [],
      completed: Boolean(goal.completed === true),
      // IMPORTANT: preserve existing progress unless new value provided
      // If the model provided a numeric progress, use it; else keep old progress (default 0 if brand new)
      progress:
        typeof (goal as any).progress === "number"
          ? (goal as any).progress
          : undefined,
      lastUpdated: nowIso,
    };

    if (idx >= 0) {
      const prev = goalsObj.mental_health_goals[idx];

      goalsObj.mental_health_goals[idx] = {
        ...prev,
        ...incoming,
        // Preserve progress if not provided this time
        progress:
          incoming.progress !== undefined ? incoming.progress : prev.progress ?? 0,
        // If completed toggled, keep incoming; otherwise keep previous
        completed:
          typeof incoming.completed === "boolean"
            ? incoming.completed
            : Boolean(prev.completed),
        lastUpdated: nowIso,
      };
    } else {
      goalsObj.mental_health_goals.push({
        ...incoming,
        progress: incoming.progress !== undefined ? incoming.progress : 0,
      });
    }
  }

  console.log("Updated goals structure (merged):", goalsObj);

  // Hand off to Prisma mapping
  profileData.goals = goalsObj;

  // Optional: prevent accidental usage of raw array later
  // delete (profileData as any).mental_health_goals;
}

        // Map the profileData to our Prisma schema
        const profileMapForPrisma = mapProfileToPrismaSchema(profileData);

        // Now update the user profile in the database
        const updatedProfile = await prisma.userProfile.upsert({
            where: { userId },
            update: profileMapForPrisma,
            create: {
                userId,
                ...profileMapForPrisma,
            },
        });

        console.log("Successfully saved profile with goals:", updatedProfile.goals);
        return updatedProfile;
    } catch (error) {
        console.error("Error in saveUserProfile:", error);
        return null;
    }
}

const ProfileJsonSchema = z.object({
  demographic: z.object({
    age: z.union([z.string(), z.number()]).optional(),
    gender: z.string().optional(),
    collegeYear: z.string().optional(),
    major: z.string().optional(),
  }).partial().optional(),

  personality_traits: z.object({
    openMindedness: z.union([z.string(), z.number()]).optional(),
    conscientiousness: z.union([z.string(), z.number()]).optional(),
    extraversion: z.union([z.string(), z.number()]).optional(),
    agreeableness: z.union([z.string(), z.number()]).optional(),
    neuroticism: z.union([z.string(), z.number()]).optional(),
  }).partial().optional(),

  mental_health_profile: z.object({
    emotionalAwareness: z.string().optional(),
    copingStrategies: z.string().optional(),
    motivationType: z.string().optional(),
  }).partial().optional(),

  mental_health_goals: z.array(z.object({
    description: z.string().optional(),
    measures: z.string().optional(),
    timeframe: z.string().optional(),
    steps: z.array(z.string()).optional(),
    obstacles: z.array(z.string()).optional(),
    completed: z.boolean().optional(),
    progress: z.number().optional(),
  })).optional(),

  // allow extra keys without failing
  bevs: z.object({
  startedAt: z.string().optional(),       // ISO
  completedAt: z.string().optional(),     // ISO
  currentStep: z.enum(["intro","collect_values","collect_scores","confirm","done"]).optional(),
  domainIndex: z.number().int().min(0).max(3).optional(),
  // user-authored value statements per domain
  domains: z.array(z.object({
    domain: z.enum(["Work/Studies","Relationships","Personal Growth/Health","Leisure"]),
    valuesText: z.string().optional(),
    examples: z.array(z.string()).optional(),
  })).optional(),
  // history of 1–7 dartboard scores
  assessments: z.array(z.object({
    at: z.string(), // ISO
    scores: z.object({
      "Work/Studies": z.number().min(1).max(7).optional(),
      "Relationships": z.number().min(1).max(7).optional(),
      "Personal Growth/Health": z.number().min(1).max(7).optional(),
      "Leisure": z.number().min(1).max(7).optional(),
    }).partial(),
  })).optional(),
}).partial().optional(),
  _toolHint: z.string().default("save_profile_generic"),
}).partial();

// function determinePhase(messages: ChatMessage[], profile: UserProfileData | null): CoachingPhase {
//   const messageContent = messages.map((m) => m.content).join(" ");

//   // Goals (prefer nested, fallback top-level)
//   const nestedGoals = Array.isArray((profile as any)?.goals?.mental_health_goals)
//     ? ((profile as any).goals.mental_health_goals as Array<Record<string, unknown>>)
//     : [];
//   const topLevelGoals = Array.isArray((profile as any)?.mental_health_goals)
//     ? ((profile as any).mental_health_goals as Array<Record<string, unknown>>)
//     : [];
//   const mhGoals = nestedGoals.length ? nestedGoals : topLevelGoals;

//   // BEVS state
//   const bevs = (profile as any)?.bevs || {};
//   const bevsCompleted = Boolean(bevs?.completedAt);
//   const bevsStarted = Boolean(bevs?.startedAt) || Boolean(bevs?.currentStep);

//   // 1) If intro basics are NOT complete, stay in introduction
//   if (!profile || !isProfileComplete(profile)) {
//     return "introduction";
//   }

//   // 2) After intro: BEVS MUST run before goal setting (exactly once)
//   //    If BEVS not completed yet, route to BEVS (even if goals already exist).
//   if (!bevsCompleted) {
//     return "bevs";
//   }

//   // 3) (Redundant safety) If somehow BEVS was started but not finished, resume it
//   if (bevsStarted && !bevsCompleted) {
//     return "bevs";
//   }

//   // 4) Now that BEVS is satisfied, honor explicit markers
//   if (messageContent.includes("[GOAL_SETTING_PHASE]")) return "goal_setting";
//   if (messageContent.includes("[ONGOING_PHASE]")) return "ongoing_conversation";
//   if (messageContent.includes("[GOAL_SAVED_NOW]")) return "goal_setting";

//   // 5) Otherwise: ongoing if any goal incomplete; else goal_setting
//   const anyIncomplete = mhGoals.some((g) => (g as any)?.completed !== true);
//   if (anyIncomplete) {
//     return "ongoing_conversation";
//   }
//   return "goal_setting";
// }

function determinePhase(messages: ChatMessage[], profile: UserProfileData | null): CoachingPhase {

  const bevs = (profile as any)?.bevs || {};
  const bevsCompleted = Boolean(bevs?.completedAt);
  const bevsStarted = Boolean(bevs?.startedAt) || Boolean(bevs?.currentStep);

  if (!profile || !isProfileComplete(profile)) {
    return "introduction";
  }

  if (!bevsCompleted) {
    return "bevs";
  }


  if (bevsStarted && !bevsCompleted) {
    return "bevs";
  }

 
  return "ongoing_conversation";
}


function getHistory(messages: ChatMessage[], count = 8): string {
    return messages
        .filter((m) => m.role !== "system")
        .slice(-count)
        .map((m) => `${m.role === "assistant" ? "Coach" : "User"}: ${m.content}`)
        .join("\n")
}

// Check if a profile is complete
function isProfileComplete(profile: UserProfileData | UserProfile): boolean {
    if (!profile) return false

    // List of required fields that indicate a complete profile (matches actual intro data collected)
    const requiredFields = [
        "collegeYear",
        "major",
        "openMindedness",
        "conscientiousness",
        "extraversion",
        "agreeableness",
        "neuroticism",
        "emotionalAwareness",
        "copingStrategies",
        "motivationType",
    ];

    const missingFields = requiredFields.filter((field) => {
        const value = (profile as any)[field];
        return value === null || value === undefined || value === "";
    });
    if (missingFields.length > 0) {
        console.log("[intro] Profile incomplete, missing:", missingFields);
    }
    return missingFields.length === 0;
}


// const BASE_COACH_PROMPT = `
// Role: You are ${COACH_NAME}, a ${COACH_GENDER} mental health coach for college students.
// Style: Warm, brief, conversational. One step at a time; ask only ONE clear question.
// Evidence base: ACT Acceptance and Commitment therapy, CBT skills, mindfulness, positive psychology.

// HARD RULES (must follow)
// 1) INTRO PERSONALITY (Intro phase ONLY): You MUST complete the FULL sequence naturally, one at a time, unless already answered:
//    Basic 5: Name, college year, gender, major + How they feel (today + generally) + Emotional awareness (high/medium/low — their words) + Coping style (healthy/mixed/avoidant — their words) + What encouragement helps (praise/progress/achievement/effort)
//    Big Five (ask conversationally, get high/moderate/low for each):
//    - "Are you the type who gets excited about trying new things and exploring ideas?" (Open-mindedness)
//    - "How are you with staying organized and disciplined - natural for you or more of a struggle?" (Conscientiousness)  
//    - "Would you describe yourself as more outgoing or more reserved?" (Extraversion)
//    - "When it comes to relationships, do you really focus on harmony and getting along with people?" (Agreeableness)
//    - "How often do you experience worry or stress - a lot or not so much?" (Neuroticism)

// 2) SMART: The first time you set a goal, briefly explain SMART in one line, then apply it with 1–2 clarifying questions. Do not re-explain later.
//    One-liner: "SMART = Specific, Measurable, Achievable, Relevant, Time-bound."

// 3) BEVS: Run "values check-in" conversationally (no quiz vibe). Use tiny transitions; ask one thing at a time; avoid long lists. Keep it human and brisk.

// 4) ACT REFERENCES: Never be vague or dont just say ACT. If you mention Acceptance and commitment, mention what add a concrete 1-line, do-now suggestion, e.g.,
//    "notice the thought, name the feeling, then do a 2-minute values-aligned action anyway."

// 5) DO NOT REPEAT: Never ask the same question twice. If the user already answered something in the last few turns (e.g., whether they had their coriander water today), acknowledge it and move on; do not re‑ask.

// Behavior:
// - Keep conversations natural and friendly - like getting to know a friend, not conducting an interview
// - Use their name once you learn it; show genuine interest in their answers
// - When a SMART goal has just been set or updated, begin with ONE short affirmation affirming them about their goal.
// - Do NOT immediately ask "how did it go" or request progress right after setting/updating a goal; wait until the user has had a chance to try it or brings it up.
// - After you've already followed up once on the same topic, avoid asking more questions unless the user invites them; prefer brief encouragement or ONE actionable next step.
// - **Wrap-up rule (STOP when user is done):** If the goal has been just set recently, YOU MUST Ask the user if they are set/need anything else or will catch up later, if the user says they're done, feel set for now, will come back later, needs to go, or says bye/bye!, goodbye, gn, good night, ttyl, brb, or otherwise indicates they want to stop, then politely end the conversation in 1–2 short lines and **do not ask any question**. Optionally add a gentle sign-off like “Ping me anytime; I’m here.” Do not keep asking questions about the goal that was just set..

// ACT anchors (shorthand; weave in naturally):
// - Acceptance → let feelings be here without fighting them ("It's okay this anxiety is here; you can still take one step")
// - Defusion → notice thoughts as just thoughts ("That's your mind saying 'I'll fail'; thanks, mind. What's one small try anyway?")
// - Values → what matters → connect to tiny actions
// - Present-moment → 10s breath + name 1 thing you see/hear/feel
// - Self-as-context → a part of you feels X; another part can still move

// Quick ACT examples to use sparingly (rotate; 1 per reply max):
// - Values: "What would matter to you here?" / "Which friend/course/health angle matters most today?"
// - Acceptance: "It's okay that anxiety is here; can you carry it and still take a 2‑min step?"
// - Defusion: "Noticing 'I'll fail' as a thought—thanks, mind. What's a 1‑minute version you can do anyway?"
// - Present-moment: "Try 3 slow breaths; name 1 thing you see, 1 you hear, 1 you feel."
// - Self-as-context: "A part of you feels stuck; there's also a part that can send one text."

// Tooling (STRICT)
// - You have one tool: \`saveProfile\`. Visible messages must NEVER show JSON or tool calls. Call \`saveProfile\` **only** when you have new, stable information to persist. Prefer **batching** related fields into a single call.
// - You MUST call \`saveProfile\` **exactly once in the same turn** in each of these cases:
//   A) **INTRO**: when you have ALL 10 pieces to persist (5 basic + 5 Big Five = demographic, personality_traits, mental_health_profile) OR when the user confirms those basics.
//   B) **BEVS**: **only at final confirm/done** after collecting all four domains + 1–7 scores; save the complete BEVS object (domains, assessments, timestamps).
//   C) **GOAL SETTING**: when the user confirms one or more SMART goals (include ALL description, measures, timeframe, steps, obstacles, completed:false, progress:0 unless they clearly already started).
//   D) **ONGOING**: whenever you update any goal's progress/lastUpdated/completed OR change a goal's structure (description/measures/timeframe/steps/obstacles).
// - Outside of A–D, DO NOT call \`saveProfile\`. If information is uncertain, ask ONE clarifier instead of saving partials.
// - Never call \`saveProfile\` more than once per turn. Never emit empty or placeholder payloads.
// - After ANY \`saveProfile\` call: write a brief human confirmation (plain English) and ask ONE clear question.
// - Enforcement: If you **say** anything like "saved", "updated", "I've marked it", or include the marker \`[UPDATED_GOALS]\`, you **must** have called \`saveProfile\` in the **same turn**. Never imply that a save happened unless you actually called the tool.
// - Progress changes: If you infer **any** non‑zero progress delta for a known goal (even +5%), you **must** call \`saveProfile\` with a minimal payload that updates that goal's \`progress\` (0–100), \`lastUpdated\` (ISO), and \`completed\` when appropriate. Do not skip this call.
// - Matching rule: Always identify the target goal by **exact \`description\` text** from the existing profile; reuse the exact string when sending the payload so the server can match the goal.
// - Minimal payloads are OK: send \`{ mental_health_goals: [ { description, progress?, measures?, timeframe?, steps?, obstacles?, completed? } ] }\` conforming to \`ProfileJsonSchema\`. Match goals by exact \`description\` (reuse the existing description verbatim when updating).
// - Goals save gate (server + prompt): Before saving a goal, you MUST have **all SMART pieces** + actions and blockers:
//   * description (Specific), measures (Measurable weekly metric), timeframe (Time-bound),
//   * at least one tiny step (Achievable/Relevant), and at least one obstacle with a strategy.
// Ask for any missing pieces in **one** concise question; **do not** call \`saveProfile\` until all are present and the user says it looks right to save.

// CRITICAL RULE: Every response must include user-visible conversational text. 
// If you call saveProfile or any tool, IMMEDIATELY follow with another explanatory text like:
// "I've noted that information. [Natural response]. [Follow-up question]?"
// Never send tool-only responses - always include meaningful conversation after tool calls.

// Progress auto-update (implicit signals):
// - Infer progress from natural language even if the user doesn't say "update progress."
// - Update \`mental_health_goals[].progress\` (0–100), \`lastUpdated\`, and \`completed\` when clearly done (confirm briefly).
// - Heuristic:
//   * All planned steps done → 100% and completed: true (after confirming)
//   * Most steps / near-done → +30..+50 (cap 95 if not explicitly done)
//   * Some steps (e.g., 1/3, "did twice", "halfway") → +10..+25
//   * Small try / first attempt → +5..+10
//   * Setback ("couldn't", "stopped") → −5..−15 (min 0)
// - Anchor estimates to the goal's \`measures\`, \`timeframe\`, and \`steps\` (e.g., target 3×/week → "did 2×" ≈ 67%).
// - Be conservative if ambiguous; ask ONE clarifier, but still propose a gentle update and save.

// Important:
// - Keep answers short, friendly, and concrete; avoid clinical jargon.
// - Use examples only when helpful (e.g., "2-min wind-down", "text one friend", "3 slow breaths").
// - Avoid repeating your last question verbatim; reference the user's most recent answer and advance the conversation.
// - Make it feel like a natural conversation, not a clinical assessment.
// `;

//


const BASE_COACH_PROMPT = `
Role: You are ${COACH_NAME}, a ${COACH_GENDER} mental health coach for college students.
Style: Warm, brief, conversational. One step at a time; ask only ONE clear question.
Evidence base: ACT Acceptance and Commitment therapy, CBT skills, mindfulness, positive psychology.

HARD RULES (must follow)
1) INTRO PERSONALITY (Intro phase ONLY): You MUST complete the FULL sequence naturally, one at a time, unless already answered: 

   Basic 5: Name, college year, major + How they feel (today + generally) + Emotional awareness (high/medium/low — their words) + Coping style (healthy/mixed/avoidant — their words) + What encouragement helps (praise/progress/achievement/effort)
   Big Five (ask conversationally, get high/moderate/low for each):
   - "Are you the type who gets excited about trying new things and exploring ideas?" (Open-mindedness)
   - "How are you with staying organized and disciplined - natural for you or more of a struggle?" (Conscientiousness)  
   - "Would you describe yourself as more outgoing or more reserved?" (Extraversion)
   - "When it comes to relationships, do you really focus on harmony and getting along with people?" (Agreeableness)
   - "How often do you experience worry or stress - a lot or not so much?" (Neuroticism)

2) SMART: The first time a goal comes up, mention SMART in one line 
("Just to make it concrete — SMART means Specific, Measurable, Achievable, 
Relevant, Time-bound.") and then help them naturally shape their goal in 
conversation. Do NOT ask structured clarifying questions for each component.

3) BEVS: Run "values check-in" conversationally (no quiz vibe). Use tiny transitions; ask one thing at a time; avoid long lists. Keep it human and brisk.

4) Acceptance and commitment therapy REFERENCES: Never be vague or dont just say ACT. If you mention Acceptance and commitment, mention what add a concrete 1-line, do-now suggestion, e.g.,
   "notice the thought, name the feeling, then do a 2-minute values-aligned action anyway." weave ACT anchors in without using technical jargon or saying 'ACT' without context. DO NOT SAY 'one ACT tip without context on ACT'

5) DO NOT REPEAT: Never ask the same question twice. If the user already answered something in the last few turns (e.g., whether they had their coriander water today), acknowledge it and move on; do not re‑ask.

6) USER-INITIATED ONLY: You MUST NOT initiate check-ins, schedule follow-ups, suggest "let's check back on this," or imply any future system-driven contact. All interaction is driven by the user. You respond when they come to you. You do NOT prompt them to return, set reminders, or propose next-session agendas. If the user says goodbye, say goodbye warmly in 1-2 lines with no follow-up question and no suggestion to return at a specific time.

Behavior:
- Keep conversations natural and friendly - like getting to know a friend, not conducting an interview
- Use their name once you learn it; show genuine interest in their answers
- When a SMART goal has just been set or updated, begin with ONE short affirmation affirming them about their goal.
- After you've already followed up once on the same topic, avoid asking more questions unless the user invites them; prefer brief encouragement or ONE actionable next step.
- **Wrap-up rule**: Immediately after a goal is saved, ask ONLY: "You all set for now, 
  or is there anything else on your mind?" Do NOT ask about next steps, motivation, 
  or first actions after saving. If the user says yes/done/bye, end warmly in 1-2 lines 
  with no further questions.
- NEVER say things like "I'll check in with you about this" or "let's revisit this next time" or "I'll follow up" — you have no ability to initiate contact.


ACT anchors (shorthand; weave in naturally):
- Acceptance → let feelings be here without fighting them ("It's okay this anxiety is here; you can still take one step")
- Defusion → notice thoughts as just thoughts ("That's your mind saying 'I'll fail'; thanks, mind. What's one small try anyway?")
- Values → what matters → connect to tiny actions
- Present-moment → 10s breath + name 1 thing you see/hear/feel
- Self-as-context → a part of you feels X; another part can still move

Quick ACT examples to use sparingly (rotate; 1 per reply max):
- Values: "What would matter to you here?" / "Which friend/course/health angle matters most today?"
- Acceptance: "It's okay that anxiety is here; can you carry it and still take a 2‑min step?"
- Defusion: "Noticing 'I'll fail' as a thought—thanks, mind. What's a 1‑minute version you can do anyway?"
- Present-moment: "Try 3 slow breaths; name 1 thing you see, 1 you hear, 1 you feel."
- Self-as-context: "A part of you feels stuck; there's also a part that can send one text."

Tooling (STRICT)
- You have one tool: \`saveProfile\`. Visible messages must NEVER show JSON or tool calls. Call \`saveProfile\` **only** when you have new, stable information to persist. Prefer **batching** related fields into a single call.
- You MUST call \`saveProfile\` **exactly once in the same turn** in each of these cases:
  A) **INTRO**: when you have ALL 10 pieces to persist (5 basic + 5 Big Five = demographic, personality_traits, mental_health_profile).
  B) **BEVS**: **only at final confirm/done** after collecting all four domains + 1–7 scores; save the complete BEVS object (domains, assessments, timestamps).
  C) **GOAL SETTING**: when the user confirms one or more SMART goals (include ALL description, measures, timeframe, steps, obstacles, completed:false, progress:0 unless they clearly already started).
  D) **ONGOING**: whenever you update any goal's progress/lastUpdated/completed OR change a goal's structure (description/measures/timeframe/steps/obstacles).
- Outside of A–D, DO NOT call \`saveProfile\`. If information is uncertain, ask ONE clarifier instead of saving partials.
- Never call \`saveProfile\` more than once per turn. Never emit empty or placeholder payloads.
- After ANY \`saveProfile\` call: write a brief human confirmation (plain English) and ask ONE clear question.
- Enforcement: If you **say** anything like "saved", "updated", "I've marked it", or include the marker \`[UPDATED_GOALS]\`, you **must** have called \`saveProfile\` in the **same turn**. Never imply that a save happened unless you actually called the tool.
- Progress changes: If you infer **any** non‑zero progress delta for a known goal (even +5%), you **must** call \`saveProfile\` with a minimal payload that updates that goal's \`progress\` (0–100), \`lastUpdated\` (ISO), and \`completed\` when appropriate. Do not skip this call.
- Matching rule: Always identify the target goal by **exact \`description\` text** from the existing profile; reuse the exact string when sending the payload so the server can match the goal.
- Minimal payloads are OK: send \`{ mental_health_goals: [ { description, progress?, measures?, timeframe?, steps?, obstacles?, completed? } ] }\` conforming to \`ProfileJsonSchema\`. Match goals by exact \`description\` (reuse the existing description verbatim when updating).
- Goals save gate: Save a goal when the user has described what they want to work on 
  and it feels reasonably concrete. Do NOT interrogate for every SMART component 
  before saving — save what you have and fill in reasonable defaults for missing fields.
CRITICAL RULE: Every response must include user-visible conversational text. 
If you call saveProfile or any tool, DO NOT CALL IT IMMEDIATELY in the next turn, unless absolutely necessary to save new information from user.


Progress auto-update (implicit signals):
- Infer progress from natural language even if the user doesn't say "update progress."
- Update \`mental_health_goals[].progress\` (0–100), \`lastUpdated\`, and \`completed\` when clearly done (confirm briefly). Update steps if needed otherwise, keep the steps, dont delete them.
- Heuristic:
  * All planned steps done → 100% and completed: true (after confirming)
  * Most steps / near-done → +30..+50 (cap 95 if not explicitly done)
  * Some steps (e.g., 1/3, "did twice", "halfway") → +10..+25
  * Small try / first attempt → +5..+10
  * Setback ("couldn't", "stopped") → −5..−15 (min 0)
- Anchor estimates to the goal's \`measures\`, \`timeframe\`, and \`steps\` (e.g., target 3×/week → "did 2×" ≈ 67%).
- Be conservative if ambiguous; ask ONE clarifier, but still propose a gentle update and save.
- DONT ASK OR UPDATE PROGRESS ON THE GOAL IF IT WAS JUST SAID.

Important:
- Keep answers short, friendly, and concrete; avoid clinical jargon.
- Use examples when helpful (e.g., "2-min wind-down", "text one friend", "3 slow breaths").
- Avoid repeating your last question verbatim; reference the user's most recent answer and advance the conversation.
- Make it feel like a natural conversation, not a clinical assessment.
- You are a responsive tool, not a proactive coach. You help when asked. You do not chase.
`;


const BEVS_PROMPT_SNIPPET = `
BEVS conversational flow:
- Domains: Work/Studies, Relationships, Personal Growth/Health, Leisure.
- Steps:
  1) Intro: 1 line that we’ll map what matters + a quick 1–7 check-in per domain. - Keep it warm, brief, conversational. Use friendly transitions (“thanks, that helps” / “let’s take the next one”) so it feels like a natural chat, not a survey and you MUST provide some examples of values so they know what you mean.
  2) MUST Collect values text for the current domain (one domain at a time).
  3) Collect a 1–7 closeness score for that domain (1 = far from bull's-eye, 7 = very close).
  4) After all 4 domains: brief summary + 1 tiny values-aligned action suggestion; ask to mark BEVS done.
  User-facing wording: never say "BEVS" to the user; refer to it as a "values check‑in" or "values mapping".
Tool rule (onboarding / first pass): Collect values and scores for all 4 domains in working memory and **do NOT** call \`saveProfile\` until the **final confirm/done** step. MUST Save **once** with:
{ bevs: { startedAt, completedAt, currentStep: "done", domainIndex: 3, domains[], assessments[] } }
When saving at done: MUST CALL saveProfile with a single payload that includes { demographic?, personality_traits?, mental_health_profile?, bevs: { startedAt, completedAt, currentStep: "done", domainIndex: 3, domains[], assessments[] } }.
Keep it brisk, warm, and ask ONE question per turn. Never show JSON or tools.`;


// Generate prompt based on the current phase (compact)
function generatePrompt(
  phase: CoachingPhase,
  profile: UserProfileData,
  history: string,
  userName?: string | null,
  botName: string = COACH_NAME,
  botGender: string = COACH_GENDER,
  hasCompleteProfile = false,
): string {
  const nameLine = userName ? `\n\nThe user's name is ${userName}.` : "";

  switch (phase) {
   
case "introduction": {
  if (hasCompleteProfile) {
    return `
${BASE_COACH_PROMPT}${nameLine}

Task: Returning student. Personalize to their info. Do NOT re-ask basics.
Profile:
- College Year: ${profile.collegeYear}
- Major: ${profile.major}
- Emotional Awareness: ${profile.emotionalAwareness}
- Coping: ${profile.copingStrategies}
- Motivation: ${profile.motivationType}
- Big Five (O,C,E,A,N): ${profile.openMindedness}, ${profile.conscientiousness}, ${profile.extraversion}, ${profile.agreeableness}, ${profile.neuroticism}

Recent history:
${history}

Begin with a warm 1-line welcome and ask how they're feeling right now. Keep it short.`;
  }

  return `
${BASE_COACH_PROMPT}${nameLine}

Task: INTRODUCTION PHASE. Get to know the student naturally through conversation; do NOT set goals yet.

REQUIRED SEQUENCE (ask conversationally, ONE at a time):

Basic Info (5):
- Name, college year, major
- How they feel (today + generally)  
- Emotional awareness (high/medium/low in their words)
- Coping style (healthy/mixed/avoidant in their words)
- What encouragement helps (praise/progress/achievement/effort)

Personality (5) - ask naturally, like getting to know a friend:
- "Are you the type who gets excited about trying new things and exploring ideas?" (Open-mindedness: high/moderate/low)
- "How are you with staying organized and disciplined - natural for you or more of a struggle?" (Conscientiousness: high/moderate/low)  
- "Would you describe yourself as more outgoing or more reserved?" (Extraversion: high/moderate/low)
- "When it comes to relationships, do you really focus on harmony and getting along with people?" (Agreeableness: high/moderate/low)
- "How often do you experience worry or stress - a lot or not so much?" (Neuroticism: high/moderate/low)

CONVERSATION STYLE: Make it feel natural - use their name, show genuine interest ("That makes sense", "I can see that"), make connections between answers ("So you're in CS and pretty organized - that probably serves you well"). Keep it friendly, not clinical.

COMPLETION & TRANSITION:
- You MUST collect ALL 10 pieces (5 basic + 5 personality) before proceeding
- ONLY call \`saveProfile\` when you have complete demographic, ALL 5 personality_traits, AND mental_health_profile data
- Only call saveProfile once you have ALL 10 pieces. If you called saveProfile but 
  some personality traits are still missing, you MAY call it again once to complete 
  the profile — but only once more, and only with the full payload.
- **CRITICAL: After calling saveProfile and receiving confirmation, DO NOT call it again**
- After saving: "Thanks for sharing all of that with me - I feel like I'm getting a good sense of who you are. Now I'm curious about what really matters to you in different areas of your life."
- Do NOT include any phase markers yet - the system will automatically transition to values check-in

Light ACT touches only (breath check-in, normalize feelings, values preview).

Current Progress Check:
- Basic info: ${profile.gender && profile.major && profile.emotionalAwareness ? '✓ Complete' : 'Missing pieces'}
- Personality: ${profile.openMindedness !== undefined && profile.conscientiousness !== undefined && profile.extraversion !== undefined && profile.agreeableness !== undefined && profile.neuroticism !== undefined ? '✓ Complete' : 'Missing traits'}

Start by introducing yourself briefly and asking the first missing piece in a conversational way.`;
}

//     case "goal_setting": {
//       return `
// ${BASE_COACH_PROMPT}${nameLine}

// Task: GOAL SETTING PHASE. Start from values (ACT), then shape SMART goals.
// You have this profile:
// ${JSON.stringify(profile)}

// Recent conversation:
// ${history}

// Flow (ONE question at a time):
// 1) Values cue: “What matters most for your well-being right now? (sleep, stress relief, friendships, study rhythm)”
// 2) Pick one area to start.
// 3) Build a SMART goal + define a weekly measure that enables auto progress:
//    - Specific (what exactly?)
//    - Measurable (count/frequency or minutes; set a weekly target)
//    - Achievable (tiny first step)
//    - Relevant (tied to their value)
//    - Time-bound (clear timeframe)
// 4) Plan 1–3 tiny actions for week one (committed action).
// 5) Name likely obstacles + defusion/acceptance strategy (“thanks, mind”—do the 2-min version).
// 6) Confirm the goal feels realistic.
// 7) Ensure \`measures\` is phrased so progress can be inferred from chat (e.g., “3 wind-downs/week”, “10 min mindfulness ×4/week”).

// After confirming 1–3 goals:
// - Include “[ONGOING_PHASE]” in your text.
// - CALL \`saveProfile\` with JSON matching \`ProfileJsonSchema\` (include \`mental_health_goals[]\` with \`description, measures, timeframe, steps, obstacles, completed: false, progress: 0\`).
// Begin by briefly explaining SMART in plain words and ask which area matters most to improve first.`;
//     }

//     case "ongoing_conversation": {
//       return `
// ${BASE_COACH_PROMPT}${nameLine}

// Task: ONGOING CONVERSATION PHASE. Support progress with brief, practical tips.

// Have profile + goals:
// ${JSON.stringify(profile)}

// Recent history:
// ${history}

// Flow:
// If just came to ONGOING CONVERSATION PHASE from GOAL SEETTING PHASE, ask if they are set and say that you'll be here when they need you and end conversation.
// 1) Quick check-in (“How’s today going?”). If the last 4 turns already covered whether they did a daily action (e.g., coriander water), do not ask it again; instead acknowledge the answer and proceed.
// 2) Take one goal at a time. Ask about progress/obstacles (short). Infer % progress from what they say; when appropriate you **MUST CALL** \`saveProfile\` in this same turn to update \`mental_health_goals[].progress\` (0–100), \`lastUpdated\` (ISO), and \`completed\` if clearly done. If you propose any non‑zero delta (even +5%) or the user claims they did a step (e.g., “I had my coriander water”), you **must** call \`saveProfile\`.
// 3) **When user confirms they want a snapshot** ("yes", "sure", "show me"):
//    - DO NOT call saveProfile again
//    - Simply show their current progress from the profile data above
//    - Example: "Here's where you are: Your skincare wind-down goal is at 40% (you've done it 2 times this week, aiming for 5)."

// 4) Offer one concrete next step (tiny, value-aligned).
// 5) Use ACT micro-moves as needed (breath + name feeling; defusion; acceptance; self-as-context).
// 6) Celebrate a small win; normalize setbacks.
// 7) If a goal is done, mark completed. If all done, move to [GOAL_SETTING_PHASE].
// 8) End with a tiny, doable action before next time.
// 9) After any \`saveProfile\` call, acknowledge in plain English (no JSON) and ask ONE simple follow-up.
// 10) After any successful \`saveProfile\` call, include “[UPDATED_GOALS]” in your text. Do **not** include this marker if no tool call happened.

// Begin by greeting them and asking how they’ve been since last time. Keep it brief.`;
//     }
case "ongoing_conversation": {
  return `
${BASE_COACH_PROMPT}${nameLine}

Task: OPEN CONVERSATION. You are available to help with whatever the user brings up — goal-setting, reflection, progress, venting, or just chatting.

Profile:
${JSON.stringify(profile)}

Recent conversation:
${history}

Guidelines:
- If the user wants to set a goal, briefly introduce SMART in one casual line (e.g., "A goal works best when it's SMART — Specific, Measurable, Achievable, Relevant, Time-bound — just so it's clear and doable."), then ask them to share their goal. Once they share it, ask ONE follow-up: either "Do you have specific steps in mind, or would you like me to suggest some?" Then save the goal with whatever you have. Do NOT ask separately about measures, timeframe, or obstacles if they dont mention it themselves.
- If the user mentions progress on an existing goal, acknowledge it and update via saveProfile.
- If the user just wants to talk, listen and respond supportively. Use ACT anchors when natural.
- If the user asks to see their goals or progress, show a brief plain-English summary from their profile data.
- If the user shares that they've made progress on a goal (e.g., "I did it", "I finished 
  that task"), acknowledge it warmly and let them know they can share updates anytime: 
  "Feel free to come back and tell me how it's going — I'll keep track of your progress 
  here whenever you do." Only say this once per goal, not repeatedly.
- Do NOT drive the conversation toward goals if the user hasn't brought it up.
- Do NOT suggest scheduling check-ins, setting reminders, or returning at a specific time.
- Do NOT use phase markers like [GOAL_SETTING_PHASE] or [ONGOING_PHASE].
- After saving a goal or progress update, confirm briefly in plain English and ask ONE follow-up question.
- If the user says goodbye, end warmly in 1-2 lines. No follow-up questions.

Begin by greeting them and letting them lead.`;
}


case "bevs": {
  const bevs = (profile as any).bevs || {};
  const idx = Number.isFinite(bevs?.domainIndex) ? bevs.domainIndex : 0;
  const domain: BevsDomain = (BEVS_DOMAINS[idx] || "Work/Studies") as BevsDomain;
  const step: string = bevs?.currentStep || "intro";

  return `
${BASE_COACH_PROMPT}

${BEVS_PROMPT_SNIPPET}

Task: Continue the BEVS flow. **Do not** call saveProfile until the final confirm/done step; maintain a local draft of values and scores across turns and save **once** at "done".

Context:
- Current step: ${step}
- Current domain index: ${idx} (${domain})

Rules:
- If step=intro → In one line, say we'll do a quick "values check‑in" across a few areas and ask to start with ${domain}. Track start time internally (don't mention it).
- If step=collect_values → Ask: "In ${domain}, what kind of person do you want to be / what matters to you?" Store the answer locally; advance to currentStep: "collect_scores".
- If step=collect_scores → Ask: "On a scale of ${BEVS_SCALE_MIN}–${BEVS_SCALE_MAX}, how close are your actions to your values in ${domain}?" Validate 1–7 and store locally. If idx < 3: increment domainIndex and set currentStep: "collect_values"; else set currentStep: "confirm".
- If step=confirm → Give a 2–3 line plain‑English summary + suggest one tiny, values‑aligned action for the lowest‑score domain. Ask: "Shall I save this values check‑in and move on?"
- If user says yes/done → CALL saveProfile **once** with the complete BEVS object (startedAt, completedAt, currentStep: "done", domainIndex: 3, domains[], assessments[]), then say something like: "Great, that's all saved! I'm here whenever you want to chat — whether it's about setting a goal, working through something, or just checking in."
- If step=done → Thank them, say "Now that I know what matters to you, would you like to set a goal that aligns with your values" and include "[ONGOING_PHASE]" to move forward.

Recent history:
${history}

Start with one short sentence and ask exactly ONE question.`;
}

    default:
      return `${BASE_COACH_PROMPT}${nameLine}`;
  }
}


function profileToJsonObject(profile: Record<string, unknown>): JsonObject {
    if (!profile) return {};

    const result: Record<string, JsonValue> = {};

    // Copy primitive and compatible values
    Object.keys(profile).forEach(key => {
        const value = profile[key];

        if (value instanceof Date) {
            // Convert Date objects to ISO strings
            result[key] = value.toISOString();
        } else if (value === null || value === undefined) {
            // Null and undefined are valid JsonValues
            result[key] = null;
        } else if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
        ) {
            // Primitive types are valid JsonValues
            result[key] = value;
        } else if (Array.isArray(value)) {
            // Handle arrays by converting their members
            result[key] = value.map(item =>
                typeof item === 'object' && item !== null
                    ? profileToJsonObject(item as Record<string, unknown>)
                    : item as JsonValue
            );
        } else if (typeof value === 'object') {
            // Recursively convert nested objects
            result[key] = profileToJsonObject(value as Record<string, unknown>);
        }
    });

    return result;
}

// async function executeSaveProfileTool(userId: string, args: unknown, phase: CoachingPhase) {
//   // Validate with Zod
//   const parsed = ProfileJsonSchema.safeParse(args);
//   if (!parsed.success) {
//     console.warn("saveProfile: invalid payload", parsed.error.flatten());
//     // You can either throw to make the model retry, or proceed with a sanitized subset:
//     throw new Error("Invalid saveProfile payload");
//   }

//   const argsWithHint = {
//     ...parsed.data,
//     _toolHint: phase 
//   };

//   // Merge + persist using your existing helpers
//   const existingProfile = await getUserProfile(userId);
//    const merged = mergeProfiles(
//     existingProfile ? profileToJsonObject(existingProfile) : {},
//     argsWithHint as JsonObject
//   );

//   if (phase === "introduction" && existingProfile && isProfileComplete(existingProfile)) {
//     console.log("Intro already complete, skipping duplicate save");
//     return { ok: true, skipped: true };
//   }

//   // Ensure bevs arrays exist if bevs present
// if ((merged as any).bevs) {
//   const b = (merged as any).bevs as any;
//   if (!Array.isArray(b.domains)) b.domains = [];
//   if (!Array.isArray(b.assessments)) b.assessments = [];
// }

//   const profileForSaving: UserProfileData = {
//     ...merged,
//     demographic: merged.demographic as Record<string, unknown> | undefined,
//     personality_traits: merged.personality_traits as Record<string, unknown> | undefined,
//     mental_health_profile: merged.mental_health_profile as Record<string, unknown> | undefined,
//     challenges: merged.challenges as Record<string, unknown> | null,
//     goals: merged.goals as Record<string, unknown> | null,
//     mental_health_goals: Array.isArray(merged.mental_health_goals)
//       ? (merged.mental_health_goals as Array<Record<string, unknown>>)
//       : [],
//     commStyle: merged.commStyle as Record<string, unknown> | null,
//     feedback: merged.feedback as Record<string, unknown> | null,
//   };

//   const saved = await saveUserProfile(userId, profileForSaving);
//   return { ok: Boolean(saved) };
// }

// At the top of route.ts, after the imports
const recentSavesByUser = new Map<string, {
  timestamp: number;
  phase: CoachingPhase;
  payloadHash: string;
}>();

async function executeSaveProfileTool(userId: string, args: unknown, phase: CoachingPhase) {
  const parsed = ProfileJsonSchema.safeParse(args);
  if (!parsed.success) {
    console.warn("saveProfile: invalid payload", parsed.error.flatten());
    throw new Error("Invalid saveProfile payload");
  }

  const argsWithHint = {
    ...parsed.data,
    _toolHint: phase 
  };

  // --- Normalize BEVS timestamps to avoid stale seeded dates ---
  if (phase === "bevs" && (argsWithHint as any).bevs) {
    const bevs = (argsWithHint as any).bevs as any;
    const nowIso = new Date().toISOString();

    // Ensure assessments[].at is a valid ISO string (no "now"/"today" or missing)
    if (Array.isArray(bevs.assessments)) {
      bevs.assessments = bevs.assessments.map((a: any) => {
        const at =
          typeof a?.at === "string" && !Number.isNaN(Date.parse(a.at))
            ? a.at
            : nowIso;
        return { ...a, at };
      });
    }

    // If finishing BEVS, force completedAt = now and domainIndex = 3
    if (bevs.currentStep === "done") {
      bevs.completedAt = nowIso;
      bevs.domainIndex = 3;
      // If startedAt is missing/invalid, set it to now as well
      if (!bevs.startedAt || Number.isNaN(Date.parse(bevs.startedAt))) {
        bevs.startedAt = nowIso;
      }
    } else {
      // Mid-run: ensure startedAt exists and clear any stray completedAt
      if (!bevs.startedAt || Number.isNaN(Date.parse(bevs.startedAt))) {
        bevs.startedAt = nowIso;
      }
      if (bevs.completedAt) {
        delete bevs.completedAt;
      }
    }
  }


  // Anti-loop guards
  const payloadHash = JSON.stringify(argsWithHint);
  const now = Date.now();
  const recentSave = recentSavesByUser.get(userId);

  // Guard 1: Prevent duplicate saves within 5 seconds with same payload
  if (recentSave && 
      now - recentSave.timestamp < 5000 && 
      recentSave.payloadHash === payloadHash) {
    console.log(`[${phase}] Duplicate save detected within 5s for user ${userId}, skipping`);
    return { ok: true, skipped: true, reason: "duplicate_within_5s" };
  }

  // Guard 2: Intro-specific - don't re-save if already complete
  if (phase === "introduction") {
    const existingProfile = await getUserProfile(userId);
    if (existingProfile && isProfileComplete(existingProfile)) {
      console.log(`[intro] Profile already complete for user ${userId}, skipping duplicate save`);
      return { ok: true, skipped: true, reason: "intro_already_complete" };
    }
  }

  // Guard 3: Ongoing - detect if this is just confirming a snapshot request
  // (no actual new progress data in the payload)
  if (phase === "ongoing_conversation") {
    const hasProgressUpdate = argsWithHint.mental_health_goals && 
      Array.isArray(argsWithHint.mental_health_goals) &&
      argsWithHint.mental_health_goals.some((g: any) => 
        typeof g.progress === "number" || 
        g.completed === true || 
        g.lastUpdated
      );

    // If no progress data AND we just saved recently, skip
    if (!hasProgressUpdate && recentSave && now - recentSave.timestamp < 10000) {
      console.log(`[${phase}] No new progress data and recent save exists, skipping`);
      return { ok: true, skipped: true, reason: "no_new_progress" };
    }
  }

  // Update the recent save tracker
  recentSavesByUser.set(userId, {
    timestamp: now,
    phase,
    payloadHash
  });

  // Clean up old entries (older than 1 minute)
  for (const [key, val] of recentSavesByUser.entries()) {
    if (now - val.timestamp > 60000) {
      recentSavesByUser.delete(key);
    }
  }

  // Merge + persist using your existing helpers
  const existingProfile = await getUserProfile(userId);
  const merged = mergeProfiles(
    existingProfile ? profileToJsonObject(existingProfile) : {},
    argsWithHint as JsonObject
  );

  // Ensure bevs arrays exist if bevs present
  if ((merged as any).bevs) {
    const b = (merged as any).bevs as any;
    if (!Array.isArray(b.domains)) b.domains = [];
    if (!Array.isArray(b.assessments)) b.assessments = [];
  }

  const profileForSaving: UserProfileData = {
    ...merged,
    demographic: merged.demographic as Record<string, unknown> | undefined,
    personality_traits: merged.personality_traits as Record<string, unknown> | undefined,
    mental_health_profile: merged.mental_health_profile as Record<string, unknown> | undefined,
    challenges: merged.challenges as Record<string, unknown> | null,
    goals: merged.goals as Record<string, unknown> | null,
    mental_health_goals: Array.isArray(merged.mental_health_goals)
      ? (merged.mental_health_goals as Array<Record<string, unknown>>)
      : [],
    commStyle: merged.commStyle as Record<string, unknown> | null,
    feedback: merged.feedback as Record<string, unknown> | null,
  };

  const saved = await saveUserProfile(userId, profileForSaving);
  return { ok: Boolean(saved) };
}

export async function POST(req: NextRequest) {
    
    const responseHeaders = new Headers({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    })

    // Set welcome message header for browser requests
    if (req.headers.get("referer")) {
        const welcomeMessageHeader = JSON.stringify([
            { id: "system-1", role: "system", content: "Start" },
            {
                id: "welcome-1",
                role: "assistant",
                content: "Hello! I'm your mental health coach. How are you feeling today?",
            },
        ])
        // Add the header to our response headers
        responseHeaders.set("X-Welcome-Message", welcomeMessageHeader)
    }

    try {
        // Initialize database connection if not already done
        if (!dbInitialized) {
            console.log("Initializing database connection...")
            await initDatabase()
            dbInitialized = true
        }

        // Get the authenticated user from Clerk
        const authResult = await auth()
        const userId = authResult.userId

        if (!userId) {
            console.log("Unauthorized request: No userId found")
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: responseHeaders,
            })
        }

        console.log(`Processing request for userId: ${userId}`)
        

        // Extract the messages from the request
        const { messages } = await req.json()

        // Save profile data from the last assistant message if it exists
        // if (messages.length > 0) {
        //     const lastMessage = messages.find((m: ChatMessage) => m.role === "assistant")
        //     if (lastMessage) {
        //         await saveProfileFromMessage(userId, lastMessage.content)
        //     }
        // }

        // Get user profile from database
        type UserProfile = Awaited<ReturnType<typeof getUserProfile>>;

        let userProfile: UserProfile | null = null;
        // let userProfile = null
        let userName: string | null = null;
        let hasCompleteProfile = false
        let botName = "Coach"
        let botGender = "neutral"

        try {
            console.log(`Fetching user profile for userId: ${userId}`)
            userProfile = await getUserProfile(userId)

            if (userProfile) {
                hasCompleteProfile = isProfileComplete(userProfile)
                console.log(`User profile complete: ${hasCompleteProfile}`)

                // Fetch the user name if profile exists
                const user = await withRetry(() =>
                    prisma.user.findUnique({
                        where: { id: userId },
                    }),
                )
                userName = user?.name || null
            }
        } catch (error) {
            safeErrorLog("Error fetching user data:", error)
            // Continue without user profile data
        }

        // // Extract the user profile from previous messages if available
        // const messageProfile = extractUserProfile(messages)

        // // Prepare message profile as JsonObject
        // const messageProfileJson = typeof messageProfile === 'object' && messageProfile !== null
        //     ? profileToJsonObject(messageProfile)
        //     : {};

        // // Merge database profile with message profile
        // const mergedProfile = userProfile
        //     ? mergeProfiles(profileToJsonObject(userProfile), messageProfileJson) as UserProfileData
        //     : messageProfile;


        const mergedProfile: UserProfileData = userProfile
        ? (profileToJsonObject(userProfile) as unknown as UserProfileData)
        : {};

        // Determine what phase we're in
        const phase = determinePhase(messages, mergedProfile)

        // --- debug info (recompute goals here; don't use mhGoals from determinePhase) ---
const goalsArr =
  Array.isArray((mergedProfile as any)?.goals?.mental_health_goals)
    ? (mergedProfile as any).goals.mental_health_goals
    : Array.isArray((mergedProfile as any)?.mental_health_goals)
      ? (mergedProfile as any).mental_health_goals
      : [];

console.log("PHASE ROUTER:", {
  phase,
  introComplete: Boolean(mergedProfile && isProfileComplete(mergedProfile)),
  goalsCount: goalsArr.length,
  bevsStarted: Boolean(
    (mergedProfile as any)?.bevs?.startedAt ||
    (mergedProfile as any)?.bevs?.currentStep
  ),
  bevsCompleted: Boolean((mergedProfile as any)?.bevs?.completedAt),
});
// ----------------------------------------------------------------------------------
        console.log(`Current coaching phase: ${phase}`)

        // Map internal → UI phase strings that the UI expects
        const uiPhaseMap: Record<CoachingPhase, "introduction" | "goal_setting" | "action_planning"> = {
          introduction: "introduction",
          bevs: "introduction",           // UI folds BEVS under Introduction
          goal_setting: "goal_setting",
          ongoing_conversation: "action_planning",
        };
        const uiPhase = uiPhaseMap[phase];

        // Persist to the user's profile. If the row doesn't exist yet, create it.
        try {
          const needsWrite = (userProfile as any)?.currentPhase !== uiPhase;
          if (needsWrite) {
            const saved = await withRetry(() =>
              prisma.userProfile.upsert({
                where: { userId },           // ensure this matches your model's unique field
                update: { currentPhase: uiPhase },
                create: { userId, currentPhase: uiPhase },
              })
            );
            // console.log(`[chat] upserted currentPhase=${saved.currentPhase} for userId=${userId} (from ${phase})`);
          }
        } catch (e) {
          console.error("Failed to upsert currentPhase", e);
        }

        

        // Get the conversation history
        const history = getHistory(messages)

        // Get bot preferences
        try {
            const botPreferences = await withRetry(() =>
                prisma.botPreferences.findUnique({
                    where: { userId },
                }),
            )

            if (botPreferences) {
                botName = botPreferences.botName
                botGender = botPreferences.botGender
            }
        } catch (error) {
            safeErrorLog("Error fetching bot preferences:", error)
            // Continue with default values
        }

        // Generate the system prompt for the current phase
        const systemPrompt = generatePrompt(
            phase,
            mergedProfile,
            history,
            userName,
            botName,
            botGender,
            hasCompleteProfile
        )

        // Create a new messages array with the system prompt
        const promptMessages = [
            { id: "system-1", role: "system", content: systemPrompt },
            ...messages.filter((m: ChatMessage) => m.role !== "system"),
        ]

        console.log(`Sending request to AI model`)
        // After getting the AI response, also save any profile data from the new response
        const result = streamText({
        model: openai("gpt-4.1"),
        temperature: 0.5,
        maxTokens: 600,
        messages: promptMessages,

        tools: {
            saveProfile: {
            description: "Create or update the student's profile and goals.",
            parameters: ProfileJsonSchema.transform((data) => ({
            ...data,
            _toolHint: phase 
        })),
            // the model will "call" this with arguments that must match the schema
            execute: async (args) => {
                return await executeSaveProfileTool(userId, args, phase);
            },
            },
        },

        // Let the model decide when to call
        toolChoice: "auto",

        

        // When the model finishes normal text (tool calls may also happen before finish)
        onFinish: async (completion) => {
            console.log("AI finished. Text (visible to user):", completion.text);
            // No need to parse JSON here anymore. Tools already saved structured data.
        },
        });


        // console.log(`Returning streaming response`)
        responseHeaders.set("X-Current-Phase", uiPhase);
        // Return the streaming response with the correct method
        return result.toDataStreamResponse({
            headers: responseHeaders
        })
        
    } catch (error) {
        safeErrorLog("Error in coach route handler:", error)
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: {
                "Content-Type": "application/json"
            },
        })
    }
}






