import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";

import {
  createCalendarEvent,
  parseGoalTimeframe,
  findNextAvailableSlotInWindow,
  PreferredWindow,
  getPrimaryCalendarTimeZone,
  debugWindowBoundsForDay,
  verifyExactFree,
} from "@/lib/google/calendar";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const FALLBACK_ORDER: PreferredWindow[] = ["evening", "afternoon", "morning", "night"];

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json();

    const {
      goalIndex,
      preferredWindow,
      clientTimeZone,
      ignoreAllDayBusy = true,
      lookaheadDays = 7,
    } = body;

    if (typeof goalIndex !== "number") {
      return NextResponse.json({ error: "goalIndex is required" }, { status: 400 });
    }

    // tokens
    const tokenRecord = await prisma.googleCalendarToken.findUnique({
      where: { userId },
    });

    if (!tokenRecord) {
      return NextResponse.json(
        { error: "Google Calendar not connected", needsAuth: true },
        { status: 403 }
      );
    }

    // profile + goals
    const profile = await prisma.userProfile.findUnique({ where: { userId } });

    if (!profile?.goals) {
      return NextResponse.json({ error: "No goals found" }, { status: 404 });
    }

    const goalsData =
      typeof profile.goals === "string"
        ? JSON.parse(profile.goals)
        : profile.goals;

    const goal = goalsData?.mental_health_goals?.[goalIndex];

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    // timezone
    let timeZone =
      clientTimeZone ||
      (profile as any)?.timeZone ||
      (profile as any)?.preferences?.timeZone;

    if (!timeZone) {
      timeZone = await getPrimaryCalendarTimeZone(
        tokenRecord.accessToken,
        tokenRecord.refreshToken
      );
    }

    if (!timeZone) timeZone = "UTC";

    // window selection
    const isValidWindow = (v: any): v is PreferredWindow =>
      ["morning", "afternoon", "evening", "night"].includes(v);

    const preferred: PreferredWindow = isValidWindow(preferredWindow)
      ? preferredWindow
      : "evening";

    // timeframe
    const { startDate, endDate } = parseGoalTimeframe(goal.timeframe || "1 month");

    const mid = new Date(
      startDate.getTime() +
        (endDate.getTime() - startDate.getTime()) / 2
    );

    const tryFind = async (day: Date) => {
      const windows: PreferredWindow[] = [
        preferred,
        ...FALLBACK_ORDER.filter((w) => w !== preferred),
      ];

      for (const w of windows) {
        const slot = await findNextAvailableSlotInWindow(
          tokenRecord.accessToken,
          tokenRecord.refreshToken,
          {
            day,
            window: w,
            durationMinutes: 30,
            ignoreAllDayBusy,
          }
        );

        if (slot) return { slot, window: w };
      }

      return null;
    };

    const midResult = await tryFind(mid);
    const endResult = await tryFind(endDate);

    if (!midResult && !endResult) {
      return NextResponse.json(
        {
          error: "No free slots found",
          debug: {
            mid: mid.toISOString(),
            end: endDate.toISOString(),
            timezone: timeZone,
          },
        },
        { status: 409 }
      );
    }

    const events: any[] = [];

    const create = async (label: string, result: any) => {
      const ok = await verifyExactFree(
        tokenRecord.accessToken,
        tokenRecord.refreshToken,
        result.slot.start,
        result.slot.end,
        timeZone
      );

      if (!ok) return;

      const e = await createCalendarEvent(
        tokenRecord.accessToken,
        tokenRecord.refreshToken,
        {
          summary: `Goal check-in: ${goal.description}`,
          description: goal.description,
          startDateTime: result.slot.start,
          endDateTime: result.slot.end,
          timeZone,
        }
      );

      events.push({
        type: label,
        id: e.id,
        link: e.htmlLink,
      });
    };

    if (midResult) await create("mid", midResult);
    if (endResult) await create("final", endResult);

    goalsData.mental_health_goals[goalIndex] = {
      ...goal,
      calendarCheckins: events,
    };

    await prisma.userProfile.update({
      where: { userId },
      data: { goals: goalsData },
    });

    return NextResponse.json({
      success: true,
      events,
    });
  } catch (err: any) {
    console.error("Calendar add failed:", err);
    return NextResponse.json(
      { error: err?.message || "Failed" },
      { status: 500 }
    );
  }
}