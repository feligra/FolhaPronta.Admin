import { useEffect, useReducer } from "react";
import { parseApiDate } from "@/utils/format";

/** Refresh badges and actions at expiry even when a background API remains stale. */
export function useAccessClock(expiresAt?: string | null): number {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const end = expiresAt?.trim() ? parseApiDate(expiresAt.trim()).getTime() : NaN;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      const remaining = end - Date.now();
      if (remaining > 0) {
        timer = setTimeout(() => {
          refresh();
          schedule();
        }, Math.min(remaining, 2_147_483_647));
      }
    };
    const resume = () => { refresh(); schedule(); };
    const visibility = () => { if (document.visibilityState === "visible") resume(); };
    schedule();
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [end]);

  return Date.now();
}
