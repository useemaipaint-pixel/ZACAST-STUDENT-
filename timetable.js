/* ==========================================================================
   TIMETABLE MODULE
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {
  populateTimetableDropdowns();
  renderTimetableGrid();
});

function populateTimetableDropdowns() {
  const deptNames = Object.keys(typeof deptData !== "undefined" ? deptData : {});
  const deptOptionsHtml = deptNames.map(d => `<option value="${d}">${d}</option>`).join("");

  const ttDept = document.getElementById("ttDepartment");
  if (ttDept) ttDept.innerHTML = `<option value="">Select Department</option>` + deptOptionsHtml;

  const ttFilterDept = document.getElementById("ttFilterDepartment");
  if (ttFilterDept) ttFilterDept.innerHTML = `<option value="All">All Departments</option>` + deptOptionsHtml;

  const courses = CourseService.getAll();
  const ttCourse = document.getElementById("ttCourse");
  if (ttCourse) ttCourse.innerHTML = `<option value="">Select Course</option>` +
    courses.map(c => `<option value="${c.code}">${c.code} — ${c.title}</option>`).join("");
}

function addTimetableEntry() {
  const department = document.getElementById("ttDepartment").value;
  const level = document.getElementById("ttLevel").value;
  const courseCode = document.getElementById("ttCourse").value;
  const venue = document.getElementById("ttVenue").value.trim();
  const day = document.getElementById("ttDay").value;
  const startTime = document.getElementById("ttStartTime").value;
  const endTime = document.getElementById("ttEndTime").value;

  if (!department || !level || !courseCode || !day || !startTime || !endTime) {
    showNotification("Please fill in department, level, course, day, start and end time.", "warning");
    return;
  }
  if (startTime >= endTime) {
    showNotification("End time must be after start time.", "warning");
    return;
  }

  TimetableService.add({ department, level, courseCode, venue, day, startTime, endTime });
  logActivity("Timetable Entry Added", `${courseCode} — ${day} ${startTime}-${endTime}`);
  showNotification("Timetable entry added successfully", "success");

  document.getElementById("ttVenue").value = "";
  document.getElementById("ttStartTime").value = "";
  document.getElementById("ttEndTime").value = "";
  renderTimetableGrid();
}

function deleteTimetableEntry(id) {
  if (!window.confirm("Remove this timetable entry?")) return;
  TimetableService.removeById(id);
  showNotification("Timetable entry removed", "success");
  renderTimetableGrid();
}

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function renderTimetableGrid() {
  const container = document.getElementById("timetableGridContainer");
  if (!container) return;

  const department = document.getElementById("ttFilterDepartment")?.value || "All";
  const level = document.getElementById("ttFilterLevel")?.value || "All";
  const entries = TimetableService.filter({ department, level });
  const courses = CourseService.getAll();

  if (!entries.length) {
    container.innerHTML = `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px;">
      <i class="fas fa-calendar-days" style="font-size:24px; color:var(--accent-color,#3fdd33);"></i>
      <p style="margin-top:8px;">No timetable entries yet for this filter.</p>
    </div>`;
    return;
  }

  container.innerHTML = DAY_ORDER.map(day => {
    const dayEntries = entries.filter(e => e.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (!dayEntries.length) return "";
    return `
      <h3 style="margin-top:20px; color:var(--accent-color,#3fdd33);">${day}</h3>
      ${dayEntries.map(e => {
        const course = courses.find(c => c.code === e.courseCode);
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; background:#005a33; border-radius:8px; padding:10px 14px; margin-top:6px; flex-wrap:wrap;">
            <div>
              <strong>${e.startTime} - ${e.endTime}</strong> · ${e.courseCode}${course ? " — " + course.title : ""}
              <div style="font-size:11px; color:#b9dcc6;">${e.department} · ${e.level}${e.venue ? " · " + e.venue : ""}</div>
            </div>
            <button class="action-btn" data-admin="1" style="background:#c0392b;" onclick="deleteTimetableEntry('${e.id}')" aria-label="Remove entry"><i class="fas fa-trash"></i></button>
          </div>
        `;
      }).join("")}
    `;
  }).join("");
}
