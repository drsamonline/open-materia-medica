# A mistyped remedy name is now answered beside the results, and two letters wrong still finds it

- **date:** 2026-11-24
- **repo:** open-materia-medica
- **version:** 1.2.0
- **kind:** behaviour change (search)

## What changed

The spelling suggestion added on 2026-11-22 was right in principle and too narrow in
two ways, both of them measured before the change was written:

| query | before | after |
|---|---|---|
| `arsenicum albim` | 11 partial remedies, **no** suggestion, Arsenicum album second | 11 partial remedies, **“Did you mean Arsenicum album?”**, and it leads |
| `nux vomicer` | 3 partial remedies, **no** suggestion, Nux vomica second | 3 partial remedies, **“Did you mean Nux vomica?”**, and it leads |
| `beladonnna` | nothing at all | **“Did you mean Belladonna?”** |
| `colic in infants` | 22 partial remedies, no suggestion | unchanged |
| `colic zzzznotaremedy` | 19 partial remedies, no suggestion | unchanged |

1. **It now runs whenever the strict pass finds nothing**, not only when the query
   found nothing at all. `arsenicum albim` and `nux vomicer` each still matched one
   word, so the relaxation answered and the correction was never offered — the case
   where a reader most needs it, because a partial list looks like an answer.
2. **Its reach is two edits on a long word.** `nux vomicer` → `nux vomica` is two
   substitutions; `beladonnna` → `Belladonna` is two. A second edit is allowed only
   on a word of **seven letters or more**, and only when the corpus holds **exactly
   one** name that close.
3. **The remedy the reader asked for now leads the partial answer.** It is moved to
   the front, never added — a suggestion can still never become a hit that was not
   one.

## What it deliberately still does not do

- **It corrects only a word the corpus does not use anywhere.** A word the materia
  medica knows is never rewritten, which is exactly what keeps `colic in infants` a
  partial answer with no suggestion beside it.
- **It does not guess between two names.** Two names two letters away is a coin
  toss; the search says nothing. (Bromatum and Bromium are both remedies, so this is
  not hypothetical.)
- **It is never a hit.** `total` counts hits only; the suggestion is a link to the
  remedy, rendered beside the results, with the word it answers for and how far that
  word was.
- A word shorter than four letters is still not “corrected”, and a whole-query match
  still outranks a single-word one, so `arsenicum albim` answers Arsenicum album
  rather than Veratrum album.

## Proof

`node tools/test-search.js` — **99 assertions** (was 65), green.

`python3 tools/mutate_search.py` — **10 of 10 mutations red**, including “no second
edit at all”, “a second edit on any length”, “two-edit matches never
disambiguated”, “whole-query matches not ranked first”, “suggestion only when
nothing at all answered”, “promotion appends instead of moving”, and both page
wiring mutations. The first pass had one survivor — the length rule was asserted
only through `maxEdits()`, so the boundary is now asserted on behaviour too
(`kalmu` is two edits from Kalium and must not be corrected).

`python3 tools/check_content.py` green (344 portraits, index, web edition and README
agree); `tools/test_check_content.py` 7/7 mutations caught.

`sw.js` cache `omm-v25` → `omm-v26`, so a returning reader gets the new module
instead of the cached one.
