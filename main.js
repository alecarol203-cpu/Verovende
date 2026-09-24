(function () {
  "use strict";

  var data = window.__BRAND__ || {};
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fineHover = matchMedia("(hover: hover) and (pointer: fine)").matches;

  var $ = function (sel, scope) { return (scope || document).querySelector(sel); };
  var $$ = function (sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); };

  function safe(fn, name) {
    try { fn(); } catch (e) { console.warn("[" + name + "]", e); }
  }

  /* ---------- Nav: solidify on scroll + mobile menu ---------- */
  function initNav() {
    var nav = $(".nav");
    if (!nav) return;
    var onScroll = function () {
      if (window.scrollY > 24) nav.classList.add("is-solid");
      else nav.classList.remove("is-solid");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    var burger = $(".nav-burger");
    var root = document.documentElement;
    if (burger) {
      burger.addEventListener("click", function () {
        root.classList.toggle("is-nav-open");
        var open = root.classList.contains("is-nav-open");
        burger.setAttribute("aria-expanded", open ? "true" : "false");
      });
      $$(".mobile-menu a").forEach(function (a) {
        a.addEventListener("click", function () { root.classList.remove("is-nav-open"); });
      });
    }
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveals() {
    var targets = $$("[data-reveal]");
    if (!targets.length) return;

    if (!("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.02, rootMargin: "0px 0px -2% 0px" });

    targets.forEach(function (el) { io.observe(el); });

    // Safety net: force-reveal anything still hidden after 6s
    setTimeout(function () {
      $$("[data-reveal]:not(.is-visible)").forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add("is-visible");
        }
      });
    }, 6000);
  }

  /* ---------- Split-text reveal (letters/words) ----------
     Walks the element's DOM tree, wraps runs of text in animated spans
     while preserving any existing markup (line breaks, highlighted
     spans, <em>, etc). The original sentence is exposed to assistive
     tech via aria-label; the generated spans are aria-hidden. */
  function splitText(el, mode) {
    if (!el || el.dataset.split === "1") return;
    el.dataset.split = "1";
    var fullText = (el.textContent || "").replace(/\s+/g, " ").trim();
    el.setAttribute("aria-label", fullText);
    var counter = { i: 0 };

    function makePiece(tok) {
      var span = document.createElement("span");
      span.className = "split-piece";
      span.setAttribute("aria-hidden", "true");
      span.style.setProperty("--i", counter.i);
      span.textContent = tok;
      counter.i++;
      return span;
    }

    function wrapTextNode(node) {
      var text = node.nodeValue;
      if (!text) return;
      var frag = document.createDocumentFragment();
      var wordTokens = text.split(/(\s+)/);

      wordTokens.forEach(function (word) {
        if (word === "") return;
        if (/^\s+$/.test(word)) {
          frag.appendChild(document.createTextNode(word));
          return;
        }
        if (mode === "words") {
          frag.appendChild(makePiece(word));
          return;
        }
        // chars mode: wrap each word's letters in a no-wrap container so the
        // browser can only break lines *between* words, never inside one
        // (adjacent inline-block letter spans otherwise offer a break
        // opportunity at every letter boundary, splitting words apart).
        var wordWrap = document.createElement("span");
        wordWrap.className = "split-word";
        Array.prototype.slice.call(word).forEach(function (ch) {
          wordWrap.appendChild(makePiece(ch));
        });
        frag.appendChild(wordWrap);
      });

      node.parentNode.replaceChild(frag, node);
    }

    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          wrapTextNode(child);
        } else if (child.nodeType === 1) {
          child.setAttribute("aria-hidden", "true");
          walk(child);
        }
      });
    }

    walk(el);
  }

  function initSplitText() {
    if (reduced) return; // graceful no-op: plain text stays as-is
    var els = $$("[data-split-text]");
    if (!els.length) return;

    els.forEach(function (el) {
      splitText(el, el.getAttribute("data-split-text") || "words");
    });

    var immediate = els.filter(function (el) { return el.hasAttribute("data-split-immediate"); });
    var deferred = els.filter(function (el) { return !el.hasAttribute("data-split-immediate"); });

    if (immediate.length) {
      requestAnimationFrame(function () {
        setTimeout(function () {
          immediate.forEach(function (el) { el.classList.add("is-split-visible"); });
        }, 120);
      });
    }

    if (deferred.length) {
      if (!("IntersectionObserver" in window)) {
        deferred.forEach(function (el) { el.classList.add("is-split-visible"); });
        return;
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-split-visible");
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
      deferred.forEach(function (el) { io.observe(el); });
    }
  }

  /* ---------- Smooth anchor scroll (native) ---------- */
  function initSmoothAnchors() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var id = a.getAttribute("href");
      if (!id || id === "#" || id.length < 2) return;
      var el;
      try { el = document.querySelector(id); } catch (err) { return; }
      if (!el) return;
      e.preventDefault();
      var navH = 84;
      var top = el.getBoundingClientRect().top + window.scrollY - navH + 1;
      window.scrollTo({ top: top, behavior: reduced ? "auto" : "smooth" });
      document.documentElement.classList.remove("is-nav-open");
    });
  }

  /* ---------- Hero subtle parallax (rAF, capped) ---------- */
  function initHeroParallax() {
    if (!fineHover) return;
    var glow = $(".hero-glow");
    var logo = $(".hero-logo");
    if (!glow && !logo) return;
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        if (glow) glow.style.transform = "translate3d(0," + Math.min(y * 0.12, 90) + "px,0)";
        if (logo) logo.style.transform = "translate3d(0," + Math.min(y * -0.05, 40) + "px,0)";
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Tilt on cards (fine pointer only) ---------- */
  function initTilt() {
    if (!fineHover) return;
    $$("[data-tilt]").forEach(function (card) {
      var rect;
      card.addEventListener("mouseover", function (e) {
        if (card.contains(e.relatedTarget)) return;
        rect = card.getBoundingClientRect();
      });
      card.addEventListener("mousemove", function (e) {
        if (!rect) rect = card.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width - 0.5;
        var py = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = "perspective(900px) rotateY(" + (px * 7) + "deg) rotateX(" + (py * -7) + "deg) translateY(-4px)";
      });
      card.addEventListener("mouseout", function (e) {
        if (card.contains(e.relatedTarget)) return;
        card.style.transform = "";
      });
    });
  }

  /* ---------- Category sticky-nav active state (catalog page) ---------- */
  function initCatNav() {
    var links = $$(".cat-nav a[href^='#']");
    var sections = $$(".cat-section[id]");
    if (!links.length || !sections.length || !("IntersectionObserver" in window)) return;

    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = byId[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          links.forEach(function (a) { a.classList.remove("is-active"); });
          link.classList.add("is-active");
          if (typeof link.scrollIntoView === "function") {
            link.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
          }
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });

    sections.forEach(function (s) { io.observe(s); });
  }

  /* ---------- Product photo galleries (rotating carousel, side arrows) ---------- */
  function initGalleries() {
    var galleries = $$(".gallery");
    if (!galleries.length) return;

    var dur = reduced ? 0 : 500;

    galleries.forEach(function (gallery) {
      var track = $(".gallery-track", gallery);
      var prevBtn = $(".gallery-arrow-prev", gallery);
      var nextBtn = $(".gallery-arrow-next", gallery);
      if (!track || !prevBtn || !nextBtn) return;

      var busy = false;

      function slideWidth() {
        var first = track.children[0];
        if (!first) return 0;
        var cs = getComputedStyle(track);
        var gap = parseFloat(cs.columnGap || cs.gap) || 0;
        return first.getBoundingClientRect().width + gap;
      }

      function release() { busy = false; }

      function goNext() {
        var items = track.children;
        if (busy || items.length < 2) return;
        busy = true;
        var w = slideWidth();
        if (!dur || !w) {
          track.appendChild(items[0]);
          release();
          return;
        }
        track.style.transition = "transform " + dur + "ms var(--ease-out, ease)";
        track.style.transform = "translateX(" + (-w) + "px)";
        var done = false;
        var finish = function () {
          if (done) return;
          done = true;
          track.removeEventListener("transitionend", finish);
          track.style.transition = "none";
          track.appendChild(items[0]);
          track.style.transform = "translateX(0)";
          release();
        };
        track.addEventListener("transitionend", finish);
        setTimeout(finish, dur + 120);
      }

      function goPrev() {
        var items = track.children;
        if (busy || items.length < 2) return;
        busy = true;
        var last = items[items.length - 1];
        track.style.transition = "none";
        track.insertBefore(last, track.firstChild);
        var w = slideWidth();
        if (!dur || !w) {
          track.style.transform = "translateX(0)";
          release();
          return;
        }
        track.style.transform = "translateX(" + (-w) + "px)";
        void track.offsetWidth; /* force reflow so the jump above isn't animated */
        var done = false;
        var finish = function () {
          if (done) return;
          done = true;
          track.removeEventListener("transitionend", finish);
          release();
        };
        track.style.transition = "transform " + dur + "ms var(--ease-out, ease)";
        track.style.transform = "translateX(0)";
        track.addEventListener("transitionend", finish);
        setTimeout(finish, dur + 120);
      }

      nextBtn.addEventListener("click", goNext);
      prevBtn.addEventListener("click", goPrev);
    });
  }

  function boot() {
    safe(initNav, "initNav");
    safe(initSplitText, "initSplitText");
    safe(initReveals, "initReveals");
    safe(initSmoothAnchors, "initSmoothAnchors");
    safe(initHeroParallax, "initHeroParallax");
    safe(initTilt, "initTilt");
    safe(initCatNav, "initCatNav");
    safe(initGalleries, "initGalleries");
    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
