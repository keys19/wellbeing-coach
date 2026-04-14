import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle } from "lucide-react";
import { CalendarButton } from "./CalendarButton";

interface GoalItemProps {
  goal: {
    description: string;
    measures: string;
    timeframe: string;
    steps: string[];
    obstacles: string[];
    completed: boolean;
    progress?: number;
    lastUpdated?: string;
    calendarEventLink?: string;
  };
  index: number;
  onComplete: (index: number, completed: boolean) => Promise<void>;
}

export function GoalItem({ goal, index, onComplete }: GoalItemProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggleComplete = async () => {
    try {
      setIsUpdating(true);
      await onComplete(index, !goal.completed);
    } catch (error) {
      console.error("Error updating goal:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="icon"
              className={`h-6 w-6 ${isUpdating ? "opacity-50" : ""}`}
              onClick={handleToggleComplete}
              disabled={isUpdating}
            >
              {goal.completed ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <Circle className="h-5 w-5" />
              )}
            </Button>
            <h3
              className={`font-medium ${
                goal.completed ? "line-through text-muted-foreground" : ""
              }`}
            >
              {goal.description}
            </h3>
          </div>

          <div className="space-y-2 ml-8">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Measures:</span> {goal.measures}
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Timeframe:</span> {goal.timeframe}
            </p>

            {goal.steps.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium mb-1">Steps:</p>
                <ul className="list-disc list-inside text-sm text-muted-foreground">
                  {goal.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ul>
              </div>
            )}

            {goal.obstacles.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium mb-1">Potential Obstacles:</p>
                <ul className="list-disc list-inside text-sm text-muted-foreground">
                  {goal.obstacles.map((obstacle, i) => (
                    <li key={i}>{obstacle}</li>
                  ))}
                </ul>
              </div>
            )}

            {typeof goal.progress === "number" && (
              <div className="mt-3">
                <p className="text-sm font-medium mb-1">Progress:</p>
                <Progress value={goal.progress} className="h-2" />
              </div>
            )}

            <div className="mt-3 flex items-center justify-between">
              <CalendarButton
                goalIndex={index}
                disabled={goal.completed}
                calendarEventLink={goal.calendarEventLink}
              />

              {goal.lastUpdated && (
                <p className="text-xs text-muted-foreground">
                  Last updated:{" "}
                  {new Date(goal.lastUpdated).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
