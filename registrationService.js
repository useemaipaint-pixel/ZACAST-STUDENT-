/* ==========================================================================
   REGISTRATION SERVICE
   ==========================================================================
   Which student registered for which course, in which session/semester.
   Maps to the "course_registrations" table in DATABASE_SCHEMA.md.
   ========================================================================== */
window.RegistrationService = (function (storage) {
  const KEY = "courseRegistrations";

  function getAll() {
    return storage.getJSON(KEY, []);
  }

  function saveAll(list) {
    return storage.setJSON(KEY, list);
  }

  function getByStudent(admission, session, semester) {
    const target = String(admission || "").trim().toLowerCase();
    return getAll().filter(r =>
      (r.studentAdmission || "").toLowerCase() === target &&
      (!session || r.session === session) &&
      (!semester || r.semester === semester)
    );
  }

  function isRegistered(admission, courseCode, session, semester) {
    const target = String(admission || "").trim().toLowerCase();
    return getAll().some(r =>
      (r.studentAdmission || "").toLowerCase() === target &&
      r.courseCode === courseCode && r.session === session && r.semester === semester
    );
  }

  function register(record) {
    const list = getAll();
    list.push(record);
    saveAll(list);
    return list;
  }

  function unregister(admission, courseCode, session, semester) {
    const target = String(admission || "").trim().toLowerCase();
    const filtered = getAll().filter(r => !(
      (r.studentAdmission || "").toLowerCase() === target &&
      r.courseCode === courseCode && r.session === session && r.semester === semester
    ));
    saveAll(filtered);
    return filtered;
  }

  return { getAll, saveAll, getByStudent, isRegistered, register, unregister };

})(window.ZacastStorage);
