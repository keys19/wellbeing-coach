
import { prisma } from "@/lib/db/prisma";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

// --- PII + name tokenization ---
const USER_NAME_TOKEN = "[USER_NAME]";
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4})/g;
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function redactPII(s: string) {
  return s
    .replace(EMAIL_RE, "[EMAIL]")
    .replace(IPV4_RE, "[IP]")
    .replace(PHONE_RE, (m) => ((m.match(/\d/g) || []).length >= 10 ? "[PHONE]" : m));
}
function redactName(text: string, name: string) {
  if (!text || !name) return text;
  const rx = new RegExp(`\\b${escapeRegExp(name.trim())}\\b`, "gi");
  return text.replace(rx, USER_NAME_TOKEN);
}
function rehydrateName(text: string, name: string) {
  if (!text || !name) return text;
  return text.replaceAll(USER_NAME_TOKEN, name);
}


type IncomingMessage = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string | Date;
  messageIndex?: number;
};

function getSessionIdFromURL(url: string): string | null {
  const match = url.match(/\/sessions\/([^\/]+)/);
  return match ? match[1] : null;
}

function serializeDateFields<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = { ...obj };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v instanceof Date) out[k] = v.toISOString();
  }
  return out as T;
}

/* GET /api/sessions/[id]/messages */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = getSessionIdFromURL(request.url);
  if (!sessionId) return NextResponse.json({ error: "Session ID not found" }, { status: 400 });

  // verify ownership
  const owns = await prisma.session.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  });
  if (!owns) return NextResponse.json({ messages: [] }, { status: 200 });

  const messages = await prisma.message.findMany({
    where: { sessionId },
    orderBy: [
      { messageIndex: "asc" },
      { createdAt: "asc" },
    ],
  });
  const me = await auth();
  const user = await currentUser();
  const preferredName = (user?.firstName || user?.username || me.userId || "").toString().trim();


  const serialized = messages.map(m => serializeDateFields(m));
    const display = serialized.map((m) => {
    if (typeof m.content === "string" && preferredName) {
      return { ...m, content: rehydrateName(m.content, preferredName) };
    }
    return m;
  });

  return NextResponse.json({ messages: display }, { status: 200 });
}

/* POST /api/sessions/[id]/messages
   Body: { messages: IncomingMessage[], currentPhase?: string }
   Idempotent. No deleteMany. Upserts by id or by (sessionId, messageIndex).
*/
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = getSessionIdFromURL(request.url);
  if (!sessionId) return NextResponse.json({ error: "Session ID not found" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const incoming = (body?.messages ?? []) as IncomingMessage[];
  const currentPhase = body?.currentPhase as string | undefined;

  if (!Array.isArray(incoming)) {
    return NextResponse.json({ error: "Invalid message format" }, { status: 400 });
  }

  // verify ownership
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (incoming.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 }, { status: 200 });
  }

  // snapshot mode: payload contains full history without ids or indexes
  const snapshotMode =
    incoming.length > 0 &&
    incoming.every(m => !m?.id && (m?.messageIndex === undefined || m?.messageIndex === null));

  // current DB stats
  const stats = await prisma.message.aggregate({
    where: { sessionId },
    _count: { _all: true },
    _max: { messageIndex: true },
  });
  const existingCount = stats._count._all;
  const currentMax = stats._max.messageIndex ?? -1;

  // normalize
  let normalized = incoming
    .filter(m => m && m.role !== "system")
    .map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sessionId,
      messageIndex: typeof m.messageIndex === "number" ? Number(m.messageIndex) : undefined,
      createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
    }));
  // Sanitize content before any dedupe/upsert
  const me = await auth();
  let preferredName = (me.userId || "").toString().trim();
  try {
    const user = await currentUser();
    if (user) {
      preferredName = (user.firstName || user.username || preferredName).toString().trim();
    }
  } catch (e) {
    // Clerk 5xx (e.g., "Service Unavailable"): fall back silently; don't break GET
    preferredName = preferredName; // keep whatever we had
  }

  normalized = normalized.map((m) => {
    if (typeof m.content === "string") {
      let content = redactPII(m.content);
      if (preferredName) content = redactName(content, preferredName);
      return { ...m, content };
    }
    return m;
  });

  // de-dupe within payload if any indexes are provided
  if (normalized.some(m => typeof m.messageIndex === "number")) {
    const byIdx = new Map<number, typeof normalized[number]>();
    for (const m of normalized) {
      if (typeof m.messageIndex === "number") byIdx.set(m.messageIndex, m);
    }
    normalized = Array.from(byIdx.values()).sort((a, b) => (a.messageIndex! - b.messageIndex!));
  }

  let toUpsert: typeof normalized = [];

  if (snapshotMode) {
    // treat as full history snapshot: assign 0..N-1 and append only the tail beyond what DB already has
    const withIdx = normalized.map((m, i) => ({ ...m, messageIndex: i }));
    toUpsert = withIdx.slice(existingCount);
  } else {
    // fill missing indexes by appending after currentMax
    let nextIndex = currentMax + 1;
    const filled = normalized.map(m =>
      typeof m.messageIndex === "number" ? m : { ...m, messageIndex: nextIndex++ }
    );
    // skip already saved slots unless there is a stable id
    toUpsert = filled.filter(m => (m.messageIndex as number) > currentMax || m.id);
  }

    // Final collapse by messageIndex to avoid multiple upserts for the same slot
  if (toUpsert.length > 0) {
    const latestByIdx = new Map<number, typeof toUpsert[number]>();
    for (const m of toUpsert) {
      const idx = m.messageIndex as number;
      const prev = latestByIdx.get(idx);
      // Prefer the one with the latest createdAt or, if missing, the one that appears last
      if (
        !prev ||
        ((m.createdAt instanceof Date ? m.createdAt.getTime() : 0) >
          (prev.createdAt instanceof Date ? prev.createdAt.getTime() : 0))
      ) {
        latestByIdx.set(idx, m);
      }
    }
    toUpsert = Array.from(latestByIdx.values()).sort((a, b) => (a.messageIndex! - b.messageIndex!));
  }

  // upsert each message
  for (const m of toUpsert) {
    const looksLikeMongoId = typeof m.id === "string" && /^[0-9a-fA-F]{24}$/.test(m.id);

    if (looksLikeMongoId) {
      await prisma.message.upsert({
        where: { id: m.id as string },
        create: {
          role: m.role,
          content: m.content,
          sessionId,
          messageIndex: m.messageIndex as number,
          ...(m.createdAt ? { createdAt: m.createdAt } : {}),
        },
        update: {
          role: m.role,
          content: m.content,
        },
      });
    } else {
      await prisma.message.upsert({
        where: { sessionId_messageIndex: { sessionId, messageIndex: m.messageIndex as number } },
        create: {
          role: m.role,
          content: m.content,
          sessionId,
          messageIndex: m.messageIndex as number,
          ...(m.createdAt ? { createdAt: m.createdAt } : {}),
        },
        update: {
          role: m.role,
          content: m.content,
        },
      });
    }
  }

  if (currentPhase) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { currentPhase },
    });
  }

  const saved = await prisma.message.findMany({
    where: { sessionId },
    orderBy: [
      { messageIndex: "asc" },
      { createdAt: "asc" },
    ],
  });

  const serialized = saved.map(m => serializeDateFields(m));
  return NextResponse.json({ messages: serialized }, { status: 200 });
}

