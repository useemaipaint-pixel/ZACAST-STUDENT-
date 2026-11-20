/* BOOT: waits for the cloud data to load, then loads the app scripts in order,
   then runs every DOMContentLoaded handler (they were registered after the
   real event had already fired, so we replay them ourselves). */
(function () {
  const queue = [];
  let booted = false;
  const docAdd = document.addEventListener.bind(document);
  const winAdd = window.addEventListener.bind(window);
  function wrap(fn) { return function (e) { try { return fn.call(this, e); } catch (err) { console.warn("[init]", err); } }; }
  document.addEventListener = function (t, fn, o) {
    if (t === "DOMContentLoaded") { if (!booted) queue.push(wrap(fn)); else setTimeout(wrap(fn), 0); return; }
    return docAdd(t, fn, o);
  };
  window.addEventListener = function (t, fn, o) {
    if (t === "DOMContentLoaded") { if (!booted) queue.push(wrap(fn)); else setTimeout(wrap(fn), 0); return; }
    return winAdd(t, fn, o);
  };
  function load(src) {
    return new Promise(function (resolve) {
      const s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = resolve;
      s.onerror = function () { console.error("Could not load", src); resolve(); };
      document.body.appendChild(s);
    });
  }
  const hydrate = Promise.race([
    window.ZacastStorage.ready,
    new Promise(function (r) { setTimeout(r, 7000); })   // never hang the app if the network is slow
  ]).catch(function () { });
  hydrate.then(async function () {
    for (const src of (window.ZACAST_SCRIPTS || [])) { await load(src); }
    booted = true;
    queue.forEach(function (fn) { fn.call(document, new Event("DOMContentLoaded")); });
  });
})();
