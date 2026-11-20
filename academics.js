/* ==========================================================================
   ACADEMICS MODULE
   Courses, Course Registration, Results, GPA/CGPA.
   Loaded after script.js, so it can reuse deptData, students,
   StudentService, showNotification and logActivity that script.js
   already defines in the shared top-level scope.

   Simplification for this phase: there's no session/semester manager
   yet (that's timetable/session UI, a later module), so registration
   and results are tracked against one active session/semester below.
   Changing it here changes it everywhere in this file.
   ========================================================================== */

const DEFAULT_SESSION = "2025/2026";
const DEFAULT_SEMESTER = "First";

document.addEventListener("DOMContentLoaded", function () {
  populateCourseDepartmentDropdowns();
  renderCoursesList();
  populateResultCourseDropdown();
});

function populateCourseDepartmentDropdowns() {
  const deptNames = Object.keys(typeof deptData !== "undefined" ? deptData : {});
  ["courseDeptFilter", "courseDepartment"].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    while (select.options.length > 1) select.remove(1);
    deptNames.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name; opt.textContent = name;
      select.appendChild(opt);
    });
  });
}

/* ==========================================================================
   COURSE MANAGEMENT (admin)
   ========================================================================== */
function resetCourseForm() {
  document.getElementById("courseEditIndex").value = "";
  document.getElementById("courseFormTitle").textContent = "Add New Course";
  ["courseCode", "courseTitle", "courseUnit", "courseLecturer"].forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("courseDepartment").value = "";
  document.getElementById("courseLevel").value = "";
  document.getElementById("courseSemester").value = "";
  document.getElementById("courseType").value = "Compulsory";
}

function saveCourse() {
  const editIndex = document.getElementById("courseEditIndex").value;
  const code = document.getElementById("courseCode").value.trim().toUpperCase();
  const title = document.getElementById("courseTitle").value.trim();
  const unit = document.getElementById("courseUnit").value;
  const department = document.getElementById("courseDepartment").value;
  const level = document.getElementById("courseLevel").value;
  const semester = document.getElementById("courseSemester").value;
  const type = document.getElementById("courseType").value;
  const lecturer = document.getElementById("courseLecturer").value.trim();

  if (!code || !title || !unit || !department || !level || !semester) {
    showNotification("Please fill in course code, title, unit, department, level and semester.", "warning");
    return;
  }

  const excludeIndex = editIndex === "" ? -1 : Number(editIndex);
  if (CourseService.isCodeTaken(code, excludeIndex)) {
    showNotification(`Course code ${code} is already in use.`, "error");
    return;
  }

  const record = { code, title, unit: Number(unit), department, level, semester, type, lecturer };

  if (editIndex === "") {
    CourseService.add(record);
    logActivity("Course Added", `${code} — ${title}`);
    showNotification("Course added successfully", "success");
  } else {
    CourseService.updateAt(Number(editIndex), record);
    logActivity("Course Updated", `${code} — ${title}`);
    showNotification("Course updated successfully", "success");
  }

  resetCourseForm();
  renderCoursesList();
  populateResultCourseDropdown();
}

function editCourse(index) {
  const course = CourseService.getByIndex(index);
  if (!course) return;
  document.getElementById("courseEditIndex").value = index;
  document.getElementById("courseFormTitle").textContent = "Edit Course";
  document.getElementById("courseCode").value = course.code;
  document.getElementById("courseTitle").value = course.title;
  document.getElementById("courseUnit").value = course.unit;
  document.getElementById("courseDepartment").value = course.department;
  document.getElementById("courseLevel").value = course.level;
  document.getElementById("courseSemester").value = course.semester;
  document.getElementById("courseType").value = course.type;
  document.getElementById("courseLecturer").value = course.lecturer || "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteCourse(index) {
  const course = CourseService.getByIndex(index);
  if (!course) return;
  if (!window.confirm(`Delete ${course.code} — ${course.title}? This cannot be undone.`)) return;
  CourseService.removeAt(index);
  logActivity("Course Deleted", `${course.code} — ${course.title}`);
  showNotification("Course deleted", "success");
  renderCoursesList();
  populateResultCourseDropdown();
}

