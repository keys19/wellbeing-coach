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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Star,
  ThumbsUp,
  Loader2,
  SmilePlus,
  Heart,
  AlertCircle,
  MessageSquare,
} from "lucide-react";

// Emotion options for feedback
const emotionOptions = [
  { value: "satisfied", label: "Satisfied", icon: SmilePlus },
  { value: "hopeful", label: "Hopeful", icon: Heart },
  { value: "neutral", label: "Neutral", icon: ThumbsUp },
  { value: "uncertain", label: "Uncertain", icon: AlertCircle },
];

// Props interface
interface GoalFeedbackDialogProps {
  isOpen: boolean;
  onClose: () => void;
  goalDescription: string;
  sessionId?: string;
  onComplete?: () => void;
}

export default function GoalFeedbackDialog({
  isOpen,
  onClose,
  goalDescription,
  sessionId,
  onComplete,
}: GoalFeedbackDialogProps) {
  const { toast } = useToast();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [emotion, setEmotion] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle feedback submission
  const handleSubmit = async () => {
    // If no rating was selected, show an error
    if (rating === null) {
      toast({
        title: "Rating required",
        description: "Please rate how helpful the chatbot was.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Submit feedback to API
      const response = await fetch("/api/feedback/goal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goalDescription,
          helpfulnessRating: rating,
          comment: comment || null,
          emotionalState: emotion || null,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit feedback");
      }

      // Show success toast
      toast({
        title: "Thank you for your feedback!",
        description: "Your feedback helps us improve your coaching experience.",
        variant: "default",
      });

      // Call the onComplete callback if provided
      if (onComplete) {
        onComplete();
      }

      // Close the dialog
      onClose();
    } catch (error) {
      console.error("Error submitting feedback:", error);
      toast({
        title: "Error submitting feedback",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form when dialog opens
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ThumbsUp className="h-5 w-5" />
            <span>We would love your feedback!</span>
          </DialogTitle>
          <DialogDescription>
            How helpful was the chatbot in achieving your goal?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Goal description */}
          <div className="bg-muted/50 p-3 rounded-md">
            <p className="text-sm font-medium">Goal completed:</p>
            <p className="text-sm">{goalDescription}</p>
          </div>

          {/* Star Rating */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Rate the helpfulness:</label>
            <div className="flex items-center justify-center gap-3">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className={`p-2 rounded-full transition-all ${
                    rating === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                  aria-label={`${value} star${value !== 1 ? "s" : ""}`}
                >
                  <Star
                    className={`h-6 w-6 ${
                      rating !== null && value <= rating
                        ? "fill-current"
                        : "fill-none"
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="text-xs text-center text-muted-foreground">
              {rating === 1
                ? "Not helpful at all"
                : rating === 2
                ? "Slightly helpful"
                : rating === 3
                ? "Moderately helpful"
                : rating === 4
                ? "Very helpful"
                : rating === 5
                ? "Extremely helpful"
                : "Select a rating"}
            </p>
          </div>

          {/* Emotional state */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              How do you feel about achieving this goal?
            </label>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {emotionOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setEmotion(option.value)}
                    className={`px-3 py-2 rounded-md flex items-center gap-2 transition-all ${
                      emotion === option.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    }`}
                    aria-label={option.label}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Additional comments (optional):
            </label>
            <Textarea
              placeholder="What could we improve? What worked well?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-24 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Skip
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Feedback"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
