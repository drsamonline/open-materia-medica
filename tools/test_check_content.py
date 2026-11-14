#!/usr/bin/env python3
"""test_check_content.py — prove the content check is real.

Two things are tested, and both matter:

  1. the check PASSES on this repository as it stands (it was failing on a clean
     tree, because it still looked for `<root>/index.html` after the site moved
     under `docs/` — a check that always fails is a check nobody runs);
  2. the check FAILS, naming the problem, on a deliberately broken copy — a
     portrait dropped from the index, a duplicated search-index entry, a served
     page that has drifted from its source. Otherwise "green" only means the
     check is asleep.

    python3 tools/test_check_content.py

No dependencies beyond the standard library.

© 2026 Dr. Sohil Momin, BHMS. All rights reserved in the original work.
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_content  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PORTRAIT = """<!doctype html>
<html><head><title>%s</title>
<meta name="description" content="%s">
<meta name="fingerprint" content="fp-%s">
<script type="application/ld+json">{"@type":"MedicalWebPage"}</script>
</head><body><a href="license.html">licence</a>%s</body></html>
"""

SLUGS = ["abies-canadensis", "abies-nigra"]


def build_tree(root, slugs=SLUGS):
    """A miniature but structurally complete copy of the repository."""
    os.makedirs(os.path.join(root, "remedies"))
    os.makedirs(os.path.join(root, "docs", "play", "remedies"))
    os.makedirs(os.path.join(root, "assets"))
    os.makedirs(os.path.join(root, "docs", "play", "assets"))

    for slug in slugs:
        page = PORTRAIT % (slug, slug, slug, "")
        for d in ("remedies", os.path.join("docs", "play", "remedies")):
            with open(os.path.join(root, d, slug + ".html"), "w", encoding="utf-8") as f:
                f.write(page)

    links = "".join('<li><a href="remedies/%s.html">%s</a></li>' % (s, s) for s in slugs)
    with open(os.path.join(root, "docs", "play", "index.html"), "w", encoding="utf-8") as f:
        f.write("<ul>%s</ul>" % links)

    entries = ",".join('{"slug":"%s","title":"%s"}' % (s, s) for s in slugs)
    si = "window.SEARCH_INDEX=[%s];" % entries
    for d in ("assets", os.path.join("docs", "play", "assets")):
        with open(os.path.join(root, d, "search-index.js"), "w", encoding="utf-8") as f:
            f.write(si)

    with open(os.path.join(root, "README.md"), "w", encoding="utf-8") as f:
        f.write("A materia medica of %d remedy portraits.\n" % len(slugs))


class TheRealRepository(unittest.TestCase):
    def test_the_repository_passes_its_own_check(self):
        found = check_content.check(REPO)
        self.assertEqual(found, [], "the repo's own content check reports problems:\n  " + "\n  ".join(found))


class ABrokenTreeFails(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="omm-check-")
        build_tree(self.root)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_the_fixture_itself_is_clean(self):
        self.assertEqual(check_content.check(self.root), [])

    def test_a_portrait_missing_from_the_index_is_caught(self):
        path = os.path.join(self.root, "docs", "play", "index.html")
        with open(path, encoding="utf-8") as f:
            text = f.read()
        with open(path, "w", encoding="utf-8") as f:
            f.write(text.replace('<li><a href="remedies/abies-nigra.html">abies-nigra</a></li>', ""))
        found = check_content.check(self.root)
        self.assertTrue(any("abies-nigra.html is not referenced from docs/play/index.html" in p for p in found), found)

    def test_a_duplicate_search_index_entry_is_caught(self):
        path = os.path.join(self.root, "assets", "search-index.js")
        with open(path, "w", encoding="utf-8") as f:
            f.write('window.SEARCH_INDEX=[{"slug":"abies-canadensis"},{"slug":"abies-canadensis"},{"slug":"abies-nigra"}];')
        found = check_content.check(self.root)
        self.assertTrue(any("duplicate slug: abies-canadensis" in p for p in found), found)

    def test_a_drifted_served_page_is_caught(self):
        path = os.path.join(self.root, "docs", "play", "remedies", "abies-nigra.html")
        with open(path, "a", encoding="utf-8") as f:
            f.write("<!-- only the served copy got this -->")
        found = check_content.check(self.root)
        self.assertTrue(any("docs/play/remedies/abies-nigra.html differs" in p for p in found), found)

    def test_a_stale_readme_count_is_caught(self):
        with open(os.path.join(self.root, "README.md"), "w", encoding="utf-8") as f:
            f.write("A materia medica of 344 remedy portraits.\n")
        found = check_content.check(self.root)
        self.assertTrue(any("advertises 344 remedy portraits but there are 2" in p for p in found), found)


if __name__ == "__main__":
    unittest.main(verbosity=2)
