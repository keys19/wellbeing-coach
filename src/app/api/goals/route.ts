import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

type MHGoal = {
  description?: string;
  measures?: string;
  timeframe?: string;
  steps?: string[];
  obstacles?: string[];
  completed?: boolean;
  progress?: number;
  lastUpdated?: string;
  completedAt?: string;
  // optional id if you later add it
  id?: string | number;
};

function toJson<T = unknown>(v: unknown): T | null {
  try {
    if (v == null) return null;
    if (typeof v === "string") return JSON.parse(v) as T;
    return v as T;
  } catch {
    return null;
  }
}

/**
 * Accepts any of these:
 *  - { goals: { mental_health_goals: [...] } }
 *  - { mental_health_goals: [...] }
 *  - [ ... ]
 * and returns MHGoal[]
 */
function normalizeGoals(input: unknown): MHGoal[] {
  const obj = toJson<any>(input);
  if (!obj) return [];
  if (Array.isArray(obj)) return obj as MHGoal[];
  if (Array.isArray(obj?.mental_health_goals)) return obj.mental_health_goals as MHGoal[];
  if (Array.isArray(obj?.goals?.mental_health_goals)) return obj.goals.mental_health_goals as MHGoal[];
  return [];
}

/**
 * Wraps MHGoal[] back into { mental_health_goals: [...] } for storage
 */
function wrapGoalsForStorage(goals: MHGoal[]) {
  return { mental_health_goals: goals };
}

function jsonNoStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

/**
 * POST /api/goals
 * Body: { goalId?: number|string, completed?: boolean, progress?: number }
 * - If `completed` is provided: set that value. If not, toggle.
 * - If `progress` provided: set it (0..100 typically).
 * - Uses index addressing for now (goalId as array index). If you later add stable ids, we can match by id too.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return jsonNoStore({ error: "Unauthorized" }, 401);

    const { goalId, completed, progress } = await req.json();

    if (goalId === undefined || goalId === null || isNaN(Number(goalId))) {
      return jsonNoStore({ error: "Goal ID (array index) is required" }, 400);
    }
    const index = Number(goalId);

    const userProfile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { goals: true },
    });

    const goalsArr = normalizeGoals(userProfile?.goals);
    if (!Array.isArray(goalsArr) || goalsArr.length === 0) {
      return jsonNoStore({ error: "No goals found" }, 404);
    }
    if (index < 0 || index >= goalsArr.length) {
      return jsonNoStore({ error: "Goal index out of range" }, 400);
    }

    const nowIso = new Date().toISOString();
    const prev = goalsArr[index] || {};
    const newCompleted =
      typeof completed === "boolean" ? completed : prev.completed !== true; // toggle if not provided

    const nextGoals = goalsArr.map((g, i) => {
      if (i !== index) return g;
      const isNewlyCompleted = newCompleted === true && g.completed !== true;
      const next: MHGoal = {
        ...g,
        completed: newCompleted,
        lastUpdated: nowIso,
      };
      if (typeof progress === "number") {
        next.progress = progress;
      } else if (next.progress == null) {
        next.progress = 0;
      }
      if (isNewlyCompleted) next.completedAt = nowIso;
      return next;
    });

    const stored = wrapGoalsForStorage(nextGoals);

    // Persist and bump updatedAt so dashboard can show "last updated" and MISS caches
    const updatedProfile = await prisma.userProfile.update({
      where: { userId },
      data: { goals: stored, updatedAt: new Date() },
      select: { goals: true, updatedAt: true },
    });

    return jsonNoStore(
      {
        success: true,
        goals: stored, // keep storage shape; dashboard GET will normalize to array
        meta: { updatedAt: updatedProfile.updatedAt },
        updatedGoalIndex: index,
        goalNewlyCompleted: newCompleted === true && prev.completed !== true,
      },
      200
    );
  } catch (error) {
    console.error("Error updating goal:", error);
    return jsonNoStore({ error: "Failed to update goal" }, 500);
  }
}

/**
 * GET /api/goals
 * Returns a normalized array plus meta so the Dashboard can render immediately after tab switch.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return jsonNoStore({ error: "Unauthorized" }, 401);

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { goals: true, updatedAt: true, emailFrequency: true, hideWelcomeDialog: true },
    });

    const goalsArray = normalizeGoals(profile?.goals);
    // newest first
    goalsArray.sort((a, b) => {
      const ta = Date.parse(a?.lastUpdated ?? "") || 0;
      const tb = Date.parse(b?.lastUpdated ?? "") || 0;
      return tb - ta;
    });

    return jsonNoStore({
      goals: goalsArray,
      meta: {
        count: goalsArray.length,
        updatedAt: profile?.updatedAt ?? null,
        emailFrequency: profile?.emailFrequency ?? null,
        hideWelcomeDialog: profile?.hideWelcomeDialog ?? null,
      },
    });
  } catch (error) {
    console.error("Error fetching goals:", error);
    return jsonNoStore({ error: "Failed to fetch goals" }, 500);
  }
}