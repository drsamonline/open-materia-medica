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
       - a suggestion is a CANDIDATE NAME, never a hit: the page renders it as a
         link to the remedy, not as a result;
       - it names the WORD it is answering for, so the user can see what was
         corrected;
       - it corrects only a word the corpus does not use ANYWHERE. A word the
         materia medica knows is never replaced — that is what keeps "colic in
         infants" a partial answer with no suggestion beside it;
       - one edit — insertion, deletion, substitution, or two adjacent letters
         transposed — and, for a word of seven letters or more, a second edit, but
         only when the corpus holds exactly ONE name that close. Two names two
         letters away is a coin toss, not a correction, and this search does not
         guess.

     REACH, 2026-11-24. It used to be one edit and it used to run only when the
     query found NOTHING. Both were too narrow for the way a name is actually
     mistyped. "arsenicum albim" and "nux vomicer" are two edits from the name,
     and because one word of each query still matched, the search answered eleven
     and three partial remedies and never said what the reader had probably meant
     — the right remedy sitting second in both lists. So the suggestion now runs
     whenever the STRICT pass finds nothing (partial answer or not), and its reach
     is two edits on a long word.
  */
  var SUGGEST_MAX = 5;

  /* A second edit is only a typo on a word long enough for it to still be the same
     name: at seven characters "vomicer" is "vomica"; at four, a two-edit
     neighbour is simply a different word. */
  var TWO_EDIT_MIN = 7;
  function maxEdits(s) { return s.length >= TWO_EDIT_MIN ? 2 : 1; }

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

  /* A second-edit match survives only when nothing else is that close. One edit is
     already specific enough to offer; two edits are offered only when the corpus
     holds exactly one name there, so the search never picks between equals. */
  function disambiguate(list) {
    var byTerm = {}, keep = [], t, i, j, g, min, n;
    for (i = 0; i < list.length; i++) {
      t = list[i].term;
      (byTerm[t] || (byTerm[t] = [])).push(list[i]);
    }
    for (t in byTerm) {
      if (!Object.prototype.hasOwnProperty.call(byTerm, t)) { continue; }
      g = byTerm[t]; min = 3; n = 0;
      for (j = 0; j < g.length; j++) { if (g[j].distance < min) { min = g[j].distance; } }
      for (j = 0; j < g.length; j++) { if (g[j].distance === min) { n++; } }
      if (min >= 2 && n > 1) { continue; }   /* two letters from two names: a guess */
      for (j = 0; j < g.length; j++) { if (g[j].distance === min) { keep.push(g[j]); } }
    }
    return keep;
  }

  /* The names the query was probably reaching for. Never called when the query has
     a strict answer, and never a substitute for one.

     `only` narrows what may be corrected: run() passes the words the corpus does
     not use, so a word it DOES use is never rewritten into something else. */
  function suggest(index, raw, only) {
    var words = only || terms(raw);
    if (!words.length) { return []; }
    /* The whole query, whitespace-collapsed: catches a multi-word name typed with
       a typo ("nux vomicer"), and a hyphen typed where the name has a space
       ("nux-vomica" is one substitution from "nux vomica"). */
    var q = String(raw).toLowerCase().replace(/\s+/g, ' ').trim();
    var qMax = maxEdits(q);
    var out = [], i, k, j, d, best;
    for (i = 0; i < index.length; i++) {
      prepare(index[i]);
      var name = index[i]._n;
      if (!name) { continue; }
      var tokens = name.split(/\s+/);
      best = null;
      d = distance(q, name, qMax);
      if (d <= qMax) { best = { d: d, via: q, whole: true }; }
      for (k = 0; k < words.length; k++) {
        if (words[k].length < 4) { continue; }   /* too short to correct honestly */
        var wMax = maxEdits(words[k]);
        for (j = 0; j < tokens.length; j++) {
          d = distance(words[k], tokens[j], wMax);
          if (d <= wMax && (!best || d < best.d)) {
            best = { d: d, via: words[k], whole: false };
          }
        }
      }
      if (!best) { continue; }
      out.push({ slug: index[i].slug, name: index[i].name, term: best.via,
                 distance: best.d, whole: best.whole });
    }
    out = disambiguate(out);
    /* A whole-query match is stronger evidence than one word matching one word,
       so it ranks first: "arsenicum albim" is one edit from Arsenicum album, and
       also one edit from Veratrum album on its second word alone. */
    out.sort(function (a, b) {
      return ((b.whole ? 1 : 0) - (a.whole ? 1 : 0)) || (a.distance - b.distance) ||
             (a.name.length - b.name.length) ||
             (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
    return out.slice(0, SUGGEST_MAX);
  }

  /* The remedy the reader asked for, moved to the front of a partial answer.
     Moved, never added: a suggestion can never become a hit that was not one. */
  function promote(hits, sugg) {
    if (!sugg.length) { return hits; }
    var want = sugg[0].slug, i;
    for (i = 1; i < hits.length; i++) {
      if (hits[i].r.slug === want) { hits.unshift(hits.splice(i, 1)[0]); break; }
    }
    return hits;
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
    out.absent = absent;
    /* A word the corpus does not use anywhere is either a word it does not have or
       a NAME typed wrong — and that is just as true when the query's other words
       did answer. Only the absent words are offered a correction. */
    out.suggest = suggest(index, raw, absent);

    var partial = rankPartial(index, ts);
    if (!partial.length) { return out; }
    out.strict = false;
    out.hits = promote(partial, out.suggest);
    out.total = out.hits.length;
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
    maxEdits: maxEdits,
    disambiguate: disambiguate,
    promote: promote,
    suggest: suggest,
    run: run
  };
})(typeof window !== 'undefined' ? window : globalThis);
