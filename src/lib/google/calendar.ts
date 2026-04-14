
// lib/google/calendar.ts
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const DEFAULT_TZ = "UTC";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mental-health-coach.fyi";

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

// FIXED: More reliable timezone conversion
function createZonedDateTime(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  // Create a date string in the target timezone
  const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
  
  // Use Intl.DateTimeFormat to handle the conversion properly
  const tempDate = new Date(dateStr);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Get what the local time would be in the target timezone
  const parts = formatter.formatToParts(tempDate);
  const localYear = parseInt(parts.find(p => p.type === 'year')?.value || '0');
  const localMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0'); 
  const localDay = parseInt(parts.find(p => p.type === 'day')?.value || '0');
  const localHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const localMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  
  // Calculate offset and adjust
  const localTime = new Date(localYear, localMonth - 1, localDay, localHour, localMinute);
  const targetTime = new Date(year, month - 1, day, hour, minute);
  const offset = targetTime.getTime() - localTime.getTime();
  
  return new Date(tempDate.getTime() + offset);
}

// FIXED: Better day bounds calculation
function getZonedDayBounds(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '0');
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
  
  const dayStart = createZonedDateTime(year, month, day, 0, 0, timeZone);
  const dayEnd = createZonedDateTime(year, month, day, 23, 59, timeZone);
  
  return { start: dayStart, end: dayEnd, year, month, day };
}

export type PreferredWindow = "morning" | "afternoon" | "evening" | "night";

// FIXED: Clearer window definitions (local time in target timezone)
const windowHours: Record<PreferredWindow, { startH: number; endH: number }> = {
  morning: { startH: 8, endH: 11 },   // 8:00 AM - 11:59 AM local time
  afternoon: { startH: 12, endH: 15 }, // 12:00 PM - 3:59 PM local time  
  evening: { startH: 16, endH: 19 },   // 4:00 PM - 7:59 PM local time
  night: { startH: 20, endH: 22 },     // 8:00 PM - 10:59 PM local time
};

// FIXED: Improved FreeBusy with filtering and debugging
export const getFreeBusy = async (
  accessToken: string,
  refreshToken: string,
  {
    timeMin,
    timeMax,
    timeZone = DEFAULT_TZ,
    includeAllCalendars = false, // CHANGED: Default to false
    debug = false
  }: {
    timeMin: Date;
    timeMax: Date;
    timeZone?: string;
    includeAllCalendars?: boolean;
    debug?: boolean;
  }
): Promise<{ start: string; end: string }[]> => {
  const calendar = getAuthedCalendar(accessToken, refreshToken);
  
  // Only query primary calendar by default to avoid read-only calendar conflicts
  const items = includeAllCalendars
    ? (await getSelectedCalendars(accessToken, refreshToken)).map((id) => ({ id }))
    : [{ id: "primary" }];

  if (debug) {
    console.log(`[FreeBusy] Querying ${items.length} calendars from ${timeMin.toISOString()} to ${timeMax.toISOString()}`);
  }

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone,
      items,
    },
  });

  const allBusy: { start: string; end: string }[] = [];
  const calendars = res.data.calendars || {};
  
  Object.keys(calendars).forEach((calId) => {
    const busy = (calendars as any)[calId]?.busy || [];
    busy.forEach((b: any) => {
      if (b.start && b.end) {
        allBusy.push({ start: b.start, end: b.end });
      }
    });
  });

  if (debug) {
    console.log(`[FreeBusy] Found ${allBusy.length} busy periods:`, allBusy.map(b => ({
      start: b.start,
      end: b.end,
      duration: (new Date(b.end).getTime() - new Date(b.start).getTime()) / (1000 * 60) + ' minutes'
    })));
  }

  return allBusy;
};

// Helper function to get calendars (simplified)
export async function getSelectedCalendars(accessToken: string, refreshToken: string) {
  const calendar = getAuthedCalendar(accessToken, refreshToken);
  const res = await calendar.calendarList.list();
  
  // Only include primary and owned calendars by default
  const calendars = (res.data.items || [])
    .filter(cal => cal.id && (cal.primary || cal.accessRole === 'owner'))
    .map(cal => cal.id!);
    
  return calendars.length > 0 ? calendars : ['primary'];
}

// export const findNextAvailableSlotInWindow = async (
//   accessToken: string,
//   refreshToken: string,
//   {
//     day,
//     window = "evening",
//     durationMinutes = 30,
//     timeZone = DEFAULT_TZ,
//     stepMinutes = 30,
//     ignoreAllDayBusy = true,
//     includeAllCalendars = false,
//     debug = true
//   }: {
//     day: Date;
//     window?: PreferredWindow;
//     durationMinutes?: number;
//     timeZone?: string;
//     stepMinutes?: number;
//     ignoreAllDayBusy?: boolean;
//     includeAllCalendars?: boolean;
//     debug?: boolean;
//   }
// ): Promise<{ start: Date; end: Date } | null> => {
  
