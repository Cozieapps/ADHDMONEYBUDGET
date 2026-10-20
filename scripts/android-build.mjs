#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
const mode = release ? 'release' : 'debug';
if (release && !process.env.SORI_KEYSTORE_PATH) throw new Error('Release builds require SORI_KEYSTORE_PATH and signing environment variables. Use npm run android:apk for an installable debug build.');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk || !existsSync(sdk)) throw new Error('Set ANDROID_HOME to your Android SDK directory. See docs/ANDROID.md.');
const run = (command, args, cwd = root, extraEnv = {}) => execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
const javac = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/javac') : 'javac';
try { execFileSync(javac, ['-version'], { stdio: 'pipe' }); } catch { throw new Error('A full JDK 21+ with javac is required; a JRE alone cannot build Android. Set JAVA_HOME to your JDK.'); }
run('npm', ['-w', 'apps/web', 'run', 'build']);
run('npx', ['--no-install', 'cap', 'sync', 'android'], join(root, 'apps/web'));
const gradleArgs = [release ? 'assembleRelease' : 'assembleDebug', '--no-daemon', '--max-workers=2'];
let gradleOpts = process.env.GRADLE_OPTS || '';
// Java does not automatically consume HTTPS_PROXY. Forward its non-secret address;
// leave configured JVM trust stores in place and never turn off TLS verification.
if (process.env.HTTPS_PROXY) {
  const proxy = new URL(process.env.HTTPS_PROXY);
  for (const scheme of ['http', 'https']) {
    gradleOpts += ` -D${scheme}.proxyHost=${proxy.hostname} -D${scheme}.proxyPort=${proxy.port || '80'}`;
  }
  gradleOpts += ' -Dhttp.nonProxyHosts=localhost|127.*';
}
run('./gradlew', gradleArgs, join(root, 'apps/android'), { GRADLE_OPTS: gradleOpts });
const built = join(root, `apps/android/app/build/outputs/apk/${mode}/app-${mode}.apk`);
if (!existsSync(built)) throw new Error('Expected signed APK was not produced. Inspect Gradle output.');
const signer = join(sdk, 'build-tools/36.0.0/apksigner');
if (!existsSync(signer)) throw new Error('Android Build Tools 36.0.0 are required to verify the APK signature.');
run(signer, ['verify', '--verbose', built]);
const outputDir = join(root, 'artifacts');
mkdirSync(outputDir, { recursive: true });
const output = join(outputDir, `sori-bloom-${mode}.apk`);
copyFileSync(built, output);
writeFileSync(`${output}.sha256`, `${createHash('sha256').update(readFileSync(output)).digest('hex')}  sori-bloom-${mode}.apk\n`);
console.log(`Installable ${mode} APK: ${output}`);
