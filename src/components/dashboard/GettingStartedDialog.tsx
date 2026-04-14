"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import Link from "next/link";
import { Calendar, Mail, CheckCircle } from "lucide-react";

/** Matches WelcomeDialog look/feel */
export default function GettingStartedDialog({
  open,
  onOpenChange,
  onDontShowAgain,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDontShowAgain?: (checked: boolean) => void;
}) {
  const [dontShowAgain, setDontShowAgain] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Quick Guide</DialogTitle>
          <DialogDescription className="text-sm">
            Quick pointers so you’re set up in under a minute.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="p-4 rounded-xl border bg-muted/30">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-indigo-500 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Connect Google Calendar</p>
                <p className="text-sm text-muted-foreground">
                  Go to <strong>Account → Preferences</strong> and click{" "}
                  <strong>Connect to Google Calendar</strong>.
                </p>
                <div className="mt-3">
                  <Link href="/app/account#preferences" className="inline-flex">
                    <Button variant="outline" size="sm">Open Preferences</Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border bg-muted/30">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-indigo-500 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Set Email Frequency</p>
                <p className="text-sm text-muted-foreground">
                  In <strong>Account → Preferences</strong>, choose how often you’d like check-ins and progress emails.
                </p>
                <div className="mt-3">
                  <Link href="/app/account?tab=preferences#email-frequency" className="inline-flex">
                    <Button variant="outline" size="sm">Adjust Emails</Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* <div className="p-4 rounded-xl border bg-muted/30">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">You’re all set</p>
                <p className="text-sm text-muted-foreground">
                  With Calendar connected and emails set, goals can be auto-scheduled and you’ll get helpful nudges.
                </p>
              </div>
            </div>
          </div> */}
        </div>

        <DialogFooter className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border"
              checked={dontShowAgain}
              onChange={(e) => {
                setDontShowAgain(e.target.checked);
                onDontShowAgain?.(e.target.checked);
              }}
            />
            Don’t show this again
          </label> */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Link href="/app/account?tab=preferences">
              <Button>Open Preferences</Button>
            </Link>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}