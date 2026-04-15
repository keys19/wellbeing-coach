// import { google } from "googleapis";
// import { OAuth2Client } from "google-auth-library";

// const SCOPES = ["https://www.googleapis.com/auth/calendar"];
// const DEFAULT_TZ = "UTC";

// const createOAuth2Client = () => {
//   const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
//   const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
//   const redirectUri =
//     `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/google/callback`;

//   if (!clientId || !clientSecret) {
//     throw new Error("Missing Google OAuth credentials");
//   }

//   return new OAuth2Client(clientId, clientSecret, redirectUri);
// };

// const getAuthedCalendar = (accessToken: string, refreshToken: string) => {
//   const client = createOAuth2Client();
//   client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
//   return google.calendar({ version: "v3", auth: client });
// };

// // ---------------- TIME UTIL ----------------

// export type PreferredWindow = "morning" | "afternoon" | "evening" | "night";

// const windowHours: Record<PreferredWindow, { start: number; end: number }> = {
//   morning: { start: 8, end: 11 },
//   afternoon: { start: 12, end: 15 },
//   evening: { start: 16, end: 19 },
//   night: { start: 20, end: 22 },
// };

// function getDayBounds(date: Date) {
//   const start = new Date(date);
//   start.setHours(0, 0, 0, 0);

//   const end = new Date(date);
//   end.setHours(23, 59, 59, 999);

//   return { start, end };
// }

// // ---------------- FREEBUSY ----------------

// export const getFreeBusy = async (
//   accessToken: string,
//   refreshToken: string,
//   args: {
//     timeMin: Date;
//     timeMax: Date;
//     timeZone?: string;
//     includeAllCalendars?: boolean;
//   }
// ) => {
//   const calendar = getAuthedCalendar(accessToken, refreshToken);

//   const items = [{ id: "primary" }];

//   const res = await calendar.freebusy.query({
//     requestBody: {
//       timeMin: args.timeMin.toISOString(),
//       timeMax: args.timeMax.toISOString(),
//       timeZone: args.timeZone || DEFAULT_TZ,
//       items,
//     },
//   });

//   const busy: { start: string; end: string }[] = [];

//   const calendars = res.data.calendars || {};
//   Object.values(calendars).forEach((cal: any) => {
//     (cal.busy || []).forEach((b: any) => {
//       busy.push({ start: b.start, end: b.end });
//     });
//   });

//   return busy;
// };

// // ---------------- SLOT FINDER ----------------

// export const findNextAvailableSlotInWindow = async (
//   accessToken: string,
//   refreshToken: string,
//   args: {
//     day: Date;
//     window?: PreferredWindow;
//     durationMinutes?: number;
//     timeZone?: string;
//     stepMinutes?: number;
//     ignoreAllDayBusy?: boolean;
//   }
// ) => {
//   const {
//     day,
//     window = "evening",
//     durationMinutes = 30,
//     stepMinutes = 30,
//     ignoreAllDayBusy = true,
//   } = args;

//   const { start, end } = getDayBounds(day);
//   const hours = windowHours[window];

//   const windowStart = new Date(day);
//   windowStart.setHours(hours.start, 0, 0, 0);

//   const windowEnd = new Date(day);
//   windowEnd.setHours(hours.end, 59, 59, 999);

//   const busy = await getFreeBusy(accessToken, refreshToken, {
//     timeMin: start,
//     timeMax: end,
//   });

//   const filteredBusy = ignoreAllDayBusy
//     ? busy.filter(b => {
//         const hrs =
//           (new Date(b.end).getTime() - new Date(b.start).getTime()) / 36e5;
//         return hrs < 12;
//       })
//     : busy;

//   const busyBlocks = filteredBusy.map(b => ({
//     s: new Date(b.start).getTime(),
//     e: new Date(b.end).getTime(),
//   }));

//   const step = stepMinutes * 60 * 1000;
//   const dur = durationMinutes * 60 * 1000;

//   for (let t = windowStart.getTime(); t + dur <= windowEnd.getTime(); t += step) {
//     const conflict = busyBlocks.some(b => !(t + dur <= b.s || t >= b.e));
//     if (!conflict) {
//       return { start: new Date(t), end: new Date(t + dur) };
//     }
//   }

//   return null;
// };

// // ---------------- DEBUG HELPERS ----------------

// export const debugWindowBoundsForDay = (
//   day: Date,
//   window: PreferredWindow,
//   timeZone: string
// ) => {
//   const hours = windowHours[window];

//   const windowStart = new Date(day);
//   windowStart.setHours(hours.start, 0, 0, 0);

//   const windowEnd = new Date(day);
//   windowEnd.setHours(hours.end, 59, 59, 999);

//   const bounds = getDayBounds(day);

//   return {
//     dayStartUtc: bounds.start,
//     dayEndUtc: bounds.end,
//     windowStartUtc: windowStart,
//     windowEndUtc: windowEnd,
//     windowStartLocalISO: windowStart.toISOString(),
//     windowEndLocalISO: windowEnd.toISOString(),
//   };
// };