function renderCoursesList() {
  const container = document.getElementById("coursesListContainer");
  if (!container) return;

  const deptFilter = document.getElementById("courseDeptFilter")?.value || "All";
  const levelFilter = document.getElementById("courseLevelFilter")?.value || "All";
  const courses = CourseService.filter({ department: deptFilter, level: levelFilter });
  const allCourses = CourseService.getAll();

  container.innerHTML = "";
  if (!courses.length) {
    container.innerHTML = `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px; margin:15px 0;">
      <i class="fas fa-book" style="font-size:24px; color:var(--accent-color,#3fdd33);"></i>
      <p style="margin-top:8px;">No courses found for this filter yet.</p>
    </div>`;
    return;
  }

  courses.forEach(course => {
    const actualIndex = allCourses.indexOf(course);
    const div = document.createElement("div");
    div.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; background:#005a33; border-radius:8px; padding:12px 16px; margin-top:8px; flex-wrap:wrap;";
    div.innerHTML = `
      <div>
        <h4 style="margin:0; color:#eee;">${course.code} — ${course.title}</h4>
        <small style="color:#b9dcc6;">${course.department} · ${course.level} · ${course.semester} Semester · ${course.unit} Unit(s) · ${course.type}${course.lecturer ? " · " + course.lecturer : ""}</small>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="action-btn btn-edit" onclick="editCourse(${actualIndex})" aria-label="Edit ${course.code}"><i class="fas fa-edit"></i></button>
        <button class="action-btn" data-admin="1" style="background:#c0392b;" onclick="deleteCourse(${actualIndex})" aria-label="Delete ${course.code}"><i class="fas fa-trash"></i></button>
      </div>
    `;
    container.appendChild(div);
  });
}

/* ==========================================================================
   COURSE REGISTRATION (student)
   ========================================================================== */
function loadCourseRegistrationForStudent() {
  const admission = document.getElementById("regStudentAdmission").value.trim();
  const workspace = document.getElementById("courseRegistrationWorkspace");
  if (!admission) { showNotification("Please enter your admission number.", "warning"); return; }

  const student = StudentService.getByAdmission(admission);
  if (!student) { showNotification("No student found with that admission number.", "error"); workspace.innerHTML = ""; return; }

  const availableCourses = CourseService.filter({ department: student.department, level: student.level });
  const alreadyRegistered = RegistrationService.getByStudent(admission, DEFAULT_SESSION, DEFAULT_SEMESTER).map(r => r.courseCode);

  if (!availableCourses.length) {
    workspace.innerHTML = `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px; margin:15px 0;">
      <i class="fas fa-circle-info" style="font-size:24px; color:var(--accent-color,#3fdd33);"></i>
      <p style="margin-top:8px;">No courses have been set up yet for ${student.department}, ${student.level}. Ask admin to add courses first.</p>
    </div>`;
    return;
  }

  workspace.innerHTML = `
    <div class="card">
      <h2>${student.name}</h2>
      <p>${student.department} · ${student.level} · ${DEFAULT_SESSION} · ${DEFAULT_SEMESTER} Semester</p>
    </div>
    <h3 style="margin-top:20px; color:var(--accent-color,#3fdd33);">Available Courses</h3>
    <div id="availableCoursesList"></div>
    <div style="margin-top:15px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <span id="registeredUnitsSummary" style="font-weight:bold; color:var(--accent-color,#3fdd33);"></span>
      <button class="submitBtn" style="width:auto; padding:12px 24px;" onclick="submitCourseRegistration('${student.admission}')"><i class="fas fa-paper-plane"></i> Submit Registration</button>
    </div>
    <div id="registrationSlipContainer" style="margin-top:20px;"></div>
  `;

  const listEl = document.getElementById("availableCoursesList");
  availableCourses.forEach(course => {
    const isChecked = alreadyRegistered.includes(course.code);
    const isCompulsory = course.type === "Compulsory";
    const row = document.createElement("label");
    row.style.cssText = "display:flex; align-items:center; gap:10px; background:#006a3c; padding:12px; border-radius:6px; margin-top:8px; cursor:pointer;";
    row.innerHTML = `
      <input type="checkbox" class="course-reg-checkbox" value="${course.code}" data-units="${course.unit}"
        ${isChecked || isCompulsory ? "checked" : ""} ${isCompulsory ? "disabled" : ""}
        onchange="updateRegisteredUnitsSummary()">
      <div>
        <strong>${course.code}</strong> — ${course.title}
        <div style="font-size:11px; color:#b9dcc6;">${course.unit} Unit(s) · ${course.type}${isCompulsory ? " (auto-selected)" : ""}</div>
      </div>
    `;
    listEl.appendChild(row);
  });

  updateRegisteredUnitsSummary();
}

function updateRegisteredUnitsSummary() {
  const checkboxes = document.querySelectorAll(".course-reg-checkbox:checked");
  let totalUnits = 0;
  checkboxes.forEach(cb => { totalUnits += Number(cb.dataset.units) || 0; });
  const summary = document.getElementById("registeredUnitsSummary");
  if (summary) summary.textContent = `${checkboxes.length} course(s) selected · ${totalUnits} total unit(s)`;
}

