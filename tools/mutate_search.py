#!/usr/bin/env python3
"""tools/mutate_search.py — prove the search suite actually guards the 2026-11-24
reach change. Each mutation is applied to the real file, the suite is run, and the
mutation must turn it RED. A survivor is a test that does not test what it claims.

    python3 tools/mutate_search.py

© 2026 Dr. Sohil Momin, BHMS. All rights reserved in the original work.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORE = ROOT / "assets" / "search-core.js"
COPY = ROOT / "docs" / "play" / "assets" / "search-core.js"
PAGE = ROOT / "docs" / "play" / "search.html"

# (name, file, old, new)
MUTATIONS = [
    ("no second edit at all", CORE,
     "var TWO_EDIT_MIN = 7;", "var TWO_EDIT_MIN = 99;"),
    ("a second edit on any length", CORE,
     "var TWO_EDIT_MIN = 7;", "var TWO_EDIT_MIN = 4;"),
    ("two-edit matches never disambiguated", CORE,
     "if (min >= 2 && n > 1) { continue; }", "if (false) { continue; }"),
    ("whole-query matches not ranked first", CORE,
     "return ((b.whole ? 1 : 0) - (a.whole ? 1 : 0)) || (a.distance - b.distance) ||",
     "return (a.distance - b.distance) ||"),
    ("suggestion only when nothing at all answered", CORE,
     "    out.suggest = suggest(index, raw, absent);\n",
     "    out.suggest = [];\n"),
    ("suggestion corrects known words too", CORE,
     "var words = only || terms(raw);", "var words = terms(raw);"),
    ("the suggested remedy is not promoted", CORE,
     "out.hits = promote(partial, out.suggest);", "out.hits = partial;"),
    ("promotion appends instead of moving", CORE,
     "if (hits[i].r.slug === want) { hits.unshift(hits.splice(i, 1)[0]); break; }",
     "if (hits[i].r.slug === want) { hits.push(hits[i]); break; }"),
    ("page does not render the suggestion beside a partial", PAGE,
     "out.innerHTML = did + hits.map(function(x){", "out.innerHTML = '' + hits.map(function(x){"),
    ("page does not say how far the word was", PAGE,
     "' — it is ' + (res.suggest[0].distance === 1 ? 'one letter' : 'two letters')",
     "' — it is close'"),
]


def run():
    r = subprocess.run(["node", "tools/test-search.js"], cwd=str(ROOT),
                       capture_output=True, text=True)
    tail = r.stdout.strip().splitlines()
    return r.returncode == 0, (tail[-1] if tail else "")


def main():
    green, line = run()
    if not green:
        print("the suite is not green before mutating: " + line)
        return 2
    print("baseline: " + line)
    survivors = []
    for name, path, old, new in MUTATIONS:
        src = path.read_text()
        if old not in src:
            print("  SKIP (pattern not found) " + name)
            survivors.append(name)
            continue
        path.write_text(src.replace(old, new, 1))
        if path == CORE:                     # keep the shipped copy in step so the
            COPY.write_text(path.read_text())  # byte-identity assertion does not
        ok, _ = run()                          # mask the mutation
        path.write_text(src)
        if path == CORE:
            COPY.write_text(src)
        if ok:
            print("  SURVIVED " + name)
            survivors.append(name)
        else:
            print("  red      " + name)
    ok, line = run()
    print("")
    print("restored: " + ("green" if ok else "RED — the file did not come back clean"))
    print("%d of %d mutations red" % (len(MUTATIONS) - len(survivors), len(MUTATIONS)))
    return 0 if (ok and not survivors) else 1


if __name__ == "__main__":
    sys.exit(main())
