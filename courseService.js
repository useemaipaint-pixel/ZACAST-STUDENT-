/* ==========================================================================
   COURSE SERVICE
   ==========================================================================
   Course catalog: code, title, unit, department, level, semester, type,
   assigned lecturer. Maps to the "courses" table in DATABASE_SCHEMA.md.
   ========================================================================== */
window.CourseService = (function (storage) {
  const KEY = "courses";

  function getAll() {
    return storage.getJSON(KEY, []);
  }

  function saveAll(list) {
    return storage.setJSON(KEY, list);
  }

  function getByIndex(index) {
    return getAll()[index] || null;
  }

  function getByCode(code) {
    if (!code) return null;
    const target = String(code).trim().toLowerCase();
    return getAll().find(c => (c.code || "").toLowerCase() === target) || null;
  }

  function isCodeTaken(code, excludeIndex) {
    const target = String(code || "").trim().toLowerCase();
    if (!target) return false;
    const exclude = Number(excludeIndex);
    return getAll().some((c, i) => i !== exclude && (c.code || "").toLowerCase() === target);
  }

  function add(course) {
    const list = getAll();
    list.push(course);
    saveAll(list);
    return list.length - 1;
  }

  function updateAt(index, course) {
    const list = getAll();
    if (index < 0 || index >= list.length) return false;
    list[index] = course;
    saveAll(list);
    return true;
  }

  function removeAt(index) {
    const list = getAll();
    if (index < 0 || index >= list.length) return null;
    const [removed] = list.splice(index, 1);
    saveAll(list);
    return removed;
  }

  // department/level are optional; pass "All" or omit to skip a filter.
  function filter({ department, level } = {}) {
    return getAll().filter(c =>
      (!department || department === "All" || c.department === department) &&
      (!level || level === "All" || c.level === level)
    );
  }

  return { getAll, saveAll, getByIndex, getByCode, isCodeTaken, add, updateAt, removeAt, filter };

})(window.ZacastStorage);
