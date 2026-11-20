/* ==========================================================================
   TIMETABLE SERVICE
   ==========================================================================
   Maps to the "timetable_entries" table in DATABASE_SCHEMA.md.
   ========================================================================== */
window.TimetableService = (function (storage) {
  const KEY = "timetableEntries";

  function getAll() {
    return storage.getJSON(KEY, []);
  }

  function saveAll(list) {
    return storage.setJSON(KEY, list);
  }

  function add(entry) {
    const list = getAll();
    entry.id = "tt_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    list.push(entry);
    saveAll(list);
    return entry;
  }

  function removeById(id) {
    const filtered = getAll().filter(e => e.id !== id);
    saveAll(filtered);
    return filtered;
  }

  function getById(id) {
    return getAll().find(e => e.id === id) || null;
  }

  function filter({ department, level } = {}) {
    return getAll().filter(e =>
      (!department || department === "All" || e.department === department) &&
      (!level || level === "All" || e.level === level)
    );
  }

  return { getAll, saveAll, add, removeById, getById, filter };

})(window.ZacastStorage);