//   const dayBounds = getZonedDayBounds(day, timeZone);
//   const { startH, endH } = windowHours[window];
  
//   // Create window bounds in the target timezone
//   const windowStart = createZonedDateTime(dayBounds.year, dayBounds.month, dayBounds.day, startH, 0, timeZone);
//   const windowEnd = createZonedDateTime(dayBounds.year, dayBounds.month, dayBounds.day, endH, 59, timeZone);
  
//   if (debug) {
//     console.log(`[FindSlot] Searching ${window} window on ${day.toISOString().split('T')[0]} in ${timeZone}`);
//     console.log(`[FindSlot] Window: ${windowStart.toISOString()} to ${windowEnd.toISOString()} UTC`);
//     console.log(`[FindSlot] Local time: ${startH}:00 to ${endH}:59`);
//   }

//   // Get busy periods for the entire day
//   const busy = await getFreeBusy(accessToken, refreshToken, {
//     timeMin: dayBounds.start,
//     timeMax: dayBounds.end,
//     timeZone,
//     includeAllCalendars,
//     debug
//   });

//   if (debug) {
//     console.log(`[FindSlot] Raw busy periods before filtering:`, busy.map(b => ({
//       start: b.start,
//       end: b.end,
//       durationHours: ((new Date(b.end).getTime() - new Date(b.start).getTime()) / (1000 * 60 * 60)).toFixed(1)
//     })));
//   }

//   // FIXED: Apply all-day filtering with better logic and debug output
//   const filteredBusy = busy.filter(b => {
//     const startTime = new Date(b.start).getTime();
//     const endTime = new Date(b.end).getTime();
//     const durationHours = (endTime - startTime) / (1000 * 60 * 60);
    
//     // Consider events longer than 12 hours as "all-day-like"
//     // This catches holidays, out-of-office blocks, etc.
//     const isAllDayLike = durationHours >= 12;
    
//     if (ignoreAllDayBusy && isAllDayLike) {
//       if (debug) {
//         console.log(`[FindSlot] FILTERING OUT all-day event: ${b.start} to ${b.end} (${durationHours.toFixed(1)} hours)`);
//       }
//       return false; // Filter out this busy period
//     }
    
//     if (debug && !isAllDayLike) {
//       console.log(`[FindSlot] KEEPING busy period: ${b.start} to ${b.end} (${durationHours.toFixed(1)} hours)`);
//     }
    
//     return true; // Keep this busy period
//   });

//   if (debug) {
//     console.log(`[FindSlot] After filtering: ${filteredBusy.length} busy periods remain`);
//   }

//   const busyWindows = filteredBusy.map(b => ({
//     s: new Date(b.start).getTime(),
//     e: new Date(b.end).getTime()
//   }));

//   const durMs = durationMinutes * 60 * 1000;
//   const stepMs = stepMinutes * 60 * 1000;
//   const now = new Date();

//   // Start from window start, or next step after current time if in window
//   let startTime = windowStart.getTime();
//   if (now >= windowStart && now <= windowEnd) {
//     startTime = Math.ceil((now.getTime() + 1) / stepMs) * stepMs;
//   }

//   if (debug) {
//     console.log(`[FindSlot] Checking ${Math.floor((windowEnd.getTime() - startTime) / stepMs)} potential slots`);
//     console.log(`[FindSlot] Will check against ${busyWindows.length} remaining busy periods`);
//   }

//   // Try each time slot
//   for (let t = startTime; t + durMs <= windowEnd.getTime(); t += stepMs) {
//     const slotStart = t;
//     const slotEnd = t + durMs;
    
//     // Check for overlaps with remaining busy periods
//     const hasOverlap = busyWindows.some(busy => {
//       const overlap = !(slotEnd <= busy.s || slotStart >= busy.e);
//       if (debug && overlap) {
//         console.log(`[FindSlot] Slot ${new Date(slotStart).toISOString()} overlaps with busy period ${new Date(busy.s).toISOString()} - ${new Date(busy.e).toISOString()}`);
//       }
//       return overlap;
//     });

//     if (!hasOverlap) {
//       if (debug) {
//         console.log(`[FindSlot] ✅ FOUND FREE SLOT: ${new Date(slotStart).toISOString()} - ${new Date(slotEnd).toISOString()}`);
//       }
//       return {
//         start: new Date(slotStart),
//         end: new Date(slotEnd)
//       };
//     }
//   }

