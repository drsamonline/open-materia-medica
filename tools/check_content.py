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

    # 2. the landing index references exactly the portraits on disk
    index_path = os.path.join(ROOT, "index.html")
    if os.path.exists(index_path):
        refs = set(re.findall(r"remedies/([a-z0-9-]+)\.html", read(index_path)))
        for s in sorted(refs - slugs):
            problems.append("index.html references remedies/%s.html which does not exist" % s)
        for s in sorted(slugs - refs):
            problems.append("remedies/%s.html is not referenced from index.html" % s)
    else:
        problems.append("index.html not found")

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

    if problems:
        print("\nFAIL: %d problem(s) found:" % len(problems))
        for p in problems:
            print("  - " + p)
        return 1

    print("OK: corpus consistent — %d portraits, index, search index, web edition and README agree." % n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
