# A remedy name typed one letter wrong is now offered, not refused

- **date:** 2026-11-22
- **repo:** open-materia-medica
- **version:** 1.1.0
- **kind:** behaviour change (search)

## What changed

`beladonna`, `nux-vomica`, `belladnona` — a remedy NAME typed one letter wrong — used
to answer "No remedy matches", because the relaxation added on 2026-11-20 answers a
PHRASE whose words exist separately and cannot answer a proper noun that exists
nowhere in the corpus.

`OMMSearch.run()` now returns a `suggest` list: candidate NAMES one edit away
(insertion, deletion, substitution, or two adjacent letters transposed — bounded
Damerau-Levenshtein, capped at 5), each naming the word it answers for. The search
page renders them under "Did you mean …" as links to the remedy.

## What it deliberately does not do

- A suggestion is **never a hit**: `total` stays 0, and the suggestion is offered only
  when the query found nothing at all.
- It never appears beside a real answer — "arnica" is one edit from a name AND is
  answered, and carries no suggestion.
- It never invents a remedy: every suggestion is a record in the index.
- Terms shorter than four letters are not "corrected"; one edit on a three-letter word
  is a different word.

## Proof

`node tools/test-search.js` — **65 assertions** (was 40), green. Ten mutations of the
new code and its page wiring were each applied and each turned the suite red.

`sw.js` cache `omm-v24` -> `omm-v25`, so a returning reader gets the new module instead
of the cached one.

`python3 tools/check_content.py` green (344 portraits, index, web edition agree);
`tools/test_check_content.py` 7/7 mutations caught.
