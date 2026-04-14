"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

// Define the WHO-5 questions
const questions = [
  {
    id: 1,
    text: "I have felt cheerful and in good spirits",
  },
  {
    id: 2,
    text: "I have felt calm and relaxed",
  },
  {
    id: 3,
    text: "I have felt active and vigorous",
  },
  {
    id: 4,
    text: "I woke up feeling fresh and rested",
  },
  {
    id: 5,
    text: "My daily life has been filled with things that interest me",
  },
];

// Rating options (same for all questions)
const ratingOptions = [
  { value: 5, label: "All of the time" },
  { value: 4, label: "Most of the time" },
  { value: 3, label: "More than half of the time" },
  { value: 2, label: "Less than half of the time" },
  { value: 1, label: "Some of the time" },
  { value: 0, label: "At no time" },
];

// Interpretation based on total score
const getInterpretation = (score: number): string => {
  if (score <= 28) return "poor";
  if (score <= 50) return "low";
  if (score <= 72) return "moderate";
  return "high";
};

interface WHO5AssessmentProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
  onComplete?: (score: number, interpretation: string) => void;
}

export default function WHO5Assessment({
  isOpen,
  onClose,
  sessionId,
  onComplete,
}: WHO5AssessmentProps) {
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate if all questions are answered
  const isComplete = questions.every((q) => typeof answers[q.id] === "number");

  // Calculate total score (raw score 0-25, then multiplied by 4 to get 0-100)
  const calculateScore = (): number => {
    const rawScore = Object.values(answers).reduce(
      (sum, value) => sum + value,
      0
    );
    return rawScore * 4; // Convert to 0-100 scale
  };

  // Handle answer selection
  const handleAnswerChange = (questionId: number, value: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!isComplete) {
      toast({
        title: "Please answer all questions",
        description:
          "All questions must be answered to calculate your well-being index.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const totalScore = calculateScore();
      const interpretation = getInterpretation(totalScore);

      // Save the assessment to the database
      const response = await fetch("/api/assessment/who5", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question1: answers[1],
          question2: answers[2],
          question3: answers[3],
          question4: answers[4],
          question5: answers[5],
          totalScore,
          interpretation,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save assessment");
      }

      // Show success message
      toast({
        title: "Assessment completed",
        description: "Your well-being assessment has been saved successfully.",
        variant: "default",
      });

      // Call the onComplete callback if provided
      if (onComplete) {
        onComplete(totalScore, interpretation);
      }

      // Close the dialog
      onClose();
    } catch (error) {
      console.error("Error saving WHO-5 assessment:", error);
      toast({
        title: "Something went wrong",
        description: "Unable to save your assessment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>WHO-5 Well-being Index</DialogTitle>
          <DialogDescription>
            Please indicate for each of the following statements how you have
            been feeling over the last two weeks.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 mt-4 max-h-[70vh] overflow-y-auto pr-2">
          {questions.map((question) => (
            <div key={question.id} className="space-y-2">
              <p className="font-medium">{question.text}</p>
              <RadioGroup
                value={answers[question.id]?.toString()}
                onValueChange={(value) =>
                  handleAnswerChange(question.id, parseInt(value))
                }
                className="grid grid-cols-2 gap-2 md:grid-cols-3"
              >
                {ratingOptions.map((option) => (
                  <div
                    key={option.value}
                    className="flex items-center space-x-2 bg-muted/50 rounded-md px-3 py-2"
                  >
                    <RadioGroupItem
                      value={option.value.toString()}
                      id={`q${question.id}-option${option.value}`}
                    />
                    <Label
                      htmlFor={`q${question.id}-option${option.value}`}
                      className="flex-1 cursor-pointer"
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ))}
        </div>

        <DialogFooter className="flex items-center justify-between md:justify-end mt-6 gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isComplete || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Submit Assessment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
