/* Open Materia Medica — © 2026 Dr. Sohil Momin, BHMS. All rights reserved. OMM-JS-SIGNATURE:SEARCH3 */
/* search-core.js — the pure half of the remedy search: query terms, scoring and
   query relaxation. No DOM and no browser globals, so tools/test-search.js can
   run the exact code the page runs under plain node.

   WHY THIS FILE EXISTS. The page used to carry its own copy of terms()/score(),
   and the whole of it had one rule: EVERY term in the query must appear in the
   remedy, or the remedy is not a hit. That is the right rule most of the time —
   it is what makes "worse midnight" mean both words and not either. It is the
   wrong rule when the words are individually common but never co-occur:
   "colic in infants" answered "No remedy matches" while 18 remedies speak of
   colic and others of infants, because no single portrait uses both. The user
   cannot tell "nothing here" from "not all of that in one place", and the honest
   answer is the second one.

   So: strict AND first, exactly as before, and the page says "matching remedies".
   Only when that finds nothing does it answer with the closest partial matches,
   ranked by how many of the words each one contains — and it SAYS so, and names
   any word the corpus does not use at all. Never relax silently, and never turn a
   genuine "no such remedy" into an answer: a word that matches nothing anywhere
   still yields no results.
 */
(function (global) {
  'use strict';

  var STOP = new Set(['the','a','an','of','and','with','from','that','this','like','one','who','is','it','as','at','in','on','for','to','by','or','be']);

  /* The query, lower-cased and split, with stop-words removed — unless the
     query was nothing but stop-words, in which case they are all we have. */
  function terms(qs) {
    var all = String(qs || '').toLowerCase().split(/\s+/).filter(Boolean);
    var keep = all.filter(function (w) { return !STOP.has(w); });
    return keep.length ? keep : all;
  }

  /* The lower-cased haystack, built once per remedy and kept on the record —
     the page calls this on every keystroke. */
  function prepare(r) {
    if (r._h === undefined) {
      r._n = String(r.name || '').toLowerCase();
      r._t = String(r.tagline || '').toLowerCase();
      r._h = (String(r.name || '') + ' ' + String(r.tagline || '') + ' ' + String(r.essence || '') + ' ' + String(r.text || '')).toLowerCase();
    }
    return r;
  }

  /* Score one remedy against the terms. -1 means "not a hit": a term with no
     occurrence anywhere disqualifies it. */
  function scoreOne(r, ts) {
    prepare(r);
    var name = r._n, hay = r._h, s = 0, i, t, cnt;
    for (i = 0; i < ts.length; i++) {
      t = ts[i];
      cnt = hay.split(t).length - 1;
      if (cnt === 0) { return -1; }
      s += Math.min(cnt, 12);
      if (name.indexOf(t) !== -1) { s += 6; }
      if (r._t.indexOf(t) !== -1) { s += 3; }
    }
    return s;
  }

  /* How many remedies each term appears in at all. This is what tells a word
     that is absent from the corpus apart from a word that is merely rare. */
  function counts(index, ts) {
    var c = {};
    ts.forEach(function (t) {
      var n = 0;
      for (var i = 0; i < index.length; i++) {
        prepare(index[i]);
        if (index[i]._h.indexOf(t) !== -1) { n++; }
      }
      c[t] = n;
    });
    return c;
  }

  /* Every strict hit, best first: a term with no occurrence disqualifies it. */
  function rank(index, ts) {
    var hits = [];
    for (var i = 0; i < index.length; i++) {
      var s = scoreOne(index[i], ts);
      if (s >= 0) { hits.push({ r: index[i], s: s, m: ts.length }); }
    }
    hits.sort(function (a, b) { return b.s - a.s; });
    return hits;
  }

  /* The closest partial matches: a remedy is a hit if it contains AT LEAST one
     term, and more terms matched always outranks a higher score on fewer. This
     is only ever used after the strict pass has found nothing. */
  function rankPartial(index, ts) {
    var hits = [], i, j;
    for (i = 0; i < index.length; i++) {
      prepare(index[i]);
      var matched = [], s = 0;
      for (j = 0; j < ts.length; j++) {
        var t = ts[j], cnt = index[i]._h.split(t).length - 1;
        if (cnt === 0) { continue; }
        matched.push(t);
        s += Math.min(cnt, 12);
        if (index[i]._n.indexOf(t) !== -1) { s += 6; }
        if (index[i]._t.indexOf(t) !== -1) { s += 3; }
      }
      if (!matched.length) { continue; }
      hits.push({ r: index[i], s: s, m: matched.length, matched: matched });
    }
    hits.sort(function (a, b) { return (b.m - a.m) || (b.s - a.s); });
    return hits;
  }

  /* One-edit spelling suggestion — for the NAME typed a letter wrong.

     WHY THIS IS SEPARATE FROM THE RELAXATION ABOVE. Relaxation answers a phrase
     whose words each exist somewhere but never together. It cannot answer a proper
     noun typed one letter wrong: "beladonna" is not a word the corpus uses at all,
     so the strict pass finds nothing, the partial pass finds nothing, and the page
     says "No remedy matches" to someone who meant Belladonna. Over a corpus of 344
     remedy NAMES that is the commonest way a search box fails.

     What it may and may not do:
       - a suggestion is a CANDIDATE NAME, never a hit: it is offered only when the
         query found nothing at all, and the page renders it as a link to the
         remedy, not as a result;
       - it names the WORD it is answering for, so the user can see what was
         corrected;
       - one edit only — insertion, deletion, substitution, or two adjacent letters
         transposed — and nothing wider. No fuzzy matcher that guesses.
  */
  var SUGGEST_MAX = 5;

  /* Bounded Damerau-Levenshtein distance. Returns the true distance when it is at
     most `max`, and max+1 as soon as it cannot be — so a long name costs no more
     than a short one, and "is this within one edit" never pays for the full table. */
  function distance(a, b, max) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) { return max + 1; }
    var d0 = [], d1 = [], d2 = [], i, j, best, v, cost;
    for (j = 0; j <= lb; j++) { d0[j] = j; }   /* row i-2 */
    for (i = 1; i <= la; i++) {
      d1[0] = i;
      best = i;
      for (j = 1; j <= lb; j++) {
        cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        v = Math.min(d0[j] + 1, d1[j - 1] + 1, d0[j - 1] + cost);
        if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
          v = Math.min(v, d2[j - 2] + 1);      /* adjacent letters swapped */
        }
        d1[j] = v;
        if (v < best) { best = v; }
      }
      if (best > max) { return max + 1; }
      d2 = d0; d0 = d1; d1 = [];
    }
    return d0[lb];
  }

  /* The names the query was probably reaching for. Never called when the query
     already has an answer, and never a substitute for one. */
  function suggest(index, raw) {
    var ts = terms(raw);
    if (!ts.length) { return []; }
    /* The whole query, whitespace-collapsed: catches a multi-word name typed with
       one typo ("nux vomic"), and a hyphen typed where the name has a space
       ("nux-vomica" is one substitution from "nux vomica"). */
    var q = String(raw).toLowerCase().replace(/\s+/g, ' ').trim();
    var out = [], i, k, j, d;
    for (i = 0; i < index.length; i++) {
      prepare(index[i]);
      var name = index[i]._n;
      if (!name) { continue; }
      var tokens = name.split(/\s+/);
      var best = { d: 2, via: null };
      d = distance(q, name, 1);
      if (d <= 1) { best = { d: d, via: q }; }
      for (k = 0; k < ts.length && best.d > 1; k++) {
        if (ts[k].length < 4) { continue; }   /* too short to correct honestly */
        for (j = 0; j < tokens.length; j++) {
          d = distance(ts[k], tokens[j], 1);
          if (d <= 1) { best = { d: d, via: ts[k] }; break; }
        }
      }
      if (best.d > 1) { continue; }
      out.push({ slug: index[i].slug, name: index[i].name, term: best.via, distance: best.d });
    }
    out.sort(function (a, b) {
      return (a.distance - b.distance) || (a.name.length - b.name.length) ||
             (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
    return out.slice(0, SUGGEST_MAX);
  }

  /* The whole search, with the relaxation rule and its receipt.
       { terms, strict, absent, suggest, hits, total }
     strict:  every term matched. absent: terms no remedy contains anywhere.
     suggest: candidate NAMES one edit away from the query — only when the query
              found nothing, and never a hit. */
  function run(index, raw) {
    var ts = terms(raw);
    var out = { terms: ts, strict: true, absent: [], suggest: [], hits: [], total: 0 };
    if (!ts.length) { return out; }

    var hits = rank(index, ts);
    if (hits.length) { out.hits = hits; out.total = hits.length; return out; }

    var c = counts(index, ts);
    var absent = ts.filter(function (t) { return c[t] === 0; });
    var partial = rankPartial(index, ts);
    if (!partial.length) {
      out.absent = absent;
      /* Nothing to answer with at all: the last honest thing the search can do is
         offer the NAME the user may have mistyped. */
      out.suggest = suggest(index, raw);
      return out;
    }
    out.strict = false;
    out.absent = absent;
    out.hits = partial;
    out.total = partial.length;
    return out;
  }

  global.OMMSearch = {
    STOP: STOP,
    terms: terms,
    prepare: prepare,
    scoreOne: scoreOne,
    counts: counts,
    rank: rank,
    rankPartial: rankPartial,
    distance: distance,
    suggest: suggest,
    run: run
  };
})(typeof window !== 'undefined' ? window : globalThis);
