import type { PlannedReminder } from '@sori/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export type ScheduleResult = 'scheduled' | 'denied' | 'unsupported';

const CHANNEL = 'reminders';
const TEST_ID = 1;
let channelReady = false;

async function ensureChannel() {
  if (channelReady) return;
  await LocalNotifications.createChannel({ id: CHANNEL, name: 'Reminders', description: 'Bills, paydays and check-ins', importance: 4 });
  channelReady = true;
}

export async function notificationPermission(request = false): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (Capacitor.isNativePlatform()) {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted' && request) p = await LocalNotifications.requestPermissions();
    return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default' && request) await Notification.requestPermission();
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

export async function scheduleTestNotification(delayMs = 10_000): Promise<ScheduleResult> {
  const title = 'Sori';
  const body = 'This is how your reminders will look. You’ve got this. 🌱';
  const permission = await notificationPermission(true);
  if (permission === 'unsupported') return 'unsupported';
  if (permission !== 'granted') return 'denied';
  if (Capacitor.isNativePlatform()) {
    await ensureChannel();
    await LocalNotifications.schedule({
      notifications: [{ id: TEST_ID, title, body, channelId: CHANNEL, schedule: { at: new Date(Date.now() + delayMs), allowWhileIdle: true } }],
    });
    return 'scheduled';
  }
  window.setTimeout(() => new Notification(title, { body, icon: '/favicon.svg' }), delayMs);
  return 'scheduled';
}

const webTimers = new Map<number, number>();

/**
 * Replaces all scheduled reminders with this plan. On Android they fire even when
 * Sori is closed; in a browser they can only fire while the tab is open (next 24h).
 */
export async function applyReminders(plan: PlannedReminder[]): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    if ((await notificationPermission(false)) !== 'granted') return;
    await ensureChannel();
    const pending = await LocalNotifications.getPending();
    const stale = pending.notifications.filter((n) => n.id !== TEST_ID);
    if (stale.length) await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) });
    if (!plan.length) return;
    await LocalNotifications.schedule({
      notifications: plan.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        channelId: CHANNEL,
        extra: { route: r.route },
        schedule: { at: new Date(r.at), allowWhileIdle: true },
      })),
    });
    return;
  }
  for (const t of webTimers.values()) window.clearTimeout(t);
  webTimers.clear();
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
  const horizon = Date.now() + 24 * 3_600_000;
  for (const r of plan) {
    if (r.at > horizon) continue;
    webTimers.set(
      r.id,
      window.setTimeout(() => {
        const n = new Notification(r.title, { body: r.body, icon: '/favicon.svg', tag: String(r.id) });
        n.onclick = () => {
          window.focus();
          window.dispatchEvent(new CustomEvent('sori:navigate', { detail: r.route }));
        };
      }, r.at - Date.now()),
    );
  }
}

/** Calls back with the route when the owner taps a native notification. */
export function onNotificationTap(go: (route: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const route = (event.notification.extra as { route?: string } | undefined)?.route;
    if (route) go(route);
  });
  return () => void handle.then((h) => h.remove());
}
