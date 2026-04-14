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
  getFreeBusy,
  verifyExactFree,
} from "@/lib/google/calendar";

// --- Helpers to combine same-day check-ins into one event ---
async function listSameDayCheckinEvent(
  accessToken: string,
  timeMinISO: string,
  timeMaxISO: string
) {
  // Query primary calendar for existing "Goal check-in:" events within the local day window
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", timeMinISO);
  url.searchParams.set("timeMax", timeMaxISO);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("q", "Goal check-in:");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.warn("[Calendar Add] events.list failed", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  // Return the first matching event if any
  return items.find((e: any) => typeof e?.summary === "string" && e.summary.startsWith("Goal check-in:")) || null;
}

async function patchCalendarEvent(
  accessToken: string,
  eventId: string,
  patch: { summary?: string; description?: string }
) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    console.warn("[Calendar Add] events.patch failed", res.status, await res.text());
    throw new Error("Failed to update existing check-in event");
  }
  return res.json();
}

function mergeCheckinText(existingSummary: string, existingDescription: string | undefined, newGoalDesc: string) {
  const basePrefix = "Goal check-in: ";
  let summary = existingSummary || `${basePrefix}${newGoalDesc}`;
  if (!summary.startsWith(basePrefix)) summary = `${basePrefix}${summary}`;

  // Extract existing goal labels after the colon, split on '+'
  const existingPart = summary.slice(basePrefix.length);
  const parts = existingPart.split("+").map(s => s.trim()).filter(Boolean);
  if (!parts.includes(newGoalDesc)) {
    parts.push(newGoalDesc);
  }
  const mergedSummary = `${basePrefix}${parts.join(" + ")}`;

  let desc = existingDescription || "";
  const bullet = `• ${newGoalDesc}`;
  if (!desc.includes(bullet)) {
    desc = desc ? `${desc}\n\n${bullet}` : bullet;
  }
  return { mergedSummary, mergedDescription: desc };
}

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const FALLBACK_ORDER: PreferredWindow[] = ["evening", "afternoon", "morning", "night"];

