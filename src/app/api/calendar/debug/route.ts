export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";

const createOAuth2Client = async () => {
  const { OAuth2Client } = await import("google-auth-library");
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  const redirectUri =
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri);
};

export async function POST(req: NextRequest) {
  try {
    const { google } = await import("googleapis");

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { date, timeZone = "Asia/Dubai" } = await req.json();

    const tokenRecord = await prisma.googleCalendarToken.findUnique({
      where: { userId },
    });

    if (!tokenRecord) {
      return NextResponse.json(
        { error: "Google Calendar not connected" },
        { status: 403 }
      );
    }

    const oauth2Client = await createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokenRecord.accessToken,
      refresh_token: tokenRecord.refreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const targetDate = date ? new Date(date) : new Date();

    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const calendarList = await calendar.calendarList.list();

    const calendars =
      calendarList.data.items?.map((cal) => ({
        id: cal.id,
        summary: cal.summary,
        primary: cal.primary,
      })) || [];

    return NextResponse.json({
      success: true,
      calendarsCount: calendars.length,
    });
  } catch (err: any) {
    console.error("Calendar debug failed:", err);
    return NextResponse.json(
      { error: err?.message || "Debug failed" },
      { status: 500 }
    );
  }
}