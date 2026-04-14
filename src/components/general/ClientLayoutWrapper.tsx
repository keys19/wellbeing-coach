"use client";

import { useState, useEffect } from "react";
import ClientLayout from "@/components/general/ClientLayout";
import { BotContextProvider } from "@/components/bot-preferences/BotContextProvider";
import { Loader2 } from "lucide-react";

export default function ClientLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  // Check for bot preferences customization in localStorage on mount
  useEffect(() => {
    // Simple check for mounting - nothing else in this effect
    setMounted(true);
  }, []);

  // Separate effect for bot preferences - avoids mixing state operations
  useEffect(() => {
    if (!mounted) return;

    // Check if we have preferences in localStorage
    try {
      const cachedPrefs = localStorage.getItem("cached_bot_preferences");

      // Ensure preferences are properly synced from localStorage when the app is reopened
      // This will trigger a call to sync with the server once BotContextProvider mounts
      if (cachedPrefs) {
        // Remove any outdated timestamps or metadata to ensure a fresh load
        localStorage.setItem(
          "cached_bot_preferences_timestamp",
          Date.now().toString()
        );

        // Log for debugging purposes
        console.log("Found cached bot preferences on app reload");

        // Set a cookie that middleware can check
        if (JSON.parse(cachedPrefs).hasCustomized) {
          document.cookie =
            "bot_preferences_customized=true; path=/; max-age=3600";
        }
      }
    } catch (error) {
      console.error("Error checking cached preferences:", error);
    }
  }, [mounted]);

  // Show minimal loading only before first mount
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <BotContextProvider>
      <ClientLayout>{children}</ClientLayout>
    </BotContextProvider>
  );
}
