#!/usr/bin/env node
// Creates isolated Sori Bloom resources, then deploys the API and Pages app.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDeployment } from './verify-deployment.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = join(root, 'apps/worker');
const webDir = join(root, 'apps/web');
const cli = join(root, 'node_modules/.bin/wrangler');
const pagesProject = process.env.SORI_PAGES_PROJECT || 'sori-bloom';
const databaseName = 'sori-bloom';
const kvTitle = 'sori-bloom-oauth';
const workerName = 'sori-bloom-api';
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'SORI_PASSPHRASE']) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing ${name}. Add it securely as described in docs/DEPLOY.md; never paste it into source files.`);
  if (name !== 'SORI_PASSPHRASE' && /\s/.test(value)) throw new Error(`${name} must contain only the value, without whitespace.`);
}
if (process.env.SORI_PASSPHRASE.trim().length < 16) throw new Error('Use a passphrase of at least 16 characters.');
if (!/^[a-z0-9][a-z0-9-]{0,56}[a-z0-9]$/.test(pagesProject)) throw new Error('SORI_PAGES_PROJECT must be a valid Pages project name.');

function wrangler(args, { cwd = workerDir, input } = {}) {
  console.log(`Running Wrangler: ${args[0]} ${args[1] || ''}`);
  return execFileSync(cli, args, { cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } });
}
function parseJson(output) {
  // Machine-readable Wrangler commands return JSON; reject non-JSON rather than guessing IDs.
  const start = output.search(/[[{]/);
  if (start < 0) throw new Error('Wrangler did not return the expected JSON.');
  return JSON.parse(output.slice(start));
}
const databases = parseJson(wrangler(['d1', 'list', '--json']));
let databaseId = databases.find((entry) => entry.name === databaseName)?.uuid;
if (!databaseId) {
  wrangler(['d1', 'create', databaseName]);
  databaseId = parseJson(wrangler(['d1', 'list', '--json'])).find((entry) => entry.name === databaseName)?.uuid;
}
const namespaces = parseJson(wrangler(['kv', 'namespace', 'list']));
let kvId = namespaces.find((entry) => entry.title === kvTitle)?.id;
if (!kvId) {
  wrangler(['kv', 'namespace', 'create', kvTitle]);
  kvId = parseJson(wrangler(['kv', 'namespace', 'list'])).find((entry) => entry.title === kvTitle)?.id;
}
if (!databaseId || !kvId) throw new Error('Could not identify the Sori Bloom D1/KV resources.');
const base = JSON.parse(readFileSync(join(workerDir, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
base.name = workerName;
delete base.$schema;
base.d1_databases = base.d1_databases.map((binding) => ({ ...binding, database_name: databaseName, database_id: databaseId }));
base.kv_namespaces = base.kv_namespaces.map((binding) => ({ ...binding, id: kvId }));
if (process.env.SORI_ENABLE_CLOUD_AI === 'true') {
  base.ai = { binding: 'AI' };
  base.vars = { ...base.vars, SORI_AI_ENABLED: 'true' };
} else {
  delete base.ai;
  base.vars = { ...base.vars, SORI_AI_ENABLED: 'false' };
}
const deployConfig = join(workerDir, 'wrangler.deploy.json');
writeFileSync(deployConfig, JSON.stringify(base, null, 2));
wrangler(['d1', 'migrations', 'apply', databaseName, '--remote', '--config', deployConfig], { input: 'y\n' });
// Without a passphrase the API fails closed (authentication returns 503).
const deployed = wrangler(['deploy', '--config', deployConfig]);
wrangler(['secret', 'put', 'SORI_PASSPHRASE', '--config', deployConfig], { input: process.env.SORI_PASSPHRASE });
const apiUrl = process.env.SORI_API_URL || /https:\/\/[a-z0-9.-]+\.workers\.dev/.exec(deployed)?.[0];
if (!apiUrl || !/^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9/_-]*)?$/i.test(apiUrl)) throw new Error('Could not determine the HTTPS API URL. Set SORI_API_URL to the deployed Worker URL and rerun.');
execFileSync('npm', ['-w', 'apps/web', 'run', 'build'], { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_API_URL: apiUrl } });
const projects = parseJson(wrangler(['pages', 'project', 'list', '--json'], { cwd: webDir }));
if (!projects.some((entry) => entry.name === pagesProject || entry['Project Name'] === pagesProject)) {
  wrangler(['pages', 'project', 'create', pagesProject, '--production-branch', 'main'], { cwd: webDir });
}
wrangler(['pages', 'deploy', 'dist', '--project-name', pagesProject, '--branch', 'main', '--commit-dirty=true'], { cwd: webDir });
const webUrl = `https://${pagesProject}.pages.dev`;
let verified = false;
for (let attempt = 0; attempt < 4; attempt++) {
  try {
    await verifyDeployment({ apiUrl, webUrl, passphrase: process.env.SORI_PASSPHRASE });
    verified = true;
    break;
  } catch (error) {
    if (attempt === 3) throw error;
    console.log('Waiting for the new deployment to become ready…');
    await new Promise(resolve => setTimeout(resolve, 3_000));
  }
}
if (!verified) throw new Error('Deployment readiness could not be confirmed.');
if (process.env.GITHUB_ACTIONS === 'true') {
  console.log(`::notice title=Sori Bloom verified::App: ${webUrl} · Sync API: ${apiUrl} · Database, sign-in and read-only sync passed.`);
}
console.log(`Sori Bloom deployed.\nWeb: ${webUrl}\nAPI: ${apiUrl}\nMCP connector: ${apiUrl}/mcp`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `api_url=${apiUrl}\nweb_url=${webUrl}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Sori Bloom: ${webUrl}\n\nAPI: ${apiUrl}\n\nMCP connector: ${apiUrl}/mcp\n`);
