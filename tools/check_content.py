#!/usr/bin/env python3
"""check_content.py — the Open Materia Medica content check.

Locks the invariants of the remedy corpus so a future remedy batch cannot
silently drift: every portrait keeps its required metadata, the index, the
offline search index and the served web edition all stay in step with the
`remedies/` directory, and the advertised count is the real count.

Run it from anywhere:

    python3 tools/check_content.py            # the repo this file lives in
    python3 tools/check_content.py <root>     # any tree laid out like it

Exits 0 when the corpus is consistent, 1 with a readable list of problems
otherwise. No dependencies beyond the standard library.

The `root` argument exists so `tools/test_check_content.py` can point the check
at a deliberately broken fixture and prove it fails — a check nobody has seen
fail is not evidence.

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

# The remedy index is the SERVED one: since the site moved under docs/, the
# landing page is docs/index.html (a project card, no portraits) and the index
# of the 344 portraits is docs/play/index.html. This check used to read
# `<root>/index.html`, which no longer exists — so it failed on a clean tree,
# and a check that always fails is a check nobody runs. Root stays as a
# fallback so an older layout still checks.
INDEX_CANDIDATES = [os.path.join("docs", "play", "index.html"), "index.html"]

problems = []


def rel(path, root):
    return os.path.relpath(path, root)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def check_search_index(path, slugs, root):
    """One entry per portrait, no duplicate, no orphan, in one search index."""
    if not os.path.exists(path):
        problems.append("%s not found" % rel(path, root))
        return
    si_slugs = re.findall(r'"slug":"([^"]+)"', read(path))
    dupes = {s for s in si_slugs if si_slugs.count(s) > 1}
    for s in sorted(dupes):
        problems.append("%s has a duplicate slug: %s" % (rel(path, root), s))
    for s in sorted(set(si_slugs) - slugs):
        problems.append("%s lists %s which has no portrait" % (rel(path, root), s))
    for s in sorted(slugs - set(si_slugs)):
        problems.append("remedies/%s.html is missing from %s" % (s, rel(path, root)))


def check(root):
    """Return the list of problems for the tree at `root` (empty means clean)."""
    del problems[:]

    remedies_dir = os.path.join(root, "remedies")
    if not os.path.isdir(remedies_dir):
        print("FAIL: remedies/ directory not found at", remedies_dir)
        return ["remedies/ directory not found"]

    files = sorted(f for f in os.listdir(remedies_dir) if f.endswith(".html"))
    slugs = {f[:-5] for f in files}
    n = len(files)
    print("remedy portraits: %d" % n)

    # 1. every portrait carries the required metadata
    for f in files:
        text = read(os.path.join(remedies_dir, f))
        for token in REQUIRED_META:
            if token not in text:
                problems.append("%s: missing %s" % (rel(os.path.join(remedies_dir, f), root), token))

    # 2. the remedy index references exactly the portraits on disk
    index_path = next((os.path.join(root, c) for c in INDEX_CANDIDATES if os.path.exists(os.path.join(root, c))), None)
    if index_path is None:
        problems.append("no remedy index found (looked for %s)" % ", ".join(INDEX_CANDIDATES))
    else:
        refs = set(re.findall(r"remedies/([a-z0-9-]+)\.html", read(index_path)))
        for s in sorted(refs - slugs):
            problems.append("%s references remedies/%s.html which does not exist" % (rel(index_path, root), s))
        for s in sorted(slugs - refs):
            problems.append("remedies/%s.html is not referenced from %s" % (s, rel(index_path, root)))

    # 3. the offline search index has exactly one entry per portrait — and the
    #    served copy is the same file, so search cannot go stale on the live site
    check_search_index(os.path.join(root, "assets", "search-index.js"), slugs, root)
    served_si = os.path.join(root, "docs", "play", "assets", "search-index.js")
    if os.path.exists(served_si):
        check_search_index(served_si, slugs, root)
        source_si = os.path.join(root, "assets", "search-index.js")
        if os.path.exists(source_si) and read(source_si) != read(served_si):
            problems.append("docs/play/assets/search-index.js differs from assets/search-index.js")

    # 4. the served web edition mirrors the source portraits
    served_dir = os.path.join(root, "docs", "play", "remedies")
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
    readme_path = os.path.join(root, "README.md")
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
    served_pages = os.path.join(root, "docs", "play")
    if not os.path.isdir(served_pages):
        problems.append("docs/play directory not found")
    else:
        root_pages = sorted(f for f in os.listdir(root) if f.endswith(".html"))
        for f in root_pages:
            twin = os.path.join(served_pages, f)
            if not os.path.exists(twin):
                problems.append("docs/play/%s is missing (source page has no served twin)" % f)
            elif read(os.path.join(root, f)) != read(twin):
                problems.append(
                    "docs/play/%s differs from %s - the served edition and the source page must be the same text"
                    % (f, f)
                )

    return list(problems)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    root = os.path.abspath(argv[0]) if argv else ROOT
    found = check(root)
    n = len([f for f in os.listdir(os.path.join(root, "remedies")) if f.endswith(".html")]) if os.path.isdir(os.path.join(root, "remedies")) else 0

    if found:
        print("\nFAIL: %d problem(s) found:" % len(found))
        for p in found:
            print("  - " + p)
        return 1

    print("OK: corpus consistent — %d portraits, index, search index, web edition and README agree." % n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
