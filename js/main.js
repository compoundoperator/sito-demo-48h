/*
  Luce Beauty Studio — sito dimostrativo
  JavaScript vanilla, nessuna dipendenza esterna.
*/

(function () {
  "use strict";

  /* ---------- Configurazione WhatsApp (demo) ----------
     In produzione: valorizzare "number" con il numero reale del cliente
     (solo cifre, con prefisso internazionale, es. "39XXXXXXXXXX").
     Finché "number" resta vuoto, ogni CTA WhatsApp mostra un avviso
     dimostrativo invece di aprire un link reale. */
  var WHATSAPP_CONFIG = {
    number: "",
    message: "Ciao! Vorrei prenotare un appuntamento da Luce Beauty Studio."
  };

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
      if (WHATSAPP_CONFIG.number) {
        var url =
          "https://wa.me/" +
          WHATSAPP_CONFIG.number +
          "?text=" +
          encodeURIComponent(message || WHATSAPP_CONFIG.message);
        window.open(url, "_blank", "noopener");
        return;
      }
      showToast(
        "Funzione dimostrativa — nessun messaggio verrà inviato. Nella versione reale questo pulsante apre WhatsApp."
      );
    }

    document.querySelectorAll("[data-whatsapp-cta]").forEach(function (button) {
      button.addEventListener("click", function () {
        openWhatsapp(button.getAttribute("data-whatsapp-message"));
      });
    });
  }

  /* ---------- Scroll reveal ---------- */
  function initScrollReveal() {
    var items = document.querySelectorAll("[data-reveal]");
    if (!items.length) return;

    if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    items.forEach(function (el) {
      observer.observe(el);
    });
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
