import { afterEach, beforeEach, expect, it } from 'vitest';
import { db } from '../data/db';
import { apiUrl, setApiUrl } from './config';
const personalName = db.name;
beforeEach(() => { localStorage.clear(); });
afterEach(() => { Object.defineProperty(db, 'name', { value: personalName, configurable: true }); });

it('isolates server configuration from the original app', () => {
  localStorage.setItem('sori.apiUrl', 'https://original.example.test');
  setApiUrl('https://bloom.example.test');
  expect(apiUrl()).toBe('https://bloom.example.test');
  expect(localStorage.getItem('sori.apiUrl')).toBe('https://original.example.test');
});

it('does not let sample previews change a personal cloud connection', () => {
  setApiUrl('https://personal.example.test');
  Object.defineProperty(db, 'name', { value: 'sori-bloom-preview', configurable: true });
  expect(() => setApiUrl('https://sample.example.test')).toThrow('Sample previews');
  expect(apiUrl()).toBe('https://personal.example.test');
});
