import { planReminders } from "@sori/core";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { runAutopay, updateSettings } from "../data/actions";
import { useData } from "../data/data-context";
import { applyReminders, onNotificationTap } from "../platform/notifications";
import { useToast } from "./shared";
import { startAutoSync } from "../platform/sync";

/** Background housekeeping: autopay logging, reminder scheduling, sync, notification taps. */
export function AppEffects() {
  const { snapshot, today, ready } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const running = useRef(false);

  useEffect(() => {
    if (!ready || running.current) return;
    running.current = true;
    void runAutopay(snapshot, today)
      .catch(() =>
        toast({
          message:
            "Automatic logging needs a check-in. Your other changes are saved.",
        }),
      )
      .finally(() => {
        running.current = false;
      });
  }, [snapshot, today, ready, toast]);

  // Re-plan reminders shortly after data settles (not on every keystroke).
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(
      () => void applyReminders(planReminders(snapshot, today)).catch(() => {}),
      3_000,
    );
    return () => window.clearTimeout(timer);
  }, [snapshot, today, ready]);

  // Tell the server (and Claude) what "today" means here.
  useEffect(() => {
    if (!ready || !snapshot.settings.setupDone) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && snapshot.settings.timeZone !== zone)
      void updateSettings(snapshot.settings, { timeZone: zone }).catch(
        () => {},
      );
  }, [ready, snapshot.settings]);

  useEffect(() => startAutoSync(), []);
  useEffect(() => {
    const open = (route: string) => {
      if (route === "/log") {
        window.dispatchEvent(new Event("sori:log"));
        return;
      }
      if (
        [
          "/",
          "/calendar",
          "/goals",
          "/forecast",
          "/spending",
          "/settings",
          "/insights",
          "/coach",
          "/debt",
        ].includes(route.split("?")[0]!)
      )
        navigate(route);
    };
    const stop = onNotificationTap(open);
    const handler = (event: Event) => {
      const route = (event as CustomEvent<unknown>).detail;
      if (typeof route === "string") open(route);
    };
    window.addEventListener("sori:navigate", handler);
    return () => {
      stop();
      window.removeEventListener("sori:navigate", handler);
    };
  }, [navigate]);

  return null;
}
