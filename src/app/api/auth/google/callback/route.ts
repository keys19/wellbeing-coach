import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTokensFromCode } from "@/lib/google/calendar";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
    try {
        // Get the code from the query parameters
        const code = req.nextUrl.searchParams.get("code");
        if (!code) {
            return NextResponse.redirect(
                new URL("/app/account?error=missing_code", req.url)
            );
        }

        // Get the authenticated user
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.redirect(
                new URL("/sign-in?next=/app/account", req.url)
            );
        }

        // Exchange authorization code for tokens
        const tokens = await getTokensFromCode(code);

        if (!tokens || !tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
            return NextResponse.redirect(
                new URL("/app/account?error=invalid_tokens", req.url)
            );
        }

        // Calculate the expiry date
        const expiresAt = new Date(tokens.expiry_date);

        // Store the tokens in the database
        await prisma.googleCalendarToken.upsert({
            where: { userId },
            update: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt,
                updatedAt: new Date(),
            },
            create: {
                userId,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt,
            },
        });

        // Redirect to account page with success message
        return NextResponse.redirect(
            new URL("/app/account?success=google_connected", req.url)
        );
    } catch (error) {
        console.error("Error handling Google OAuth callback:", error);
        return NextResponse.redirect(
            new URL("/app/account?error=callback_failed", req.url)
        );
    }
} 