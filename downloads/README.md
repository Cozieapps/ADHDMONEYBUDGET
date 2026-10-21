# Install Sori Bloom

Download [sori-bloom-debug.apk](https://github.com/Cozieapps/ADHDMONEYBUDGET/releases/download/v0.1.0-bloom.2/sori-bloom-debug.apk) on your Android tablet, then open the downloaded file. Android may ask you to allow installation from your browser or files app.

This is the compiled, signature-verified personal preview build of Sori Bloom, version 0.1.0, package `app.sori.bloom`. It supports Android 10 and newer and can coexist with the original Sori app.

The checksum is in [sori-bloom-debug.apk.sha256](sori-bloom-debug.apk.sha256). From this directory, verify it with:

```bash
sha256sum -c sori-bloom-debug.apk.sha256
```

A fresh installation starts with no personal financial data. Budgeting works offline. Optional cloud sync is configured in the app's Settings once your Cloudflare server is deployed. No passphrase or API token is included in this APK.

This debug-signed build is intended for personal review. Keep a stable private signing key for later updates; a differently signed build requires uninstalling the previous installation. Export your budget before uninstalling. See [Android build instructions](../docs/ANDROID.md).
