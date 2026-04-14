import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma, withRetry } from "@/lib/db/prisma";
import { EmailAddress } from "@clerk/nextjs/server";

export async function POST() {
    try {
        // Get the authenticated user from Clerk
        const { userId } = await auth();

        if (!userId) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }

        console.log(`Ensure-exists API called for user: ${userId}`);

        // Get user details from Clerk
        const clerk = await clerkClient();
        const clerkUser = await clerk.users.getUser(userId);
        const userEmail = clerkUser.emailAddresses.find(
            (email: EmailAddress) => email.id === clerkUser.primaryEmailAddressId
        )?.emailAddress;

        // First check if the user already exists
        let user = await withRetry(() =>
            prisma.user.findUnique({
                where: { id: userId },
            })
        );

        let userCreated = false;

        // Create user if it doesn't exist yet
        if (!user) {
            try {
                console.log(`User ${userId} doesn't exist, creating...`);

                // First check if a user with this email already exists
                if (userEmail) {
                    const existingUserWithEmail = await prisma.user.findFirst({
                        where: { email: userEmail },
                    });

                    if (existingUserWithEmail) {
                        // If a user with this email exists, update their ID to match the current user
                        const fullName = `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim();

                        user = await withRetry(() =>
                          prisma.user.update({
                            where: { id: existingUserWithEmail.id },           // ← use the unique id
                            data: { name: fullName || undefined },
                          })
                        );
                        // user = await withRetry(() =>
                        //     prisma.user.update({
                        //         where: { email: userEmail },
                        //         data: {
                        //             name: `${clerkUser.firstName} ${clerkUser.lastName}`.trim() || undefined,
                        //         },
                        //     })
                        // );
                        // Update the ID using a raw query since it's the primary key
                        await prisma.$runCommandRaw({
                            update: "users",
                            updates: [{
                                q: { email: userEmail },
                                u: { $set: { _id: userId } }
                            }]
                        });
                        console.log(`Updated existing user with email ${userEmail} to use ID ${userId}`);
                    } else {
                        // Create new user with email
                        user = await withRetry(() =>
                            prisma.user.create({
                                data: {
                                    id: userId,
                                    email: userEmail,
                                    name: `${clerkUser.firstName} ${clerkUser.lastName}`.trim() || undefined,
                                },
                            })
                        );
                        console.log(`User ${userId} created successfully with email ${userEmail}`);
                    }
                } else {
                    // Create user without email if none is available
                    user = await withRetry(() =>
                        prisma.user.create({
                            data: {
                                id: userId,
                            },
                        })
                    );
                    console.log(`User ${userId} created successfully without email`);
                }

                userCreated = true;
            } catch (createError) {
                // If there's a unique constraint error, the user might have been created in a race condition
                // Try to fetch it again
                console.warn(`Error creating user, might be a race condition: ${createError instanceof Error ? createError.message : 'Unknown error'}`);

                user = await withRetry(() =>
                    prisma.user.findUnique({
                        where: { id: userId },
                    })
                );

                if (!user) {
                    throw new Error("Failed to create user and user still doesn't exist");
                }
            }
        } else {
            console.log(`User ${userId} already exists`);
        }

        // Return success with creation status
        return new Response(
            JSON.stringify({
                success: true,
                userExists: true,
                userCreated,
                userId
            }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }
        );
    } catch (error) {
        // Safe error logging
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Error ensuring user exists:", errorMessage);

        return new Response(
            JSON.stringify({
                error: "Failed to ensure user exists",
                details: errorMessage,
                success: false
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
} 
