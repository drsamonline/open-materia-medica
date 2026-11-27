#!/usr/bin/env node
/* tools/test-search.js — the guard on the remedy search.
 *
 * The page's search used to live only inside docs/play/search.html, so nothing
 * could test it and nothing did. It now has a pure half (assets/search-core.js),
 * and this file runs THAT code — the same file the page loads — against the real
 * 344-remedy index, under plain node, with no dependencies.
 *
 * What it pins:
 *   1. strict AND still means AND — "worse midnight" is both words, not either;
 *   2. a natural phrase whose one word the corpus never uses still answers, and
 *      says which word it dropped (the defect this exists for: "colic in
 *      infants" answered "No remedy matches" while 18 remedies speak of colic);
 *   3. a genuine no-match is still a no-match — relaxation must not invent one;
 *   4. the page really loads the module and calls it, so the two cannot drift;
 *   5. a NAME typed one letter wrong is offered as a suggestion, and a suggestion
 *      is never a hit and never invents a remedy.
 *
 *     node tools/test-search.js
 *
 * © 2026 Dr. Sohil Momin, BHMS. All rights reserved in the original work.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0;
const fails = [];

function ok(name, cond) {
  if (cond) { pass++; return; }
  fails.push(name);
  console.log('FAIL ' + name);
}

function eq(name, got, want) {
  ok(name + ' (got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want) + ')',
     JSON.stringify(got) === JSON.stringify(want));
}

/* Load the module exactly as the page does: it publishes window.OMMSearch. */
global.window = global;
require(path.join(ROOT, 'docs', 'play', 'assets', 'search-core.js'));
const S = global.OMMSearch;
ok('search-core.js publishes OMMSearch', !!S && typeof S.run === 'function');

/* The real index, as a plain array — search-index.js publishes window.OMM_INDEX. */
require(path.join(ROOT, 'docs', 'play', 'assets', 'search-index.js'));
const DATA = global.OMM_INDEX || [];
ok('the search index loads', DATA.length > 0);
const N = DATA.length;
console.log('index: ' + N + ' remedies');

/* --- 1. terms ------------------------------------------------------------ */
eq('stop-words are dropped from a query', S.terms('the burning of the skin'), ['burning', 'skin']);
eq('a query of nothing but stop-words keeps them', S.terms('the of'), ['the', 'of']);
eq('terms are lower-cased', S.terms('BURNING'), ['burning']);
eq('empty query has no terms', S.terms('   '), []);

/* --- 2. strict AND is still AND ------------------------------------------ */
const strict = S.run(DATA, 'worse midnight');
ok('"worse midnight" is a strict answer', strict.strict === true);
ok('"worse midnight" finds remedies', strict.total > 0);
ok('every "worse midnight" hit contains BOTH words', strict.hits.every(function (x) {
  const h = S.prepare(x.r)._h;
  return h.indexOf('worse') !== -1 && h.indexOf('midnight') !== -1;
}));
eq('no word is reported absent from a query that matched', strict.absent, []);

/* --- 3. the defect: a phrase whose words never co-occur ------------------ */
const colic = S.run(DATA, 'colic in infants');
ok('"colic in infants" answers at all (was: no remedy matches)', colic.total > 0);
ok('"colic in infants" is marked partial', colic.strict === false);
ok('"infants" is not claimed absent (it does occur, just never with colic)',
   colic.absent.indexOf('infants') === -1);
ok('every partial hit contains at least one of the words', colic.hits.every(function (x) {
  const h = S.prepare(x.r)._h;
  return h.indexOf('colic') !== -1 || h.indexOf('infants') !== -1;
}));
ok('a two-word hit, if any, outranks every one-word hit', (function () {
  for (let i = 1; i < colic.hits.length; i++) {
    if (colic.hits[i].m > colic.hits[i - 1].m) { return false; }
  }
  return true;
})());
ok('"colic" alone is still a strict answer', S.run(DATA, 'colic').strict === true);
ok('the partial answer contains every strict "colic" hit', (function () {
  const alone = S.run(DATA, 'colic').hits.map(function (x) { return x.r.slug; });
  const pair = colic.hits.map(function (x) { return x.r.slug; });
  return alone.every(function (s) { return pair.indexOf(s) !== -1; });
})());

/* Ordering: two words of the query present must outrank one word present, even
   when the one-word remedy scores higher on raw frequency. "colic infants grief"
   has exactly one remedy containing two of the three (Staphysagria), and a
   different remedy scores highest on a single word (Magnesia carbonica). */
