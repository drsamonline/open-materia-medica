# Open Materia Medica

> © 2026 Dr. Sohil Momin, BHMS. All rights reserved. This work — text, design and code — is
> watermarked and fingerprinted. Unauthorised copying, redistribution or
> rebranding is prohibited.


A plain-language homeopathic **materia medica** as a self-contained, offline-capable
static website (and installable PWA): **344 remedy portraits**, each set beside the real
toxicology and modern pharmacology of its source substance.

Compiled by **Dr. Sohil Momin, BHMS**.

This is the free web edition of, and companion to, the book
**Open Materia Medica: The classical materia medica, in plain language**.
It is the same material, arranged for the screen — and it ships with an offline
Android app so the whole library travels with you.

> Educational reference only — **not medical advice**. Severe, sudden or worsening
> symptoms need a qualified clinician.

---

## What's inside

| Path | What it is |
|---|---|
| `index.html` | Home / remedy index — all 344 portraits, one line each. |
| `search.html` | Offline full-text search across every portrait. |
| `diseases.html` | 66 conditions with their most-used remedies (jump-links). |
| `repertory.html` | Mini-repertory: the most-used rubrics with first remedies. |
| `quick-reference.html` | The daily-practice fifty, plus every Boericke remedy in one line. |
| `compare.html` | Any two portraits side by side (opens on Arsenicum / Veratrum). |
| `kingdoms.html` | The remedies by kingdom, with a distribution chart. |
| `families.html` | Sixteen natural families (snakes, spiders, Kali family, …). |
| `veterinary.html` | Animal conditions by species. |
| `agro.html` | Agro-homeopathy: crop, pest and storage problems. |
| `glossary.html` | 34 classical terms in plain words. |
| `evidence.html` | The research debate on ultra-dilute preparations, gathered in one place, neutrally. |
| `references.html` | Every source, cited once site-wide. |
| `compiled-by.html` | The compiler's page. |
| `about.html` | The user guide — how to read a remedy page and use the library. |
| `basics.html` | Read this first — the beginner's primer on how homeopathy is read. |
| `study.html` | Study app — flashcards and self-test over the library. |
| `license.html` | Licence and rights of use. |
| `remedies/*.html` | The 344 remedy portraits. |

Every remedy page opens with a **source illustration** and the **essence**, then runs
through the same blocks: **the traditional picture** (inner state → body → modalities →
organ affinities) → **where the classical picture comes from** → **the substance in real
medicine** → **glossary** → **look-alikes** → a **safety** note.

## Assets

| File | Purpose |
|---|---|
| `assets/style.css` | The whole design system (one stylesheet). |
| `assets/site.js` | Mobile nav, active-link highlight, back-to-top, reading bar, service worker. |
| `assets/search-index.js` | The offline search index, loaded as a JS global so search works from `file://` too. |
| `assets/icon.svg`, `assets/favicon.svg` | App icon and favicon. |
| `sw.js`, `manifest.json` | Service worker and web-app manifest — the offline install. |

## Android app

The companion app bundles this entire site and runs it offline: no network, no
server, works in aeroplane mode.

**Install it** — download `OpenMateriaMedica-1.0.apk` from the
[latest release](../../releases/latest) and open it on the phone.

**Or build it** — the project lives in [`android/`](android/) and has **no
dependencies**: no AndroidX, no Compose, no libraries. The only code is a single
`WebView` activity. Run `android/sync-assets.sh` first (it copies the site into
the app), then build with Android Studio or `./gradlew assembleDebug`.

## Hosting

It is a **static site** — drop the folder on any web host (GitHub Pages, Netlify,
Cloudflare Pages, a plain Apache/Nginx directory). No build step, no server code,
no external requests.

**Live at:** <https://drsamonline.github.io/open-materia-medica/> — served from this
repository by GitHub Pages, straight from the default branch. There is no build
step: what is committed is what is served.

- **Offline app:** served over `https`, it installs to a phone's home screen and works
  with no network — the service worker caches the entire library.
- **Local use:** opening `index.html` from disk works for browsing and search
  (the index loads as a script, not a `fetch`); the install prompt needs a web server.

## Editing

- **Text/content** lives directly in the HTML files. Remedy pages are plain HTML with a
  shared structure, so a find-and-replace across `remedies/` is safe.
- **Navigation and footer** are a single canonical block repeated in every page. If you
  add a page, copy the `<header class="site">…</header>` and `<footer class="site">…</footer>`
  block from any existing page and adjust the `href` prefixes (`../` inside `remedies/`).
- **The search index** is generated from the remedy pages. After editing remedies,
  rebuild `assets/search-index.js` so search stays current.
- **Colours and typography** are tokens at the top of `assets/style.css`
  (`--accent`, `--paper`, `--serif`, …). Change them there and the whole site follows.

## Sources

The classical portraits are drawn from public-domain editions of Boericke,
Clarke, Kent, Allen, Nash and Farrington; the modern pharmacology and the research debate
are cited on `references.html` and discussed on `evidence.html`.
