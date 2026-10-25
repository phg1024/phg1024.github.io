/*
 * Shared Google Analytics 4 loader.
 *
 * Used by the Eleventy pages (via src/_includes/analytics.njk, which passes the
 * ID from src/_data/site.js) and by the standalone project apps under
 * src/projects/*, which are plain static files and therefore fall back to GA_ID
 * below. If you ever swap GA4 properties, change GA_ID here and
 * site.analytics.ga4 in src/_data/site.js — or just pass data-ga-id everywhere.
 *
 * Usage:
 *   <script async src="/js/ga.js"></script>
 *   <script async src="/js/ga.js" data-ga-id="G-XXXX" data-consent="1"></script>
 */
(function () {
  "use strict";

  var GA_ID = "G-D20F5RT2LN";

  // Count people, not previews or test runs. Local dev servers (eleventy --serve, any
  // localhost port, LAN addresses), pages opened from disk, and automated browsers
  // (Puppeteer, Playwright, Selenium set navigator.webdriver) used to send page views to the
  // live property: a day of headless layout tests became several hundred localhost visits.
  var host = location.hostname;
  var local = location.protocol === "file:" ||
    host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" ||
    host === "0.0.0.0" || host === "" || /\.local$/.test(host) ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if (local || navigator.webdriver) return;

  var script = document.currentScript || document.querySelector("script[src*='/js/ga.js']");
  var id = (script && script.getAttribute("data-ga-id")) || GA_ID;
  if (!id) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  window.gtag = gtag;

  // Consent Mode v2: start denied and let a CMP grant what the user allowed.
  if (script && script.getAttribute("data-consent") === "1") {
    gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      wait_for_update: 500
    });
  }

  gtag("js", new Date());
  gtag("config", id);

  // Load the gtag.js library; it replays everything queued in dataLayer.
  var tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  (document.head || document.documentElement).appendChild(tag);
})();