const three = S.run(DATA, 'colic infants grief');
ok('a three-word query with no full match answers', three.total > 0 && three.strict === false);
eq('the two-word remedy ranks first, not the highest-scoring one-word remedy', three.hits[0].r.name, 'Staphysagria');
ok('the highest raw score really belongs to a one-word remedy (so this is a real choice)',
   (function () {
     const byScore = three.hits.slice().sort(function (a, b) { return b.s - a.s; });
     return byScore[0].r.name !== three.hits[0].r.name && byScore[0].m === 1;
   })());

const withAbsent = S.run(DATA, 'colic zzzznotaremedy');
ok('a word the corpus never uses still lets the rest answer', withAbsent.total > 0);
eq('the unused word is named', withAbsent.absent, ['zzzznotaremedy']);
ok('the unused word is not silently highlighted as a hit', withAbsent.hits.every(function (x) {
  return S.prepare(x.r)._h.indexOf('zzzznotaremedy') === -1;
}));

/* --- 4. a genuine no-match stays one ------------------------------------- */
const none = S.run(DATA, 'zzzznotaremedy');
eq('a single absent word finds nothing', none.total, 0);
eq('a single absent word is not relaxed into an answer', none.strict, true);
const allAbsent = S.run(DATA, 'zzzznotaremedy qqqqalsonot');
eq('a query of absent words finds nothing', allAbsent.total, 0);

/* --- 5. ranking and scoring --------------------------------------------- */
const salt = S.run(DATA, 'craves salt');
ok('"craves salt" is a strict answer', salt.strict === true && salt.total > 0);
eq('"craves salt" still ranks Natrum muriaticum first', salt.hits[0].r.name, 'Natrum muriaticum');
ok('hits are sorted best-first', salt.hits.every(function (x, i, a) { return i === 0 || a[i - 1].s >= x.s; }));
eq('total is the number of hits', salt.total, salt.hits.length);
ok('a name match outranks a body-only match', (function () {
  const ts = ['arnica'];
  const named = DATA.filter(function (r) { return /^arnica/i.test(r.name); })[0];
  const body = DATA.filter(function (r) {
    return !/arnica/i.test(r.name) && S.prepare(r)._h.indexOf('arnica') !== -1;
  })[0];
  return !!named && !!body && S.scoreOne(named, ts) > S.scoreOne(body, ts);
})());
ok('a remedy with no term scores -1', (function () {
  const r = DATA.filter(function (x) { return S.prepare(x)._h.indexOf('zzzznotaremedy') === -1; })[0];
  return S.scoreOne(r, ['zzzznotaremedy']) === -1;
})());
ok('scoring is idempotent (the haystack cache does not change the answer)', (function () {
  const r = DATA[0];
  return S.scoreOne(r, ['the', 'burning']) === S.scoreOne(r, ['the', 'burning']);
})());

/* --- 5b. a name typed one letter wrong ------------------------------------ */
/* The relaxation above answers a phrase; it cannot answer a proper noun. "beladonna"
   is a word the corpus does not use anywhere, so before this every misspelt remedy
   name answered "No remedy matches" to someone who had the name nearly right. */
ok('search-core.js publishes a suggest()', typeof S.suggest === 'function');
ok('search-core.js publishes a bounded distance()', typeof S.distance === 'function');
eq('distance is 0 for the same word', S.distance('belladonna', 'belladonna', 1), 0);
eq('one insertion is distance 1', S.distance('beladonna', 'belladonna', 1), 1);
eq('two adjacent letters swapped is distance 1', S.distance('belladnona', 'belladonna', 1), 1);
eq('a substitution is distance 1', S.distance('belladonnx', 'belladonna', 1), 1);
ok('a distant word is beyond the bound (max+1, not the true distance)',
   S.distance('cat', 'belladonna', 1) === 2);

const typo = S.run(DATA, 'beladonna');
eq('a misspelt name finds no hit (a suggestion is not a result)', typo.total, 0);
eq('a misspelt name is not relaxed into a partial answer', typo.strict, true);
eq('"beladonna" suggests Belladonna', typo.suggest[0] && typo.suggest[0].name, 'Belladonna');
eq('the suggestion names the word it answers for', typo.suggest[0] && typo.suggest[0].term, 'beladonna');

