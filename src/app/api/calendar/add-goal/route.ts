import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";
import { createCalendarEvent, parseGoalTimeframe } from "@/lib/google/calendar";

export async function POST(req: NextRequest) {
    try {
        // Get the authenticated user
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json(
                { error: "You must be signed in to add goals to calendar" },
                { status: 401 }
            );
        }

        // Get the goal index from the request body
        const { goalIndex } = await req.json();

        if (goalIndex === undefined) {
            return NextResponse.json(
                { error: "Goal index is required" },
                { status: 400 }
            );
        }

        // Check if user has connected Google Calendar
        const tokenRecord = await prisma.googleCalendarToken.findUnique({
            where: { userId },
        });

        if (!tokenRecord) {
            return NextResponse.json(
                { error: "Google Calendar not connected", needsAuth: true },
                { status: 403 }
            );
        }

        // Check if token is expired
        if (new Date() > tokenRecord.expiresAt) {
            return NextResponse.json(
                { error: "Google Calendar token expired", needsReauth: true },
                { status: 403 }
            );
        }

        // Get the user's profile with goals
        const userProfile = await prisma.userProfile.findUnique({
            where: { userId },
        });

        if (!userProfile?.goals) {
            return NextResponse.json(
                { error: "No goals found" },
                { status: 404 }
            );
        }

        // Parse the goals JSON
        const goalsData = typeof userProfile.goals === 'string'
            ? JSON.parse(userProfile.goals)
            : userProfile.goals;

        if (!Array.isArray(goalsData.mental_health_goals)) {
            return NextResponse.json(
                { error: "Invalid goals format" },
                { status: 400 }
            );
        }

        // Get the specific goal
        const goal = goalsData.mental_health_goals[goalIndex];
        if (!goal) {
            return NextResponse.json(
                { error: "Goal not found" },
                { status: 404 }
            );
        }

        // Parse the timeframe to get start and end dates
        const { startDate, endDate } = parseGoalTimeframe(goal.timeframe);

        // Create a description that includes steps and measures
        const stepsText = goal.steps?.length
            ? `Steps:\n${goal.steps.map((step: string, i: number) => `${i + 1}. ${step}`).join('\n')}`
            : '';

        const obstaclesText = goal.obstacles?.length
            ? `\n\nPotential Obstacles:\n${goal.obstacles.map((obstacle: string, i: number) => `${i + 1}. ${obstacle}`).join('\n')}`
            : '';

        const description = `${goal.description}\n\nMeasures: ${goal.measures}\n\n${stepsText}${obstaclesText}`;

        // Create the calendar event
        const calendarEvent = await createCalendarEvent(
            tokenRecord.accessToken,
            tokenRecord.refreshToken,
            {
                summary: `Goal: ${goal.description}`,
                description,
                startDateTime: startDate,
                endDateTime: endDate,
            }
        );

        // Update the goal with the calendar event ID
        goalsData.mental_health_goals[goalIndex] = {
            ...goal,
            calendarEventId: calendarEvent.id,
            calendarEventLink: calendarEvent.htmlLink
        };

        // Save the updated goals
        await prisma.userProfile.update({
            where: { userId },
            data: {
                goals: goalsData
            }
        });

        return NextResponse.json({
            success: true,
            message: "Goal added to calendar",
            eventLink: calendarEvent.htmlLink
        });
    } catch (error) {
        console.error("Error adding goal to calendar:", error);
        return NextResponse.json(
            { error: "Failed to add goal to calendar" },
            { status: 500 }
        );
    }
} 