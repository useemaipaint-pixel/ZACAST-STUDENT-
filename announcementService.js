/* ==========================================================================
   ANNOUNCEMENT SERVICE
   ==========================================================================
   Maps to the "announcements" table in DATABASE_SCHEMA.md. Scheduling
   is done by comparing publishAt (an ISO datetime, optional) against
   "now" at read time — nothing needs a background job to "publish" an
   announcement, it just becomes visible once its time passes.
   ========================================================================== */
window.AnnouncementService = (function (storage) {
  const KEY = "announcements";

  function getAll() {
    return storage.getJSON(KEY, []);
  }

  function saveAll(list) {
    return storage.setJSON(KEY, list);
  }

  function add(announcement) {
    const list = getAll();
    announcement.id = "ann_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    list.push(announcement);
    saveAll(list);
    return announcement;
  }

  function updateById(id, updated) {
    const list = getAll();
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) return false;
    list[idx] = { ...list[idx], ...updated, id };
    saveAll(list);
    return true;
  }

  function removeById(id) {
    const filtered = getAll().filter(a => a.id !== id);
    saveAll(filtered);
    return filtered;
  }

  function getById(id) {
    return getAll().find(a => a.id === id) || null;
  }

  // No publishAt = published immediately. A future publishAt means
  // "scheduled" until that moment passes.
  function isPublished(announcement) {
    if (!announcement.publishAt) return true;
    return new Date(announcement.publishAt).getTime() <= Date.now();
  }

  // Published announcements relevant to a viewer: "All" always matches;
  // "Students"/"Lecturers" match by role; "Department" matches only if
  // department equals the viewer's own department.
  function getRelevantFor({ role, department } = {}) {
    return getAll()
      .filter(isPublished)
      .filter(a => {
        if (a.audience === "All") return true;
        if (a.audience === "Students") return role === "student" || !role;
        if (a.audience === "Lecturers") return role === "lecturer";
        if (a.audience === "Department") return !!department && a.department === department;
        return true;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  return { getAll, saveAll, add, updateById, removeById, getById, isPublished, getRelevantFor };

})(window.ZacastStorage);
