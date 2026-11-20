/* ==========================================================================
   COMMENT SERVICE
   ==========================================================================
   The public comment wall on the About page. This is app-level guestbook
   content rather than one of the core academic tables, so it isn't in
   DATABASE_SCHEMA.md's main table list — if you want it in MySQL later,
   a simple `public_comments(id, name, text, created_at)` table covers it.
   ========================================================================== */
window.CommentService = (function (storage) {
  const KEY = "publicComments";

  function getAll() {
    return storage.getJSON(KEY, []);
  }

  function saveAll(list) {
    return storage.setJSON(KEY, list);
  }

  function add(comment) {
    const list = getAll();
    list.push(comment);
    saveAll(list);
    return list;
  }

  return { getAll, saveAll, add };

})(window.ZacastStorage);
