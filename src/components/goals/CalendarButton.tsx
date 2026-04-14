import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CalendarButtonProps {
  goalIndex: number;
  disabled?: boolean;
  calendarEventLink?: string;
}

export function CalendarButton({
  goalIndex,
  disabled = false,
  calendarEventLink,
}: CalendarButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleAddToCalendar = async () => {
    try {
      setIsLoading(true);

      // Check if Google Calendar is connected
      const statusRes = await fetch("/api/calendar/status");
      const statusData = await statusRes.json();

      if (!statusData.connected || statusData.isExpired) {
        // If not connected or token expired, show a toast and redirect to auth URL
        toast({
          title: "Google Calendar not connected",
          description: "You need to connect your Google Calendar first.",
          variant: "destructive",
        });

        // Open the auth URL in a new tab
        window.open(statusData.authUrl, "_blank");
        return;
      }

      // Add goal to calendar
      const response = await fetch("/api/calendar/add-goal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ goalIndex }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.needsAuth) {
          toast({
            title: "Google Calendar not connected",
            description: "You need to connect your Google Calendar first.",
            variant: "destructive",
          });

          // Check if status call returned an auth URL
          const statusRes = await fetch("/api/calendar/status");
          const statusData = await statusRes.json();

          // Open the auth URL in a new tab
          window.open(statusData.authUrl, "_blank");
        } else if (data.needsReauth) {
          toast({
            title: "Google Calendar authorization expired",
            description: "Please reconnect your Google Calendar.",
            variant: "destructive",
          });

          // Check if status call returned an auth URL
          const statusRes = await fetch("/api/calendar/status");
          const statusData = await statusRes.json();

          // Open the auth URL in a new tab
          window.open(statusData.authUrl, "_blank");
        } else {
          toast({
            title: "Error",
            description: data.error || "Something went wrong.",
            variant: "destructive",
          });
        }
        return;
      }

      toast({
        title: "Success",
        description: "Goal added to your Google Calendar.",
      });

      // Force a page refresh to show updated goal data
      window.location.reload();
    } catch (error) {
      console.error("Error adding goal to calendar:", error);
      toast({
        title: "Error",
        description: "Failed to add goal to calendar.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // If goal is already in calendar, show a link to the event
  if (calendarEventLink) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1"
        disabled={disabled}
        onClick={() => window.open(calendarEventLink, "_blank")}
      >
        <Calendar className="h-4 w-4" />
        View in Calendar
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1"
      disabled={disabled || isLoading}
      onClick={handleAddToCalendar}
    >
      <Calendar className="h-4 w-4" />
      {isLoading ? "Adding..." : "Add to Calendar"}
    </Button>
  );
}
