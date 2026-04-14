"use client";
import { useEffect, useRef } from "react";

export default function TabSyncRefresh({
  onRefresh,
  minIntervalMs = 30000,
}: {
  onRefresh: () => void;
  minIntervalMs?: number;
}) {
  const lastRunRef = useRef(0);
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  useEffect(() => {
    const tryRefresh = () => {
      const now = Date.now();
      if (now - lastRunRef.current < minIntervalMs) return;
      lastRunRef.current = now;
      cbRef.current();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tryRefresh();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    // Only run once on mount
    tryRefresh();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [minIntervalMs]);

  return null;
}