#!/usr/bin/env node
// Upload existing personal-preview assets. Never rebuild, re-sign or replace a release asset.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2];
const repo = process.env.GH_REPO || 'Cozieapps/ADHDMONEYBUDGET';
const expectedRepo = 'cozieapps/adhdmoneybudget';
if (!tag || !/^v\d+\.\d+\.\d+-bloom\.\d+$/.test(tag)) throw new Error('Supply a personal-preview tag such as v0.1.0-bloom.1.');
if (repo.toLowerCase() !== expectedRepo) throw new Error('This helper publishes only Cozieapps/ADHDMONEYBUDGET.');
const assetsArg = process.argv.indexOf('--assets');
const assets = assetsArg < 0 ? join(root, 'release-assets') : resolve(root, process.argv[assetsArg + 1] || 'release-assets');
const names = ['sori-bloom-debug.apk', 'sori-bloom-debug.apk.sha256', 'sori-bloom-web.zip', 'sori-bloom-web.zip.sha256'];
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const gh = (args) => execFileSync('gh', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

if (assetsArg < 0) {
  // Package the already-built local files, preserving the APK's signing identity.
  mkdirSync(assets, { recursive: true });
  const apkDir = existsSync(join(root, 'downloads/sori-bloom-debug.apk')) ? 'downloads' : 'artifacts';
  const apk = join(root, apkDir, 'sori-bloom-debug.apk');
  const checksum = join(root, apkDir, 'sori-bloom-debug.apk.sha256');
  if (!existsSync(apk) || !existsSync(checksum)) throw new Error('An existing APK and SHA-256 sidecar are required; this helper will not build or sign one.');
  writeFileSync(join(assets, names[0]), readFileSync(apk));
  writeFileSync(join(assets, names[1]), readFileSync(checksum));
  if (!existsSync(join(root, 'apps/web/dist/index.html'))) throw new Error('The existing web build is missing. Run npm run build first.');
  // Create a fresh zip at our own known output path so removed web files cannot linger.
  const webArchive = join(assets, names[2]);
  if (existsSync(webArchive)) throw new Error('release-assets/sori-bloom-web.zip already exists. Reuse it with --assets release-assets, or choose a fresh asset directory.');
  execFileSync('zip', ['-X', '-q', '-r', webArchive, '.'], { cwd: join(root, 'apps/web/dist'), stdio: 'inherit' });
  writeFileSync(join(assets, names[3]), `${hash(webArchive)}  ${names[2]}\n`);
}
for (const name of names) if (!existsSync(join(assets, name))) throw new Error(`Missing release asset: ${name}`);
for (const name of [names[0], names[2]]) {
  const declared = readFileSync(join(assets, `${name}.sha256`), 'utf8').trim();
  const expected = new RegExp(`^([a-f0-9]{64})  ${name.replaceAll('.', '\\.')}\\s*$`).exec(declared)?.[1];
  if (!expected || expected !== hash(join(assets, name))) throw new Error(`Checksum mismatch for ${name}; nothing was uploaded.`);
}

let release;
try {
  release = JSON.parse(gh(['release', 'view', tag, '--repo', repo, '--json', 'url,assets,isDraft,isPrerelease']));
} catch {
  // Create is fail-closed: it cannot replace an existing release. A permission/network
  // error also fails here rather than being treated as permission to overwrite anything.
  gh(['release', 'create', tag, '--repo', repo, '--verify-tag', '--draft', '--prerelease', '--title', `Sori Bloom ${tag} · personal Android preview`, '--notes-file', join(root, 'docs/RELEASE-NOTES.md')]);
  release = JSON.parse(gh(['release', 'view', tag, '--repo', repo, '--json', 'url,assets,isDraft,isPrerelease']));
}
if (!release.isPrerelease) throw new Error('This tag already names a non-preview release; refusing to alter it.');
const temporary = mkdtempSync(join(tmpdir(), 'sori-preview-'));
try {
  for (const name of names) {
    const existing = release.assets.find((asset) => asset.name === name);
    if (existing) {
      gh(['release', 'download', tag, '--repo', repo, '--pattern', name, '--dir', temporary]);
      if (hash(join(temporary, name)) !== hash(join(assets, name))) throw new Error(`Release asset ${name} already exists with different bytes. Use a new preview tag; no existing asset was overwritten.`);
      console.log(`Already published with matching checksum: ${name}`);
    } else {
      // No --clobber: a concurrent upload fails safely instead of replacing data.
      gh(['release', 'upload', tag, join(assets, name), '--repo', repo]);
      console.log(`Uploaded ${name}`);
    }
  }
  if (release.isDraft) gh(['release', 'edit', tag, '--repo', repo, '--draft=false']);
  const published = JSON.parse(gh(['release', 'view', tag, '--repo', repo, '--json', 'url,isDraft,isPrerelease,assets']));
  if (published.isDraft || !published.isPrerelease || names.some((name) => !published.assets.some((asset) => asset.name === name))) throw new Error('Release verification did not confirm a published preview with all assets.');
  console.log(`Downloadable personal preview: ${published.url}`);
} finally {
  // Only the directory created above by this process is removed.
  rmSync(temporary, { recursive: true, force: true });
}
