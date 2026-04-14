// // app/api/cron/send-reminders/route.ts
// import { NextRequest } from "next/server";
// import { prisma } from "@/lib/db/prisma";
// import { sendEmail } from "@/lib/email/emailService";
// import { clerkClient as _clerkClient } from "@clerk/nextjs/server";

// export const runtime = "nodejs";
// export const maxDuration = 60;
// export const dynamic = "force-dynamic";


// function isFromVercelCron(req: NextRequest): boolean {
//   const auth = req.headers.get("authorization");
//   return auth === `Bearer ${process.env.CRON_SECRET}`;
// }

// function isFromScheduler(req: NextRequest) {
//   const raw = req.headers.get("authorization") || "";
//   const token = raw.replace(/^Bearer\s+/i, "").trim();
//   const expected = (process.env.SCHEDULER_API_KEY || process.env.CRON_SECRET || "").trim();

//   console.log("[cron auth]", {
//     headerPresent: !!raw,
//     tokenLen: token.length,
//     expectedPresent: !!expected,
//     expectedLen: expected.length,
//     tokenPreview: token ? token.slice(0, 4) + "…" : null,
//     expectedPreview: expected ? expected.slice(0, 4) + "…" : null,
//     nodeEnv: process.env.NODE_ENV,
//   });

//   return token && expected && token === expected;
// }


// const mask = (s: string) => s.replace(/(.{2}).+(@.+)/, "$1***$2");


// async function getClerk() {
//   // @ts-ignore runtime guard
//   return typeof _clerkClient === "function" ? await _clerkClient() : _clerkClient;
// }

// type Recipient = { userId: string; email: string; name: string | null };

// async function fetchClerkRecipients(): Promise<Recipient[]> {
//   const clerk = await getClerk();
//   const out: Recipient[] = [];
//   let offset = 0;
//   const limit = 100;

//   while (true) {

//     const resp: any = await clerk.users.getUserList({ offset, limit });
//     const users: any[] = Array.isArray(resp) ? resp : resp?.data ?? [];
//     if (users.length === 0) break;

//     for (const u of users) {
//       const email =
//         u.primaryEmailAddress?.emailAddress ??
//         u.emailAddresses?.[0]?.emailAddress ??
//         null;
//       if (!email) continue;

//       const name =
//         u.fullName ||
//         [u.firstName, u.lastName].filter(Boolean).join(" ") ||
//         u.username ||
//         null;

//       out.push({ userId: u.id, email, name });
//     }

//     if (users.length < limit) break;
//     offset += limit;
//   }

//   return out;
// }

// function getISOWeekUTC(d: Date): number {
//   const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
//   const dayNum = date.getUTCDay() || 7;
//   date.setUTCDate(date.getUTCDate() + 4 - dayNum);
//   const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
//   return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
// }

// // Only daily / weekly / biweekly
// function isDueToday(freq: string | null | undefined, todayUTC: Date): boolean {
//   if (!freq) return false;
//   const f = freq.toLowerCase();
//   const day = todayUTC.getUTCDay(); // 1 = Monday
//   if (f === "daily") return true;
//   if (f === "weekly") return day === 1;
//   if (f === "biweekly") {
//     if (day !== 1) return false;
//     const wk = getISOWeekUTC(todayUTC);
//     return wk % 2 === 0; 
//   }
//   return false;
// }

// export async function POST(req: NextRequest) {
//   try {
//     console.log("=== CRON JOB STARTING ===");
//     console.log("Timestamp:", new Date().toISOString());
//     console.log("Environment check:", {
//       hasBrevoKey: !!process.env.BREVO_API_KEY,
//       hasFromEmail: !!process.env.BREVO_FROM_EMAIL,
//       nodeEnv: process.env.NODE_ENV,
//     });


//     if (!isFromScheduler(req)) {
//       console.log("Authorization failed");
//       return new Response(JSON.stringify({ error: "Unauthorized" }), {
//         status: 401,
//         headers: { "Content-Type": "application/json" },
//       });
//     }
//     console.log("Authorization passed");


