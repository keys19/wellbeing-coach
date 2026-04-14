"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Upload, Check } from "lucide-react";
import { BotCustomizationDialog } from "@/components/bot-preferences/BotCustomizationDialog";
import { useBotContext } from "@/components/bot-preferences/BotContextProvider";

export default function BotPreferences() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const { botPreferences: contextPreferences, setBotPreferences } =
    useBotContext();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [fromOnboarding, setFromOnboarding] = useState(false);

  // Set mounted state
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      setFromOnboarding(window.location.search.includes("fromOnboarding"));
}
  }, []);

  // Fetch bot preferences
  const fetchBotPreferences = useCallback(async () => {
    if (!isMounted || !isLoaded || !user) return;

    try {
      setIsLoading(true);
      console.log("Fetching bot preferences...");
      const response = await fetch("/api/bot-preferences");

      if (response.ok) {
        const data = await response.json();
        console.log("Bot preferences data:", data);
        setBotPreferences(data.preferences);

        // Only redirect if user has explicitly customized their bot AND
        // we're not coming from settings AND
        // we're on the first render
        const fromSettings = window.location.search.includes("fromSettings");

        if (data.preferences.hasCustomized && !fromSettings) {
          console.log("User has already customized, redirecting to chat");
          router.push("/app/chat");
        } else {
          // Check if we should show the dialog - only for new uncustomized bots
          const shouldShowDialog =
              !data.preferences.hasCustomized && (!fromSettings || fromOnboarding);
          console.log(
            `Should show dialog: ${shouldShowDialog}, hasCustomized: ${data.preferences.hasCustomized}`
          );
          setShowDialog(shouldShowDialog);
        }
      } else {
        console.error("Error fetching bot preferences:", await response.text());
      }
    } catch (error) {
      console.error("Error fetching bot preferences:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, user, router, isMounted]);

  // Initial fetch
  useEffect(() => {
    fetchBotPreferences();
  }, [fetchBotPreferences]);

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !user) {
      router.push("/sign-in");
    }
  }, [isLoaded, user, router]);

  // Handle image preview
  useEffect(() => {
    if (imageFile) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(imageFile);
    } else if (contextPreferences.botImageUrl) {
      setPreviewUrl(contextPreferences.botImageUrl);
    } else {
      setPreviewUrl(null);
    }
  }, [imageFile, contextPreferences.botImageUrl]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        alert("Image size should be less than 5MB");
        return;
      }
      setImageFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsSaving(true);
      setFormError(null);

      // If we have a new image file, use it as the botImageUrl
      const botImageUrl = previewUrl || null;

      // Prepare the preferences update
      const updatedPreferences = {
        botName: contextPreferences.botName,
        botGender: contextPreferences.botGender,
        botImageUrl,
        hasCustomized: true,
      };

      // Update local state and localStorage first for immediate feedback
      setBotPreferences({
        ...updatedPreferences,
      });

      // console.log("Sending bot preferences to server:", updatedPreferences);

      const response = await fetch("/api/bot-preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedPreferences),
        credentials: "include", // Include cookies
      });

      const data = await response.json();

      if (response.ok) {
        console.log(
          "Successfully saved preferences to server:",
          data.preferences
        );

        // Update again with the server-returned data to ensure consistency
        setBotPreferences({
          ...data.preferences,
          hasCustomized: true,
        });

        // Wait a small amount of time to ensure the cache is updated
        await new Promise((resolve) => setTimeout(resolve, 100));

        // If coming from settings, go back to settings
        const fromSettings = window.location.search.includes("fromSettings");
        if (fromSettings) {
          router.push("/app/account");
        } else {
          // Otherwise, go to the chat page
          router.push("/app/chat");
        }
      } else {
        console.error("Error saving preferences:", data);

        // Set a specific error message based on the response
        if (response.status === 401) {
          setFormError(
            "Authentication error. Please try refreshing the page or signing in again."
          );
        } else if (data.error) {
          setFormError(`Error: ${data.error}`);
        } else {
          setFormError("Failed to save. Please try again.");
        }
      }
    } catch (error) {
      console.error("Error:", error);
      setFormError(
        "Network error. Please check your connection and try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

    const handleDialogDismiss = () => {
    setShowDialog(false); };

  if (!isLoaded || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <BotCustomizationDialog
        open={showDialog}
        onDismiss={handleDialogDismiss}
      />

      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 text-center">
          Customize Your Mental Health Coach
        </h1>
        <p className="text-center text-muted-foreground mb-6">
          Personalize your mental health coach to make your experience more
          engaging and comfortable.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Bot Customization</CardTitle>
            <CardDescription>
              Customize your mental health coach&apos;s appearance and
              personality.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex flex-col items-center space-y-4">
                  <Avatar className="h-24 w-24">
                    {previewUrl ? (
                      <AvatarImage src={previewUrl} alt="Bot avatar" />
                    ) : (
                      <AvatarImage
                        src="/placeholder.svg"
                        alt="Default avatar"
                      />
                    )}
                    <AvatarFallback>
                      {(contextPreferences.botName || "A").charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-center space-y-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                      id="avatar-upload"
                    />
                    <Label
                      htmlFor="avatar-upload"
                      className="cursor-pointer flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Upload Image
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Max size: 5MB
                    </p>
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="botName">Coach Name</Label>
                    <Input
                      id="botName"
                      value={contextPreferences.botName}
                      onChange={(e) =>
                        setBotPreferences({
                          ...contextPreferences,
                          botName: e.target.value,
                        })
                      }
                      placeholder="Enter a name for your coach"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Coach Gender</Label>
                    <RadioGroup
                      value={contextPreferences.botGender}
                      onValueChange={(value) =>
                        setBotPreferences({
                          ...contextPreferences,
                          botGender: value,
                        })
                      }
                      className="flex flex-col space-y-1"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Female" id="female" />
                        <Label htmlFor="female">Female</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Male" id="male" />
                        <Label htmlFor="male">Male</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Non-binary" id="non-binary" />
                        <Label htmlFor="non-binary">Non-binary</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </div>

              {formError && (
                <div className="text-red-500 text-sm">{formError}</div>
              )}

              <CardFooter className="flex justify-end p-0">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
