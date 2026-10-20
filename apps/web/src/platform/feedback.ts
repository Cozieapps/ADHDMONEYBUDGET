import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Free sounds: synthesized with the Web Audio API — no files, no licences.

export type Cue = 'tap' | 'log' | 'coin' | 'success' | 'celebrate';

let context: AudioContext | undefined;

function audio(): AudioContext | undefined {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return undefined;
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

function tone(ctx: AudioContext, freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.12) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  amp.gain.setValueAtTime(0, ctx.currentTime + start);
  amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

const CUES: Record<Cue, (ctx: AudioContext) => void> = {
  tap: (ctx) => tone(ctx, 660, 0, 0.08, 'sine', 0.05),
  // Soft two-note chime.
  log: (ctx) => {
    tone(ctx, 784, 0, 0.25);
    tone(ctx, 1046.5, 0.08, 0.35);
  },
  // Coin: quick bright pair.
  coin: (ctx) => {
    tone(ctx, 988, 0, 0.09, 'triangle', 0.1);
    tone(ctx, 1319, 0.07, 0.3, 'triangle', 0.1);
  },
  // Gentle major arpeggio.
  success: (ctx) => {
    [523.25, 659.25, 783.99].forEach((f, i) => tone(ctx, f, i * 0.07, 0.35, 'sine', 0.09));
  },
  celebrate: (ctx) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, f, i * 0.09, 0.5, 'triangle', 0.08));
  },
};

export function playCue(cue: Cue, enabled: boolean): void {
  if (!enabled) return;
  try {
    const ctx = audio();
    if (ctx) CUES[cue](ctx);
  } catch {
    // Sound is a nicety; never let it break an action.
  }
}

export function buzz(cue: Cue, enabled: boolean): void {
  if (!enabled) return;
  try {
    if (Capacitor.isNativePlatform()) {
      if (cue === 'celebrate' || cue === 'success') void Haptics.notification({ type: NotificationType.Success });
      else void Haptics.impact({ style: cue === 'tap' ? ImpactStyle.Light : ImpactStyle.Medium });
    } else {
      navigator.vibrate?.(cue === 'celebrate' ? [20, 40, 30] : 15);
    }
  } catch {
    // Ignore devices without vibration.
  }
}
