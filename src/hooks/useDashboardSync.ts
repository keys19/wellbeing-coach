import { useCallback, useRef, useState } from "react";

export function useDashboardSync(userId?: string) {
  const [lastSyncTime, setLastSyncTime] = useState(0);
  const isRefreshingRef = useRef(false);

  const refreshData = useCallback(async () => {
    if (!userId || isRefreshingRef.current) return null;
    
    const now = Date.now();
    // Don't refresh if we just did it within 15 seconds
    if (now - lastSyncTime < 15000) return null;

    isRefreshingRef.current = true;
    
    try {
      // Fetch all data in parallel
      const [profileRes, sessionRes] = await Promise.all([
        fetch(`/api/user-profile?userId=${userId}&t=${now}`, { cache: 'no-store' }),
        fetch("/api/sessions?getLatest=true", { cache: "no-store" })
      ]);

      const results: any = {};

      // Handle profile
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        results.profile = profileData.profile;
      }

      // Handle session
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        results.session = sessionData.latestSession;

        // Fetch messages if we have a session
        if (sessionData.latestSession?.id && !sessionData.latestSession.id.startsWith("temp-")) {
          const msgRes = await fetch(
            `/api/sessions/${sessionData.latestSession.id}/messages`,
            { cache: "no-store" }
          );
          if (msgRes.ok) {
            const msgData = await msgRes.json();
            results.messages = msgData.messages || [];
          }
        }
      }

      setLastSyncTime(now);
      return results;
    } catch (error) {
      console.error("Dashboard sync failed:", error);
      return null;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [userId, lastSyncTime]);

  return { refreshData, lastSyncTime, isRefreshing: isRefreshingRef.current };
}