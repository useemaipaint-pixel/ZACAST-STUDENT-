/* ==========================================================================
   AUTH SERVICE  (student session only)
   --------------------------------------------------------------------------
   Staff (Lecturer / Admin) accounts live in staff-auth.js inside the Staff
   app. This file only remembers which student is logged in on this device.
   ========================================================================== */
window.AuthService = (function (storage) {
  const SESSION_ACTIVE_KEY = "isUserWorkspaceActive";
  const SESSION_IDENTITY_KEY = "activeUserSessionIdentity";

  function getAccounts() { return []; }
  function saveAccounts() { return true; }
  function startSession(identity) {
    storage.setRaw(SESSION_ACTIVE_KEY, "true");
    storage.setRaw(SESSION_IDENTITY_KEY, identity);
  }
  function endSession() {
    storage.remove(SESSION_ACTIVE_KEY);
    storage.remove(SESSION_IDENTITY_KEY);
  }
  function getSession() {
    const active = storage.getRaw(SESSION_ACTIVE_KEY) === "true";
    const identity = storage.getRaw(SESSION_IDENTITY_KEY);
    return (active && identity) ? { identity } : null;
  }
  return { getAccounts, saveAccounts, startSession, endSession, getSession };
})(window.ZacastStorage);
