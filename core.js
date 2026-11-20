/* ==========================================================================
   CORE HELPERS shared by both apps (loaded after script.js)
   ========================================================================== */
window.ZacastImage = {
  // Shrinks a photo so it stays small enough to sync (about 20-40 KB).
  compress: function (file, maxSide, quality) {
    maxSide = maxSide || 420; quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        const img = new Image();
        img.onerror = reject;
        img.onload = function () {
          const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * ratio); c.height = Math.round(img.height * ratio);
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
};

// Where the ID-card QR code points (the Student app's public verify page).
window.ZACAST_VERIFY_BASE = function () {
  const c = window.ZACAST_CONFIG || {};
  return String(c.STUDENT_APP_URL || (location.origin + location.pathname)).replace(/[?#].*$/, "");
};

// Announcements this person is allowed to see.
window.visibleAnnouncements = function () {
  if (window.ZacastApp && typeof ZacastApp.visibleAnnouncements === "function") return ZacastApp.visibleAnnouncements();
  return AnnouncementService.getAll().filter(AnnouncementService.isPublished);
};

// Fresh data arrived from the cloud (another phone/computer changed something).
window.addEventListener("zacast:data-changed", function () {
  try {
    students = StudentService.getAll();
    activities = ActivityService.getAll();
    appReactions = ReactionService.get();
    publicComments = CommentService.getAll();
  } catch (e) { }
  if (window.ZacastApp && typeof ZacastApp.refreshViews === "function") {
    try { ZacastApp.refreshViews(); } catch (e) { console.warn(e); }
  }
  try { updateNotificationBadge(); } catch (e) { }
});

// Little cloud-status pill (Connected / Offline / Local only)
(function () {
  function paint() {
    const el = document.getElementById("cloudStatusPill");
    if (!el) return;
    const s = ZacastStorage.status;
    const map = {
      online: ["fa-cloud-check", "Cloud synced", "ok"],
      connecting: ["fa-cloud-arrow-up", "Connecting…", "wait"],
      offline: ["fa-cloud-bolt", "Offline — will sync", "bad"],
      local: ["fa-hard-drive", "Local only (no cloud set)", "wait"]
    };
    const m = map[s] || map.local;
    el.className = "cloud-pill " + m[2];
    el.innerHTML = `<i class="fas ${m[0]}"></i><span>${m[1]}</span>`;
  }
  window.addEventListener("zacast:status", paint);
  document.addEventListener("DOMContentLoaded", paint);
})();
