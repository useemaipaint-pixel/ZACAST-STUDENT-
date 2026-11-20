/* ==========================================================================
   NOTIFICATION CENTER SERVICE
   ==========================================================================
   Read/unread tracking for the notification center — separate from the
   toast system in script.js (showNotification), which is transient
   on-screen feedback and never persisted.

   Scope note: this app has no per-account login for admins, lecturers,
   or students individually (see AuthService's own note on the same
   limitation), so read-state is tracked per browser rather than per
   person. Good enough for a single shared front-desk workstation;
   Phase 4 (a real backend with per-user accounts) is what makes this
   genuinely per-person — see the "notifications" table in
   DATABASE_SCHEMA.md, which is already keyed by user_id for that.
   ========================================================================== */
window.NotificationCenterService = (function (storage) {
  const READ_KEY = "notificationReadIds";

  function getReadIds() {
    return storage.getJSON(READ_KEY, []);
  }

  function saveReadIds(ids) {
    return storage.setJSON(READ_KEY, ids);
  }

  function isRead(id) {
    return getReadIds().includes(id);
  }

  function markRead(id) {
    const ids = getReadIds();
    if (!ids.includes(id)) { ids.push(id); saveReadIds(ids); }
    return ids;
  }

  function markAllRead(ids) {
    const merged = Array.from(new Set([...getReadIds(), ...ids]));
    saveReadIds(merged);
    return merged;
  }

  return { getReadIds, isRead, markRead, markAllRead };

})(window.ZacastStorage);
