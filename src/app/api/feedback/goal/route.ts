import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
    try {
        // Get the authenticated user from Clerk
        const { userId } = await auth();

        if (!userId) {
            return new Response(
                JSON.stringify({ error: "Unauthorized" }),
                {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        // Parse request body
        const {
            goalDescription,
            helpfulnessRating,
            comment,
            emotionalState,
            sessionId,
        } = await req.json();

        // Validate required fields
        if (
            !goalDescription ||
            typeof helpfulnessRating !== "number" ||
            helpfulnessRating < 1 ||
            helpfulnessRating > 5
        ) {
            return new Response(
                JSON.stringify({
                    error: "Invalid data. Goal description and helpfulness rating (1-5) are required."
                }),
                {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        // Create the feedback in the database
        const feedback = await prisma.goalFeedback.create({
            data: {
                userId,
                goalDescription,
                helpfulnessRating,
                comment,
                emotionalState,
                sessionId,
            },
        });

        return new Response(
            JSON.stringify({
                success: true,
                feedback: {
                    id: feedback.id,
                    helpfulnessRating: feedback.helpfulnessRating,
                    createdAt: feedback.createdAt,
                },
            }),
            {
                status: 201,
                headers: { "Content-Type": "application/json" },
            }
        );
    } catch (error) {
        console.error("Error saving goal feedback:", error);

        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
}

export async function GET(req: NextRequest) {
    try {
        // Get the authenticated user from Clerk
        const { userId } = await auth();

        if (!userId) {
            return new Response(
                JSON.stringify({ error: "Unauthorized" }),
                {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        // Get query parameters
        const searchParams = req.nextUrl.searchParams;
        const limit = parseInt(searchParams.get("limit") || "10");

        // Fetch the user's feedback entries
        const feedbacks = await prisma.goalFeedback.findMany({
            where: {
                userId,
            },
            orderBy: {
                createdAt: "desc",
            },
            take: limit,
        });

        return new Response(
            JSON.stringify({
                success: true,
                feedbacks: feedbacks.map((f) => ({
                    id: f.id,
                    goalDescription: f.goalDescription,
                    helpfulnessRating: f.helpfulnessRating,
                    emotionalState: f.emotionalState,
                    comment: f.comment,
                    createdAt: f.createdAt,
                })),
            }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }
        );
    } catch (error) {
        console.error("Error fetching goal feedback:", error);

        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
} 