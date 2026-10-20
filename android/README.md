# Open Materia Medica — Android app

The companion app: the whole book, offline, in your pocket. It bundles the site
at the repository root and renders it in a `WebView`, so it needs no network and
no server.

## Two ways to get it

**Install the ready APK** — download `OpenMateriaMedica-1.0.apk` from the
[latest release](../../releases/latest) and open it on the phone. Android will
warn about installing from an unknown source; allow it for the app you are
opening the file with.

**Build it yourself** — the project has **no dependencies**. No AndroidX, no
Compose, no third-party libraries. The only code is one `WebView` activity.

```bash
cd android
./sync-assets.sh          # copies the site from the repo root into app/src/main/assets/site
```

Then either open the folder in Android Studio and hit *Build → Build APK(s)*, or:

```bash
./gradlew assembleDebug
```

`sync-assets.sh` exists because the site lives once, at the repository root.
Running it is what keeps the app and the website from drifting apart. Without it
the project has no content to show.

## What is inside

- Package `com.matneo.omm`, version 1.0
- `minSdkVersion 24` (Android 7.0), `targetSdkVersion 34` (Android 14)
- 376 bundled site files, including `index.html` and `search-index.js`
- The site's service worker is deliberately inert here: it registers only over
  `http(s)`, so under `file://` it never runs. Offline behaviour comes from the
  files simply being on the device.

See `ANDROID_NOTES.md` for the signing details and the honest caveats —
including what was verified in the build and what was not.
