import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CalendarStatus {
  connected: boolean;
  isExpired?: boolean;
  connectedAt?: string;
  authUrl?: string;
}

export default function GoogleCalendarConnect() {
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Check Google Calendar connection status when component mounts
    const checkStatus = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/calendar/status");

        if (!response.ok) {
          throw new Error("Failed to check Google Calendar status");
        }

        const data = await response.json();
        setStatus(data);
      } catch (error) {
        console.error("Error checking Google Calendar status:", error);
        toast({
          title: "Error",
          description: "Failed to check Google Calendar connection status.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    checkStatus();
  }, [toast]);

  const handleConnect = () => {
    if (!status?.authUrl) {
      toast({
        title: "Error",
        description: "Authorization URL not available.",
        variant: "destructive",
      });
      return;
    }

    // Open Google authorization in a new tab
    window.open(status.authUrl, "_blank");
  };

  const handleReconnect = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/google");

      if (!response.ok) {
        throw new Error("Failed to generate authorization URL");
      }

      const data = await response.json();

      if (!data.authUrl) {
        throw new Error("Authorization URL not received");
      }

      // Open Google authorization in a new tab
      window.open(data.authUrl, "_blank");
    } catch (error) {
      console.error("Error reconnecting to Google Calendar:", error);
      toast({
        title: "Error",
        description: "Failed to reconnect to Google Calendar.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-start gap-2 mt-6">
        <h3 className="text-lg font-medium">Google Calendar Integration</h3>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 mt-6">
      <h3 className="text-lg font-medium">Google Calendar Integration</h3>
      <p className="text-sm text-muted-foreground">
        Connect your Google Calendar to add your goals as events.
      </p>

      {status?.connected && !status.isExpired ? (
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
            <p className="text-sm text-muted-foreground">
              Connected to Google Calendar
              {status.connectedAt && (
                <span className="ml-2">
                  (connected on{" "}
                  {new Date(status.connectedAt).toLocaleDateString()})
                </span>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 mt-2"
            onClick={handleReconnect}
          >
            <Calendar className="h-4 w-4" />
            Reconnect
          </Button>
        </div>
      ) : (
        <Button
          variant="default"
          size="sm"
          className="gap-1 mt-2"
          onClick={handleConnect}
        >
          <Calendar className="h-4 w-4" />
          Connect Google Calendar
        </Button>
      )}
    </div>
  );
}
