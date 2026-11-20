/* ==========================================================================
   ATTENDANCE SERVICE
   ==========================================================================
   One record per student + course + date. Maps to the "attendance"
   table in DATABASE_SCHEMA.md.
   ========================================================================== */
window.AttendanceService = (function (storage) {
  const KEY = "attendance";

  function getAll() {
    return storage.getJSON(KEY, []);
  }

  function saveAll(list) {
    return storage.setJSON(KEY, list);
  }

  function getByStudent(admission, courseCode) {
    const target = String(admission || "").trim().toLowerCase();
    return getAll().filter(a =>
      (a.studentAdmission || "").toLowerCase() === target &&
      (!courseCode || a.courseCode === courseCode)
    );
  }

  function getByCourseDate(courseCode, date) {
    return getAll().filter(a => a.courseCode === courseCode && a.date === date);
  }

  // Marks (or re-marks, if already marked for that course+date) one
  // student's attendance.
  function mark(record) {
    const list = getAll();
    const idx = list.findIndex(a =>
      (a.studentAdmission || "").toLowerCase() === (record.studentAdmission || "").toLowerCase() &&
      a.courseCode === record.courseCode && a.date === record.date
    );
    if (idx === -1) { list.push(record); } else { list[idx] = { ...list[idx], ...record }; }
    saveAll(list);
    return list;
  }

  function markBulk(records) {
    records.forEach(r => mark(r));
    return getAll();
  }

  // Late counts as "attended" for the percentage (the student was
  // present, just late) but is still reported separately in the count.
  function computeStats(admission, courseCode) {
    const records = getByStudent(admission, courseCode);
    const total = records.length;
    const present = records.filter(r => r.status === "Present").length;
    const absent = records.filter(r => r.status === "Absent").length;
    const late = records.filter(r => r.status === "Late").length;
    const percentage = total > 0 ? ((present + late) / total) * 100 : 0;
    return { total, present, absent, late, percentage };
  }

  return { getAll, saveAll, getByStudent, getByCourseDate, mark, markBulk, computeStats };

})(window.ZacastStorage);
