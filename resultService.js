/* ==========================================================================
   RESULT SERVICE
   ==========================================================================
   CA/exam scores, grading, and GPA/CGPA calculation. Maps to the
   "results" table in DATABASE_SCHEMA.md. GPA/CGPA are deliberately
   NOT stored anywhere — they're always computed fresh from published
   results + course units, so they can never go stale.

   Grading scale used (standard 5-point Nigerian polytechnic scale):
     70-100 -> A (5.0)   60-69 -> B (4.0)   50-59 -> C (3.0)
     45-49  -> D (2.0)   40-44 -> E (1.0)   0-39  -> F (0.0)
   ========================================================================== */
window.ResultService = (function (storage) {
  const KEY = "results";

  const GRADE_SCALE = [
    { min: 70, grade: "A", point: 5.0 },
    { min: 60, grade: "B", point: 4.0 },
    { min: 50, grade: "C", point: 3.0 },
    { min: 45, grade: "D", point: 2.0 },
    { min: 40, grade: "E", point: 1.0 },
    { min: 0,  grade: "F", point: 0.0 }
  ];

  function computeGrade(total) {
    const score = Number(total) || 0;
    const band = GRADE_SCALE.find(b => score >= b.min) || GRADE_SCALE[GRADE_SCALE.length - 1];
    return { grade: band.grade, gradePoint: band.point };
  }

  function getAll() {
    return storage.getJSON(KEY, []);
  }

  function saveAll(list) {
    return storage.setJSON(KEY, list);
  }

  function getByStudent(admission) {
    const target = String(admission || "").trim().toLowerCase();
    return getAll().filter(r => (r.studentAdmission || "").toLowerCase() === target);
  }

  // Creates a new result, or updates the existing one for the same
  // student + course + session + semester (so re-saving corrects a
  // typo instead of creating a duplicate row).
  function upsert(record) {
    const list = getAll();
    const idx = list.findIndex(r =>
      (r.studentAdmission || "").toLowerCase() === (record.studentAdmission || "").toLowerCase() &&
      r.courseCode === record.courseCode &&
      r.session === record.session &&
      r.semester === record.semester
    );
    if (idx === -1) { list.push(record); } else { list[idx] = { ...list[idx], ...record }; }
    saveAll(list);
    return list;
  }

  function publishForStudent(admission) {
    const target = String(admission || "").trim().toLowerCase();
    const list = getAll();
    list.forEach(r => { if ((r.studentAdmission || "").toLowerCase() === target) r.published = true; });
    saveAll(list);
    return list;
  }

  // Weighted average: sum(gradePoint * unit) / sum(unit). Only counts
  // published results. Pass session+semester for a single-semester GPA,
  // or omit both for the CGPA across everything published.
  function computeGpa(results, courses, { session, semester } = {}) {
    let totalPoints = 0;
    let totalUnits = 0;
    results
      .filter(r => r.published && (!session || r.session === session) && (!semester || r.semester === semester))
      .forEach(r => {
        const course = courses.find(c => c.code === r.courseCode);
        const unit = course ? Number(course.unit) || 0 : 0;
        totalPoints += (Number(r.gradePoint) || 0) * unit;
        totalUnits += unit;
      });
    return totalUnits > 0 ? (totalPoints / totalUnits) : 0;
  }

  return { getAll, saveAll, getByStudent, upsert, publishForStudent, computeGrade, computeGpa, GRADE_SCALE };

})(window.ZacastStorage);
