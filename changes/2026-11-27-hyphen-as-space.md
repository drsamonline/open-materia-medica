# A hyphen typed where the name has a space is now read as a space, and says so

- **date:** 2026-11-27
- **repo:** open-materia-medica
- **version:** 1.2.1 (stacked on the open #9, which carries 1.2.0)
- **kind:** behaviour change (search)

## What changed

The spelling correction added on 2026-11-22 and widened on 2026-11-24 corrects a
**word**. A reader who types a compound name with a hyphen is not typing a word the
corpus has ever used, so there was nothing to correct and nothing to relax: the page
said "No remedy matches" to a query the same reader could have typed correctly by
pressing the space bar instead.

Measured on the 344-remedy index, before this change:

| query | before | the spaced form of the same query |
|---|---|---|
| `nat-mur` | nothing at all | `nat mur` → 4 remedies |
| `nux-vom` | nothing at all | `nux vom` → 2 remedies |
| `ammon-carb` | nothing at all | `ammon carb` → 1 remedy |
| `nux-vomica` | nothing, only "Did you mean Nux vomica?" | `nux vomica` → 2 remedies |

The index spells exactly one name with a hyphen — **X-Ray** — and every other
compound as two words, so a hyphen between letters is a separator, not a letter.

1. **The literal reading is tried first and always wins.** `x-ray` still finds
   X-Ray, and is not reported as re-read.
2. **Only when the literal reading finds nothing** is the query re-read with the
   hyphens turned into spaces. Same terms, same scoring, same ranking — so the
   hyphenated form and the spaced form return the same remedies in the same order.
3. **The answer says so.** `run()` now returns `readAs`, and the page prints
   `Read “nat-mur” as “nat mur” — 4 matching remedies` in front of the count. A
   re-read is never silent.
4. **Hyphen, non-breaking hyphen, en dash and em dash** are all read as a space,
   because the en dash is what a word processor substitutes and what a paste
   carries.

## What it deliberately still does not do

- **It does not rewrite a hyphen that is part of a name.** X-Ray is in the index
  with its hyphen, and the literal pass finds it first.
- **It invents nothing.** `zzz-qqq` still answers nothing and suggests nothing; the
  retry only ever re-reads the words the reader typed.
- **It does not become a suggestion engine.** When the retry finds an answer, the
  query was answered, so no "Did you mean" is offered beside it.

## The proof

- `node tools/test-search.js` — **116 assertions** (was 99), including: the
  hyphenated form returns the identical slug list to the spaced form for `nat-mur`,
  `nux-vomica` and `nux-vom`; `ammon-carb` reaches Ammonium carbonicum; `x-ray` is
  read literally; an en dash behaves like a hyphen; `zzz-qqq` stays empty; and the
  page renders the receipt.
- `python3 tools/mutate_search.py` — **14 of 14 mutations red** (was 10), the four
  new ones being: the retry never runs; a hyphen is not a separator; a re-read
  answer does not say how it was read; the page does not say it re-read the query.

© 2026 Dr. Sohil Momin, BHMS. All rights reserved in the original work.