function submitCourseRegistration(admission) {
  const checkboxes = document.querySelectorAll(".course-reg-checkbox:checked");
  if (!checkboxes.length) { showNotification("Please select at least one course.", "warning"); return; }

  let registeredCount = 0;
  checkboxes.forEach(cb => {
    const courseCode = cb.value;
    if (!RegistrationService.isRegistered(admission, courseCode, DEFAULT_SESSION, DEFAULT_SEMESTER)) {
      RegistrationService.register({
        studentAdmission: admission,
        courseCode,
        session: DEFAULT_SESSION,
        semester: DEFAULT_SEMESTER,
        registeredAt: new Date().toLocaleString()
      });
      registeredCount++;
    }
  });

  logActivity("Course Registration", `${admission} registered ${registeredCount} new course(s) for ${DEFAULT_SESSION} ${DEFAULT_SEMESTER} Semester.`);
  showNotification("Course registration submitted successfully", "success");
  renderRegistrationSlip(admission);
}

function renderRegistrationSlip(admission) {
  const student = StudentService.getByAdmission(admission);
  const registrations = RegistrationService.getByStudent(admission, DEFAULT_SESSION, DEFAULT_SEMESTER);
  const courses = CourseService.getAll();
  const container = document.getElementById("registrationSlipContainer");
  if (!container || !student) return;

  let totalUnits = 0;
  const rows = registrations.map(reg => {
    const course = courses.find(c => c.code === reg.courseCode);
    const unit = course ? course.unit : 0;
    totalUnits += unit;
    return `<tr><td style="padding:6px 0;">${reg.courseCode}</td><td>${course ? course.title : "—"}</td><td>${unit}</td></tr>`;
  }).join("");

  container.innerHTML = `
    <div class="card" id="printableRegistrationSlip">
      <h2>Course Registration Slip</h2>
      <p><b>Name:</b> ${student.name} &nbsp; <b>Admission No:</b> ${student.admission}</p>
      <p><b>Department:</b> ${student.department} &nbsp; <b>Level:</b> ${student.level}</p>
      <p><b>Session:</b> ${DEFAULT_SESSION} &nbsp; <b>Semester:</b> ${DEFAULT_SEMESTER}</p>
      <table style="width:100%; margin-top:10px; border-collapse:collapse;">
        <thead><tr style="text-align:left; border-bottom:1px solid var(--accent-color,#3fdd33);"><th>Code</th><th>Title</th><th>Unit</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:10px;"><b>Total Registered Units:</b> ${totalUnits}</p>
    </div>
    <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
      <button class="action-btn btn-pdf" onclick="downloadRegistrationSlipPDF()"><i class="fas fa-file-pdf"></i> Download PDF</button>
      <button class="action-btn btn-print" onclick="window.print()"><i class="fas fa-print"></i> Print</button>
    </div>
  `;
}

function downloadRegistrationSlipPDF() {
  const el = document.getElementById("printableRegistrationSlip");
  if (!el || typeof exportHTMLToPDF === "undefined") { showNotification("PDF export isn't available right now.", "error"); return; }
  showNotification("Generating PDF...", "info");
  exportHTMLToPDF(el, "Course_Registration_Slip.pdf", { orientation: "portrait", width: 800 })
    .then(() => showNotification("PDF generated successfully", "success"))
    .catch(() => showNotification("Something went wrong generating the PDF", "error"));
}

/* ==========================================================================
   RESULTS (admin)
   ========================================================================== */
function populateResultCourseDropdown() {
  const select = document.getElementById("resultCourseSelect");
  if (!select) return;
  const courses = CourseService.getAll();
  select.innerHTML = `<option value="">Select Course</option>` +
    courses.map(c => `<option value="${c.code}">${c.code} — ${c.title}</option>`).join("");
}

function saveResultEntry() {
  const admission = document.getElementById("resultAdmission").value.trim();
  const courseCode = document.getElementById("resultCourseSelect").value;
  const ca = Number(document.getElementById("resultCA").value);
  const exam = Number(document.getElementById("resultExam").value);

  if (!admission || !courseCode) { showNotification("Please enter an admission number and select a course.", "warning"); return; }
  const student = StudentService.getByAdmission(admission);
  if (!student) { showNotification("No student found with that admission number.", "error"); return; }
  if (isNaN(ca) || isNaN(exam) || ca < 0 || exam < 0) { showNotification("Please enter valid CA and Exam scores.", "warning"); return; }

  const total = ca + exam;
  const { grade, gradePoint } = ResultService.computeGrade(total);

  ResultService.upsert({
    studentAdmission: admission,
    courseCode,
    session: DEFAULT_SESSION,
    semester: DEFAULT_SEMESTER,
    caScore: ca,
    examScore: exam,
    total,
    grade,
    gradePoint,
    published: false,
    enteredAt: new Date().toLocaleString()
  });

  document.getElementById("resultPreviewText").textContent =
    `Total: ${total} · Grade: ${grade} · Grade Point: ${gradePoint.toFixed(2)} (saved as draft — not yet published)`;
  logActivity("Result Entry", `${admission} — ${courseCode}: ${total} (${grade})`);
  showNotification("Result saved successfully", "success");

  document.getElementById("resultCA").value = "";
  document.getElementById("resultExam").value = "";
}