/* A hyphen typed where the name has a space is a SEPARATOR, not a letter — so it is
   read as a space (2026-11-27). It used to find nothing strictly and be offered only
   as a suggestion; the spaced form of the same query always answered. */
const hyphen = S.run(DATA, 'nux-vomica');
eq('a hyphen where the name has a space is read as a space', hyphen.readAs, 'nux vomica');
ok('"nux-vomica" finds the remedy it names', hyphen.hits.some(function (x) { return x.r.name === 'Nux vomica'; }));

const swap = S.run(DATA, 'belladnona');
ok('a transposition suggests the name', swap.suggest.some(function (x) { return x.name === 'Belladonna'; }));

/* Honesty: a suggestion must never invent a remedy, and must never stand beside a
   real answer or beside a word nothing is close to. */
ok('every suggestion names a remedy that is in the index', [typo, hyphen, swap].every(function (res) {
  return res.suggest.every(function (x) {
    return DATA.some(function (r) { return r.slug === x.slug && r.name === x.name; });
  });
}));
ok('a suggestion never appears beside a real answer', S.run(DATA, 'worse midnight').suggest.length === 0);
/* "arnica" IS one edit from a name — an exact one — and it is also ANSWERED, so it
   must carry no suggestion. This is the assertion that keeps the two apart. */
ok('a query that is itself a remedy name is answered, not suggested',
   S.run(DATA, 'arnica').total > 0 && S.run(DATA, 'arnica').suggest.length === 0);
eq('a term too short to correct honestly suggests nothing', S.suggest(DATA, 'nu'), []);
ok('a partial answer carries no suggestion', colic.suggest.length === 0);
eq('a word nothing is close to suggests nothing', S.run(DATA, 'zzzznotaremedy').suggest, []);
ok('at most five suggestions are offered', typo.suggest.length <= 5);
/* The cap needs its own fixture: no real query here is one edit from six names, so
   the real index cannot show the bound biting. */
ok('the cap really caps: eight names one edit away yield five', (function () {
  const many = [];
  for (let i = 0; i < 8; i++) { many.push({ slug: 'synthetic-' + i, name: 'Arnica synthetic ' + i, tagline: '', essence: '', text: '' }); }
  return S.suggest(many, 'arnica').length === 5;
})());
ok('a suggestion is a candidate name, never a hit object',
   typo.suggest.every(function (x) { return x.r === undefined && x.s === undefined; }));

/* --- 5d. a hyphen typed where the name has a space ----------------------- */
/* "nat-mur", "nux-vom" and "ammon-carb" are how people type compound remedy names,
   and the corpus spells all of them with a space — so the literal token was a word
   it does not use and the page said "No remedy matches". The property pinned here is
   the one a reader can check: the hyphenated form and the spaced form are the same
   query and must answer the same remedies, in the same order. */
function slugs(res) { return res.hits.map(function (x) { return x.r.slug; }); }

const natSp = S.run(DATA, 'nat mur');
const natHy = S.run(DATA, 'nat-mur');
ok('"nat mur" answers (the spaced form was never broken)', natSp.total > 0);
ok('"nat-mur" answers at all', natHy.total > 0);
eq('"nat-mur" answers exactly what "nat mur" answers', slugs(natHy), slugs(natSp));
eq('"nat-mur" says how it was read', natHy.readAs, 'nat mur');
eq('a hyphenated answer is still a strict answer, not a partial one', natHy.strict, true);
eq('"nat-mur" carries no suggestion: it was answered, not guessed at', natHy.suggest.length, 0);

const nuxHy = S.run(DATA, 'nux-vomica');
const nuxSp = S.run(DATA, 'nux vomica');
eq('"nux-vomica" answers what "nux vomica" answers', slugs(nuxHy), slugs(nuxSp));
eq('the top hit for "nux-vomica" is the remedy it names', nuxHy.hits[0].r.name, 'Nux vomica');

ok('"nux-vom" (a name cut short) answers the way "nux vom" does',
   slugs(S.run(DATA, 'nux-vom')).join() === slugs(S.run(DATA, 'nux vom')).join() &&
   S.run(DATA, 'nux-vom').total > 0);
ok('"ammon-carb" reaches Ammonium carbonicum',
   S.run(DATA, 'ammon-carb').hits.some(function (x) { return x.r.name === 'Ammonium carbonicum'; }));

