import { NextRequest, NextResponse } from "next/server";
import { prisma, createRetryablePrismaFunction } from "@/lib/db/prisma";
import { auth } from "@clerk/nextjs/server";

// Helper function to extract the sessionId from the URL
function getSessionIdFromURL(url: string): string | null {
    // Extract sessionId from URL pattern /api/sessions/{sessionId}
    const matches = url.match(/\/api\/sessions\/([^\/]+)/);
    return matches ? matches[1] : null;
}

// Handler for GET requests - fetch a specific session by ID
export async function GET(
    request: NextRequest
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Extract sessionId from URL
    const sessionId = getSessionIdFromURL(request.url);
    if (!sessionId) {
        return NextResponse.json(
            { error: "Session ID is required" },
            { status: 400 }
        );
    }

    try {
        // Create retry-able prisma function to get session
        const getSession = createRetryablePrismaFunction(async () => {
            return await prisma.session.findUnique({
                where: {
                    id: sessionId,
                    userId,
                },
            });
        });

        try {
            const session = await getSession();
            if (!session) {
                return NextResponse.json(
                    { error: "Session not found or access denied" },
                    { status: 404 }
                );
            }
            return NextResponse.json(session);
        } catch (dbError) {
            console.error("Database error fetching session:", dbError);
            return NextResponse.json(
                {
                    id: sessionId,
                    createdAt: new Date(),
                    userId,
                    currentPhase: "introduction",
                    error: "Database connection error"
                },
                { status: 200 }
            );
        }
    } catch (error) {
        console.error("Error processing session request:", error);
        return NextResponse.json(
            {
                id: sessionId,
                createdAt: new Date(),
                userId,
                currentPhase: "introduction",
                error: "Failed to fetch session"
            },
            { status: 200 }
        );
    }
} 