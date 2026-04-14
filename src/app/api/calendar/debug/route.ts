// Calendar Diagnostic Route - Add this as /api/calendar/debug/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

const createOAuth2Client = () => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/google/callback`;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials are not properly configured");
  }
  return new OAuth2Client(clientId, clientSecret, redirectUri);
};

const getAuthedCalendar = (accessToken: string, refreshToken: string) => {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return google.calendar({ version: "v3", auth: oauth2Client });
};

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { date, timeZone = "Asia/Dubai" } = await req.json();
    const targetDate = date ? new Date(date) : new Date();

    // Get tokens
    const tokenRecord = await prisma.googleCalendarToken.findUnique({ where: { userId } });
    if (!tokenRecord) {
      return NextResponse.json({ error: "Google Calendar not connected" }, { status: 403 });
    }

    const calendar = getAuthedCalendar(tokenRecord.accessToken, tokenRecord.refreshToken);

    // 1. Get all calendars
    const calendarList = await calendar.calendarList.list();
    const calendars = calendarList.data.items?.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary,
      accessRole: cal.accessRole,
      selected: cal.selected,
      backgroundColor: cal.backgroundColor,
      hidden: cal.hidden
    })) || [];

    // 2. Set day bounds (full day in target timezone)
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    console.log(`[Debug] Checking ${dayStart.toISOString()} to ${dayEnd.toISOString()}`);

    // 3. Get FreeBusy for primary calendar only
    const primaryFreeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        timeZone,
        items: [{ id: "primary" }],
      },
    });

    // 4. Get FreeBusy for ALL calendars
    const allCalendarItems = calendars.map(cal => ({ id: cal.id }));
    const allFreeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        timeZone,
        items: allCalendarItems,
      },
    });

    // 5. Get actual events from primary calendar
    const events = await calendar.events.list({
      calendarId: "primary",
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    // 6. Get events from ALL calendars
    const allCalendarEvents = await Promise.all(
      calendars.slice(0, 5).map(async (cal) => { // Limit to first 5 to avoid rate limits
        try {
          const calEvents = await calendar.events.list({
            calendarId: cal.id!,
            timeMin: dayStart.toISOString(),
            timeMax: dayEnd.toISOString(),
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 10
          });
          return {
            calendarId: cal.id,
            calendarName: cal.summary,
            events: calEvents.data.items?.map(event => ({
              id: event.id,
              summary: event.summary,
              start: event.start?.dateTime || event.start?.date,
              end: event.end?.dateTime || event.end?.date,
              status: event.status,
              transparency: event.transparency,
              eventType: event.eventType,
              allDay: !event.start?.dateTime // If no dateTime, it's all-day
            })) || []
          };
        } catch (err) {
          return {
            calendarId: cal.id,
            calendarName: cal.summary,
            error: (err as any)?.message || "Access denied"
          };
        }
      })
    );

    // 7. Analyze the FreeBusy results
    const primaryBusy = primaryFreeBusy.data.calendars?.primary?.busy || [];
    const allBusy: any[] = [];
    
    Object.entries(allFreeBusy.data.calendars || {}).forEach(([calId, calData]) => {
      const busy = (calData as any)?.busy || [];
      busy.forEach((b: any) => {
        const calInfo = calendars.find(c => c.id === calId);
        allBusy.push({
          calendarId: calId,
          calendarName: calInfo?.summary || "Unknown",
          start: b.start,
          end: b.end,
          durationHours: ((new Date(b.end).getTime() - new Date(b.start).getTime()) / (1000 * 60 * 60)).toFixed(1)
        });
      });
    });

    return NextResponse.json({
      success: true,
      targetDate: targetDate.toISOString(),
      timeZone,
      dayBounds: {
        start: dayStart.toISOString(),
        end: dayEnd.toISOString()
      },
      calendars: {
        total: calendars.length,
        list: calendars
      },
      freeBusy: {
        primaryOnly: primaryBusy.map((b: any) => ({
          start: b.start,
          end: b.end,
          durationHours: ((new Date(b.end).getTime() - new Date(b.start).getTime()) / (1000 * 60 * 60)).toFixed(1)
        })),
        allCalendars: allBusy
      },
      actualEvents: {
        primaryCalendar: events.data.items?.map(event => ({
          id: event.id,
          summary: event.summary,
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          status: event.status,
          transparency: event.transparency,
          allDay: !event.start?.dateTime
        })) || [],
        allCalendars: allCalendarEvents
      }
    });

  } catch (err: any) {
    console.error("Calendar debug failed:", err);
    return NextResponse.json({ 
      error: err?.message || "Debug failed",
      stack: err?.stack 
    }, { status: 500 });
  }
}