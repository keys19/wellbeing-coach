import { PrismaClient } from "@prisma/client"
import type { User } from "@prisma/client";

// Create a PrismaClient instance with logging
export const prisma = new PrismaClient({
    log: ["error", "warn"],
})

// Maximum number of retries for database operations
const MAX_RETRIES = 3
// Delay between retries (in milliseconds)
const RETRY_DELAY = 1000

// Initialize database connection with retry logic
export async function initDatabase() {
    let retries = 0

    while (retries < MAX_RETRIES) {
        try {
            await prisma.$connect()
            console.log("Database connection initialized successfully.")
            return true
        } catch (error) {
            retries++
            console.error(`Failed to connect to the database (attempt ${retries}/${MAX_RETRIES}):`, error)

            if (retries >= MAX_RETRIES) {
                console.error("Maximum retries reached. Could not connect to the database.")
                return false
            }

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
        }
    }

    return false
}

// Helper function to execute database operations with retry logic
export async function withRetry<T>(operation: () => Promise<T>): Promise<T | null> {
    let retries = 0

    while (retries < MAX_RETRIES) {
        try {
            // Ensure the database is connected before trying the operation
            try {
                // Quick check if Prisma is connected
                await prisma.$connect()
            } catch (connectError) {
                console.error(`Database connection failed: ${connectError instanceof Error ? connectError.message : 'Unknown error'}`)
                // Continue anyway, the operation might still work
            }

            return await operation()
        } catch (error) {
            retries++

            // Fix the error logging to avoid template string issues
            if (error instanceof Error) {
                console.error(`Database operation failed (attempt ${retries}/${MAX_RETRIES}): ${error.message}`)

                // Check for specific MongoDB I/O errors and handle them
                if (error.message.includes('I/O error') ||
                    error.message.includes('Raw query failed') ||
                    error.message.includes('unknown')) {
                    console.error('Database connection appears to be unstable. Waiting longer before retry.')
                    // Wait longer for I/O errors
                    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * 3))
                    continue
                }
            } else {
                console.error(`Database operation failed (attempt ${retries}/${MAX_RETRIES}): Unknown error`)
            }

            if (retries >= MAX_RETRIES) {
                console.error("Maximum retries reached. Database operation failed.")
                return null
            }

            // Wait before retrying with exponential backoff
            const delay = RETRY_DELAY * Math.pow(2, retries - 1)
            await new Promise((resolve) => setTimeout(resolve, delay))
        }
    }

    return null
}

// Get user profile from database with retry logic
export async function getUserProfile(userId: string) {
    if (!userId) {
        console.error("Cannot get user profile: userId is required")
        return null
    }

    try {
        console.log(`Fetching user profile for userId: ${userId}`)

        // First try to find the user profile directly with retry, handling possible database connection issues
        try {
            const profile = await withRetry(() =>
                prisma.userProfile.findUnique({
                    where: { userId },
                })
            )

            if (profile) {
                console.log(`Found profile for userId: ${userId}`)
                return profile
            }
        } catch (findError) {
            console.error(`Error finding user profile: ${findError instanceof Error ? findError.message : 'Unknown error'}`)
            // Continue to next step even if finding fails
        }

        console.log(`No profile found for userId: ${userId}, checking if user exists`)

        // If no profile exists, check if the user exists with retry
        let user: User | null = null;
        try {
            user = await withRetry(() =>
                prisma.user.findUnique({
                    where: { id: userId },
                })
            )
        } catch (findUserError) {
            console.error(`Error finding user: ${findUserError instanceof Error ? findUserError.message : 'Unknown error'}`)
        }

        // If user doesn't exist, create one with retry
        if (!user) {
            console.log(`User ${userId} doesn't exist, creating new user`)
            try {
                user = await withRetry(() =>
                    prisma.user.create({
                        data: {
                            id: userId,
                        },
                    })
                )
                console.log(`Created new user for userId: ${userId}`)
            } catch (createError) {
                console.error(`Error creating user: ${createError instanceof Error ? createError.message : 'Unknown error'}`)
            }
        } else {
            console.log(`User ${userId} exists but has no profile`)
        }

        return null
    } catch (error) {
        // Safe error logging
        if (error instanceof Error) {
            console.error("Error fetching user profile:", error.message)
        } else {
            console.error("Error fetching user profile: Unknown error")
        }
        return null
    }
}

export async function syncClerkUser(
    userId: string,
    data: { email?: string; firstName?: string; lastName?: string; username?: string },
) {
    try {
        await withRetry(() =>
            prisma.user.upsert({
                where: { id: userId },
                update: {
                    email: data.email ?? undefined,
                    name: [data.firstName, data.lastName].filter(Boolean).join(" ") || data.username || undefined,
                },
                create: {
                    id: userId, // Keep as string (Clerk format)
                    email: data.email ?? undefined,
                    name: [data.firstName, data.lastName].filter(Boolean).join(" ") || data.username || undefined,
                },
            }),
        )
        console.log(`User ${userId} synced with Clerk data.`)
        return true
    } catch (error) {
        // Safe error logging
        if (error instanceof Error) {
            console.error("Error syncing user with Clerk data:", error.message)
        } else {
            console.error("Error syncing user with Clerk data: Unknown error")
        }
        return false
    }
}

// Helper function for race conditions that throws instead of returning null
export async function retryOnErrorOrRaceCondition<T>(operation: () => Promise<T>): Promise<T> {
    let retries = 0

    while (retries < MAX_RETRIES) {
        try {
            // Ensure the database is connected before trying the operation
            try {
                // Quick check if Prisma is connected
                await prisma.$connect()
            } catch (connectError) {
                console.error(`Database connection failed: ${connectError instanceof Error ? connectError.message : 'Unknown error'}`)
                // Continue anyway, the operation might still work
            }

            return await operation()
        } catch (error) {
            retries++

            // Fix the error logging to avoid template string issues
            if (error instanceof Error) {
                console.error(`Database operation failed (attempt ${retries}/${MAX_RETRIES}): ${error.message}`)

                // Check for specific MongoDB I/O errors and handle them
                if (error.message.includes('I/O error') ||
                    error.message.includes('Raw query failed') ||
                    error.message.includes('unknown')) {
                    console.error('Database connection appears to be unstable. Waiting longer before retry.')
                    // Wait longer for I/O errors
                    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * 3))
                    continue
                }
            } else {
                console.error(`Database operation failed (attempt ${retries}/${MAX_RETRIES}): Unknown error`)
            }

            if (retries >= MAX_RETRIES) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Maximum retries reached. Database operation failed with error: ${errorMessage}`);
                throw error; // Re-throw the error instead of returning null
            }

            // Wait before retrying with exponential backoff
            const delay = RETRY_DELAY * Math.pow(2, retries - 1)
            await new Promise((resolve) => setTimeout(resolve, delay))
        }
    }

    throw new Error('Unexpected error in retry logic'); // Should never get here
}

// Utility function to create a retryable Prisma function that returns the result directly
export function createRetryablePrismaFunction<T>(operation: () => Promise<T>): () => Promise<T> {
    return async () => {
        try {
            return await retryOnErrorOrRaceCondition(operation);
        } catch (error) {
            console.error('Retryable Prisma function failed:', error instanceof Error ? error.message : 'Unknown error');
            throw error; // Rethrow after logging
        }
    };
}