//     let body: any = {};
//     try { body = await req.json(); } catch { /* can be mepty*/ }

//     const allowOverride = process.env.ALLOW_CRON_OVERRIDE === "true";
//     const allowedDomains = (process.env.CRON_OVERRIDE_ALLOWED_DOMAINS || "")
//       .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
//     const maxOverride = Number(process.env.CRON_OVERRIDE_MAX ?? 20);
//     const isAllowedEmail = (e: string) =>
//       allowedDomains.length === 0 || allowedDomains.some(d => e.toLowerCase().endsWith(`@${d}`));

//     let mode: "override" | "clerk" = "clerk";
//     let recipients: { userId: string | null; email: string; name: string | null }[] = [];

//     if (allowOverride && (typeof body?.email === "string" || Array.isArray(body?.emails))) {
//       if (typeof body.email === "string" && isAllowedEmail(body.email)) {
//         recipients = [{ userId: null, email: body.email, name: null }];
//         mode = "override";
//         console.log("Override ->", mask(body.email));
//       } else if (Array.isArray(body.emails) && body.emails.length) {
//         const filtered = body.emails
//           .filter((e: any) => typeof e === "string" && isAllowedEmail(e))
//           .slice(0, maxOverride);
//         if (filtered.length) {
//           recipients = filtered.map((email: string) => ({ userId: null, email, name: null }));
//           mode = "override";
//           console.log(`Override -> ${recipients.length} recipients (masked)`);
//         }
//       }
//     }


//     if (mode === "clerk") {
//       const clerks = await fetchClerkRecipients();
//       recipients = clerks;
//       console.log("Clerk recipients:", recipients.length);
//     }

//     if (!recipients.length) {
//       return new Response(JSON.stringify({
//         success: true,
//         message: "No recipients resolved",
//         mode,
//         userCount: 0,
//         sent: 0,
//         errors: 0,
//         results: [],
//         timestamp: new Date().toISOString(),
//       }), { status: 200, headers: { "Content-Type": "application/json" } });
//     }


//     let filteredOut = 0;
//     if (mode === "clerk") {
//       const ids = recipients.map(r => r.userId).filter(Boolean) as string[];
//       const profiles = ids.length
//         ? await prisma.userProfile.findMany({
//             where: { userId: { in: ids } },
//             select: { userId: true, emailFrequency: true },
//           })
//         : [];
//       const freqMap = new Map(profiles.map(p => [p.userId, (p.emailFrequency ?? "weekly").toLowerCase()]));
//       const todayUTC = new Date();

//       const before = recipients.length;
//       recipients = recipients.filter(r => {
//         if (!r.userId) return true; // shouldn’t happen in clerk mode
//         const freq = freqMap.get(r.userId) || "weekly";
//         return isDueToday(freq, todayUTC);
//       });
//       filteredOut = before - recipients.length;
//       console.log(`Frequency filter -> kept ${recipients.length}, filtered ${filteredOut}`);
//     }

//     if (!recipients.length) {
//       return new Response(JSON.stringify({
//         success: true,
//         message: "No one due today",
//         mode,
//         userCount: 0,
//         sent: 0,
//         errors: 0,
//         results: [],
//         filteredOut,
//         timestamp: new Date().toISOString(),
//       }), { status: 200, headers: { "Content-Type": "application/json" } });
//     }


//     const idsForPrefs = recipients.map(r => r.userId).filter(Boolean) as string[];
//     const prefs = idsForPrefs.length
//       ? await prisma.botPreferences.findMany({
//           where: { userId: { in: idsForPrefs } },
//           select: { userId: true, botName: true },
//         })
//       : [];
//     const prefMap = new Map(prefs.map(p => [p.userId, p.botName || "Taylor"]));


