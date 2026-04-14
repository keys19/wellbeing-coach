"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { UserProfile } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Settings, Mail, Loader2, CalendarClock } from "lucide-react";
import SignoutButton from "@/components/account/SignoutButton";
import GoogleCalendarConnect from "@/components/account/GoogleCalendarConnect";
import { useToast } from "@/hooks/use-toast";

export default function AccountPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("profile");
  const [emailFrequency, setEmailFrequency] = useState<string>("daily");
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<string | null>(null);
  type PreferredWindow = "morning" | "afternoon" | "evening" | "night";
  const [preferredWindow, setPreferredWindow] = useState<PreferredWindow>("evening");

  // Check for query parameters that might have been set by the Google OAuth flow
  useEffect(() => {
    const error = searchParams.get("error");
    const success = searchParams.get("success");

    if (error) {
      let errorMessage = "An error occurred";
      switch (error) {
        case "missing_code":
          errorMessage = "Missing authorization code from Google";
          break;
        case "invalid_tokens":
          errorMessage = "Failed to obtain valid authorization tokens";
          break;
        case "callback_failed":
          errorMessage = "Authorization process failed";
          break;
        default:
          errorMessage = `Error: ${error}`;
      }

      toast({
        title: "Google Calendar Connection Failed",
        description: errorMessage,
        variant: "destructive",
      });

      // Clean up URL to remove query parameter
      window.history.replaceState({}, document.title, "/app/account");
    }

    if (success === "google_connected") {
      toast({
        title: "Connected Successfully",
        description: "Your Google Calendar has been connected!",
      });

      // Set preferences tab as active
      setActiveTab("preferences");

      // Clean up URL to remove query parameter
      window.history.replaceState({}, document.title, "/app/account");
    }
  }, [searchParams, toast]);

  useEffect(() => {
    const fetchUserPreferences = async () => {
      if (isLoaded && isSignedIn) {
        try {
          const response = await fetch("/api/user-preferences");
          if (response.ok) {
            const data = await response.json();
            const serverFreq = data.emailFrequency;

            const allowed = new Set(["daily", "biweekly", "weekly", "monthly"]);
            if (allowed.has(serverFreq)) {
              setEmailFrequency(serverFreq);
            } else {
              
              setEmailFrequency("daily");
              try {
                await fetch("/api/user-preferences", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ emailFrequency: "daily" }),
                });
              } catch (e) {
                console.error("Failed to persist default emailFrequency=daily", e);
              }
            }
            if (
            data.calendarPreferredWindow === "morning" ||
            data.calendarPreferredWindow === "afternoon" ||
            data.calendarPreferredWindow === "evening" ||
            data.calendarPreferredWindow === "night"
          ) {
            setPreferredWindow(data.calendarPreferredWindow as PreferredWindow);
          }
          } else {
            console.error(
              "Error fetching user preferences:",
              await response.text()
            );
          }
        } catch (error) {
          console.error("Error fetching user preferences:", error);
        }
      }
    };

    fetchUserPreferences();
  }, [isLoaded, isSignedIn]);

  const handleFrequencyChange = async (frequency: string) => {
    setEmailFrequency(frequency);
    setUpdateStatus("Saving...");

    try {
      const response = await fetch("/api/user-preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emailFrequency: frequency,
        }),
      });

      if (response.ok) {
        setUpdateStatus("Settings saved successfully");
        setTimeout(() => setUpdateStatus(null), 3000);
      } else {
        setUpdateStatus("Error saving settings");
        console.error("Error saving user preferences:", await response.text());
        setTimeout(() => setUpdateStatus(null), 5000);
      }
    } catch (error) {
      setUpdateStatus("Error saving settings");
      console.error("Error saving user preferences:", error);
      setTimeout(() => setUpdateStatus(null), 5000);
    }
  };

  const handleWindowChange = async (windowVal: PreferredWindow) => {
  setPreferredWindow(windowVal);
  setUpdateStatus("Saving...");

  try {
    const response = await fetch("/api/user-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calendarPreferredWindow: windowVal,
      }),
    });

    if (response.ok) {
      setUpdateStatus("Settings saved successfully");
      setTimeout(() => setUpdateStatus(null), 3000);
    } else {
      setUpdateStatus("Error saving settings");
      console.error("Error saving user preferences:", await response.text());
      setTimeout(() => setUpdateStatus(null), 5000);
    }
  } catch (error) {
    setUpdateStatus("Error saving settings");
    console.error("Error saving user preferences:", error);
    setTimeout(() => setUpdateStatus(null), 5000);
  }
};

  const handleSendTestEmail = async () => {
    if (!user?.emailAddresses?.[0]?.emailAddress) {
      setTestEmailStatus("Error: No email address found");
      return;
    }

    setIsSendingTest(true);
    setTestEmailStatus(null);

    try {
      const response = await fetch("/api/email/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.emailAddresses[0].emailAddress,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTestEmailStatus("Test email sent successfully");
      } else {
        setTestEmailStatus(`Failed: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      setTestEmailStatus("Error sending test email");
      console.error("Error sending test email:", error);
    } finally {
      setIsSendingTest(false);
      setTimeout(() => setTestEmailStatus(null), 5000);
    }
  };

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Account Settings</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Your Profile</CardTitle>
              <CardDescription>
                Manage your account details and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full">
                <UserProfile routing="hash" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Coaching Preferences</CardTitle>
              <CardDescription>
                Customize your coaching experience
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">


                <div>
                  <h3 className="font-medium mb-2">Coach Customization</h3>
                  <Button
                    variant="outline"
                    onClick={() =>
                      router.push("/app/bot-preferences?fromSettings=true")
                    }
                    className="flex items-center gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Customize Your Coach
                  </Button>
                </div>

       
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <div className="mt-8">
        <SignoutButton />
      </div>
    </div>
  );
}
