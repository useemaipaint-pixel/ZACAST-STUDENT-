/* ==========================================================================
   ACTIVITY SERVICE
   ==========================================================================
   The system activity log. Maps to the "audit_logs" table in
   DATABASE_SCHEMA.md. Keeps the most recent MAX_ENTRIES only, same
   cap the original app used.
   ========================================================================== */
window.ActivityService = (function (storage) {
  const KEY = "activities";
  const MAX_ENTRIES = 50;

  function getAll() {
    return storage.getJSON(KEY, []);
  }

  function saveAll(list) {
    return storage.setJSON(KEY, list);
  }

  function log(type, detail) {
    const list = getAll();
    list.push({ type, detail, time: new Date().toLocaleString() });
    if (list.length > MAX_ENTRIES) list.shift();
    saveAll(list);
    return list;
  }

  return { getAll, saveAll, log };

})(window.ZacastStorage);
