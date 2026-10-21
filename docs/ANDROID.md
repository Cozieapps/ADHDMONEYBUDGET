# Install Sori Bloom on an Android tablet

Sori Bloom is a real installable Android application built with Capacitor: the shared React interface runs in Android's WebView, with native notification, haptic, file and sharing integrations. It is not a Kotlin/Compose rewrite. It supports Android 10/API 29 and newer. Application ID `app.sori.bloom` allows it to coexist with the original `app.sori.budget` app.

## Download the published APK

Open [Sori Bloom’s personal preview release](https://github.com/Cozieapps/ADHDMONEYBUDGET/releases/tag/v0.1.0-bloom.2) and download `sori-bloom-debug.apk` on your tablet. The release contains the exact compiled and signature-verified package, plus its SHA-256 checksum. Open the downloaded APK to install it.

## Build with GitHub Actions

Run **Verify and build** in Actions to compile an additional test APK. Once its verification and Android jobs pass, download the **sori-bloom-debug-apk** artifact, unzip it and open `sori-bloom-debug.apk` on the tablet. Android may ask you to allow installation from your browser/files app. This debug build is intended for personal testing. Keep your release keystore safe before using release builds for long-term updates.

## Build locally

Requirements: Node 22+, npm 11+, a full JDK 21 (including javac), Android SDK Platform 36 and Build Tools 36.0.0 (AGP also installs its default 35.0.0). Google's command-line tools/Android Studio can install the SDK. Accept the SDK license terms when the official installer requests them.

```bash
npm ci
export ANDROID_HOME=/path/to/your/android-sdk
export JAVA_HOME=/path/to/your/jdk21
# Optional: make cloud-build caches writable, outside the checkout.
export GRADLE_USER_HOME=/workspace/.gradle
export ANDROID_USER_HOME=/workspace/.android-user
npm run android:apk
```

The build compiles the web app, runs Capacitor sync, assembles a debug APK with two Gradle workers, and copies the signed installable output plus SHA-256 to `artifacts/`. It keeps TLS verification on and uses Gradle's pinned distribution checksum. `ANDROID_HOME=/workspace/.android-sdk` is the SDK installed in this development machine. The verified full JDK in this machine is `/workspace/.jdk21`; the system Java binary is only a JRE. In this managed network, set `GRADLE_OPTS=-Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts` to reuse the system JVM trust store (including its configured proxy CA). Do not disable TLS checks. On a workstation, use your own SDK and JDK paths.

Use `VITE_API_URL=https://your-sori-bloom-api.workers.dev npm run android:apk` to preconfigure sync. You can also enter the HTTPS API address and passphrase in the app after installation; local budgeting does not need a server. Do not include a passphrase in a `VITE_` variable: those values are public in the app bundle.

## Permissions and reminders

Notifications are opt-in. Android reminders can fire while the app is closed after permission is granted and the app has scheduled them. Android may require additional battery/background allowances; exact timing depends on the OS. In a browser, reminders work only while Sori is open. No bank credentials, contact access, camera or location permissions are requested. Android system backup is disabled; use Sori's explicit backup export for financial records.

## Release signing

A release build requires `SORI_KEYSTORE_PATH`, `SORI_KEYSTORE_PASSWORD`, `SORI_KEY_ALIAS`, and `SORI_KEY_PASSWORD` in the local secure environment. Run `npm run android:release`. Never commit key material or passwords. Updates need the same signing key and a larger `SORI_VERSION_CODE`; `SORI_VERSION_NAME` controls the displayed version. Losing the key requires reinstalling; export a backup first.

## Verified build in this workspace

The current debug APK was compiled successfully with Temurin JDK 21.0.12.1+1, SDK Platform 36, Gradle 8.14.3 and Android Gradle Plugin 8.13.0. It is in `artifacts/sori-bloom-debug.apk`, with a SHA-256 sidecar. Android `apksigner verify` passed its APK Signature Scheme v2 signature; `aapt` confirmed the application label, ID, version, minimum/target SDK and disabled backup. The packaged bundle is the same final build exercised by the browser tests.

The APK was not installed on a physical tablet in this environment. Notification delivery, battery restrictions, haptics and native file sharing still need a device check. This is a debug-signed personal test build; use your own persistent signing key for long-term release updates.