//   if (debug) {
//     console.log(`[FindSlot] ❌ No free slots found in ${window} window`);
//   }
//   return null;
// };

// Export other required functions
// FINAL FIX: Corrected findNextAvailableSlotInWindow with working all-day filtering

export const findNextAvailableSlotInWindow = async (
  accessToken: string,
  refreshToken: string,
  {
    day,
    window = "evening",
    durationMinutes = 30,
    timeZone = DEFAULT_TZ,
    stepMinutes = 30,
    ignoreAllDayBusy = true,
    includeAllCalendars = false,
    debug = true
  }: {
    day: Date;
    window?: PreferredWindow;
    durationMinutes?: number;
    timeZone?: string;
    stepMinutes?: number;
    ignoreAllDayBusy?: boolean;
    includeAllCalendars?: boolean;
    debug?: boolean;
  }
): Promise<{ start: Date; end: Date } | null> => {
  
  const dayBounds = getZonedDayBounds(day, timeZone);
  const { startH, endH } = windowHours[window];
  
  // Create window bounds in the target timezone
  const windowStart = createZonedDateTime(dayBounds.year, dayBounds.month, dayBounds.day, startH, 0, timeZone);
  const windowEnd = createZonedDateTime(dayBounds.year, dayBounds.month, dayBounds.day, endH, 59, timeZone);
  
  if (debug) {
    console.log(`[FindSlot] Searching ${window} window on ${day.toISOString().split('T')[0]} in ${timeZone}`);
    console.log(`[FindSlot] Window: ${windowStart.toISOString()} to ${windowEnd.toISOString()} UTC`);
    console.log(`[FindSlot] Local time: ${startH}:00 to ${endH}:59`);
    console.log(`[FindSlot] ignoreAllDayBusy setting: ${ignoreAllDayBusy}`);
  }

  // Get busy periods for the entire day
  const busy = await getFreeBusy(accessToken, refreshToken, {
    timeMin: dayBounds.start,
    timeMax: dayBounds.end,
    timeZone,
    includeAllCalendars,
    debug
  });

  if (debug) {
    console.log(`[FindSlot] Raw busy periods before filtering:`, busy.map(b => ({
      start: b.start,
      end: b.end,
      durationHours: ((new Date(b.end).getTime() - new Date(b.start).getTime()) / (1000 * 60 * 60)).toFixed(1)
    })));
  }

  // CORRECTED: Apply all-day filtering with explicit logic
  let filteredBusy = busy;
  
  if (ignoreAllDayBusy) {
    filteredBusy = busy.filter(b => {
      const startTime = new Date(b.start).getTime();
      const endTime = new Date(b.end).getTime();
      const durationHours = (endTime - startTime) / (1000 * 60 * 60);
      
      // Consider events longer than 12 hours as "all-day-like"
      const isAllDayLike = durationHours >= 12;
      
      if (isAllDayLike) {
        if (debug) {
          console.log(`[FindSlot] 🗑️ FILTERING OUT all-day event: ${b.start} to ${b.end} (${durationHours.toFixed(1)} hours)`);
        }
        return false; // EXCLUDE this busy period
      } else {
        if (debug) {
          console.log(`[FindSlot] ✅ KEEPING busy period: ${b.start} to ${b.end} (${durationHours.toFixed(1)} hours)`);
        }
        return true; // INCLUDE this busy period
      }
    });
  } else {
    if (debug) {
      console.log(`[FindSlot] Not filtering all-day events (ignoreAllDayBusy = false)`);
    }
  }

  if (debug) {
    console.log(`[FindSlot] After filtering: ${filteredBusy.length} busy periods remain (was ${busy.length})`);
    if (filteredBusy.length > 0) {
      console.log(`[FindSlot] Remaining busy periods:`, filteredBusy.map(b => ({
        start: b.start,
        end: b.end,
        durationHours: ((new Date(b.end).getTime() - new Date(b.start).getTime()) / (1000 * 60 * 60)).toFixed(1)
      })));
    }
  }

  const busyWindows = filteredBusy.map(b => ({
    s: new Date(b.start).getTime(),
    e: new Date(b.end).getTime()
  }));

  const durMs = durationMinutes * 60 * 1000;
  const stepMs = stepMinutes * 60 * 1000;
  const now = new Date();

  // Start from window start, or next step after current time if in window
  let startTime = windowStart.getTime();
  if (now >= windowStart && now <= windowEnd) {
    startTime = Math.ceil((now.getTime() + 1) / stepMs) * stepMs;
  }

  if (debug) {
    console.log(`[FindSlot] Checking ${Math.floor((windowEnd.getTime() - startTime) / stepMs)} potential slots`);
    console.log(`[FindSlot] Will check against ${busyWindows.length} remaining busy periods`);
  }

  // Try each time slot
  for (let t = startTime; t + durMs <= windowEnd.getTime(); t += stepMs) {
    const slotStart = t;
    const slotEnd = t + durMs;
    
    // Check for overlaps with remaining busy periods
    const hasOverlap = busyWindows.some(busy => {
      const overlap = !(slotEnd <= busy.s || slotStart >= busy.e);
      if (debug && overlap) {
        console.log(`[FindSlot] Slot ${new Date(slotStart).toISOString()} overlaps with busy period ${new Date(busy.s).toISOString()} - ${new Date(busy.e).toISOString()}`);
      }
      return overlap;
    });

    if (!hasOverlap) {
      if (debug) {
        console.log(`[FindSlot] 🎉 FOUND FREE SLOT: ${new Date(slotStart).toISOString()} - ${new Date(slotEnd).toISOString()}`);
      }
      return {
        start: new Date(slotStart),
        end: new Date(slotEnd)
      };
    }
  }

  if (debug) {
    console.log(`[FindSlot] ❌ No free slots found in ${window} window`);
  }
  return null;
};


