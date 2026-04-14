"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useUser } from "@clerk/nextjs";

interface BotPreferences {
  botName: string;
  botImageUrl: string | null;
  botGender: string;
  hasCustomized: boolean;
}

interface BotContextType {
  botPreferences: BotPreferences;
  isLoading: boolean;
  refetchPreferences: () => Promise<void>;
  setBotPreferences: (preferences: BotPreferences) => void;
  markCustomized: () => void;
}

// Default preferences factory to ensure consistency between renders
const getDefaultBotPreferences = (): BotPreferences => ({
  botName: "Taylor",
  botImageUrl: null,
  botGender: "Female",
  hasCustomized: false,
});

const STORAGE_KEY = "cached_bot_preferences";

const BotContext = createContext<BotContextType>({
  botPreferences: getDefaultBotPreferences(),
  isLoading: true,
  refetchPreferences: async () => {},
  setBotPreferences: () => {},
  markCustomized: () => {},
});

export function useBotContext() {
  return useContext(BotContext);
}

export function BotContextProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();

  // Load preferences from cache initially
  const [botPreferences, setBotPreferencesState] = useState<BotPreferences>(
    () => {
      // Use cached preferences during initial render if available
      if (typeof window !== "undefined") {
        try {
          const cached = localStorage.getItem(STORAGE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            // Verify it has the expected shape
            if (parsed.botName && parsed.botGender !== undefined) {
              console.log("Using cached bot preferences");
              return parsed;
            }
          }
        } catch (e) {
          console.error("Error loading cached preferences:", e);
        }
      }
      return getDefaultBotPreferences();
    }
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchBotPreferences = async () => {
    // Skip the API call during server-side rendering
    if (typeof window === "undefined") return;

    if (!isLoaded || !user) return;

    try {
      setIsLoading(true);
      const response = await fetch("/api/bot-preferences", {
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      if (response.ok) {
        const data = await response.json();

        // Only update state and localStorage if the server data is different
        // or if hasCustomized is true (meaning it's the authoritative data)
        if (
          data.preferences.hasCustomized ||
          data.preferences.botName !== botPreferences.botName ||
          data.preferences.botGender !== botPreferences.botGender ||
          data.preferences.botImageUrl !== botPreferences.botImageUrl
        ) {
          console.log(
            "Updating bot preferences from server:",
            data.preferences
          );
          setBotPreferencesState(data.preferences);

          // Cache the preferences from server
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.preferences));
          } catch (e) {
            console.error("Error saving server preferences to cache:", e);
          }
        }
      } else {
        console.error(
          `Error fetching bot preferences: ${response.status} ${response.statusText}`
        );
      }
    } catch (error) {
      console.error("Error fetching bot preferences:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Custom setter that updates both state and cache IMMEDIATELY
  const setBotPreferences = (newPreferences: BotPreferences) => {
    console.log("Setting bot preferences:", newPreferences);

    // Update state
    setBotPreferencesState(newPreferences);

    // Update localStorage synchronously
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPreferences));
    } catch (e) {
      console.error("Error saving preferences to cache:", e);
    }

    // If user is authenticated and preference has hasCustomized=true,
    // also save to server immediately to ensure persistence
    if (isLoaded && user && newPreferences.hasCustomized) {
      // Don't await this - let it happen in the background
      fetch("/api/bot-preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newPreferences),
      }).catch((error) => {
        console.error("Error saving preferences to server:", error);
      });
    }
  };

  const markCustomized = () => {
      setBotPreferences({
      ...botPreferences,
      hasCustomized: true,
      });
      };

  // Use a flag to track client-side mounting
  const [isMounted, setIsMounted] = useState(false);

  // First effect just to set mounted flag
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Second effect to fetch preferences only when mounted (client-side only)
  useEffect(() => {
    if (isMounted && isLoaded && user) {
      fetchBotPreferences();
    }
  }, [isLoaded, user, isMounted]);

  // Re-fetch on window focus to ensure latest data
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFocus = () => {
      if (isLoaded && user) {
        console.log("Window focused, fetching latest bot preferences");
        fetchBotPreferences();
      }
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [isLoaded, user]);

  return (
    <BotContext.Provider
      value={{
        botPreferences,
        isLoading,
        refetchPreferences: fetchBotPreferences,
        setBotPreferences,
        markCustomized,
      }}
    >
      {children}
    </BotContext.Provider>
  );
}