//     const results: Array<{
//       userId?: string | null;
//       email: string;
//       status: "sent" | "error";
//       botName?: string;
//       userName?: string;
//       error?: string;
//     }> = [];
//     let successCount = 0;
//     let errorCount = 0;

//     for (const r of recipients) {
//       const botName = r.userId ? (prefMap.get(r.userId) || "Taylor") : "Taylor";
//       const userName = r.name || "there";

//       try {
//         console.log("Sending ->", mask(r.email));
//         const ok = await sendEmail(
//           r.email,
//           "Mental Health Coach - Friendly Reminder",
//           `Hi ${userName}! This is a friendly reminder from ${botName} to check in with your mental health today.`,
//           `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
//             <h2 style="color: #4F46E5;">Mental Health Coach - Friendly Reminder</h2>
//             <p>Hi ${userName}!</p>
//             <p>This is a friendly reminder from <strong>${botName}</strong> to check in with your mental health today.</p>
//             <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-left: 3px solid #4F46E5;">
//               <p style="margin: 0;">Take a moment to reflect on how you're feeling and remember that it's okay to prioritize your wellbeing.</p>
//             </div>
//             <p>We're here to support you on your mental health journey.</p>
//             <div style="margin-top: 30px; text-align: center;">
//               <p style="color: #666; font-size: 14px;">This is an automated reminder. You can manage your preferences in your account settings.</p>
//             </div>
//           </div>
//           `
//         );

//         if (!ok) throw new Error("sendEmail returned false");

//         successCount++;
//         results.push({
//           userId: r.userId,
//           email: mask(r.email),
//           status: "sent",
//           botName,
//           userName,
//         });
//         await new Promise(res => setTimeout(res, 300));
//       } catch (e: any) {
//         errorCount++;
//         results.push({
//           userId: r.userId,
//           email: mask(r.email),
//           status: "error",
//           error: e?.message || "Unknown error",
//         });
//         console.warn("Failed:", mask(r.email), e?.message || e);
//       }
//     }

//     const response = {
//       success: true,
//       message: `Cron job completed - sent ${successCount} emails`,
//       mode,
//       userCount: recipients.length,
//       sent: successCount,
//       errors: errorCount,
//       filteredOut,
//       results,
//       timestamp: new Date().toISOString(),
//     };

//     console.log("Final results:", response);

//     return new Response(JSON.stringify(response), {
//       status: 200,
//       headers: { "Content-Type": "application/json" },
//     });

//   } catch (error) {
//     const errorMessage = error instanceof Error ? error.message : "Unknown error";
//     console.error("Cron job failed:", errorMessage);

//     return new Response(JSON.stringify({
//       error: "Cron job failed",
//       message: errorMessage,
//     }), {
//       status: 500,
//       headers: { "Content-Type": "application/json" },
//     });
//   }
// }

// export async function GET(req: NextRequest) {
//   return POST(req);
// }

