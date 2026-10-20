import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

function localDate(offset = 0) {
  const date = new Date(); date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
async function freshBudget(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hi, I’m Sori.' })).toBeVisible();
  await page.getByLabel('Your first name').fill('Ava');
  await page.getByRole('button', { name: 'A little further' }).click();
  await page.getByLabel('Available balance (USD)').fill('1000');
  await page.getByLabel('Next payday (optional)').fill(localDate(14));
  await page.getByLabel('Take-home pay (USD)').fill('2000');
  await page.getByRole('button', { name: 'A little further' }).click();
  await page.getByLabel('My safety buffer (USD)').fill('100');
  await page.getByRole('button', { name: 'Meet my money' }).click();
  await expect(page.getByRole('heading', { name: /Hey Ava/ })).toBeVisible();
  await expect(page.locator('.safe-value .money')).toHaveText('$64.28');
}
async function route(page: Page, path: string) {
  await page.goto(`/#/${path}`);
  await expect(page.locator('#main-content h1')).toBeVisible();
}
async function audit(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  expect(violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
}

test('fresh budget logs, undoes, persists and removes spending', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await freshBudget(page);
  await page.getByRole('button', { name: 'Log money', exact: true }).filter({ visible: true }).click();
  const log = page.getByRole('dialog');
  await log.getByPlaceholder('12.50 coffee at Lily’s #work').fill('12.50 coffee');
  await expect(log.getByLabel('Amount (USD)')).toHaveValue('12.50');
  await log.getByRole('button', { name: 'Save money out' }).click();
  await expect(page.getByRole('status')).toContainText('Logged.');
  await expect(page.locator('.safe-value .money')).toHaveText('$51.78');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await route(page, 'spending');
  await expect(page.getByText('0 entries', { exact: true })).toBeVisible();
  await route(page, '');
  await page.getByRole('button', { name: 'Log money', exact: true }).filter({ visible: true }).click();
  await page.getByRole('dialog').getByPlaceholder('12.50 coffee at Lily’s #work').fill('12.50 coffee');
  await page.getByRole('dialog').getByRole('button', { name: 'Save money out' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await route(page, 'spending');
  await expect(page.getByText('1 entries', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove Coffee', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Coffee', exact: true }).click();
  await expect(page.getByText('0 entries', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('1 entries', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('category envelope and bill check-off update the actual ledger', async ({ page }) => {
  await freshBudget(page); await route(page, 'spending');
  await page.getByRole('button', { name: 'Plan a category' }).click();
  const envelope = page.getByRole('dialog');
  await envelope.getByRole('combobox', { name: 'Category', exact: true }).selectOption({ label: 'Coffee & treats' });
  await envelope.getByLabel('Monthly amount').fill('80');
  await envelope.getByRole('button', { name: 'Save envelope' }).click();
  await expect(page.getByText('$80.00 left in this envelope')).toBeVisible();
  await route(page, 'calendar');
  await page.getByRole('button', { name: 'Add a repeat' }).click();
  const repeat = page.getByRole('dialog');
  await repeat.getByLabel('Name', { exact: true }).fill('Phone check');
  await repeat.getByLabel('Amount each time').fill('35');
  await repeat.getByLabel('First / next due date').fill(localDate());
  await repeat.getByRole('button', { name: 'Add repeat', exact: true }).click();
  await page.getByRole('button', { name: 'Mark Phone check paid' }).click();
  await expect(page.getByRole('button', { name: 'Undo Phone check paid' })).toBeVisible();
  await route(page, 'spending');
  await expect(page.getByText('1 entries', { exact: true })).toBeVisible();
  await expect(page.getByText('Phone check', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Phone check', { exact: true })).toBeVisible();
});

test('goals, wish pause, debt payments, forecast scenario and local coach work', async ({ page }) => {
  await freshBudget(page); await route(page, 'goals');
  await page.getByRole('button', { name: 'New goal' }).click();
  const goal = page.getByRole('dialog');
  await goal.getByLabel('What are you saving for?').fill('Rainy day');
  await goal.getByLabel('Target amount').fill('500');
  await goal.getByLabel('Plan to add each month').fill('25');
  await goal.getByRole('button', { name: 'Plant this goal' }).click();
  await page.getByRole('button', { name: 'Add a little', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Amount to set aside').fill('20');
  await page.getByRole('dialog').getByRole('button', { name: 'Add to goal' }).click();
  await expect(page.locator('.goal-card .goal-amount')).toContainText('$20.00');
  await page.getByRole('button', { name: 'Park a wish' }).click();
  await page.getByRole('dialog').getByLabel('What caught your eye?').fill('Lovely shoes');
  await page.getByRole('dialog').getByLabel('How much is it?').fill('40');
  await page.getByRole('dialog').getByRole('button', { name: 'Give it 48 hours' }).click();
  await expect(page.getByRole('button', { name: 'Buy & log' })).toBeDisabled();
  await page.getByRole('button', { name: 'Let it go' }).click();
  await expect(page.getByText(/in wishes you decided to let go/)).toContainText('$40.00');
  await route(page, 'debt');
  await page.getByRole('button', { name: 'Add a debt' }).click();
  const debt = page.getByRole('dialog');
  await debt.getByLabel('Debt name').fill('Kind card');
  await debt.getByLabel('Current amount owed').fill('600');
  await debt.getByLabel('Minimum monthly payment').fill('30');
  await debt.getByLabel('Interest rate (APR %)').fill('12');
  await debt.getByRole('button', { name: 'Add debt', exact: true }).click();
  await page.getByRole('button', { name: 'Record a payment' }).click();
  await page.getByRole('dialog').getByLabel('Amount you paid').fill('30');
  await page.getByRole('dialog').getByRole('button', { name: 'Record this payment' }).click();
  await expect(page.locator('.debt-row .row-between').first()).toContainText('$570.00');
  await route(page, 'forecast');
  await page.getByRole('button', { name: '90 days', exact: true }).click();
  await expect(page.getByRole('button', { name: '90 days', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Purchase amount').fill('40');
  await expect(page.getByRole('status')).toContainText('Your lowest point changes by');
  await route(page, 'coach');
  await page.getByRole('button', { name: 'Money feels overwhelming.' }).click();
  await expect(page.locator('.chat-message.sori')).toContainText('You don’t need to solve the whole month today.');
  await page.getByLabel('Message Sori').fill('log 12 coffee');
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Review a money entry' }).last().click();
  await expect(page.getByRole('dialog').getByLabel('Amount (USD)')).toHaveValue('12.00');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await route(page, 'settings');
  await expect(page.getByText('This device only', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Budget backup', exact: true })).toBeVisible();
});

test('sample preview is separate from a fresh personal budget', async ({ page }) => {
  await page.goto('/?preview=1#/');
  await expect(page.getByRole('heading', { name: /Hey Jordan/ })).toBeVisible();
  await expect(page.locator('.preview-banner')).toBeVisible();
  await page.getByRole('link', { name: 'Start my fresh budget' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, I’m Sori.' })).toBeVisible();
  await freshBudget(page);
  await route(page, 'spending');
  await expect(page.getByText('0 entries', { exact: true })).toBeVisible();
  await page.goto('/?preview=1#/');
  await expect(page.getByRole('heading', { name: /Hey Jordan/ })).toBeVisible();
});

test('fresh setup and sample screens meet serious accessibility checks', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Hi, I’m Sori.' })).toBeVisible();
  await page.screenshot({ path: `../../artifacts/sori-setup-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' });
  await audit(page);
  await page.goto('/?preview=1#/'); await expect(page.getByRole('heading', { name: /Hey Jordan/ })).toBeVisible();
  await page.screenshot({ path: `../../artifacts/sori-dashboard-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' });
  await audit(page);
  for (const screen of ['spending', 'calendar', 'goals', 'debt', 'forecast', 'insights', 'coach', 'settings']) {
    await page.goto(`/?preview=1#/${screen}`); await expect(page.locator('#main-content h1')).toBeVisible();
    await audit(page);
  }
  expect(errors).toEqual([]);
});

test('sample screens do not overflow narrow, tablet or desktop viewports', async ({ page }) => {
  await page.goto('/?preview=1#/'); await expect(page.getByRole('heading', { name: /Hey Jordan/ })).toBeVisible();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const screen of ['', 'spending', 'calendar', 'goals', 'debt', 'forecast', 'insights', 'coach', 'settings']) {
      await page.goto(`/?preview=1#/${screen}`); await expect(page.locator('#main-content h1')).toBeVisible();
      const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      expect(layout.content, `${screen || 'today'} at ${width}px`).toBeLessThanOrEqual(layout.width + 1);
    }
  }
});

test('installed app shell reopens and logs while offline', async ({ page, context }) => {
  await freshBudget(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Hey Ava/ })).toBeVisible();
  await page.getByRole('button', { name: 'Log money', exact: true }).filter({ visible: true }).click();
  await page.getByRole('dialog').getByPlaceholder('12.50 coffee at Lily’s #work').fill('8 lunch');
  await page.getByRole('dialog').getByRole('button', { name: 'Save money out' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#/spending');
  await expect(page.getByText('1 entries', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Lunch' })).toBeVisible();
  await context.setOffline(false);
});

test('privacy and simple view persist and dialogs support Escape', async ({ page }) => {
  await page.goto('/?preview=1#/');
  await expect(page.getByRole('heading', { name: /Hey Jordan/ })).toBeVisible();
  await page.getByRole('button', { name: 'Hide amounts' }).click();
  await expect(page.getByRole('button', { name: 'Show amounts' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Simple view' }).click();
  await expect(page.getByRole('heading', { name: 'Your next 30 days' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Show amounts' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Simple view' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Log money', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('budget backup exports, rejects invalid files and restores after confirmation', async ({ page }) => {
  await freshBudget(page); await route(page, 'settings');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Budget backup', exact: true }).click();
  const backup = await downloadEvent;
  const path = await backup.path();
  expect(path).not.toBeNull();
  const contents = await readFile(path!, 'utf8');
  const parsed = JSON.parse(contents);
  expect(parsed.snapshot.settings.name).toBe('Ava');
  expect(parsed.snapshot.txns).toHaveLength(0);
  await page.getByLabel('Restore a budget backup').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"invalid":true}') });
  await expect(page.getByRole('alert')).toContainText('not a readable Sori backup');
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Ava');
  await expect(page.locator('.account-row')).toContainText('$1,000.00');
  await page.getByLabel('Your name', { exact: true }).fill('Bea');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('preferences, saved');
  await page.getByLabel('Restore a budget backup').setInputFiles({ name: 'sori-test-backup.json', mimeType: 'application/json', buffer: Buffer.from(contents) });
  await expect(page.getByRole('dialog')).toContainText('This replaces the budget on this device.');
  await page.getByRole('dialog').getByRole('button', { name: 'Restore this backup', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await route(page, '');
  await expect(page.getByRole('heading', { name: /Hey Ava/ })).toBeVisible();
});
