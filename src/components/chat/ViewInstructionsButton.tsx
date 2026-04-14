"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { MessageSquare, Clock, ListChecks, CheckCircle } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useBotContext } from "@/components/bot-preferences/BotContextProvider";

export function ViewInstructionsButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useUser();
  const { botPreferences } = useBotContext();

  const resetWelcomeDialog = async () => {
    if (user) {
      try {
        await fetch("/api/user-preferences", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            hideWelcomeDialog: false,
          }),
        });
      } catch (error) {
        console.error("Error updating preferences:", error);
      }
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1"
      >
        <HelpCircle className="h-4 w-4" />
        <span>Instructions</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              How to Use Your Mental Health Coach
            </DialogTitle>
            <DialogDescription className="text-base mt-2">
              {botPreferences.botName} is your personalized mental health coach
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
                    Talk to {botPreferences.botName} like you would with a trusted coach or friend. Open up about what’s on your mind—your feelings, stressors, and personal goals.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <ListChecks className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Explore Helpful Techniques</p>
                  <p className="text-sm text-muted-foreground">
                   {botPreferences.botName} will introduce you to helpful tools and mental wellness strategies you can try at your own pace. 
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Reflect and Grow</p>
                  <p className="text-sm text-muted-foreground">
                    As you continue the conversation, your profile will be updated to help {botPreferences.botName} support you more personally and effectively.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Gain Insights Over Time</p>
                  <p className="text-sm text-muted-foreground">
                    Use your dashboard to explore your emotional patterns, celebrate small wins, and deepen your self-awareness. Growth is a journey, and every step counts.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                resetWelcomeDialog();
                setIsOpen(false);
              }}
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              Show on startup
            </Button>
            <Button
              onClick={() => setIsOpen(false)}
              className="w-full sm:w-auto order-1 sm:order-2"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
