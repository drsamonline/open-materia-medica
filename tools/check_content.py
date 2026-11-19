#!/usr/bin/env python3
"""check_content.py — the Open Materia Medica content check.

Locks the invariants of the remedy corpus so a future remedy batch cannot
silently drift: every portrait keeps its required metadata, the index, the
offline search index and the served web edition all stay in step with the
`remedies/` directory, and the advertised count is the real count.

Run it from anywhere:

    python3 tools/check_content.py

Exits 0 when the corpus is consistent, 1 with a readable list of problems
otherwise. No dependencies beyond the standard library.

© 2026 Dr. Sohil Momin, BHMS. All rights reserved in the original work.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

REQUIRED_META = [
    '<title>',
    'name="description"',
    'name="fingerprint"',
    'application/ld+json',
    'license.html',
]

problems = []


def rel(path):
    return os.path.relpath(path, ROOT)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def main():
    remedies_dir = os.path.join(ROOT, "remedies")
    if not os.path.isdir(remedies_dir):
        print("FAIL: remedies/ directory not found at", remedies_dir)
        return 1

    files = sorted(f for f in os.listdir(remedies_dir) if f.endswith(".html"))
    slugs = {f[:-5] for f in files}
    n = len(files)
    print("remedy portraits: %d" % n)

    # 1. every portrait carries the required metadata
    for f in files:
        text = read(os.path.join(remedies_dir, f))
        for token in REQUIRED_META:
            if token not in text:
                problems.append("%s: missing %s" % (rel(os.path.join(remedies_dir, f)), token))

    # 2. the index that lists the portraits references exactly the portraits on
    #    disk. This used to be root index.html. The landing page then moved to
    #    docs/index.html and the list itself moved into the app
    #    (docs/play/index.html), so the old path stopped existing and this check
    #    answered "index.html not found" on every run - a guard that can never go
    #    green is not a guard. Ask the layout where the list actually is.
    index_path = None
    for candidate in ("docs/play/index.html", "index.html"):
        if os.path.exists(os.path.join(ROOT, candidate)):
            index_path = os.path.join(ROOT, candidate)
            break
    if index_path:
        refs = set(re.findall(r"remedies/([a-z0-9-]+)\.html", read(index_path)))
        for s in sorted(refs - slugs):
            problems.append("%s references remedies/%s.html which does not exist" % (rel(index_path), s))
        for s in sorted(slugs - refs):
            problems.append("remedies/%s.html is not referenced from %s" % (s, rel(index_path)))
    else:
        problems.append("no index that lists the portraits was found (docs/play/index.html or index.html)")

    # 3. the offline search index has exactly one entry per portrait
    si_path = os.path.join(ROOT, "assets", "search-index.js")
    if os.path.exists(si_path):
        si_slugs = re.findall(r'"slug":"([^"]+)"', read(si_path))
        dupes = {s for s in si_slugs if si_slugs.count(s) > 1}
        for s in sorted(dupes):
            problems.append("assets/search-index.js has a duplicate slug: %s" % s)
        for s in sorted(set(si_slugs) - slugs):
            problems.append("assets/search-index.js lists %s which has no portrait" % s)
        for s in sorted(slugs - set(si_slugs)):
            problems.append("remedies/%s.html is missing from assets/search-index.js" % s)
    else:
        problems.append("assets/search-index.js not found")

    # 4. the served web edition mirrors the source portraits
    served_dir = os.path.join(ROOT, "docs", "play", "remedies")
    if os.path.isdir(served_dir):
        served = sorted(f for f in os.listdir(served_dir) if f.endswith(".html"))
        served_slugs = {f[:-5] for f in served}
        if served_slugs != slugs:
            for s in sorted(slugs - served_slugs):
                problems.append("docs/play/remedies is missing %s.html" % s)
            for s in sorted(served_slugs - slugs):
                problems.append("docs/play/remedies has %s.html which has no source portrait" % s)
        else:
            for f in files:
                if read(os.path.join(remedies_dir, f)) != read(os.path.join(served_dir, f)):
                    problems.append("docs/play/remedies/%s differs from remedies/%s" % (f, f))
    else:
        problems.append("docs/play/remedies directory not found")

    # 5. the advertised count in the README is the real count
    readme_path = os.path.join(ROOT, "README.md")
    if os.path.exists(readme_path):
        readme = read(readme_path)
        counts = {int(m) for m in re.findall(r"(\d+)\s+remedy portraits", readme)}
        for c in sorted(counts):
            if c != n:
                problems.append("README.md advertises %d remedy portraits but there are %d" % (c, n))

    # 6. every page has ONE text: the served edition is the source page, not a
    #    second copy that is free to drift. This check exists because the app's
    #    own palette was added to docs/play/index.html alone (875629d, "the app
    #    gets its own palette") and the app source never got it - so the demo was
    #    a better page than the app it demonstrates, and every check above stayed
    #    green. Anything that belongs to the page belongs to BOTH copies.
    served_pages = os.path.join(ROOT, "docs", "play")
    if not os.path.isdir(served_pages):
        problems.append("docs/play directory not found")
    else:
        root_pages = sorted(f for f in os.listdir(ROOT) if f.endswith(".html"))
        for f in root_pages:
            twin = os.path.join(served_pages, f)
            if not os.path.exists(twin):
                problems.append("docs/play/%s is missing (source page has no served twin)" % f)
            elif read(os.path.join(ROOT, f)) != read(twin):
                problems.append(
                    "docs/play/%s differs from %s - the served edition and the source page must be the same text"
                    % (f, f)
                )

    # 7. every advertised count is the real count - not just the README's. The
    #    social-card alt text of each portrait ("344 classical remedy portraits")
    #    is repeated across the corpus, so a five-remedy batch that updated only
    #    the README would leave hundreds of pages lying about the size of it.
    claim_re = re.compile(r"(\d+)\s+(?:classical\s+)?remedy portraits")
    claim_files = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in (".git", "node_modules"))
        for f in sorted(filenames):
            if not f.endswith((".html", ".md", ".json", ".js")):
                continue
            p = os.path.join(dirpath, f)
            try:
                text = read(p)
            except (UnicodeDecodeError, OSError):
                continue
            claims = {int(m) for m in claim_re.findall(text)}
            if claims:
                claim_files += 1
            for c in sorted(claims):
                if c != n:
                    problems.append("%s advertises %d remedy portraits but there are %d" % (rel(p), c, n))
    print("files advertising a portrait count: %d" % claim_files)

    # 8. every asset the app loads is served from two places - assets/ (the app
    #    source) and docs/play/assets/ (the copy the web edition actually loads).
    #    Only the search index used to be checked, so a rebuilt script could ship
    #    in one place while the live app kept running the other. The list is
    #    explicit, not a directory walk: an asset that exists only in one place is
    #    a different mistake, and this check is about the ones that must match.
    for asset in ("search-index.js", "search-core.js"):
        src_a = os.path.join(ROOT, "assets", asset)
        served_a = os.path.join(ROOT, "docs", "play", "assets", asset)
        if os.path.exists(src_a) and os.path.exists(served_a):
            if read(src_a) != read(served_a):
                problems.append("docs/play/assets/%s differs from assets/%s" % (asset, asset))
        elif not os.path.exists(served_a):
            problems.append("docs/play/assets/%s not found" % asset)
    served_si = os.path.join(ROOT, "docs", "play", "assets", "search-index.js")

    # 9. everything the app loads is precached. sw.js FILES is what makes the app
    #    work with no network - the promise the whole project is built on - and
    #    nothing checked it, so a new script could be added to a page, work
    #    perfectly online, and vanish the moment the reader is offline. Both
    #    copies of sw.js must be the same file, and must list every local script
    #    and stylesheet the play pages load.
    if os.path.isdir(served_pages):
        sw_root = os.path.join(ROOT, "sw.js")
        sw_served = os.path.join(served_pages, "sw.js")
        if not os.path.exists(sw_served):
            problems.append("docs/play/sw.js not found")
        else:
            if os.path.exists(sw_root) and read(sw_root) != read(sw_served):
                problems.append("docs/play/sw.js differs from sw.js")
            sw = read(sw_served)
            m = re.search(r"const FILES\s*=\s*\[(.*?)\];", sw, re.S)
            if not m:
                problems.append("docs/play/sw.js: could not find the FILES precache list")
            else:
                precached = set(re.findall(r'"([^"]+)"', m.group(1)))
                loaded = {}
                for f in sorted(os.listdir(served_pages)):
                    if not f.endswith(".html"):
                        continue
                    text = read(os.path.join(served_pages, f))
                    refs = re.findall(r'<script src="([^"]+)"', text)
                    refs += re.findall(r'<link[^>]+href="([^"]+\.(?:css|js))"', text)
                    for r in refs:
                        if r.startswith(("http:", "https:", "//", "data:")):
                            continue
                        loaded.setdefault(r, set()).add(f)
                for r in sorted(loaded):
                    if r not in precached:
                        problems.append(
                            "docs/play/%s is loaded by %s but is not in the sw.js FILES precache - "
                            "it would work online and fail offline"
                            % (r, ", ".join(sorted(loaded[r])[:3])))

    if problems:
        print("\nFAIL: %d problem(s) found:" % len(problems))
        for p in problems:
            print("  - " + p)
        return 1

    print("OK: corpus consistent — %d portraits, index, search index, web edition and README agree." % n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
