import { useEffect, useState } from "react";
import { GoalItem } from "./GoalItem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Trophy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import GoalFeedbackDialog from "@/components/feedback/GoalFeedbackDialog";

interface Goal {
  description: string;
  measures: string;
  timeframe: string;
  steps: string[];
  obstacles: string[];
  completed: boolean;
  progress?: number;
  lastUpdated?: string;
  completedAt?: string;
}

export function GoalsList() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completedGoalDialog, setCompletedGoalDialog] = useState<{
    open: boolean;
    goal?: Goal;
    index?: number;
  }>({ open: false });
  const [feedbackDialog, setFeedbackDialog] = useState<{
    open: boolean;
    goalDescription?: string;
  }>({ open: false });

  // Fetch goals on component mount
  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/goals");
      if (!response.ok) {
        throw new Error("Failed to fetch goals");
      }
      const data = await response.json();
      setGoals(data.goals.mental_health_goals || []);
    } catch (err) {
      console.error("Error fetching goals:", err);
      setError("Failed to load goals");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteGoal = async (index: number, completed: boolean) => {
    try {
      // Optimistic update for better UX
      const updatedGoals = [...goals];
      const wasCompleted = updatedGoals[index].completed;
      updatedGoals[index] = {
        ...updatedGoals[index],
        completed,
        ...(completed && !wasCompleted
          ? { completedAt: new Date().toISOString() }
          : {}),
      };
      setGoals(updatedGoals);

      const response = await fetch("/api/goals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goalId: index,
          completed,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update goal");
      }

      const data = await response.json();
      const serverGoals = data.goals.mental_health_goals || [];
      setGoals(serverGoals);

      // Show celebration dialog if a goal was newly completed
      if (data.goalNewlyCompleted && completed) {
        setCompletedGoalDialog({
          open: true,
          goal: serverGoals[index],
          index,
        });
      }
    } catch (err) {
      console.error("Error updating goal:", err);
      // Revert optimistic update if needed
      await fetchGoals();
    }
  };

  const closeCompletionDialog = () => {
    const goalDescription = completedGoalDialog.goal?.description;
    setCompletedGoalDialog({ open: false });
    if (goalDescription) {
      setFeedbackDialog({
        open: true,
        goalDescription,
      });
    }
  };

  const closeFeedbackDialog = () => {
    setFeedbackDialog({ open: false });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mental Health Goals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-24 animate-pulse bg-muted rounded-lg" />
            <div className="h-24 animate-pulse bg-muted rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mental Health Goals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-red-500">{error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Mental Health Goals</CardTitle>
        </CardHeader>
        <CardContent>
          {goals.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No goals set yet. Start a conversation with your coach to set some
              goals!
            </div>
          ) : (
            <div className="space-y-4">
              {goals.map((goal, index) => (
                <GoalItem
                  key={index}
                  goal={goal}
                  index={index}
                  onComplete={handleCompleteGoal}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Goal Completion Celebration Dialog */}
      <Dialog
        open={completedGoalDialog.open}
        onOpenChange={(open) => !open && closeCompletionDialog()}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Trophy className="h-6 w-6 text-yellow-500" />
              <span>Goal Accomplished!</span>
            </DialogTitle>
            <DialogDescription>
              Great job on completing your mental health goal!
            </DialogDescription>
          </DialogHeader>

          <div className="py-6">
            {/* Celebration animation - Trophy + confetti effect */}
            <div className="flex flex-col items-center justify-center pb-4">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-center">
                {completedGoalDialog.goal?.description}
              </h3>

              {/* Animated stars/confetti */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="star-1 absolute top-1/4 left-1/4 w-1 h-1 bg-yellow-500 rounded-full animate-pulse"></div>
                <div className="star-2 absolute top-1/3 right-1/3 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <div className="star-3 absolute bottom-1/4 right-1/4 w-1 h-1 bg-blue-500 rounded-full animate-pulse"></div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                You&apos;ve reached an important milestone in your mental health
                journey. This achievement demonstrates your commitment to
                self-improvement.
              </p>

              <div className="bg-green-50 border border-green-100 p-3 rounded-md">
                <h4 className="text-sm font-medium text-green-800 mb-1">
                  What&apos;s next?
                </h4>
                <ul className="list-disc list-inside text-xs text-green-700 space-y-1">
                  <li>Take a moment to reflect on what worked well</li>
                  <li>Consider setting a new goal with your coach</li>
                  <li>Apply what you&apos;ve learned to future challenges</li>
                </ul>
              </div>
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button variant="secondary" onClick={closeCompletionDialog}>
              Close
            </Button>
            <Link href="/app/chat">
              <Button className="bg-green-600 hover:bg-green-700">
                Discuss Next Steps
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Goal Feedback Dialog */}
      <GoalFeedbackDialog
        isOpen={feedbackDialog.open}
        onClose={closeFeedbackDialog}
        goalDescription={feedbackDialog.goalDescription || ""}
      />
    </>
  );
}
