"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Paintbrush, User, MessageSquare } from "lucide-react";

interface BotCustomizationDialogProps {
  open: boolean;
  onDismiss: () => void;
}

export function BotCustomizationDialog({
  open,
  onDismiss,
}: BotCustomizationDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Customize Your Coach</DialogTitle>
          <DialogDescription className="text-base mt-2">
            Make your mental health coach your own by personalizing it to your
            preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Choose a name</p>
                <p className="text-sm text-muted-foreground">
                  Give your coach a name that resonates with you.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Paintbrush className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Upload an avatar</p>
                <p className="text-sm text-muted-foreground">
                  Select an image that represents your coach personality.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Personalized experience</p>
                <p className="text-sm text-muted-foreground">
                  Your coach will use your preferences to provide a more
                  personalized coaching experience.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onDismiss} className="w-full sm:w-auto">
            Get Started
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
