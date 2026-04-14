import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAuthUrl } from "@/lib/google/calendar";

export async function GET() {
    try {
        // Get the authenticated user from Clerk
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "You must be signed in to connect Google Calendar" },
                { status: 401 }
            );
        }

        // Generate Google OAuth URL
        const authUrl = getAuthUrl();

        return NextResponse.json({ authUrl });
    } catch (error) {
        console.error("Error generating Google OAuth URL:", error);
        return NextResponse.json(
            { error: "Failed to generate Google OAuth URL" },
            { status: 500 }
        );
    }
} 