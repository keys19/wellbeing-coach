export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
    try {
        const code = req.nextUrl.searchParams.get("code");

        if (!code) {
            return NextResponse.redirect(
                new URL("/app/account?error=missing_code", req.url)
            );
        }

        const { userId } = await auth();

        if (!userId) {
            return NextResponse.redirect(
                new URL("/sign-in?next=/app/account", req.url)
            );
        }

        // IMPORTANT: lazy import to prevent build-time evaluation crashes
        const { getTokensFromCode } = await import("@/lib/google/calendar");

        const tokens = await getTokensFromCode(code);

        if (
            !tokens?.access_token ||
            !tokens?.refresh_token ||
            !tokens?.expiry_date
        ) {
            return NextResponse.redirect(
                new URL("/app/account?error=invalid_tokens", req.url)
            );
        }

        const expiresAt = new Date(tokens.expiry_date);

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

        return NextResponse.redirect(
            new URL("/app/account?success=google_connected", req.url)
        );
    } catch (error) {
        console.error("Google OAuth callback error:", error);

        return NextResponse.redirect(
            new URL("/app/account?error=callback_failed", req.url)
        );
    }
}