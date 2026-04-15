export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { eventId, goalIndex } = (await req.json()) as {
      eventId?: string;
      goalIndex?: number;
    };

    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    const tokenRecord = await prisma.googleCalendarToken.findUnique({
      where: { userId },
    });

    if (!tokenRecord) {
      return NextResponse.json(
        { error: "Google Calendar not connected" },
        { status: 403 }
      );
    }

    // =========================
    // LAZY GOOGLE IMPORT (FIX)
    // =========================
    const { google } = await import("googleapis");
    const { OAuth2Client } = await import("google-auth-library");

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
    const redirectUri =
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}` +
      `/api/auth/google/callback`;

    const oauth2 = new OAuth2Client(clientId, clientSecret, redirectUri);

    oauth2.setCredentials({
      access_token: tokenRecord.accessToken,
      refresh_token: tokenRecord.refreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2 });

    // 1. Check event exists
    let exists = false;

    try {
      await calendar.events.get({
        calendarId: "primary",
        eventId,
      });
      exists = true;
    } catch (err: any) {
      if (err?.code === 404) {
        exists = false;
      } else {
        console.error("events.get failed:", err);
        return NextResponse.json(
          { error: "Calendar check failed" },
          { status: 502 }
        );
      }
    }

    if (exists || goalIndex === undefined) {
      return NextResponse.json({ exists, cleaned: false });
    }

    // 2. Cleanup goal reference
    const profile = await prisma.userProfile.findUnique({ where: { userId } });

    if (!profile?.goals) {
      return NextResponse.json({
        exists: false,
        cleaned: false,
        note: "No goals found",
      });
    }

    const goalsData =
      typeof profile.goals === "string"
        ? JSON.parse(profile.goals as any)
        : profile.goals;

    const goal = goalsData?.mental_health_goals?.[goalIndex];

    if (!goal) {
      return NextResponse.json({
        exists: false,
        cleaned: false,
        note: "Goal not found",
      });
    }

    if (Array.isArray(goal.calendarCheckins)) {
      goal.calendarCheckins = goal.calendarCheckins.filter(
        (c: any) => c?.id !== eventId
      );

      if (goal.calendarCheckins.length === 0) {
        delete goal.calendarCheckins;
      }
    }

    if (goal.calendarEventId === eventId) {
      delete goal.calendarEventId;
      delete goal.calendarEventLink;
    }

    goalsData.mental_health_goals[goalIndex] = goal;

    await prisma.userProfile.update({
      where: { userId },
      data: { goals: goalsData },
    });

    return NextResponse.json({ exists: false, cleaned: true });
  } catch (err: any) {
    console.error("validate-cleanup failed:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}