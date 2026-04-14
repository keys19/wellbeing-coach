"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, MessageSquare, Clock, ListChecks } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useBotContext } from "@/components/bot-preferences/BotContextProvider";

// Define UserProfile type to avoid 'any'
interface UserProfile {
  hideWelcomeDialog?: boolean;
  id?: string;
  userId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  // Add other properties as needed with specific types
  [key: string]: unknown; // For other properties with unknown type
}

interface WelcomeDialogProps {
  userProfile: UserProfile | null;
  onDismiss: (dontShowAgain: boolean) => Promise<void>;
}

// Local storage key for dialog visibility
const WELCOME_DIALOG_SEEN_KEY = "welcome_dialog_seen";

export function WelcomeDialog({ userProfile, onDismiss }: WelcomeDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const { isLoaded } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  // Add state to track if we've already shown the dialog in this session
  const [hasShownInSession, setHasShownInSession] = useState(false);

  const { botPreferences, isLoading: isLoadingBotPreferences } =
    useBotContext();

  // First set mounted state
  useEffect(() => {
    setIsMounted(true);

    // Check local storage to see if we've shown the dialog recently
    if (typeof window !== "undefined") {
      try {
        const seenRecently = localStorage.getItem(WELCOME_DIALOG_SEEN_KEY);
        if (seenRecently) {
          // If we've seen it recently, don't show it again in this session
          setHasShownInSession(true);
        }
      } catch (e) {
        console.error("Error checking localStorage:", e);
      }
    }
  }, []);

  // Then handle dialog visibility only on client side
  useEffect(() => {
    if (isMounted && isLoaded && !isLoadingBotPreferences) {
      // Only show the dialog if:
      // 1. User is loaded
      // 2. Bot preferences are loaded
      // 3. We haven't shown it in this session already
      // 4. Either userProfile is null (new user) OR userProfile exists but hideWelcomeDialog is not true
      const shouldShow =
        !hasShownInSession &&
        (!userProfile || (userProfile && !userProfile.hideWelcomeDialog));

      if (shouldShow) {
        // Mark that we've shown it this session
        setHasShownInSession(true);
        setIsOpen(true);

        // Set local storage flag to prevent multiple shows in a short time period
        try {
          localStorage.setItem(WELCOME_DIALOG_SEEN_KEY, "true");
        } catch (e) {
          console.error("Error setting localStorage:", e);
        }
      }
    }
  }, [
    userProfile,
    isLoaded,
    isMounted,
    isLoadingBotPreferences,
    hasShownInSession,
  ]);

  const handleClose = async () => {
    try {
      setIsSubmitting(true);
      await onDismiss(dontShowAgain);
      // If user chose "don't show again", ensure we update our local state
      if (dontShowAgain) {
        setHasShownInSession(true);
      }
    } catch (error) {
      console.error("Error saving preference:", error);
    } finally {
      setIsSubmitting(false);
      setIsOpen(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        // Only allow closing via the button to ensure preference is saved
        if (!open && !isSubmitting) {
          handleClose();
        }
        setIsOpen(open);
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Welcome to Your Mental Health Coach!
          </DialogTitle>
          <DialogDescription className="text-base mt-2">
            Meet {botPreferences.botName}, your personalized mental health coach
            designed to help you achieve your goals.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <h3 className="font-medium text-lg">How it works:</h3>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Chat naturally</p>
                <p className="text-sm text-muted-foreground">
                  Talk to {botPreferences.botName} like you would with a trusted
                  coach or friend. Open up about what&apos;s on your mind—your
                  feelings, stressors, and personal goals.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <ListChecks className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">
                  Explore and Apply Helpful Techniques
                </p>
                <p className="text-sm text-muted-foreground">
                  {botPreferences.botName} will introduce you to helpful tools
                  and mental wellness strategies you can try at your own pace.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Reflect and Grow</p>
                <p className="text-sm text-muted-foreground">
                  As you continue the conversation, your profile will be updated
                  to help {botPreferences.botName} support you more personally
                  and effectively.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Gain Insights Over Time</p>
                <p className="text-sm text-muted-foreground">
                  Use your dashboard to explore your emotional patterns,
                  celebrate small wins, and deepen your self-awareness. Growth
                  is a journey, and every step counts.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 mb-4">
          <Checkbox
            id="dontShowAgain"
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked === true)}
          />
          <label
            htmlFor="dontShowAgain"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Do not show this again
          </label>
        </div>

        <DialogFooter>
          <Button
            onClick={handleClose}
            className="w-full sm:w-auto"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Get Started"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
