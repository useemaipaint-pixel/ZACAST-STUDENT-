/* ==========================================================================
   REACTION SERVICE
   ==========================================================================
   The "do you like this app" Love / Hate counters shown in the About
   section and the admin dashboard.
   ========================================================================== */
window.ReactionService = (function (storage) {
  const KEY = "appReactions";
  const DEFAULTS = { love: 0, hate: 0 };

  function get() {
    return storage.getJSON(KEY, { ...DEFAULTS });
  }

  function increment(type) {
    const reactions = get();
    if (!(type in reactions)) reactions[type] = 0;
    reactions[type]++;
    storage.setJSON(KEY, reactions);
    return reactions;
  }

  // Used by restore, which needs to set exact values from a backup file
  // rather than incrementing.
  function set(reactions) {
    storage.setJSON(KEY, reactions);
    return reactions;
  }

  return { get, increment, set };

})(window.ZacastStorage);
