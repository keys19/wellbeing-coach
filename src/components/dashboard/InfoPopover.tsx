"use client";

import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface InfoPopoverProps {
  title: string;
  children: React.ReactNode;
}

export function InfoPopover({ title, children }: InfoPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 rounded-full ml-1 hover:bg-gray-100 hover:text-gray-900"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="sr-only">About {title}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" side="top" align="center">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">{title}</h4>
          <div className="text-sm text-muted-foreground">{children}</div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