/* The literal reading wins: X-Ray IS a name in the index, hyphen and all. */
const xray = S.run(DATA, 'x-ray');
ok('a hyphen that is part of a real name still finds it',
   xray.hits.some(function (x) { return x.r.name === 'X-Ray'; }));
eq('and that query is not reported as re-read', xray.readAs, undefined);

/* An en dash is a hyphen someone copied out of a word processor. */
eq('an en dash is read the same way as a hyphen', S.run(DATA, 'nat\u2013mur').readAs, 'nat mur');

/* The retry must not invent an answer, and must not become a suggestion engine. */
const noHy = S.run(DATA, 'zzz-qqq');
eq('a hyphenated query nothing is close to still finds nothing', noHy.total, 0);
eq('and carries no suggestion', noHy.suggest.length, 0);

/* --- 5c. the reach of that correction: two edits, and beside a partial --- */
/* The one-edit suggestion above only ran when the query found NOTHING, and it only
   looked one edit away. Both were too narrow: "nux vomicer" is two edits from Nux
   vomica, and because "nux" still matched, the search answered three partial
   remedies and never said what the reader meant. These assertions pin the two
   widenings, and pin the guards that keep them from becoming a guess. */

ok('search-core.js publishes maxEdits()', typeof S.maxEdits === 'function');
eq('a word of seven letters or more may be corrected by two edits', S.maxEdits('vomicer'), 2);
eq('a six-letter word may not', S.maxEdits('albimu'), 1);
eq('a five-letter word may not', S.maxEdits('albim'), 1);
eq('a three-letter word may not', S.maxEdits('nux'), 1);
eq('two substitutions are distance 2', S.distance('vomicer', 'vomica', 2), 2);
/* The length rule has to bite on behaviour, not only on the helper: "kalmu" is two
   edits from the name Kalium, and at six letters that is not a typo. */
const kal = [{ slug: 'k', name: 'Kalium', tagline: '', essence: '', text: '' }];
eq('a six-letter word two edits from a name is not "corrected"', S.suggest(kal, 'kalmu'), []);
eq('one edit from the same name is', S.suggest(kal, 'kalmium')[0] && S.suggest(kal, 'kalmium')[0].name, 'Kalium');

/* 1. two edits reach the name */
const nv = S.run(DATA, 'nux vomicer');
eq('"nux vomicer" is two edits from the name, and finds no strict hit', nv.strict, false);
ok('"nux vomicer" still answers partially (it did before)', nv.total > 0);
eq('"nux vomicer" now says what was probably meant', nv.suggest[0] && nv.suggest[0].name, 'Nux vomica');
eq('the suggestion reports the real distance, 2', nv.suggest[0] && nv.suggest[0].distance, 2);
eq('the suggestion names the word it answers for', nv.suggest[0] && nv.suggest[0].term, 'nux vomicer');
ok('a two-edit typo with one word still matching is not left silent', nv.suggest.length > 0);

/* 2. the suggested remedy leads the partial answer — the reader asked for it */
eq('the mistyped name\'s remedy now ranks first, not second', nv.hits[0].r.name, 'Nux vomica');
ok('promotion MOVES a hit, it never adds one', nv.hits.length === S.rankPartial(DATA, S.terms('nux vomicer')).length);

const ars = S.run(DATA, 'arsenicum albim');
eq('"arsenicum albim" suggests Arsenicum album', ars.suggest[0] && ars.suggest[0].name, 'Arsenicum album');
eq('and puts it first among the partial hits', ars.hits[0].r.name, 'Arsenicum album');
ok('a whole-query match outranks a single-word one (Veratrum album is one edit from "albim")',
   (function () {
     const v = ars.suggest.filter(function (x) { return x.name === 'Veratrum album'; })[0];
     return !!v && ars.suggest.indexOf(v) > ars.suggest.indexOf(ars.suggest[0]) && ars.suggest[0].whole === true;
   })());

const bl3 = S.run(DATA, 'beladonnna');
eq('a two-edit misspelling with nothing else matching now suggests the name',
   bl3.suggest[0] && bl3.suggest[0].name, 'Belladonna');

/* 3. the guards. A word the corpus KNOWS is never corrected. */
eq('a partial answer with no unknown word still carries no suggestion', colic.suggest.length, 0);
eq('and a query mixing a known word with junk still carries none',
   S.run(DATA, 'colic zzzznotaremedy').suggest.length, 0);
