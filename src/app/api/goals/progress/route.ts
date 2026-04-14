import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

interface Goal {
    description: string;
    measures: string;
    timeframe: string;
    steps: string[];
    obstacles: string[];
    completed: boolean;
    progress: number;
    lastUpdated: string;
    completedAt?: string;
    keywords?: string[];
}

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { messageContent } = await req.json();
        if (!messageContent) {
            return NextResponse.json({ error: "Message content is required" }, { status: 400 });
        }

        // Get user's profile with goals
        const userProfile = await prisma.userProfile.findUnique({
            where: { userId },
        });

        if (!userProfile?.goals) {
            return NextResponse.json({ error: "No goals found" }, { status: 404 });
        }

        // Parse the goals JSON
        const goalsData = typeof userProfile.goals === 'string'
            ? JSON.parse(userProfile.goals)
            : userProfile.goals;

        if (!Array.isArray(goalsData.mental_health_goals)) {
            return NextResponse.json({ error: "Invalid goals format" }, { status: 400 });
        }

        // First, identify which goal is being discussed
        const { goalIndex, relevanceScore } = identifyRelevantGoal(messageContent, goalsData.mental_health_goals);

        // Track if a goal was newly completed
        let goalNewlyCompleted = false;

        // Only update progress if we're confident about which goal is being discussed
        if (goalIndex !== -1 && relevanceScore > 0.5) {
            const updatedGoals = {
                mental_health_goals: goalsData.mental_health_goals.map((goal: Goal, index: number) => {
                    if (index === goalIndex) {
                        const newProgress = calculateProgress(goal, messageContent);
                        // Check if progress increased and is now reaching 100%
                        if (newProgress > (goal.progress || 0)) {
                            const wasCompletedBefore = goal.completed === true;
                            const isCompletedNow = newProgress >= 100;

                            // Check if this is a newly completed goal
                            if (isCompletedNow && !wasCompletedBefore) {
                                goalNewlyCompleted = true;
                            }

                            return {
                                ...goal,
                                progress: newProgress,
                                lastUpdated: new Date().toISOString(),
                                completed: isCompletedNow,
                                // Add completedAt timestamp when goal is newly completed
                                ...(isCompletedNow && !wasCompletedBefore ? {
                                    completedAt: new Date().toISOString()
                                } : {})
                            };
                        }
                    }
                    return goal;
                })
            };

            // Save the updated goals
            const updatedProfile = await prisma.userProfile.update({
                where: { userId },
                data: {
                    goals: updatedGoals
                }
            });

            return NextResponse.json({
                success: true,
                goals: updatedProfile.goals,
                updatedGoalIndex: goalIndex,
                // Indicate if a goal was newly completed to trigger UI feedback
                goalNewlyCompleted,
                // Include the completed goal's info if relevant
                ...(goalNewlyCompleted ? {
                    completedGoal: updatedGoals.mental_health_goals[goalIndex]
                } : {})
            });
        }

        // If no relevant goal was found, return without making changes
        return NextResponse.json({
            success: true,
            goals: goalsData,
            updatedGoalIndex: -1
        });

    } catch (error) {
        console.error("Error updating goal progress:", error);
        return NextResponse.json(
            { error: "Failed to update goal progress" },
            { status: 500 }
        );
    }
}

function identifyRelevantGoal(messageContent: string, goals: Goal[]): { goalIndex: number; relevanceScore: number } {
    const messageLower = messageContent.toLowerCase();
    let maxScore = 0;
    let relevantGoalIndex = -1;

    goals.forEach((goal, index) => {
        let score = 0;
        const descriptionLower = goal.description.toLowerCase();
        const measuresLower = goal.measures.toLowerCase();

        // Check for direct mentions of the goal description
        if (messageLower.includes(descriptionLower)) {
            score += 0.5;
        }

        // Check for mentions of measurement criteria
        if (messageLower.includes(measuresLower)) {
            score += 0.3;
        }

        // Check for mentions of specific steps
        goal.steps.forEach(step => {
            if (messageLower.includes(step.toLowerCase())) {
                score += 0.2;
            }
        });

        // Check for numerical improvements (e.g., "from 7/10 to 4/10")
        const numericalProgressRegex = /from\s*(\d+)(?:\/\d+)?\s*to\s*(\d+)(?:\/\d+)?/i;
        const match = messageLower.match(numericalProgressRegex);
        if (match && parseInt(match[1]) > parseInt(match[2])) {
            score += 0.4;
        }

        // Check for specific keywords related to the goal
        const goalKeywords = extractKeywords(goal.description);
        goalKeywords.forEach(keyword => {
            if (messageLower.includes(keyword.toLowerCase())) {
                score += 0.1;
            }
        });

        if (score > maxScore) {
            maxScore = score;
            relevantGoalIndex = index;
        }
    });

    return { goalIndex: relevantGoalIndex, relevanceScore: maxScore };
}

function calculateProgress(goal: Goal, messageContent: string): number {
    const currentProgress = goal.progress || 0;
    let progressIncrease = 0;

    const messageLower = messageContent.toLowerCase();

    // Check for numerical improvements
    const numericalProgressRegex = /from\s*(\d+)(?:\/\d+)?\s*to\s*(\d+)(?:\/\d+)?/i;
    const match = messageLower.match(numericalProgressRegex);
    if (match) {
        const fromValue = parseInt(match[1]);
        const toValue = parseInt(match[2]);
        if (fromValue > toValue) {
            // Calculate percentage improvement
            const improvement = ((fromValue - toValue) / fromValue) * 100;
            progressIncrease += improvement;
        }
    }

    // Check for completion of specific steps
    goal.steps.forEach(step => {
        if (messageLower.includes(step.toLowerCase())) {
            progressIncrease += Math.floor(100 / goal.steps.length);
        }
    });

    // Check for overcoming obstacles
    goal.obstacles.forEach(obstacle => {
        if (messageLower.includes(obstacle.toLowerCase()) &&
            (messageLower.includes("overcome") ||
                messageLower.includes("solved") ||
                messageLower.includes("handled") ||
                messageLower.includes("managed"))) {
            progressIncrease += 15;
        }
    });

    // Add progress based on positive indicators specific to the goal
    const positiveIndicators = [
        "improvement", "better", "progress", "success",
        "achieved", "completed", "consistent", "regularly",
        "routine", "habit", "daily", "weekly"
    ];

    positiveIndicators.forEach(indicator => {
        if (messageLower.includes(indicator)) {
            progressIncrease += 5;
        }
    });

    // Calculate new progress, ensuring it doesn't exceed 100%
    const newProgress = Math.min(100, currentProgress + progressIncrease);

    return newProgress;
}

function extractKeywords(text: string): string[] {
    // Remove common words and split into keywords
    const commonWords = new Set(['and', 'or', 'the', 'to', 'in', 'on', 'at', 'with', 'by', 'for', 'of', 'a', 'an']);
    return text
        .toLowerCase()
        .split(/\W+/)
        .filter(word => word.length > 2 && !commonWords.has(word));
} 