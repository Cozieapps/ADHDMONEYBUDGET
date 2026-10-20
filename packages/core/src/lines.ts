import { dayNumber } from './dates';
import type { ISODate } from './types';

export const DAILY_LINES = [
  'One thing at a time is enough.',
  'Checking in counts. Even when the number isn’t pretty.',
  'You don’t have to be perfect to be in control.',
  'Small steps, big changes.',
  'Future you says thank you.',
  'Money is a tool, not a report card.',
  'A plan you can change is still a plan.',
  'Rest is productive too.',
  'Progress, not perfection.',
  'You noticed. That’s the hard part.',
  'Today’s job: just today.',
  'Be as kind to yourself as you’d be to a friend.',
  'A missed day is a pause, not a failure.',
  'You’re building a habit, not passing a test.',
  'Done is better than perfect.',
  'Your brain is not broken. It just likes things visible.',
  'Tiny wins still count as wins.',
  'Fresh start whenever you need one.',
  'You’re allowed to enjoy your money.',
  'Calm money, calm mind.',
];

export function dailyLine(date: ISODate): string {
  return DAILY_LINES[((dayNumber(date) % DAILY_LINES.length) + DAILY_LINES.length) % DAILY_LINES.length]!;
}
