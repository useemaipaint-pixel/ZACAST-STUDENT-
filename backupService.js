/* BACKUP SERVICE - bundles ALL shared data (students, courses, results, attendance, ...).
   Staff login accounts are intentionally NOT included in backups. */
window.BackupService = (function (studentSvc, activitySvc, reactionSvc, commentSvc) {
  const EXTRA_KEYS = ["courses", "courseRegistrations", "results", "attendance", "announcements", "timetableEntries", "supportTickets"];
  function buildBundle() {
    const bundle = {
      students: studentSvc.getAll(),
      activities: activitySvc.getAll(),
      appReactions: reactionSvc.get(),
      publicComments: commentSvc.getAll()
    };
    EXTRA_KEYS.forEach(k => { bundle[k] = ZacastStorage.getJSON(k, []); });
    return bundle;
  }
  function validateBundle(data) { return !!(data && Array.isArray(data.students)); }
  function applyBundle(data) {
    if (!validateBundle(data)) return false;
    studentSvc.saveAll(data.students);
    if (Array.isArray(data.activities)) activitySvc.saveAll(data.activities);
    if (data.appReactions) reactionSvc.set(data.appReactions);
    if (Array.isArray(data.publicComments)) commentSvc.saveAll(data.publicComments);
    EXTRA_KEYS.forEach(k => { if (Array.isArray(data[k])) ZacastStorage.setJSON(k, data[k]); });
    return true;
  }
  return { buildBundle, validateBundle, applyBundle };
})(window.StudentService, window.ActivityService, window.ReactionService, window.CommentService);
