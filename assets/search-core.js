/* Open Materia Medica — © 2026 Dr. Sohil Momin, BHMS. All rights reserved. OMM-JS-SIGNATURE:SEARCH2 */
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

  /* The whole search, with the relaxation rule and its receipt.
       { terms, strict, absent, hits, total }
     strict:  every term matched. absent: terms no remedy contains anywhere. */
  function run(index, raw) {
    var ts = terms(raw);
    var out = { terms: ts, strict: true, absent: [], hits: [], total: 0 };
    if (!ts.length) { return out; }

    var hits = rank(index, ts);
    if (hits.length) { out.hits = hits; out.total = hits.length; return out; }

    var c = counts(index, ts);
    var absent = ts.filter(function (t) { return c[t] === 0; });
    var partial = rankPartial(index, ts);
    if (!partial.length) {
      out.absent = absent;
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
    run: run
  };
})(typeof window !== 'undefined' ? window : globalThis);