// app/api/cron/send-reminders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/emailService";
import { clerkClient as _clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ---------------- AUTH GUARD ----------------
function isFromScheduler(req: NextRequest) {
  // Primary: Authorization: Bearer <key>
  const rawAuth = req.headers.get("authorization") || "";
  const bearer = rawAuth.replace(/^Bearer\s+/i, "").trim();

  // Secondary (useful for manual curl tests when Authorization is stripped by a proxy):
  const xHeader = (req.headers.get("x-scheduler-key") || "").trim();

  const token = bearer || xHeader;
  const expected = (process.env.SCHEDULER_API_KEY || process.env.CRON_SECRET || "").trim();

  console.log("[cron auth]", {
    headerPresent: !!rawAuth,
    xHeaderPresent: !!xHeader,
    tokenLen: token.length,
    expectedPresent: !!expected,
    expectedLen: expected.length,
    tokenPreview: token ? token.slice(0, 4) + "…" : null,
    expectedPreview: expected ? expected.slice(0, 4) + "…" : null,
    nodeEnv: process.env.NODE_ENV,
  });

  // Optional dev bypass while iterating locally
  if (process.env.NODE_ENV === "development" && process.env.CRON_DEV_BYPASS === "1") return true;

  return token && expected && token === expected;
}

// ---------------- HELPERS ----------------
const mask = (s: string) => s.replace(/(.{2}).+(@.+)/, "$1***$2");

async function getClerk() {
  // @ts-ignore runtime guard
  return typeof _clerkClient === "function" ? await _clerkClient() : _clerkClient;
}

type Recipient = { userId: string; email: string; name: string | null };

async function fetchClerkRecipients(): Promise<Recipient[]> {
  const clerk = await getClerk();
  const out: Recipient[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const resp: any = await clerk.users.getUserList({ offset, limit });
    const users: any[] = Array.isArray(resp) ? resp : resp?.data ?? [];
    if (users.length === 0) break;

    for (const u of users) {
      const email =
        u.primaryEmailAddress?.emailAddress ??
        u.emailAddresses?.[0]?.emailAddress ??
        null;
      if (!email) continue;

      const name =
        u.fullName ||
        [u.firstName, u.lastName].filter(Boolean).join(" ") ||
        u.username ||
        null;

      out.push({ userId: u.id, email, name });
    }

    if (users.length < limit) break;
    offset += limit;
  }

  return out;
}

function getISOWeekUTC(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Only daily / weekly / biweekly
function isDueToday(freq: string | null | undefined, todayUTC: Date): boolean {
  if (!freq) return false;
  const f = freq.toLowerCase();
  const day = todayUTC.getUTCDay(); // 1 = Monday
  if (f === "daily") return true;
  if (f === "weekly") return day === 1;
  if (f === "biweekly") {
    if (day !== 1) return false;
    const wk = getISOWeekUTC(todayUTC);
    return wk % 2 === 0;
  }
  return false;
}

// ---------------- HANDLERS ----------------
export async function POST(req: NextRequest) {
  try {
    console.log("=== CRON JOB STARTING ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Environment check:", {
      hasBrevoKey: !!process.env.BREVO_API_KEY,
      hasFromEmail: !!process.env.BREVO_FROM_EMAIL,
      nodeEnv: process.env.NODE_ENV,
    });

    // Auth
    if (!isFromScheduler(req)) {
      console.log("Authorization failed");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.log("Authorization passed");

    // Optional JSON body (for override mode)
    let body: any = {};
    try { body = await req.json(); } catch { /* ignore empty body */ }

    const allowOverride = process.env.ALLOW_CRON_OVERRIDE === "true";
    const allowedDomains = (process.env.CRON_OVERRIDE_ALLOWED_DOMAINS || "")
      .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const maxOverride = Number(process.env.CRON_OVERRIDE_MAX ?? 20);
    const isAllowedEmail = (e: string) =>
      allowedDomains.length === 0 || allowedDomains.some(d => e.toLowerCase().endsWith(`@${d}`));

    let mode: "override" | "clerk" = "clerk";
    let recipients: { userId: string | null; email: string; name: string | null }[] = [];

    if (allowOverride && (typeof body?.email === "string" || Array.isArray(body?.emails))) {
      if (typeof body.email === "string" && isAllowedEmail(body.email)) {
        recipients = [{ userId: null, email: body.email, name: null }];
        mode = "override";
        console.log("Override ->", mask(body.email));
      } else if (Array.isArray(body.emails) && body.emails.length) {
        const filtered = body.emails
          .filter((e: any) => typeof e === "string" && isAllowedEmail(e))
          .slice(0, maxOverride);
        if (filtered.length) {
          recipients = filtered.map((email: string) => ({ userId: null, email, name: null }));
          mode = "override";
          console.log(`Override -> ${recipients.length} recipients (masked)`);
        }
      }
    }

    if (mode === "clerk") {
      const clerks = await fetchClerkRecipients();
      recipients = clerks;
      console.log("Clerk recipients:", recipients.length);
    }

    if (!recipients.length) {
      return NextResponse.json({
        success: true,
        message: "No recipients resolved",
        mode,
        userCount: 0,
        sent: 0,
        errors: 0,
        results: [],
        timestamp: new Date().toISOString(),
      });
    }

    let filteredOut = 0;
    if (mode === "clerk") {
      const ids = recipients.map(r => r.userId).filter(Boolean) as string[];
      const profiles = ids.length
        ? await prisma.userProfile.findMany({
            where: { userId: { in: ids } },
            select: { userId: true, emailFrequency: true },
          })
        : [];
      const freqMap = new Map(profiles.map(p => [p.userId, (p.emailFrequency ?? "weekly").toLowerCase()]));
      const todayUTC = new Date();

      const before = recipients.length;
      recipients = recipients.filter(r => {
        if (!r.userId) return true; // shouldn’t happen in clerk mode
        const freq = freqMap.get(r.userId) || "weekly";
        return isDueToday(freq, todayUTC);
      });
      filteredOut = before - recipients.length;
      console.log(`Frequency filter -> kept ${recipients.length}, filtered ${filteredOut}`);
    }

    if (!recipients.length) {
      return NextResponse.json({
        success: true,
        message: "No one due today",
        mode,
        userCount: 0,
        sent: 0,
        errors: 0,
        results: [],
        filteredOut,
        timestamp: new Date().toISOString(),
      });
    }

    const idsForPrefs = recipients.map(r => r.userId).filter(Boolean) as string[];
    const prefs = idsForPrefs.length
      ? await prisma.botPreferences.findMany({
          where: { userId: { in: idsForPrefs } },
          select: { userId: true, botName: true },
        })
      : [];
    const prefMap = new Map(prefs.map(p => [p.userId, p.botName || "Taylor"]));

    const results: Array<{
      userId?: string | null;
      email: string;
      status: "sent" | "error";
      botName?: string;
      userName?: string;
      error?: string;
    }> = [];
    let successCount = 0;
    let errorCount = 0;

    for (const r of recipients) {
      const botName = r.userId ? (prefMap.get(r.userId) || "Taylor") : "Taylor";
      const userName = r.name || "there";

      try {
        console.log("Sending ->", mask(r.email));
        const ok = await sendEmail(
          r.email,
          "Mental Health Coach - Friendly Reminder",
          `Hi ${userName}! This is a friendly reminder from ${botName} to check in with your mental health today.`,
          `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4F46E5;">Mental Health Coach - Friendly Reminder</h2>
            <p>Hi ${userName}!</p>
            <p>This is a friendly reminder from <strong>${botName}</strong> to check in with your mental health today.</p>
            <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-left: 3px solid #4F46E5;">
              <p style="margin: 0;">Take a moment to reflect on how you're feeling and remember that it's okay to prioritize your wellbeing.</p>
            </div>
            <p>We're here to support you on your mental health journey.</p>
            <div style="margin-top: 30px; text-align: center;">
              <p style="color: #666; font-size: 14px;">This is an automated reminder. You can manage your preferences in your account settings.</p>
            </div>
          </div>
          `
        );

        if (!ok) throw new Error("sendEmail returned false");

        successCount++;
        results.push({
          userId: r.userId,
          email: mask(r.email),
          status: "sent",
          botName,
          userName,
        });
        await new Promise(res => setTimeout(res, 300));
      } catch (e: any) {
        errorCount++;
        results.push({
          userId: r.userId,
          email: mask(r.email),
          status: "error",
          error: e?.message || "Unknown error",
        });
        console.warn("Failed:", mask(r.email), e?.message || e);
      }
    }

    const response = {
      success: true,
      message: `Cron job completed - sent ${successCount} emails`,
      mode,
      userCount: recipients.length,
      sent: successCount,
      errors: errorCount,
      filteredOut,
      results,
      timestamp: new Date().toISOString(),
    };

    console.log("Final results:", response);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Cron job failed:", message);
    return NextResponse.json({ error: "Cron job failed", message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}