async function findAcrossDays(
  accessToken: string,
  refreshToken: string,
  baseDay: Date,
  preferred: PreferredWindow,
  timeZone: string,
  lookaheadDays: number,
  options: {
    ignoreAllDayBusy: boolean;
    includeAllCalendars: boolean;
    debug: boolean;
  }
) {
  const windows: PreferredWindow[] = [preferred, ...FALLBACK_ORDER.filter((w) => w !== preferred)];
  const attempts: any[] = [];

  console.log(`[findAcrossDays] Searching ${lookaheadDays} days starting from ${baseDay.toISOString().split('T')[0]}`);
  console.log(`[findAcrossDays] Settings: ignoreAllDay=${options.ignoreAllDayBusy}, includeAll=${options.includeAllCalendars}`);

  for (let d = 0; d < lookaheadDays; d++) {
    const day = new Date(baseDay);
    day.setDate(baseDay.getDate() + d);

    console.log(`[findAcrossDays] Checking day ${d}: ${day.toISOString().split('T')[0]}`);

    for (const w of windows) {
      const bounds = debugWindowBoundsForDay(day, w, timeZone);

      const busy = await getFreeBusy(accessToken, refreshToken, {
        timeMin: bounds.dayStartUtc,
        timeMax: bounds.dayEndUtc,
        timeZone,
        includeAllCalendars: options.includeAllCalendars,
        debug: options.debug
      });

      if (options.debug) {
        attempts.push({
          dayISO: day.toISOString(),
          window: w,
          windowStartLocal: bounds.windowStartLocalISO,
          windowEndLocal: bounds.windowEndLocalISO,
          windowStartUTC: bounds.windowStartUtc.toISOString(),
          windowEndUTC: bounds.windowEndUtc.toISOString(),
          busyCount: busy.length,
        });
      }

      const slot = await findNextAvailableSlotInWindow(accessToken, refreshToken, {
        day,
        window: w,
        durationMinutes: 30,
        timeZone,
        stepMinutes: 30,
        ignoreAllDayBusy: options.ignoreAllDayBusy,
        includeAllCalendars: options.includeAllCalendars,
        debug: options.debug,
      });

      if (slot) {
        console.log(`[findAcrossDays] Found slot on day ${d} in ${w} window: ${slot.start.toISOString()}`);
        return {
          result: { slot, window: w as PreferredWindow, day },
          attempts,
        };
      }
    }
  }

  console.log(`[findAcrossDays] No slots found across ${lookaheadDays} days`);
  return { result: null, attempts };
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = (await req.json()) as {
      goalIndex: number;
      preferredWindow?: PreferredWindow;
      clientTimeZone?: string;
      includeAllCalendars?: boolean;
      ignoreAllDayBusy?: boolean;
      lookaheadDays?: number;
      debug?: boolean;
    };

    if (typeof body.goalIndex !== "number") {
      return NextResponse.json({ error: "goalIndex is required" }, { status: 400 });
    }

    const {
      goalIndex,
      preferredWindow: windowFromClient,
      clientTimeZone,
      includeAllCalendars = false,  
      ignoreAllDayBusy = true,      
      lookaheadDays = 7,            
      debug = true,
    } = body;

    console.log(`[Calendar Add] Starting search for goal ${goalIndex} with settings:`, {
      includeAllCalendars,
      ignoreAllDayBusy,
      lookaheadDays,
      preferredWindow: windowFromClient
    });

    // Google tokens
    const tokenRecord = await prisma.googleCalendarToken.findUnique({ where: { userId } });
    if (!tokenRecord) {
      return NextResponse.json(
        { error: "Google Calendar not connected", needsAuth: true },
        { status: 403 }
      );
    }

    // Profile + goals
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    if (!profile?.goals) {
      return NextResponse.json({ error: "No goals found" }, { status: 404 });
    }

    const goalsData =
      typeof profile.goals === "string"
        ? JSON.parse(profile.goals as any)
        : (profile.goals as any);
    const goal = goalsData?.mental_health_goals?.[goalIndex];
    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    // Prefer PROFILE setting; only use client override if explicitly provided AND valid
    const profilePref =
      (profile as any)?.calendarPreferredWindow ??
      (profile as any)?.preferences?.calendarPreferredWindow ??
      null;

    const normalizeWin = (v: any) =>
      typeof v === "string" ? (v as string).toLowerCase().trim() : v;

    const isWin = (v: any): v is PreferredWindow =>
      v === "morning" || v === "afternoon" || v === "evening" || v === "night";

    // If the client sent a value, we'll use it ONLY if profile doesn't have one
    const chosenRaw =
      profilePref != null && normalizeWin(profilePref)
        ? normalizeWin(profilePref)
        : normalizeWin(windowFromClient);

    const preferredWindow: PreferredWindow = isWin(chosenRaw) ? (chosenRaw as PreferredWindow) : "evening";

    // Debug which source won
    console.log("[Calendar Add] Preferred window sources:", {
      fromProfile: normalizeWin(profilePref),
      fromClient: normalizeWin(windowFromClient),
      chosen: preferredWindow,
    });

    // Timezone: client → profile → Google primary → UTC
    let timeZone: string | null =
      clientTimeZone ||
      (profile as any)?.timeZone ||
      (profile as any)?.preferences?.timeZone ||
      null;
    if (!timeZone) {
      timeZone = await getPrimaryCalendarTimeZone(
        tokenRecord.accessToken,
        tokenRecord.refreshToken
      );
    }
    if (!timeZone) timeZone = "UTC";

    console.log(`[Calendar Add] Using timezone: ${timeZone}, preferred window: ${preferredWindow}`);

    // timeframe → midpoint & end
    const { startDate, endDate } = parseGoalTimeframe(goal.timeframe || "1 month");
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });
    }

    const midMs = start.getTime() + Math.floor((end.getTime() - start.getTime()) / 2);
    const midDay = new Date(midMs);

    console.log(`[Calendar Add] Searching for slots on midpoint: ${midDay.toISOString().split('T')[0]} and end: ${end.toISOString().split('T')[0]}`);

    // Search for slots (midpoint + end)
    const [midDiag, endDiag] = await Promise.all([
      findAcrossDays(
        tokenRecord.accessToken,
        tokenRecord.refreshToken,
        midDay,
        preferredWindow,
        timeZone,
        lookaheadDays,
        { ignoreAllDayBusy, includeAllCalendars, debug }
      ),
      findAcrossDays(
        tokenRecord.accessToken,
        tokenRecord.refreshToken,
        end,
        preferredWindow,
        timeZone,
        lookaheadDays,
        { ignoreAllDayBusy, includeAllCalendars, debug }
      ),
    ]);

    const midFound = midDiag.result;
    const endFound = endDiag.result;

    if (!midFound && !endFound) {
      console.log(`[Calendar Add] No slots found. Returning detailed error.`);
      return NextResponse.json(
        {
          error: "No free 30-min slots found on midpoint or end days.",
          details: {
            timeZone,
            preferredWindow,
            windowsTried: [preferredWindow, ...FALLBACK_ORDER.filter((w) => w !== preferredWindow)],
            lookaheadDays,
            midpointDate: midDay.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
            settings: {
              includeAllCalendars,
              ignoreAllDayBusy
            }
          },
          debugInfo: {
            midpointAttempts: midDiag.attempts,
            endAttempts: endDiag.attempts,
          }
        },
        { status: 409 }
      );
    }

    // Create events with final verification
    const summary = `Goal check-in: ${goal.description}`;
    const description = `${goal.description}`;
    const events: {
      type: "mid" | "final";
      id?: string;
      link?: string;
      when: string;
      window: PreferredWindow;
    }[] = [];

    // Process creations sequentially so a same-day second event can merge into the first
    if (midFound) {
      console.log(`[Calendar Add] Verifying midpoint slot: ${midFound.slot.start.toISOString()}`);
      const ok = await verifyExactFree(
        tokenRecord.accessToken,
        tokenRecord.refreshToken,
        midFound.slot.start,
        midFound.slot.end,
        timeZone,
        includeAllCalendars
      );
      if (ok) {
        // Check if a same-day check-in event already exists; if so, merge
        const dayBounds = debugWindowBoundsForDay(midFound.day, "morning", timeZone);
        const existing = await listSameDayCheckinEvent(
          tokenRecord.accessToken,
          dayBounds.dayStartUtc.toISOString(),
          dayBounds.dayEndUtc.toISOString()
        );
        if (existing?.id) {
          const { mergedSummary, mergedDescription } = mergeCheckinText(
            existing.summary,
            existing.description,
            goal.description
          );
          const updated = await patchCalendarEvent(tokenRecord.accessToken, existing.id, {
            summary: mergedSummary,
            description: mergedDescription,
          });
          console.log(`[Calendar Add] Merged into existing event ${existing.id}`);
          events.push({
            type: "mid",
            id: existing.id,
            link: updated?.htmlLink ?? existing.htmlLink,
            when: midFound.slot.start.toISOString(),
            window: midFound.window,
          });
        } else {
          const e = await createCalendarEvent(tokenRecord.accessToken, tokenRecord.refreshToken, {
            summary,
            description: `• ${goal.description}`,
            startDateTime: midFound.slot.start.toISOString(),
            endDateTime: midFound.slot.end.toISOString(),
            timeZone,
          });
          console.log(`[Calendar Add] Created midpoint event: ${e.id}`);
          events.push({
            type: "mid",
            id: e.id ?? undefined,
            link: e.htmlLink ?? undefined,
            when: midFound.slot.start.toISOString(),
            window: midFound.window,
          });
        }
      } else {
        console.warn("Midpoint slot no longer free — skipped insert.");
      }
    }

    if (endFound) {
      console.log(`[Calendar Add] Verifying end slot: ${endFound.slot.start.toISOString()}`);
      const ok = await verifyExactFree(
        tokenRecord.accessToken,
        tokenRecord.refreshToken,
        endFound.slot.start,
        endFound.slot.end,
        timeZone,
        includeAllCalendars
      );
      if (ok) {
        // Merge-or-create for the end day
        const dayBounds = debugWindowBoundsForDay(endFound.day, "morning", timeZone);
        const existing = await listSameDayCheckinEvent(
          tokenRecord.accessToken,
          dayBounds.dayStartUtc.toISOString(),
          dayBounds.dayEndUtc.toISOString()
        );
        if (existing?.id) {
          const { mergedSummary, mergedDescription } = mergeCheckinText(
            existing.summary,
            existing.description,
            goal.description
          );
          const updated = await patchCalendarEvent(tokenRecord.accessToken, existing.id, {
            summary: mergedSummary,
            description: mergedDescription,
          });
          console.log(`[Calendar Add] Merged into existing event ${existing.id}`);
          events.push({
            type: "final",
            id: existing.id,
            link: updated?.htmlLink ?? existing.htmlLink,
            when: endFound.slot.start.toISOString(),
            window: endFound.window,
          });
        } else {
          const e = await createCalendarEvent(tokenRecord.accessToken, tokenRecord.refreshToken, {
            summary,
            description: `• ${goal.description}`,
            startDateTime: endFound.slot.start.toISOString(),
            endDateTime: endFound.slot.end.toISOString(),
            timeZone,
          });
          console.log(`[Calendar Add] Created final event: ${e.id}`);
          events.push({
            type: "final",
            id: e.id ?? undefined,
            link: e.htmlLink ?? undefined,
            when: endFound.slot.start.toISOString(),
            window: endFound.window,
          });
        }
      } else {
        console.warn("Final slot no longer free — skipped insert.");
      }
    }

    // Persist the event info back to the profile
    const updatedGoal = {
      ...goal,
      calendarCheckins: events,
      calendarEventId: undefined, 
      calendarEventLink: undefined,
    };
    goalsData.mental_health_goals[goalIndex] = updatedGoal;

    await prisma.userProfile.update({
      where: { userId },
      data: { goals: goalsData },
    });

    console.log(`[Calendar Add] Successfully created ${events.length} events`);

    return NextResponse.json({
      success: true,
      preferredWindow,
      timeZone,
      includeAllCalendars,
      ignoreAllDayBusy,
      midEventLink: events.find((e) => e.type === "mid")?.link,
      finalEventLink: events.find((e) => e.type === "final")?.link,
      windowsUsed: events.map((e) => ({ type: e.type, window: e.window })),
      createdCount: events.length,
      settings: {
        lookaheadDays,
        includeAllCalendars,
        ignoreAllDayBusy
      }
    });
  } catch (err: any) {
    console.error("Add to calendar failed:", err);
    const status = err?.status || 500;
    const message = err?.message || "Failed to add goal check-ins";
    if (status === 401 || status === 403) {
      return NextResponse.json({ error: message, needsAuth: true }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
