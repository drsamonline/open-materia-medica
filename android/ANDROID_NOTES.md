# ANDROID_NOTES — what this APK is, and what it is not

## What it is

An **offline WebView wrapper**. The 7.4 MB site is bundled inside the APK under
`assets/site/`, and one activity loads it from
`file:///android_asset/site/index.html`. There is no network code at all, so it
cannot break when a server moves, and it works in aeroplane mode.

This is the only route that produces a working APK from what exists today,
because the alternative — a Trusted Web Activity — needs something that was
never supplied.

## What it is not

**It is not a TWA, and it is not ready for the Play Store.** Two separate
reasons:

1. **TWA is blocked.** A Trusted Web Activity is Google's official way to ship a
   PWA as an app, and it is the right answer *if the site is hosted*. It requires
   the site served over HTTPS at a real domain, plus a Digital Asset Links file
   (`https://yourdomain/.well-known/assetlinks.json`) naming this app's package
   and signing-certificate fingerprint. No domain was ever provided, so the TWA
   could not be built or published. Give me the domain and it becomes a short
   job.

2. **Play policy.** Google discourages apps that are "just a website in a
   WebView" — apps that add no native value. This one is a defensible case
   (an offline reference that works with no connection), but it is not a
   guarantee of acceptance. For personal use, sideloading is unaffected.

## What I could not verify

**I have not run this app.** There is no Android device and no emulator in this
environment. What I did verify, by inspecting the built package:

| Check | Result |
|---|---|
| Signature | verifies; APK Signature Scheme v2 and v3 |
| Signer | `CN=Dr. Sohil Momin, OU=MATNEO, O=MATNEO, L=Vadodara, ST=Gujarat, C=IN` |
| Package / version | `com.matneo.omm`, versionCode 1, versionName 1.0 |
| SDK range | min 24 (Android 7.0), target 34 (Android 14) |
| Launcher activity | `com.matneo.omm.MainActivity`, label "Materia Medica", MAIN/LAUNCHER filter present |
| Launcher icons | present at hdpi, xhdpi, xxhdpi, xxxhdpi |
| Bundled assets | 376 site files, including `index.html` and `search-index.js` |
| Code | `MainActivity` present in `classes.dex` |

What that does **not** prove is that it installs and renders correctly on your
phone. Please test it — and tell me what breaks, if anything.

## Notes on the build

- **Signing scheme.** v1 (JAR) signing is off, v2 and v3 are on. That is correct
  for `minSdkVersion 24`, since v2 arrived with Android 7.0. If you ever lower
  `minSdkVersion` below 24, turn v1 signing back on.
- **The keystore password is written down** in `README.md`. Treat it as a
  development key and generate a private one before any public release.
- **The manifest was fixed** as part of this work. It had no `scope` (so the
  installed PWA's navigation boundary was undefined) and declared only an SVG
  icon, where Android wants PNG at 192 and 512. Both are corrected in the
  bundled copy, and PNG icons were generated from the existing SVG.

## If you want the Play Store route

Tell me the domain and I will:

1. host `assetlinks.json` at `/.well-known/` with this app's SHA-256 fingerprint,
2. generate the TWA (Bubblewrap) project pointed at that URL,
3. build and sign the AAB,
4. and add the `og:url` and `<link rel="canonical">` the site still lacks.

The fingerprint to put in `assetlinks.json` for *this* build is:

```
90:5C:F4:B6:CE:46:E1:3F:41:96:2A:30:48:65:EF:B5:9E:AE:FF:2E:05:3A:0E:7F:89:BA:92:8B:3F:70:24:05
```

That is the SHA-256 of the certificate this APK is signed with. Note that a
different signing key means a different fingerprint, and the file must match the
key that actually signs the published build.
