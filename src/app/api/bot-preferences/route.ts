import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma, retryOnErrorOrRaceCondition } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

// GET route to fetch bot preferences
export async function GET() {
    try {
        const authResult = await auth();
        const userId = authResult.userId;

        // Add cache-control headers to prevent browser caching
        const headers = {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Surrogate-Control": "no-store"
        };

        if (!userId) {
            console.warn("Unauthorized access to bot preferences");
            return NextResponse.json(
                {
                    error: "Unauthorized",
                    preferences: null,
                },
                { status: 401, headers }
            );
        }

        console.log(`Fetching bot preferences for user ${userId}`);

        // Try to fetch the bot preferences with retry
        try {
            // IMPORTANT CHANGE: Query BotPreferences model instead of UserProfile
            const botPreferences = await retryOnErrorOrRaceCondition(
                () => prisma.botPreferences.findUnique({
                    where: { userId },
                })
            );

            console.log("Query successful:", botPreferences);

            // If no preferences exist (e.g., new user), return default preferences
            if (!botPreferences) {
                console.log(`No bot preferences found for user ${userId}, returning defaults`);

                // Return default preferences
                return NextResponse.json(
                    {
                        preferences: {
                            botName: "Taylor",
                            botImageUrl: null,
                            botGender: "Female",
                            hasCustomized: false,
                        },
                    },
                    { status: 200, headers }
                );
            }

            // Return the user's preferences
            return NextResponse.json(
                { preferences: botPreferences },
                { status: 200, headers }
            );
        } catch (findUniqueError) {
            console.error("Error with findUnique on BotPreferences:", findUniqueError);
            console.log("Attempting fallback with findFirst");

            // Try with findFirst as a fallback
            try {
                const botPreferencesFallback = await retryOnErrorOrRaceCondition(
                    () => prisma.botPreferences.findFirst({
                        where: { userId },
                    })
                );

                if (botPreferencesFallback) {
                    console.log("Successfully found preferences using findFirst fallback");
                    return NextResponse.json(
                        { preferences: botPreferencesFallback },
                        { status: 200, headers }
                    );
                } else {
                    console.log(`No bot preferences found with fallback for user ${userId}, returning defaults`);
                    // Return default preferences
                    return NextResponse.json(
                        {
                            preferences: {
                                botName: "Taylor",
                                botImageUrl: null,
                                botGender: "Female",
                                hasCustomized: false,
                            },
                        },
                        { status: 200, headers }
                    );
                }
            } catch (dbError) {
                console.error(`Database error while fetching preferences: ${dbError}`);

                // Return default preferences on database error
                return NextResponse.json(
                    {
                        error: "Database error, using defaults",
                        preferences: {
                            botName: "Taylor",
                            botImageUrl: null,
                            botGender: "Female",
                            hasCustomized: false,
                        },
                    },
                    {
                        status: 200, headers: {
                            "Cache-Control": "private, no-cache"
                        }
                    }
                );
            }
        }
    } catch (error) {
        console.error("Error fetching bot preferences:", error);

        // Return default preferences even on error to avoid breaking the UI
        return NextResponse.json(
            {
                error: "Failed to fetch preferences",
                preferences: {
                    botName: "Taylor",
                    botImageUrl: null,
                    botGender: "Female",
                    hasCustomized: false,
                },
            },
            {
                status: 200, headers: {
                    "Cache-Control": "private, no-cache"
                }
            }
        );
    }
}

// POST route to save bot preferences
export async function POST(req: NextRequest) {
    try {
        const authResult = await auth();
        const userId = authResult.userId;

        if (!userId) {
            console.warn("Unauthorized POST to bot preferences");
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        // Parse the request body
        const body = await req.json();
        const { botName, botGender, botImageUrl } = body;

        // Validate the required fields
        if (!botName || !botGender) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        console.log(`Saving preferences for user ${userId}: ${JSON.stringify({ botName, botGender })}`);

        // Try to find the user first
        try {
            const user = await retryOnErrorOrRaceCondition(
                () => prisma.user.findUnique({
                    where: { id: userId },
                })
            );

            if (!user) {
                console.log(`User ${userId} not found, trying to create...`);

                // Try to create the user if they don't exist
                try {
                    const newUser = await retryOnErrorOrRaceCondition(
                        () => prisma.user.create({
                            data: {
                                id: userId,
                            },
                        })
                    );

                    console.log(`Created new user: ${newUser.id}`);
                } catch (createError) {
                    console.error(`Failed to create user ${userId}:`, createError);

                    // If user creation fails, we'll still try to save the preferences
                    // This gives multiple opportunities for the user to be created
                }
            }

            // Create or update the user's bot preferences
            try {
                // IMPORTANT CHANGE: Use BotPreferences model instead of UserProfile
                const botPrefs = await retryOnErrorOrRaceCondition(
                    () => prisma.botPreferences.upsert({
                        where: { userId },
                        create: {
                            userId,
                            botName,
                            botGender,
                            botImageUrl,
                            hasCustomized: true,
                        },
                        update: {
                            botName,
                            botGender,
                            botImageUrl,
                            hasCustomized: true,
                        },
                    })
                );

                // Add cache-control headers to prevent browser caching
                const headers = {
                    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                    "Surrogate-Control": "no-store"
                };

                return NextResponse.json(
                    { preferences: botPrefs },
                    { status: 201, headers }
                );
            } catch (error) {
                console.error(`Error saving preferences for user ${userId}:`, error);

                // Return a 200 status with error info and defaults with hasCustomized=true
                // This prevents UI loops while acknowledging the error
                return NextResponse.json(
                    {
                        error: "Failed to save preferences",
                        preferences: {
                            botName,
                            botGender,
                            botImageUrl,
                            hasCustomized: true, // Important: mark as customized to prevent redirect loops
                        },
                    },
                    { status: 200 }
                );
            }
        } catch (dbError) {
            console.error(`Database error while saving preferences: ${dbError}`);
            return NextResponse.json(
                {
                    error: "Database connection error",
                    preferences: {
                        botName,
                        botGender,
                        botImageUrl,
                        hasCustomized: true,
                    },
                },
                { status: 200 }
            );
        }
    } catch (error) {
        console.error("Error processing bot preferences:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

