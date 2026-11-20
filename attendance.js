/* ==========================================================================
   ATTENDANCE MODULE
   Mark attendance for a course on a given date (against the students
   registered for that course), and view a per-student attendance
   report with percentage, counts, and history.

   Loaded after academics.js, so it reuses DEFAULT_SESSION and
   DEFAULT_SEMESTER from there.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {
  populateAttendanceDropdowns();
  const dateInput = document.getElementById("attendanceDate");
  if (dateInput && !dateInput.value) {
    dateInput.valueAsDate = new Date();
  }
});

function populateAttendanceDropdowns() {
  const courses = CourseService.getAll();
  const optionsHtml = courses.map(c => `<option value="${c.code}">${c.code} — ${c.title}</option>`).join("");

  const markSelect = document.getElementById("attendanceCourseSelect");
  if (markSelect) markSelect.innerHTML = `<option value="">Select Course</option>` + optionsHtml;

  const filterSelect = document.getElementById("attendanceLookupCourseFilter");
  if (filterSelect) filterSelect.innerHTML = `<option value="">All Courses</option>` + optionsHtml;
}

/* ---------------- MARK ATTENDANCE (admin) ---------------- */

function loadStudentsForAttendance() {
  const courseCode = document.getElementById("attendanceCourseSelect").value;
  const date = document.getElementById("attendanceDate").value;
  const listEl = document.getElementById("attendanceMarkingList");
  const saveWrap = document.getElementById("attendanceSaveBtnWrap");

  if (!courseCode || !date) {
    listEl.innerHTML = "";
    saveWrap.style.display = "none";
    return;
  }

  const registeredStudents = RegistrationService.getAll()
    .filter(r => r.courseCode === courseCode)
    .map(r => StudentService.getByAdmission(r.studentAdmission))
    .filter(Boolean);

  if (!registeredStudents.length) {
    listEl.innerHTML = `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px;">
      <i class="fas fa-user-slash" style="font-size:24px; color:var(--accent-color,#3fdd33);"></i>
      <p style="margin-top:8px;">No students are registered for this course yet.</p>
    </div>`;
    saveWrap.style.display = "none";
    return;
  }

  const existingRecords = AttendanceService.getByCourseDate(courseCode, date);
  const existingByAdmission = {};
  existingRecords.forEach(r => { existingByAdmission[r.studentAdmission.toLowerCase()] = r.status; });

  listEl.innerHTML = "";
  registeredStudents.forEach(student => {
    const currentStatus = existingByAdmission[student.admission.toLowerCase()] || "Present";
    const row = document.createElement("div");
    row.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; background:#005a33; border-radius:8px; padding:10px 14px; margin-top:8px; flex-wrap:wrap;";
    row.innerHTML = `
      <div><strong>${student.name}</strong> <small style="color:#b9dcc6;">(${student.admission})</small></div>
      <div class="attendance-status-group" data-admission="${student.admission}" style="display:flex; gap:6px;">
        ${["Present", "Late", "Absent"].map(status => `
          <button type="button" class="action-btn attendance-status-btn ${status === currentStatus ? "attendance-status-active" : ""}"
            data-status="${status}" onclick="setAttendanceStatus(this, '${student.admission}', '${status}')"
            style="background:${status === currentStatus ? attendanceColorFor(status) : "#3a3a3a"};">
            ${status}
          </button>
        `).join("")}
      </div>
    `;
    listEl.appendChild(row);
  });

  saveWrap.style.display = "block";
}

function attendanceColorFor(status) {
  if (status === "Present") return "#4CAF50";
  if (status === "Late") return "#f39c12";
  return "#c0392b";
}

function setAttendanceStatus(button, admission, status) {
  const group = button.closest(".attendance-status-group");
  group.querySelectorAll(".attendance-status-btn").forEach(btn => {
    btn.classList.remove("attendance-status-active");
    btn.style.background = "#3a3a3a";
  });
  button.classList.add("attendance-status-active");
  button.style.background = attendanceColorFor(status);
  group.dataset.selectedStatus = status;
}

function saveAttendanceForCourse() {
  const courseCode = document.getElementById("attendanceCourseSelect").value;
  const date = document.getElementById("attendanceDate").value;
  if (!courseCode || !date) { showNotification("Please select a course and a date.", "warning"); return; }

  const groups = document.querySelectorAll(".attendance-status-group");
  if (!groups.length) { showNotification("No students to mark for this course.", "warning"); return; }

  const records = Array.from(groups).map(group => {
    const admission = group.dataset.admission;
    const activeBtn = group.querySelector(".attendance-status-active");
    const status = activeBtn ? activeBtn.dataset.status : "Present";
    return { studentAdmission: admission, courseCode, date, status };
  });

  AttendanceService.markBulk(records);
  logActivity("Attendance Marked", `${courseCode} on ${date} — ${records.length} student(s) marked.`);
  showNotification("Attendance saved successfully", "success");
}

/* ---------------- ATTENDANCE REPORT ---------------- */

function renderAttendanceReport() {
  const admission = document.getElementById("attendanceLookupAdmission").value.trim();
  const courseFilter = document.getElementById("attendanceLookupCourseFilter").value;
  const container = document.getElementById("attendanceReportContainer");

  if (!admission) { showNotification("Please enter an admission number.", "warning"); return; }
  const student = StudentService.getByAdmission(admission);
  if (!student) { showNotification("No student found with that admission number.", "error"); container.innerHTML = ""; return; }

  const records = AttendanceService.getByStudent(admission, courseFilter || null);
  const stats = AttendanceService.computeStats(admission, courseFilter || null);

  if (!records.length) {
    container.innerHTML = `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px;">
      <i class="fas fa-calendar-xmark" style="font-size:24px; color:var(--accent-color,#3fdd33);"></i>
      <p style="margin-top:8px;">No attendance recorded yet for ${student.name}${courseFilter ? " in " + courseFilter : ""}.</p>
    </div>`;
    return;
  }

  const courses = CourseService.getAll();
  const historyRows = records
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(r => {
      const course = courses.find(c => c.code === r.courseCode);
      const color = attendanceColorFor(r.status);
      return `<tr>
        <td style="padding:6px 0;">${r.date}</td>
        <td>${r.courseCode}${course ? " — " + course.title : ""}</td>
        <td><span style="color:${color}; font-weight:bold;">${r.status}</span></td>
      </tr>`;
    }).join("");

  container.innerHTML = `
    <div class="dashboard-stats-grid">
      <div class="stat-card color-1"><h4>Attendance %</h4><span>${stats.percentage.toFixed(1)}%</span></div>
      <div class="stat-card color-2"><h4>Present</h4><span>${stats.present}</span></div>
      <div class="stat-card color-3"><h4>Late</h4><span>${stats.late}</span></div>
    </div>
    <div class="dashboard-stats-grid">
      <div class="stat-card color-1"><h4>Absent</h4><span>${stats.absent}</span></div>
      <div class="stat-card color-2"><h4>Total Sessions</h4><span>${stats.total}</span></div>
    </div>
    <h3 style="margin-top:20px; color:var(--accent-color,#3fdd33);">History</h3>
    <table style="width:100%; border-collapse:collapse; margin-top:10px;">
      <thead><tr style="text-align:left; border-bottom:1px solid var(--accent-color,#3fdd33);"><th>Date</th><th>Course</th><th>Status</th></tr></thead>
      <tbody>${historyRows}</tbody>
    </table>
  `;
}