export const getAuthUrl = () => {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
};

export const getTokensFromCode = async (code: string) => {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

export const getPrimaryCalendarTimeZone = async (
  accessToken: string,
  refreshToken: string
): Promise<string | null> => {
  const calendar = getAuthedCalendar(accessToken, refreshToken);
  const res = await calendar.calendars.get({ calendarId: "primary" });
  return (res.data as any)?.timeZone ?? null;
};

export const parseGoalTimeframe = (timeframe: string): { startDate: Date; endDate: Date } => {
  const now = new Date();
  const startDate = new Date(now);
  const endDate = new Date(now);
  const m = /(\d+)\s+(day|week|month|year)s?/i.exec(timeframe || "");
  if (m) {
    const amount = parseInt(m[1], 10);
    switch (m[2].toLowerCase()) {
      case "day": endDate.setDate(now.getDate() + amount); break;
      case "week": endDate.setDate(now.getDate() + amount * 7); break;
      case "month": endDate.setMonth(now.getMonth() + amount); break;
      case "year": endDate.setFullYear(now.getFullYear() + amount); break;
    }
  } else {
    endDate.setMonth(now.getMonth() + 1);
  }
  return { startDate, endDate };
};

type EventDetails = {
  summary: string;
  description: string;
  startDateTime: Date | string;
  endDateTime: Date | string;
  timeZone?: string;
};

export const createCalendarEvent = async (
  accessToken: string,
  refreshToken: string,
  eventDetails: EventDetails
) => {
  const calendar = getAuthedCalendar(accessToken, refreshToken);
  const timeZone = eventDetails.timeZone || DEFAULT_TZ;
  const toIso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString());

  const event = {
    summary: eventDetails.summary,
    description: [
      eventDetails.description?.trim() ?? "",
      "",
      `Visit your dashboard: ${APP_URL}`
    ].join("\n"),
    start: { dateTime: toIso(eventDetails.startDateTime), timeZone },
    end: { dateTime: toIso(eventDetails.endDateTime), timeZone },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
  };

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: event,
  });
  return response.data;
};

export async function verifyExactFree(
  accessToken: string,
  refreshToken: string,
  start: Date,
  end: Date,
  timeZone: string,
  includeAllCalendars: boolean = false
) {
  const clashes = await getFreeBusy(accessToken, refreshToken, {
    timeMin: start,
    timeMax: end,
    timeZone,
    includeAllCalendars,
  });
  return clashes.length === 0;
}

// Debug helper
export function debugWindowBoundsForDay(day: Date, window: PreferredWindow, timeZone: string) {
  const bounds = getZonedDayBounds(day, timeZone);
  const { startH, endH } = windowHours[window];
  const windowStart = createZonedDateTime(bounds.year, bounds.month, bounds.day, startH, 0, timeZone);
  const windowEnd = createZonedDateTime(bounds.year, bounds.month, bounds.day, endH, 59, timeZone);

  return {
    dayStartUtc: bounds.start,
    dayEndUtc: bounds.end,
    windowStartUtc: windowStart,
    windowEndUtc: windowEnd,
    windowStartLocalISO: `${bounds.year}-${bounds.month.toString().padStart(2, '0')}-${bounds.day.toString().padStart(2, '0')}T${startH.toString().padStart(2, '0')}:00:00`,
    windowEndLocalISO: `${bounds.year}-${bounds.month.toString().padStart(2, '0')}-${bounds.day.toString().padStart(2, '0')}T${endH.toString().padStart(2, '0')}:59:59`,
  };
}