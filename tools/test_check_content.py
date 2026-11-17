#!/usr/bin/env python3
"""test_check_content.py — prove that tools/check_content.py actually bites.

A green checker is only evidence if it can go red. This test copies the corpus
to a temporary directory, confirms the copy is green, then breaks it in the five
ways a real mistake breaks it and requires the checker to name each one:

  1. a portrait the index no longer links
  2. a portrait the search index does not list
  3. an advertised count that is not the real count
  4. a served search index that drifted from the source
  5. a served portrait that drifted from the source

Each break is reverted before the next one, and the tree is green again at the
end — so the test also proves the checker does not fail a corpus it just passed.

    python3 tools/test_check_content.py

Exits 0 when every mutation is caught, 1 otherwise. Standard library only.
"""
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {".git", "node_modules"}


def run(root):
    p = subprocess.run(
        [sys.executable, os.path.join(root, "tools", "check_content.py")],
        capture_output=True,
        text=True,
    )
    return p.returncode, p.stdout + p.stderr


def edit(path, old, new, count=1):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    if old not in text:
        raise SystemExit("test setup: %r not found in %s" % (old, path))
    with open(path, "w", encoding="utf-8") as f:
        f.write(text.replace(old, new, count))


failures = []


def expect_red(label, root, needle):
    code, out = run(root)
    if code == 0:
        failures.append("%s: checker stayed GREEN on a broken corpus" % label)
        return
    if needle not in out:
        failures.append("%s: checker went red but never said %r\n%s" % (label, needle, out))
        return
    print("  caught: %s" % label)


def main():
    tmp = tempfile.mkdtemp(prefix="omm-check-")
    root = os.path.join(tmp, "corpus")
    shutil.copytree(ROOT, root, ignore=shutil.ignore_patterns(*SKIP))
    try:
        code, out = run(root)
        if code != 0:
            print("FAIL: the untouched corpus is already red:\n%s" % out)
            return 1
        print("baseline green: 344 portraits")

        # 1. the index stops linking a portrait
        idx = os.path.join(root, "docs", "play", "index.html")
        with open(idx, encoding="utf-8") as f:
            original_index = f.read()
        slug = "abies-canadensis"
        # replace the link itself: renaming the target keeps the same prefix and
        # the regex still matches it, which would test nothing
        edit(idx, 'remedies/%s.html' % slug, '#')
        expect_red("index drops a portrait", root, "remedies/%s.html is not referenced from docs/play/index.html" % slug)
        with open(idx, "w", encoding="utf-8") as f:
            f.write(original_index)

        # 2. a portrait lands with no search-index entry
        src = os.path.join(root, "remedies", "abies-canadensis.html")
        new = os.path.join(root, "remedies", "zzz-test-remedy.html")
        shutil.copyfile(src, new)
        expect_red("portrait missing from the search index", root, "remedies/zzz-test-remedy.html is missing from assets/search-index.js")
        os.remove(new)

        # 3. an advertised count that is not the real count
        readme = os.path.join(root, "README.md")
        edit(readme, "344 remedy portraits", "345 remedy portraits")
        expect_red("an advertised count is wrong", root, "README.md advertises 345 remedy portraits but there are 344")
        edit(readme, "345 remedy portraits", "344 remedy portraits")

        # 4. the served search index drifts from the source
        served_si = os.path.join(root, "docs", "play", "assets", "search-index.js")
        with open(served_si, encoding="utf-8") as f:
            original_si = f.read()
        with open(served_si, "a", encoding="utf-8") as f:
            f.write("\n")
        expect_red("served search index drifts", root, "docs/play/assets/search-index.js differs from assets/search-index.js")
        with open(served_si, "w", encoding="utf-8") as f:
            f.write(original_si)

        # 5. a served portrait drifts from the source
        served_page = os.path.join(root, "docs", "play", "remedies", "abies-canadensis.html")
        with open(served_page, encoding="utf-8") as f:
            original_page = f.read()
        with open(served_page, "a", encoding="utf-8") as f:
            f.write("\n<!-- drift -->\n")
        expect_red("served portrait drifts", root, "docs/play/remedies/abies-canadensis.html differs from remedies/abies-canadensis.html")
        with open(served_page, "w", encoding="utf-8") as f:
            f.write(original_page)

        # every break reverted: the corpus must be green again
        code, out = run(root)
        if code != 0:
            failures.append("the corpus did not return to green after every break was reverted:\n%s" % out)
        else:
            print("reverted: green again")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if failures:
        print("\nFAIL: %d problem(s):" % len(failures))
        for f in failures:
            print("  - " + f)
        return 1
    print("\nOK: 5/5 mutations caught, and the corpus is green when they are reverted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