function renderStudentResultsTable() {
  const admission = document.getElementById("resultLookupAdmission").value.trim();
  const container = document.getElementById("resultsTableContainer");
  if (!admission) { showNotification("Please enter an admission number.", "warning"); return; }

  const results = ResultService.getByStudent(admission);
  const courses = CourseService.getAll();

  if (!results.length) {
    container.innerHTML = `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px;">
      <i class="fas fa-file-circle-question" style="font-size:24px; color:var(--accent-color,#3fdd33);"></i>
      <p style="margin-top:8px;">No results entered for this student yet.</p>
    </div>`;
    return;
  }

  const rows = results.map(r => {
    const course = courses.find(c => c.code === r.courseCode);
    return `<tr>
      <td style="padding:6px 0;">${r.courseCode}</td>
      <td>${course ? course.title : "—"}</td>
      <td>${r.caScore}</td>
      <td>${r.examScore}</td>
      <td>${r.total}</td>
      <td>${r.grade}</td>
      <td>${r.published ? '<span style="color:#4CAF50;"><i class="fas fa-circle-check"></i> Published</span>' : '<span style="color:#f39c12;"><i class="fas fa-clock"></i> Draft</span>'}</td>
    </tr>`;
  }).join("");

  container.innerHTML = `
    <table style="width:100%; border-collapse:collapse;">
      <thead><tr style="text-align:left; border-bottom:1px solid var(--accent-color,#3fdd33);">
        <th>Code</th><th>Title</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th><th>Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function publishStudentResults() {
  const admission = document.getElementById("resultLookupAdmission").value.trim();
  if (!admission) { showNotification("Please enter an admission number first.", "warning"); return; }
  const student = StudentService.getByAdmission(admission);
  if (!student) { showNotification("No student found with that admission number.", "error"); return; }

  if (!window.confirm(`Publish all results for ${student.name} (${admission})? Students will be able to see them.`)) return;

  ResultService.publishForStudent(admission);
  logActivity("Results Published", `Published results for ${admission}`);
  showNotification("Results published successfully", "success");
  renderStudentResultsTable();
}

/* ==========================================================================
   GPA / CGPA (student)
   ========================================================================== */
function renderGpaDashboard() {
  const admission = document.getElementById("gpaLookupAdmission").value.trim();
  const container = document.getElementById("gpaDashboardContent");
  if (!admission) { showNotification("Please enter your admission number.", "warning"); return; }

  const student = StudentService.getByAdmission(admission);
  if (!student) { showNotification("No student found with that admission number.", "error"); container.innerHTML = ""; return; }

  const results = ResultService.getByStudent(admission).filter(r => r.published);
  const courses = CourseService.getAll();

  if (!results.length) {
    container.innerHTML = `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px; margin:15px 0;">
      <i class="fas fa-chart-line" style="font-size:24px; color:var(--accent-color,#3fdd33);"></i>
      <p style="margin-top:8px;">No published results yet for ${student.name}. Check back once results have been released.</p>
    </div>`;
    return;
  }

  const cgpa = ResultService.computeGpa(results, courses);
  const currentSemesterGpa = ResultService.computeGpa(results, courses, { session: DEFAULT_SESSION, semester: DEFAULT_SEMESTER });

  const totalUnits = results.reduce((sum, r) => {
    const course = courses.find(c => c.code === r.courseCode);
    return sum + (course ? Number(course.unit) : 0);
  }, 0);
  const unitsPassed = results.reduce((sum, r) => {
    if (r.grade === "F") return sum;
    const course = courses.find(c => c.code === r.courseCode);
    return sum + (course ? Number(course.unit) : 0);
  }, 0);

  container.innerHTML = `
    <div class="dashboard-stats-grid" style="margin-top:15px;">
      <div class="stat-card color-1"><h4>Current Semester GPA</h4><span>${currentSemesterGpa.toFixed(2)}</span></div>
      <div class="stat-card color-2"><h4>CGPA</h4><span>${cgpa.toFixed(2)}</span></div>
      <div class="stat-card color-3"><h4>Total Units</h4><span>${totalUnits}</span></div>
    </div>
    <div class="dashboard-stats-grid">
      <div class="stat-card color-1"><h4>Units Passed</h4><span>${unitsPassed}</span></div>
      <div class="stat-card color-2"><h4>Units Outstanding</h4><span>${totalUnits - unitsPassed}</span></div>
    </div>
  `;
}