ok('suggest() corrects only the words it is given (a whole-query match is still allowed)',
   S.suggest(DATA, 'arsenicum albim', ['albim']).every(function (x) {
     return x.term === 'albim' || x.whole === true;
   }));
eq('a suggestion still never appears beside a strict answer', S.run(DATA, 'worse midnight').suggest.length, 0);
ok('every suggestion is still a link, never a hit',
   nv.suggest.every(function (x) { return x.r === undefined && x.s === undefined; }));
ok('promote() on no suggestions changes nothing', S.promote([{ r: { slug: 'a' }, s: 1, m: 1 }], []).length === 1);
ok('promote() never adds the suggested remedy to an empty list', S.promote([], nv.suggest).length === 0);

/* 4. two edits are offered only when the corpus holds exactly ONE name that close.
   Two names two letters away is a coin toss; the search must say nothing. */
/* "nux vomicer" is exactly two edits from "Nux vomica"; "Nux vomicus" is two as
   well (e->u, r->s), so the corpus would hold two names that close and neither may
   be offered. With one name present, the same query is answered. */
const amb = [
  { slug: 'x', name: 'Nux vomica', tagline: '', essence: '', text: '' },
  { slug: 'y', name: 'Nux vomicus', tagline: '', essence: '', text: '' }
];
eq('two names two edits away are not guessed between', S.suggest(amb, 'nux vomicer'), []);
const one = [amb[0]];
eq('one name two edits away is offered',
   S.suggest(one, 'nux vomicer')[0] && S.suggest(one, 'nux vomicer')[0].name, 'Nux vomica');
ok('the ambiguity rule is the disambiguator, not the cap',
   typeof S.disambiguate === 'function' && S.disambiguate([]).length === 0);

/* --- 6. the page loads the module and calls it --------------------------- */
const page = fs.readFileSync(path.join(ROOT, 'docs', 'play', 'search.html'), 'utf8');
ok('search.html loads assets/search-core.js', /<script src="assets\/search-core\.js"><\/script>/.test(page));
ok('search.html searches through OMMSearch.run', page.indexOf('OMMSearch.run(') !== -1);
ok('search.html no longer keeps its own score()', page.indexOf('function score(r, ts)') === -1);
ok('search.html no longer keeps its own terms()', page.indexOf('function terms(qs)') === -1);
ok('search.html tells the user when an answer is only partial', page.indexOf('!res.strict') !== -1);
ok('search.html names a word the corpus does not use', page.indexOf('res.absent') !== -1);
ok('search.html offers the spelling suggestion in the no-match branch',
   /if \(res\.suggest[^)]*\)\s*\{/.test(page));
ok('search.html renders a suggestion as a LINK to the remedy, not as a result',
   /Did you mean[\s\S]{0,400}href="remedies\//.test(page));
ok('search.html offers the suggestion beside a PARTIAL answer too',
   /var did = '';/.test(page) && /out\.innerHTML = did \+ hits/.test(page));
ok('search.html says how far the mistyped word was from the name',
   page.indexOf('one letter') !== -1 && page.indexOf('two letters') !== -1);
ok('search.html never renders the suggestion as a result row',
   /Did you mean[\s\S]{0,300}\?<\/strong>/.test(page));
/* The hyphen retry has to be SAID on the page, or it is a silent guess. */
ok('search.html renders the re-read receipt', page.indexOf('var note = res.readAs') !== -1);
ok('search.html says it as "Read X as Y"', page.indexOf("' as ' + quote(res.readAs)") !== -1);

/* --- 7. the two copies of the module are one text ------------------------ */
ok('assets/search-core.js is byte-identical to docs/play/assets/search-core.js',
   fs.readFileSync(path.join(ROOT, 'assets', 'search-core.js'), 'utf8') ===
   fs.readFileSync(path.join(ROOT, 'docs', 'play', 'assets', 'search-core.js'), 'utf8'));
ok('assets/style.css is byte-identical to docs/play/assets/style.css',
   fs.readFileSync(path.join(ROOT, 'assets', 'style.css'), 'utf8') ===
   fs.readFileSync(path.join(ROOT, 'docs', 'play', 'assets', 'style.css'), 'utf8'));

console.log('');
if (fails.length) {
  console.log('FAIL: ' + fails.length + ' of ' + (pass + fails.length) + ' assertions failed');
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('OK: ' + pass + ' assertions passed (' + N + ' remedies in the index)');
