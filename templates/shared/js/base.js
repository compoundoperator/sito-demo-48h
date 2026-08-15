/*
  templates/shared/js/base.js — Landing Factory
  JavaScript vanilla condiviso da tutte le famiglie di template.
  Nessuna dipendenza esterna. Nessuna logica di scelta di
  famiglia/categoria/preset: quella resta interamente lato build (Node).

  Configurazione per-attività iniettata a build time in window.__SITE__
  (vedi scripts/build.js), già validata/normalizzata server-side:
    {
      mode: "TEMPLATE_DEMO" | "PRIVATE_DEMO" | "PRODUCTION",
      whatsappNumber: "393510000000" | null,   // cifre già validate, o null
      whatsappDefaultMessage: "..." | null,
      whatsappDemoText: "..."
    }
  Finché whatsappNumber è null (sempre il caso in TEMPLATE_DEMO/PRIVATE_DEMO,
  e in PRODUCTION senza un numero valido), ogni CTA mostra un avviso
  dimostrativo invece di aprire un link reale — mai un link rotto.
*/

(function () {
  "use strict";

  var SITE = window.__SITE__ || {};

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.addEventListener("DOMContentLoaded", function () {
    initHeaderScroll();
    initMobileMenu();
    initWhatsappCtas();
    initScrollReveal();
    initActiveNav();
    initFaqSingleOpen();
    initContactForm();
    initFooterYear();
  });

  /* ---------- Header sticky ---------- */
  function initHeaderScroll() {
    var header = document.getElementById("siteHeader");
    if (!header) return;

    var ticking = false;

    function update() {
      header.classList.toggle("is-scrolled", window.scrollY > 12);
      ticking = false;
    }

    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );

    update();
  }

  /* ---------- Menu mobile ---------- */
  function initMobileMenu() {
    var toggle = document.getElementById("navToggle");
    var menu = document.getElementById("mobileMenu");
    if (!toggle || !menu) return;

    function closeMenu() {
      toggle.setAttribute("aria-expanded", "false");
      menu.classList.remove("is-open");
      document.body.classList.remove("menu-open");
    }

    function openMenu() {
      toggle.setAttribute("aria-expanded", "true");
      menu.classList.add("is-open");
      document.body.classList.add("menu-open");
    }

    toggle.addEventListener("click", function () {
      var isOpen = toggle.getAttribute("aria-expanded") === "true";
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        closeMenu();
        toggle.focus();
      }
    });

    document.addEventListener("click", function (event) {
      var isOpen = toggle.getAttribute("aria-expanded") === "true";
      if (!isOpen) return;
      if (menu.contains(event.target) || toggle.contains(event.target)) return;
      closeMenu();
    });
  }

  /* ---------- CTA WhatsApp (comportamento demo) ---------- */
  function initWhatsappCtas() {
    var toast = document.getElementById("demoToast");
    var hideTimer = null;

    function showToast(text) {
      if (!toast) return;
      toast.textContent = text;
      toast.classList.add("is-visible");
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(function () {
        toast.classList.remove("is-visible");
      }, 5000);
    }

    function openWhatsapp(message) {
      if (SITE.whatsappNumber) {
        var text = message || SITE.whatsappDefaultMessage || "";
        var url = "https://wa.me/" + SITE.whatsappNumber + (text ? "?text=" + encodeURIComponent(text) : "");
        window.open(url, "_blank", "noopener");
        return;
      }
      showToast(
        SITE.whatsappDemoText ||
          "Funzione dimostrativa — nessun messaggio verrà inviato. Nella versione reale questo pulsante apre WhatsApp."
      );
    }

    document.querySelectorAll("[data-whatsapp-cta]").forEach(function (button) {
      button.addEventListener("click", function () {
        openWhatsapp(button.getAttribute("data-whatsapp-message"));
      });
    });
  }

  /* ---------- Scroll reveal ----------
     Nessun timer: la rivelazione è guidata esclusivamente da
     IntersectionObserver (meccanismo primario) più un controllo di
     sicurezza non temporale su scroll/resize basato su
     getBoundingClientRect, per gli elementi ancora in attesa. */
  function initScrollReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
    if (!items.length) return;

    /* Senza IntersectionObserver o con reduced-motion: il contenuto resta
       visibile di default (vedi css/style.css) — non applichiamo mai la
       classe che lo nasconderebbe, quindi non c'è nulla da rivelare e
       nessun listener di scroll/resize viene registrato. */
    if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
      return;
    }

    var pending = new Set(items);
    var ticking = false;

    function onTransitionEnd(event) {
      if (event.propertyName !== "opacity") return;
      var el = event.currentTarget;
      el.classList.remove("reveal-pending");
      el.removeEventListener("transitionend", onTransitionEnd);
    }

    function reveal(el) {
      if (!pending.has(el)) return;
      pending.delete(el);
      el.addEventListener("transitionend", onTransitionEnd);
      el.classList.add("is-visible");
      if (pending.size === 0) {
        window.removeEventListener("scroll", onScrollOrResize);
        window.removeEventListener("resize", onScrollOrResize);
      }
    }

    var observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            obs.unobserve(entry.target);
            reveal(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );

    function checkPendingByGeometry() {
      ticking = false;
      if (pending.size === 0) return;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      Array.prototype.slice.call(pending).forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (rect.top < vh && rect.bottom > 0) {
          observer.unobserve(el);
          reveal(el);
        }
      });
    }

    function onScrollOrResize() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(checkPendingByGeometry);
    }

    items.forEach(function (el) {
      el.classList.add("reveal-pending");
      observer.observe(el);
    });

    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
  }

  /* ---------- Nav attiva sulla sezione visibile ---------- */
  function initActiveNav() {
    var links = document.querySelectorAll('.nav__link[href^="#"]');
    if (!links.length || !("IntersectionObserver" in window)) return;

    var sections = [];
    links.forEach(function (link) {
      var id = link.getAttribute("href").slice(1);
      var section = document.getElementById(id);
      if (section) sections.push({ link: link, section: section });
    });

    if (!sections.length) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var match = sections.find(function (item) {
            return item.section === entry.target;
          });
          if (!match) return;
          if (entry.isIntersecting) {
            links.forEach(function (l) {
              l.classList.remove("is-active");
            });
            match.link.classList.add("is-active");
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );

    sections.forEach(function (item) {
      observer.observe(item.section);
    });
  }

  /* ---------- FAQ: un solo elemento aperto alla volta ---------- */
  function initFaqSingleOpen() {
    var items = document.querySelectorAll(".faq-item");
    items.forEach(function (item) {
      item.addEventListener("toggle", function () {
        if (!item.open) return;
        items.forEach(function (other) {
          if (other !== item) other.removeAttribute("open");
        });
      });
    });
  }

  /* ---------- Form contatto (demo, non invia né salva dati) ---------- */
  function initContactForm() {
    var form = document.getElementById("demoForm");
    var status = document.getElementById("formStatus");
    if (!form || !status) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      form.reset();
      status.textContent =
        "Demo dell'esperienza di invio — in questa versione dimostrativa nessun dato viene realmente trasmesso o conservato. Per un contatto reale usa WhatsApp.";
    });
  }

  /* ---------- Anno corrente nel footer ---------- */
  function initFooterYear() {
    var el = document.getElementById("year");
    if (el) el.textContent = new Date().getFullYear();
  }
})();
