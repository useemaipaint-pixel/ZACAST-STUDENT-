/* ==========================================================================
   STORAGE ADAPTER  (cloud-synced)
   ==========================================================================
   Every service reads/writes through this file. Data lives in memory + this
   browser's localStorage (so the app is instant and works offline), and is
   mirrored to ONE shared Supabase table (zacast_kv) so the Student app and the
   Staff (Lecturer/Admin) app — which are two separate websites — see the same
   data.

   • No SUPABASE_URL / SUPABASE_KEY in config.js  ->  "local only" mode
     (exactly like the old single app; nothing leaves the browser).
   • List values (students, results, ...) are MERGED on upload (3-way diff),
     so two people adding different records at the same time don't erase each
     other.
   ========================================================================== */
window.ZacastStorage = (function () {
  const cfg = window.ZACAST_CONFIG || {};
  const BASE = String(cfg.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const APIKEY = String(cfg.SUPABASE_KEY || "").trim();
  const TABLE = cfg.TABLE || "zacast_kv";
  const cloud = !!(BASE && APIKEY && !/YOUR_|PASTE_/i.test(BASE + APIKEY));

  // Keys that stay on this device only (never uploaded).
  const LOCAL_ONLY = new Set(["notificationReadIds"]);
  const DIRTY_KEY = "zc:dirty";

  const store = new Map();   // key -> JSON string (current value)
  const base = new Map();    // key -> JSON string (last value known to be in the cloud)
  const blobMem = new Map();
  const dirty = new Set();
  const timers = new Map();
  let status = cloud ? "connecting" : "local";
  let lastPull = null;

  function setStatus(s) {
    if (status === s) return;
    status = s;
    window.dispatchEvent(new CustomEvent("zacast:status", { detail: s }));
  }
  function emitChange(keys) {
    window.dispatchEvent(new CustomEvent("zacast:data-changed", { detail: { keys } }));
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function saveDirty() { lsSet(DIRTY_KEY, JSON.stringify(Array.from(dirty))); }

  /* ---------- REST helpers ---------- */
  function headers(extra) {
    const h = { apikey: APIKEY, "Content-Type": "application/json" };
    if (!/^sb_/.test(APIKEY)) h.Authorization = "Bearer " + APIKEY; // legacy JWT anon keys
    return Object.assign(h, extra || {});
  }
  async function rest(method, query, body, extra) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), cfg.TIMEOUT_MS || 9000);
    try {
      const res = await fetch(`${BASE}/rest/v1/${TABLE}${query || ""}`, {
        method, headers: headers(extra), signal: ctl.signal,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      if (!res.ok) throw new Error(res.status + " " + (await res.text().catch(() => "")));
      const txt = await res.text();
      return txt ? JSON.parse(txt) : null;
    } finally { clearTimeout(timer); }
  }
  const enc = encodeURIComponent;
  async function fetchOne(key) {
    const rows = await rest("GET", `?select=key,value&key=eq.${enc(key)}`);
    return rows && rows[0] ? rows[0] : null;
  }
  function upsert(key, value) {
    return rest("POST", "?on_conflict=key", { key, value }, { Prefer: "resolution=merge-duplicates,return=minimal" });
  }

  /* ---------- 3-way merge for list values ---------- */
  function countMap(arr) {
    const m = new Map();
    arr.forEach(x => { const s = JSON.stringify(x); m.set(s, (m.get(s) || 0) + 1); });
    return m;
  }
  function merge3(baseArr, localArr, remoteArr) {
    const b = countMap(baseArr), l = countMap(localArr);
    const result = remoteArr.slice();
    const r = countMap(result);
    // removed locally -> remove from remote
    b.forEach((n, s) => {
      let remove = n - (l.get(s) || 0);
      for (let i = result.length - 1; i >= 0 && remove > 0; i--) {
        if (JSON.stringify(result[i]) === s) { result.splice(i, 1); remove--; r.set(s, (r.get(s) || 1) - 1); }
      }
    });
    // added locally -> add to remote if remote doesn't have them yet
    const seen = new Map();
    localArr.forEach(item => {
      const s = JSON.stringify(item);
      const added = (l.get(s) || 0) - (b.get(s) || 0);
      if (added <= 0) return;
      const done = seen.get(s) || 0;
      if (done >= added) return;
      seen.set(s, done + 1);
      if ((r.get(s) || 0) < (l.get(s) || 0)) { result.push(item); r.set(s, (r.get(s) || 0) + 1); }
    });
    return result;
  }

  async function pushKey(key) {
    if (!cloud) return;
    const localStr = store.get(key);
    try {
      if (localStr === undefined) {
        await rest("DELETE", `?key=eq.${enc(key)}`);
        base.delete(key);
      } else {
        const local = JSON.parse(localStr);
        let merged = local;
        if (Array.isArray(local)) {
          const remote = await fetchOne(key);
          if (remote && Array.isArray(remote.value)) {
            const baseArr = base.has(key) ? JSON.parse(base.get(key)) : [];
            merged = merge3(baseArr, local, remote.value);
          }
        }
        await upsert(key, merged);
        const s = JSON.stringify(merged);
        base.set(key, s);
        if (s !== localStr && store.get(key) === localStr) {
          store.set(key, s); lsSet(key, s); emitChange([key]);
        }
      }
      dirty.delete(key); saveDirty();
      setStatus("online");
    } catch (e) {
      console.warn("ZacastStorage: upload failed for", key, e.message || e);
      setStatus("offline");
      setTimeout(flush, 15000);
    }
  }
  function schedulePush(key) {
    if (!cloud || LOCAL_ONLY.has(key)) return;
    dirty.add(key); saveDirty();
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { timers.delete(key); pushKey(key); }, 350));
  }
  function flush() {
    if (!cloud) return Promise.resolve();
    return Promise.all(Array.from(dirty).map(k => pushKey(k)));
  }

  /* ---------- pull / hydrate ---------- */
  async function pull(initial) {
    if (!cloud) return;
    try {
      let q = `?select=key,value,updated_at&key=not.like.blob:*`;
      if (lastPull && !initial) q += `&updated_at=gt.${enc(lastPull)}`;
      const rows = (await rest("GET", q)) || [];
      const changed = [];
      rows.forEach(row => {
        if (!lastPull || row.updated_at > lastPull) lastPull = row.updated_at;
        if (LOCAL_ONLY.has(row.key)) return;
        const s = JSON.stringify(row.value);
        base.set(row.key, s);
        if (dirty.has(row.key)) return;          // we have newer local edits waiting to upload
        if (store.get(row.key) !== s) {
          store.set(row.key, s); lsSet(row.key, s); changed.push(row.key);
        }
      });
      setStatus("online");
      if (!initial && changed.length) emitChange(changed);
      return changed;
    } catch (e) {
      console.warn("ZacastStorage: sync failed", e.message || e);
      setStatus("offline");
    }
  }

  const ready = (async function init() {
    try { JSON.parse(lsGet(DIRTY_KEY) || "[]").forEach(k => dirty.add(k)); } catch (e) { }
    // warm the memory cache from localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !k.startsWith("zc:") && !k.startsWith("blob:")) store.set(k, localStorage.getItem(k));
      }
    } catch (e) { }
    if (!cloud) return;
    await pull(true);
    // First run / offline edits: push anything the cloud doesn't have yet.
    const remoteKeys = new Set(base.keys());
    store.forEach((v, k) => { if (!remoteKeys.has(k) && isDataKey(k)) dirty.add(k); });
    saveDirty();
    flush();
    setInterval(() => pull(false), cfg.SYNC_SECONDS ? cfg.SYNC_SECONDS * 1000 : 15000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { flush(); pull(false); } });
    window.addEventListener("online", () => { flush(); pull(false); });
  })();

  // Only keys that are real shared data (services) get seeded to the cloud.
  const DATA_KEYS = ["students", "activities", "reactions", "comments", "courses", "courseRegistrations", "results",
    "attendance", "announcements", "timetableEntries", "supportTickets", "staffAccounts", "lecturerPermissions", "appReactions", "publicComments"];
  function isDataKey(k) { return DATA_KEYS.includes(k); }

  /* ---------- public API (same shape as before) ---------- */
  function getJSON(key, fallback) {
    try {
      const raw = store.has(key) ? store.get(key) : lsGet(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { console.error(`ZacastStorage: could not parse "${key}"`, e); return fallback; }
  }
  function setJSON(key, value) {
    try {
      const s = JSON.stringify(value);
      store.set(key, s);
      if (!lsSet(key, s)) console.warn(`ZacastStorage: browser storage full — "${key}" kept in memory/cloud only.`);
      schedulePush(key);
      return true;
    } catch (e) { console.error(`ZacastStorage: could not save "${key}".`, e); return false; }
  }
  function getRaw(key) { return lsGet(key); }
  function setRaw(key, value) { return lsSet(key, value); }
  function remove(key) { lsDel(key); }

  /* Large binary-ish values (department paper images): not preloaded, fetched on demand. */
  async function getBlob(key) {
    if (blobMem.has(key)) return blobMem.get(key);
    let val = null;
    if (cloud) {
      try { const row = await fetchOne("blob:" + key); val = row ? row.value : null; setStatus("online"); }
      catch (e) { setStatus("offline"); try { val = JSON.parse(lsGet("blob:" + key) || "null"); } catch (x) { } }
    } else {
      try { val = JSON.parse(lsGet("blob:" + key) || "null"); } catch (e) { }
    }
    blobMem.set(key, val);
    return val;
  }
  async function setBlob(key, val) {
    if (cloud) { await upsert("blob:" + key, val); setStatus("online"); }
    if (!lsSet("blob:" + key, JSON.stringify(val)) && !cloud) throw new Error("Browser storage is full — connect the cloud database (config.js) to store more papers.");
    blobMem.set(key, val);
    return true;
  }

  return {
    getJSON, setJSON, getRaw, setRaw, remove, getBlob, setBlob, flush, ready,
    sync: () => pull(false),
    get cloud() { return cloud; },
    get status() { return status; }
  };
})();
