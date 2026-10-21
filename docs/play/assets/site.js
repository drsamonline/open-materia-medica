/* Open Materia Medica — © 2026 Dr. Sohil Momin, BHMS. All rights reserved. OMM-JS-SIGNATURE:D6AAAAC90A
   Watermarked source; unauthorised copying or redistribution is prohibited. */
/* Open Materia Medica — shared UI behaviour.
   Progressive enhancement only: every page works without it. */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  var framed = false;
  try { framed = window.self !== window.top; } catch (e) { framed = true; }

  try{console.info("Open Materia Medica · © 2026 Dr. Sohil Momin, BHMS · all rights reserved · OMM-"+("4862E16746"));}catch(e){}

  /* keep the browser UI colour in step with the live theme + mood */
  function syncThemeColor() {
    try {
      var c = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
      if (!c) return;
      document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.remove(); });
      var m2 = document.createElement('meta');
      m2.setAttribute('name', 'theme-color');
      m2.setAttribute('content', c);
      document.head.appendChild(m2);
    } catch (e) {}
  }

  ready(function () {
    var header = document.querySelector('header.site');

    /* ---- mobile nav toggle ---- */
    if (header) {
      var toggle = header.querySelector('.nav-toggle');
      if (toggle) {
        toggle.addEventListener('click', function () {
          var open = header.classList.toggle('nav-open');
          toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        /* close the menu when a link is used (a same-page hash route does not reload) */
        function closeNav() {
          header.classList.remove('nav-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
        header.querySelectorAll('nav.nav a').forEach(function (a) {
          a.addEventListener('click', closeNav);
        });
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') closeNav();
        });
        document.addEventListener('click', function (e) {
          if (header.classList.contains('nav-open') && !header.contains(e.target)) closeNav();
        });
      }

      /* ---- highlight the current page in the nav ---- */
      var here = location.pathname.split('/').pop() || 'index.html';
      header.querySelectorAll('nav.nav a').forEach(function (a) {
        var target = a.getAttribute('href').split('#')[0].split('/').pop();
        if (target && target === here) a.setAttribute('aria-current', 'page');
      });
    }

    syncThemeColor();

    /* ---- light / dark theme toggle ---- */
    var tt = document.getElementById('theme-toggle');
    if (tt) {
      tt.addEventListener('click', function () {
        var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('omm-theme', next); } catch (e) {}
        tt.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
        syncThemeColor();
      });
    }

    /* ---- random colour mood ---- */
    var mt = document.getElementById('mood-toggle');
    if (mt) {
      var MOODS = ['sage', 'amber', 'indigo', 'rose', 'clay'];
      mt.addEventListener('click', function () {
        var cur = document.documentElement.getAttribute('data-mood') || 'sage';
        var next = cur;
        while (next === cur && MOODS.length > 1) next = MOODS[Math.floor(Math.random() * MOODS.length)];
        document.documentElement.setAttribute('data-mood', next);
        try { localStorage.setItem('omm-mood', next); } catch (e) {}
        mt.setAttribute('title', 'Colour mood: ' + next);
        syncThemeColor();
      });
    }

    /* ---- remedy of the day (index page, built from the listed rows) ---- */
    var rotd = document.getElementById('rotd');
    if (rotd) {
      var rows = document.querySelectorAll('a[href^="remedies/"]');
      if (rows.length) {
        var day = Math.floor(Date.now() / 86400000);
        var a = rows[day % rows.length];
        var tr = a.closest('tr');
        var made = tr && tr.children[1] ? tr.children[1].textContent : '';
        var line = tr && tr.children[2] ? tr.children[2].textContent : '';
        rotd.innerHTML = '<a href="' + a.getAttribute('href') + '">' + a.textContent + '</a>'
          + '<span class="tagline">' + made + '</span>'
          + '<span class="essence">' + line + '</span>';
      }
    }

    /* ---- random remedy (index page) ---- */
    var rnd = document.getElementById('random-remedy');
    if (rnd) rnd.addEventListener('click', function () {
      var links = document.querySelectorAll('a[href^="remedies/"]');
      if (links.length) location.href = links[Math.floor(Math.random() * links.length)].getAttribute('href');
    });

    /* ---- back to top + reading progress (not inside compare frames) ---- */
    if (framed) return;
    var top = document.createElement('button');
    top.className = 'totop';
    top.setAttribute('aria-label', 'Back to top');
    top.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.body.appendChild(top);

    var bar = document.createElement('div');
    bar.className = 'progress';
    document.body.appendChild(bar);

    function onScroll() {
      var y = window.scrollY || document.documentElement.scrollTop;
      top.classList.toggle('show', y > 520);
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  });

  /* ---- service worker (offline app) ---- */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(
        (location.pathname.indexOf('/remedies/') !== -1 ? '../' : '') + 'sw.js'
      ).catch(function () {});
    });
  }
})();
