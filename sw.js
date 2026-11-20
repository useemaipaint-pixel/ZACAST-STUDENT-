/* ZACAST student service worker — makes the app installable and usable offline. */
const CACHE = "zacast-student-v3";
const CORE = ["./", "index.html", "config.js", "style.css", "extra.css", "design-biolink.css", "logo.png", "zacast-logo.png", "icon-192.png", "manifest.webmanifest", "academics.js", "announcements.js", "attendance.js", "boot.js", "core.js", "documents.js", "papers.js", "pwa.js", "script.js", "student-app.js", "support.js", "timetable.js", "verification.js", "activityService.js", "announcementService.js", "attendanceService.js", "authService.js", "backupService.js", "commentService.js", "courseService.js", "notificationCenterService.js", "reactionService.js", "registrationService.js", "resultService.js", "storageAdapter.js", "studentService.js", "supportTicketService.js", "timetableService.js"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("zacast-student") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in") || url.pathname.includes("/rest/v1/")) return;   // never cache database calls
  if (url.origin === location.origin) {                       // our own files: network first, cache when offline
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
  } else {                                                     // libraries/fonts from CDNs: cache first
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res; })));
  }
});
