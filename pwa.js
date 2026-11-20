/* PWA: service worker + "Install App" button that works in every browser. */
(function () {
  let deferred = null;
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("SW failed", e); });
    });
  }

  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; refresh(); });
  window.addEventListener("appinstalled", function () { deferred = null; refresh(); });

  function refresh() {
    document.querySelectorAll(".pwa-install-btn").forEach(function (b) { b.style.display = isStandalone() ? "none" : ""; });
  }

  function help() {
    const ua = navigator.userAgent || "";
    const ios = /iphone|ipad|ipod/i.test(ua);
    const ff = /firefox/i.test(ua);
    let steps;
    if (ios) steps = "Tap the <b>Share</b> button (square with arrow) in Safari, then choose <b>Add to Home Screen</b>.";
    else if (ff) steps = "Open the browser menu (⋮) and tap <b>Install</b> / <b>Add to Home screen</b>.";
    else steps = "Open the browser menu (⋮ or ⋯) and choose <b>Install app</b> or <b>Add to Home screen</b>. On desktop Chrome/Edge look for the install icon in the address bar.";
    const el = document.getElementById("installHelpModal");
    if (el) { el.querySelector(".install-steps").innerHTML = steps; el.style.display = "flex"; }
    else alert(steps.replace(/<[^>]+>/g, ""));
  }

  window.installZacastApp = async function () {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { }
      deferred = null; refresh();
    } else help();
  };
  document.addEventListener("DOMContentLoaded", refresh);
})();
