#!/usr/bin/env python3
"""test_check_content.py — proves check_content.py still fails on drift.

A content check that has only ever been seen to pass is not a check. This builds
throwaway corpora in a temporary directory, runs the real checker against each one
through OMM_ROOT, and requires the checker to go RED for every kind of drift it
claims to catch - and GREEN on the consistent one.

    python3 tools/test_check_content.py

Exits 0 when every case behaves, 1 otherwise. Standard library only.
"""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHECK = os.path.join(HERE, "check_content.py")
REPO = os.path.dirname(HERE)

META = (
    '<html><head><title>%s</title>'
    '<meta name="description" content="x">'
    '<meta name="fingerprint" content="OMM-0000000000-000000000000">'
    '<script type="application/ld+json">{"@type":"MedicalWebPage"}</script>'
    '<a href="license.html">terms</a></head><body></body></html>'
)

failures = []
cases = 0


def page(slugs):
    return "<html><body>%s</body></html>" % "".join(
        '<a href="remedies/%s.html">%s</a>' % (s, s) for s in slugs
    )


def build(root, slugs=("aaa", "bbb"), index=("aaa", "bbb"), extra_page=(), readme_count=None,
          served_drift=False, drop_meta=False, make_index=True):
    """Write a corpus that is consistent unless a parameter breaks one thing."""
    os.makedirs(os.path.join(root, "remedies"))
    os.makedirs(os.path.join(root, "docs", "play", "remedies"))
    os.makedirs(os.path.join(root, "assets"))
    for s in slugs:
        text = META % s
        if drop_meta and s == slugs[0]:
            text = text.replace('name="fingerprint"', 'name="not-fingerprint"')
        with open(os.path.join(root, "remedies", s + ".html"), "w") as f:
            f.write(text)
        twin = text
        if served_drift and s == slugs[0]:
            twin = text.replace("<body></body>", "<body>drifted</body>")
        with open(os.path.join(root, "docs", "play", "remedies", s + ".html"), "w") as f:
            f.write(twin)
    if make_index:
        with open(os.path.join(root, "docs", "play", "index.html"), "w") as f:
            f.write(page(index))
    with open(os.path.join(root, "assets", "search-index.js"), "w") as f:
        f.write("var idx=[" + ",".join('{"slug":"%s"}' % s for s in slugs) + "];")
    with open(os.path.join(root, "dedication.html"), "w") as f:
        f.write("<html><body>dedication</body></html>")
    with open(os.path.join(root, "docs", "play", "dedication.html"), "w") as f:
        f.write("<html><body>dedication</body></html>")
    for name, slugs_linked in extra_page:
        with open(os.path.join(root, "docs", "play", name), "w") as f:
            f.write(page(slugs_linked))
    with open(os.path.join(root, "README.md"), "w") as f:
        f.write("%d remedy portraits, open to everyone.\n" % (readme_count or len(slugs)))


def run(root):
    env = dict(os.environ, OMM_ROOT=root)
    p = subprocess.run([sys.executable, CHECK], capture_output=True, text=True, env=env)
    return p.returncode, p.stdout + p.stderr


def case(name, expect_exit, expect_text, **kw):
    global cases
    cases += 1
    root = tempfile.mkdtemp(prefix="omm-check-")
    try:
        build(root, **kw)
        code, out = run(root)
    finally:
        shutil.rmtree(root, ignore_errors=True)
    if code != expect_exit:
        failures.append("%s: expected exit %d, got %d\n%s" % (name, expect_exit, code, out))
        return
    if expect_text and expect_text not in out:
        failures.append("%s: expected %r in the output, got:\n%s" % (name, expect_text, out))


# 1. a consistent corpus is green - the check is not red for its own reasons
case("consistent corpus", 0, "OK: corpus consistent")

# 2. a portrait that no index references
case("portrait missing from the index", 1, "is not referenced from",
     index=("aaa",))

# 3. the index is gone entirely - the layout moved once already
case("no index at all", 1, "no remedies index found", make_index=False)

# 4. a page other than the index links a portrait that is not there. This is the
#    check that did not exist: seven pages carried 504 links nobody verified.
case("secondary page links a deleted portrait", 1,
     "links remedies/zzz.html which does not exist",
     extra_page=[("families.html", ["aaa", "zzz"])])

# 5. the served edition drifted from the source page
case("served twin drifted", 1, "differs from", served_drift=True)

# 6. the advertised count lies
case("README count lies", 1, "advertises", readme_count=999)

# 7. a portrait lost its fingerprint
case("portrait missing its fingerprint", 1, 'missing name="fingerprint"', drop_meta=True)

if failures:
    print("FAIL: %d of %d case(s) did not behave:" % (len(failures), cases))
    for f in failures:
        print("  - " + f)
    sys.exit(1)

print("OK: %d/%d cases — the content check is red on every drift it claims to catch." % (cases, cases))
sys.exit(0)
