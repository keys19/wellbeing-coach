// import { NextResponse } from "next/server";
// import { auth } from "@clerk/nextjs/server";
// import { prisma } from "@/lib/db/prisma";
// import { getAuthUrl } from "@/lib/google/calendar";

// export async function GET() {
//     try {
//         // Get the authenticated user
//         const { userId } = await auth();
//         if (!userId) {
//             return NextResponse.json(
//                 { error: "Unauthorized" },
//                 { status: 401 }
//             );
//         }

//         // Check if user has connected Google Calendar
//         const tokenRecord = await prisma.googleCalendarToken.findUnique({
//             where: { userId },
//         });

//         // If no token record is found, generate auth URL
//         if (!tokenRecord) {
//             const authUrl = getAuthUrl();
//             return NextResponse.json({
//                 connected: false,
//                 authUrl,
//             });
//         }

//         // Check if token is expired
//         const isExpired = new Date() > tokenRecord.expiresAt;

//         return NextResponse.json({
//             connected: true,
//             isExpired,
//             connectedAt: tokenRecord.createdAt,
//             authUrl: isExpired ? getAuthUrl() : null,
//         });
//     } catch (error) {
//         console.error("Error checking Google Calendar status:", error);
//         return NextResponse.json(
//             { error: "Failed to check Google Calendar status" },
//             { status: 500 }
//         );
//     }
// } 

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUrl } from "@/lib/google/calendar";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tokenRecord = await prisma.googleCalendarToken.findUnique({
      where: { userId },
    });

    if (!tokenRecord) {
      // No token → always return auth URL to connect
      const authUrl = getAuthUrl();
      return NextResponse.json({
        connected: false,
        isExpired: true,
        connectedAt: null,
        authUrl,
      });
    }

    const isExpired = new Date() > tokenRecord.expiresAt;

    return NextResponse.json({
      connected: true,
      isExpired,
      connectedAt: tokenRecord.createdAt,
      authUrl: isExpired ? getAuthUrl() : getAuthUrl(), // ✅ Always provide a valid URL
    });
  } catch (error) {
    console.error("Error checking Google Calendar status:", error);
    return NextResponse.json(
      { error: "Failed to check Google Calendar status" },
      { status: 500 }
    );
  }
}
