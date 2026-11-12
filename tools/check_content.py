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

# OMM_ROOT lets the self-test (tools/test_check_content.py) point the check at a
# throwaway corpus, so the check can be proved to FAIL on drift without touching
# the real 344 portraits.
ROOT = os.environ.get("OMM_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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


def find_remedy_index(root):
    """The page that lists every portrait, wherever the corpus currently keeps it."""
    for candidate in (os.path.join("docs", "play", "index.html"), "index.html"):
        path = os.path.join(root, candidate)
        if os.path.exists(path):
            return path
    return None


def corpus_pages(root):
    """Every HTML page that belongs to the corpus: the root pages and the served
    edition's pages. The 344 portraits are not pages in this sense - they are the
    thing the pages link to - and neither is the served copy of them."""
    pages = []
    for directory in (root, os.path.join(root, "docs", "play")):
        if not os.path.isdir(directory):
            continue
        for f in sorted(os.listdir(directory)):
            if f.endswith(".html"):
                pages.append(os.path.join(directory, f))
    return pages


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

    # 2. the index that lists the portraits references exactly the corpus on disk.
    #
    #    This used to read ROOT/index.html and nothing else. That page moved into the
    #    app (docs/play/index.html) and the landing page took the root slot, so from
    #    then on the check failed on a CLEAN tree with "index.html not found" - a red
    #    check that says nothing about the corpus, which is the one kind of check
    #    people learn to ignore. Resolve the index that actually exists, and name
    #    whichever one was used so the message is about the corpus, not the layout.
    index_path = find_remedy_index(ROOT)
    if index_path is None:
        problems.append("no remedies index found (looked for docs/play/index.html and index.html)")
    else:
        refs = set(re.findall(r"remedies/([a-z0-9-]+)\.html", read(index_path)))
        for s in sorted(slugs - refs):
            problems.append("remedies/%s.html is not referenced from %s" % (s, rel(index_path)))

    # 2b. no page links a portrait that is not there. The index was the only page
    #     checked, so families.html, diseases.html, kingdoms.html, repertory.html,
    #     quick-reference.html, agro.html and veterinary.html - seven pages carrying
    #     504 portrait links between them - were free to point at a deleted remedy.
    for page in corpus_pages(ROOT):
        if index_path is not None and os.path.abspath(page) == os.path.abspath(index_path):
            continue
        for s in sorted(set(re.findall(r"remedies/([a-z0-9-]+)\.html", read(page))) - slugs):
            problems.append("%s links remedies/%s.html which does not exist" % (rel(page), s))

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

    if problems:
        print("\nFAIL: %d problem(s) found:" % len(problems))
        for p in problems:
            print("  - " + p)
        return 1

    print("OK: corpus consistent — %d portraits, index, search index, web edition and README agree." % n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
