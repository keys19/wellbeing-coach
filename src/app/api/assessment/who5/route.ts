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
            question1,
            question2,
            question3,
            question4,
            question5,
            totalScore,
            interpretation,
            sessionId,
        } = await req.json();

        // Validate required fields
        if (
            typeof question1 !== "number" ||
            typeof question2 !== "number" ||
            typeof question3 !== "number" ||
            typeof question4 !== "number" ||
            typeof question5 !== "number" ||
            typeof totalScore !== "number"
        ) {
            return new Response(
                JSON.stringify({ error: "Invalid data provided. All questions must have numeric answers." }),
                {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        // Create the assessment in the database
        const assessment = await prisma.wHO5Assessment.create({
            data: {
                userId,
                question1,
                question2,
                question3,
                question4,
                question5,
                totalScore,
                interpretation,
                sessionId,
            },
        });

        return new Response(
            JSON.stringify({
                success: true,
                assessment: {
                    id: assessment.id,
                    totalScore: assessment.totalScore,
                    interpretation: assessment.interpretation,
                    createdAt: assessment.createdAt,
                },
            }),
            {
                status: 201,
                headers: { "Content-Type": "application/json" },
            }
        );
    } catch (error) {
        console.error("Error saving WHO-5 assessment:", error);

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

        // Fetch the user's most recent WHO-5 assessments
        const assessments = await prisma.wHO5Assessment.findMany({
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
                assessments: assessments.map((a) => ({
                    id: a.id,
                    totalScore: a.totalScore,
                    interpretation: a.interpretation,
                    createdAt: a.createdAt,
                    questions: {
                        question1: a.question1,
                        question2: a.question2,
                        question3: a.question3,
                        question4: a.question4,
                        question5: a.question5,
                    },
                })),
            }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }
        );
    } catch (error) {
        console.error("Error fetching WHO-5 assessments:", error);

        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
} 