// export async function POST(request: NextRequest) {
//   const authResult = await auth();
//   if (!authResult?.userId) {
//     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//   }

//   const sessionId = getSessionIdFromURL(request.url);
//   if (!sessionId) {
//     return NextResponse.json({ error: "Session ID not found" }, { status: 400 });
//   }

//   try {
//     const body = await request.json();
//     const { messages, currentPhase } = body as MessageRequest;

//     if (!Array.isArray(messages)) {
//       return NextResponse.json({ error: "Invalid message format" }, { status: 400 });
//     }

//     // Ensure the session exists and belongs to the user
//     const session = await prisma.session.findFirst({
//       where: { id: sessionId, userId: authResult.userId },
//       select: { id: true },
//     });
//     if (!session) {
//       return NextResponse.json({ error: "Session not found" }, { status: 404 });
//     }

//     // Filter out system messages and enforce order via array index
//     const toStore = messages
//       .filter((m) => m && m.role !== "system")
//       .map((m, index) => ({
//         role: m.role,
//         content: m.content,
//         messageIndex: index,
//         sessionId,
//         ...(m.createdAt ? { createdAt: new Date(m.createdAt) } : {}),
//       }));

//     // ---- retry on write conflict/deadlock -----------------------------
//     const MAX_RETRIES = 4;
//     let attempt = 0;
//     // small helper
//     const isConflict = (e: unknown) => {
//       const msg = (e as any)?.message ? String((e as any).message) : String(e);
//       return msg.toLowerCase().includes("write conflict") || msg.toLowerCase().includes("deadlock");
//     };

//     while (true) {
//       try {
//         await prisma.$transaction(async (tx) => {
//           // overwrite strategy: wipe then insert
//           await tx.message.deleteMany({ where: { sessionId } });
//           if (toStore.length > 0) {
//             await tx.message.createMany({ data: toStore });
//           }
//           if (currentPhase) {
//             await tx.session.update({
//               where: { id: sessionId },
//               data: { currentPhase },
//             });
//           }
//         }, { maxWait: 5000, timeout: 10000 });
//         break; // success
//       } catch (e) {
//         if (attempt < MAX_RETRIES && isConflict(e)) {
//           attempt += 1;
//           // exponential backoff: 200ms, 400ms, 800ms, 1600ms
//           const wait = 200 * Math.pow(2, attempt - 1);
//           await new Promise((r) => setTimeout(r, wait));
//           continue;
//         }
//         // rethrow anything else or if out of retries
//         throw e;
//       }
//     }
//     // -------------------------------------------------------------------

//     const saved = await prisma.message.findMany({
//       where: { sessionId },
//       orderBy: { messageIndex: "asc" },
//     });

//     console.log("Saved messages:", saved);
//     return NextResponse.json({ messages: saved });
//   } catch (e) {
//     // DEFENSIVE LOGGING to avoid the "payload must be object" crash in dev overlay
//     const msg = e instanceof Error ? e.message : String(e);
//     console.error("Error saving messages:", msg);

//     // Optional: surface a nicer conflict error for the client to decide retry UI
//     const text = msg.toLowerCase();
//     if (text.includes("write conflict") || text.includes("deadlock")) {
//       return NextResponse.json(
//         { error: "Database conflict detected - please try again" },
//         { status: 409 }
//       );
//     }

//     return NextResponse.json({ error: "Failed to save messages" }, { status: 500 });
//   }
// }