// export const verifyExactFree = async (
//   accessToken: string,
//   refreshToken: string,
//   start: Date,
//   end: Date,
//   timeZone: string,
//   includeAllCalendars = false
// ) => {
//   const busy = await getFreeBusy(accessToken, refreshToken, {
//     timeMin: start,
//     timeMax: end,
//     timeZone,
//     includeAllCalendars,
//   });

//   return busy.length === 0;
// };

// export const getPrimaryCalendarTimeZone = async (
//   accessToken: string,
//   refreshToken: string
// ) => {
//   const calendar = getAuthedCalendar(accessToken, refreshToken);
//   const res = await calendar.calendars.get({ calendarId: "primary" });
//   return (res.data as any)?.timeZone ?? "UTC";
// };

// export const getTokensFromCode = async (code: string) => {
//   const oauth2Client = createOAuth2Client();
//   const { tokens } = await oauth2Client.getToken(code);
//   return tokens;
// };

// export const getAuthUrl = () => {
//   const oauth2Client = createOAuth2Client();
//   return oauth2Client.generateAuthUrl({
//     access_type: "offline",
//     scope: SCOPES,
//     prompt: "consent",
//   });
// };

// // ---------------- EVENT CREATION ----------------

// export const createCalendarEvent = async (
//   accessToken: string,
//   refreshToken: string,
//   event: {
//     summary: string;
//     description: string;
//     startDateTime: string | Date;
//     endDateTime: string | Date;
//     timeZone?: string;
//   }
// ) => {
//   const calendar = getAuthedCalendar(accessToken, refreshToken);

//   const res = await calendar.events.insert({
//     calendarId: "primary",
//     requestBody: {
//       summary: event.summary,
//       description: event.description,
//       start: {
//         dateTime:
//           typeof event.startDateTime === "string"
//             ? event.startDateTime
//             : event.startDateTime.toISOString(),
//       },
//       end: {
//         dateTime:
//           typeof event.endDateTime === "string"
//             ? event.endDateTime
//             : event.endDateTime.toISOString(),
//       },
//     },
//   });

//   return res.data;
// };

// // ---------------- GOAL TIMEFRAME ----------------

// export const parseGoalTimeframe = (timeframe: string) => {
//   const now = new Date();
//   const end = new Date(now);

//   const match = /(\d+)\s*(day|week|month|year)/i.exec(timeframe || "");

//   if (!match) {
//     end.setMonth(end.getMonth() + 1);
//     return { startDate: now, endDate: end };
//   }

//   const n = parseInt(match[1], 10);
//   const unit = match[2].toLowerCase();

//   if (unit === "day") end.setDate(end.getDate() + n);
//   if (unit === "week") end.setDate(end.getDate() + n * 7);
//   if (unit === "month") end.setMonth(end.getMonth() + n);
//   if (unit === "year") end.setFullYear(end.getFullYear() + n);

//   return { startDate: now, endDate: end };
// };


// Google Calendar integration disabled

export type PreferredWindow = "morning" | "afternoon" | "evening" | "night";

export interface GoogleTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
}

export interface CalendarEvent {
  id?: string;
  htmlLink?: string;
}

export const getAuthUrl = (): string => "";

export const getTokensFromCode = async (_code: string): Promise<GoogleTokens> => ({
  access_token: null,
  refresh_token: null,
  expiry_date: null,
});

export const getFreeBusy = async (
  _accessToken: string,
  _refreshToken: string,
  _args?: unknown
): Promise<{ start: string; end: string }[]> => [];

export const findNextAvailableSlotInWindow = async (
  _accessToken: string,
  _refreshToken: string,
  _args?: unknown
): Promise<{ start: Date; end: Date } | null> => null;

export const verifyExactFree = async (
  _accessToken: string,
  _refreshToken: string,
  _start: Date,
  _end: Date,
  _timeZone: string,
  _includeAllCalendars?: boolean
): Promise<boolean> => true;

export const getPrimaryCalendarTimeZone = async (
  _accessToken: string,
  _refreshToken: string
): Promise<string> => "UTC";

export const createCalendarEvent = async (
  _accessToken: string,
  _refreshToken: string,
  _event: unknown
): Promise<CalendarEvent> => ({ id: undefined, htmlLink: undefined });

export const parseGoalTimeframe = (timeframe: string) => {
  const now = new Date();
  const end = new Date(now);
  const match = /(\d+)\s*(day|week|month|year)/i.exec(timeframe || "");
  if (!match) { end.setMonth(end.getMonth() + 1); return { startDate: now, endDate: end }; }
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === "day") end.setDate(end.getDate() + n);
  if (unit === "week") end.setDate(end.getDate() + n * 7);
  if (unit === "month") end.setMonth(end.getMonth() + n);
  if (unit === "year") end.setFullYear(end.getFullYear() + n);
  return { startDate: now, endDate: end };
};

export const debugWindowBoundsForDay = () => ({});