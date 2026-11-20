/* ==========================================================================
   ZACAST STUDENT APP
   Everything a student can do or see lives here. Login = Admission Number
   or full name. Students only ever see THEIR OWN records.
   ========================================================================== */
window.ZacastApp = (function () {
  const app = { role: "student", student: null, current: "home" };
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function findStudent(idf) {
    const t = String(idf || "").trim().toLowerCase();
    if (!t) return null;
    const list = StudentService.getAll();
    return list.find(s => (s.admission || "").toLowerCase() === t) || list.find(s => (s.name || "").toLowerCase() === t) || null;
  }
  function me() {
    if (!app.student) return null;
    return StudentService.getByAdmission(app.student.admission) || app.student;
  }

  /* ---------------- access control ---------------- */
  app.canOpen = function (id) {
    if (id === "studentVerification") return true;
    if (!app.student) return id === "register";
    return true;
  };
  app.visibleAnnouncements = function () {
    const s = me();
    return AnnouncementService.getRelevantFor({ role: "student", department: s ? s.department : "" });
  };
  app.sanitizeEdit = function (rec, old) {
    if (!old) return rec;
    rec.admission = old.admission;
    rec.status = old.status || rec.status;
    rec.registrationDate = old.registrationDate || rec.registrationDate;
    return rec;
  };

  /* ---------------- start-up ---------------- */
  app.onReady = function () {
    updateHomeLiveClock(); setInterval(updateHomeLiveClock, 1000);
    triggerSkillBarsAnimation(); loadCommentsDisplay(); initializeDigitalSignaturePad(); initStates();
    restoreSavedTheme(); restoreSidebarCollapseState(); restoreNavGroupState();
    restoreNotificationSoundPreference(); restoreNotificationPreferences();

    const params = new URLSearchParams(location.search);
    if (params.get("verify")) {                       // public QR-code verification page
      $("gatewayWelcomePage").style.display = "none";
      $("publicVerifyOverlay").style.display = "flex";
      document.body.classList.add("guest-mode");
      $("verifyAdmissionInput").value = params.get("verify");
      try { renderVerificationResult(); } catch (e) { }
      return;
    }
    const sess = AuthService.getSession();
    const st = sess && findStudent(sess.identity);
    if (st) enterWorkspace(st, true); else { AuthService.endSession(); showGateway(); }
    logActivity("System initiated", "Student app opened.");
  };

  function showGateway() {
    app.student = null;
    document.body.classList.add("guest-mode");
    $("appMainWorkspace").style.display = "none";
    $("gatewayWelcomePage").style.display = "flex";
  }

  function fillHidden(s) {
    ["studentLoginAdmission", "regStudentAdmission", "gpaLookupAdmission", "attendanceLookupAdmission",
      "ticketAdmission", "myTicketsLookupAdmission", "documentsLookupAdmission", "resultLookupAdmission"].forEach(id => { const el = $(id); if (el) el.value = s.admission; });
  }

  function enterWorkspace(st, silent) {
    app.student = st;
    fillHidden(st);
    document.body.classList.remove("guest-mode");
    $("gatewayWelcomePage").style.display = "none";
    $("publicVerifyOverlay").style.display = "none";
    $("appMainWorkspace").style.display = "grid";
    const nm = $("sidebarUserName"); if (nm) nm.textContent = st.name;
    const dp = $("sidebarUserDept"); if (dp) dp.textContent = `${st.department || ""} · ${st.level || ""}`;
    showSection("home");
    updateNotificationBadge();
    if (!silent) showNotification(`Welcome, ${st.name}`, "success");
  }
  app.enter = enterWorkspace;

  app.onStudentRegistered = function (admission) {
    AuthService.startSession(admission);
    setTimeout(() => {
      const st = findStudent(admission);
      if (st) enterWorkspace(st);
    }, 2300);
  };

  /* ---------------- gateway (login with admission number or full name) ---------------- */
  window.triggerGatewayAccessVerification = function () {
    const raw = $("gatewaySearchInput").value.trim();
    if (!raw) { showNotification("Enter your Admission Number or Full Name to log in.", "warning"); return; }
    const st = findStudent(raw);
    if (!st) { showNotification("No student found with those details. If you have not registered, tap 'Register as New Student'.", "error"); return; }
    $("professionalLoadingOverlay").style.display = "flex";
    setTimeout(() => {
      $("professionalLoadingOverlay").style.display = "none";
      AuthService.startSession(st.admission);
      enterWorkspace(st);
      logActivity("Student Login", `${st.name} (${st.admission}) logged in.`);
    }, 900);
  };
  window.redirectGatewayToRegistrationPage = function () {
    $("gatewayWelcomePage").style.display = "none";
    $("appMainWorkspace").style.display = "grid";
    showSection("register");
  };
  window.backToStudentLogin = function () { clearRegistrationForm(); showGateway(); };
  window.logoutEntireSystemWorkspace = function () {
    const s = me();
    if (s) logActivity("Student Logout", `${s.name} logged out.`);
    AuthService.endSession();
    $("gatewaySearchInput").value = "";
    showGateway();
  };

  // students may edit their own profile but never their admission number or status
  const _setup = window.setupEditStudentProfile;
  window.setupEditStudentProfile = function (i) {
    _setup(i);
    const a = $("admission"); if (a) { a.readOnly = true; a.style.opacity = ".6"; }
    const g = document.querySelector("#register [onclick*='generateAutoAdmissionNumber']"); if (g) g.parentElement.style.display = "none";
    const st = $("studentStatusInput"); if (st) { st.disabled = true; }
    $("registerTitle").innerText = "Edit My Profile";
  };
  const _commit = window.commitSaveAction;
  window.commitSaveAction = function () {
    const editIndex = arguments[arguments.length - 1];
    _commit.apply(this, arguments);
    if (editIndex !== "") setTimeout(() => {
      const a = $("admission"); if (a) { a.readOnly = false; a.style.opacity = ""; }
      const st = $("studentStatusInput"); if (st) st.disabled = false;
      const g = document.querySelector("#register [onclick*='generateAutoAdmissionNumber']"); if (g) g.parentElement.style.display = "";
      if (app.student) { const f = me(); if (f) app.student = f; showSection("studentLoginSection"); }
    }, 2300);
  };

  /* ---------------- views ---------------- */
  app.refreshViews = function () {
    if (!app.student) return;
    const f = findStudent(app.student.admission);
    if (!f) { showNotification("Your record was removed by the school. Logging out.", "warning"); logoutEntireSystemWorkspace(); return; }
    app.student = f;
    if (app.current && app.current !== "register") app.onSectionOpen(app.current, true);
  };

  app.onSectionOpen = function (id) {
    app.current = id;
    const s = me(); if (!s) return;
    fillHidden(s);
    switch (id) {
      case "home": renderHome(); break;
      case "studentLoginSection": loginAsStudent(); break;
      case "courses": renderMyCourses(); break;
      case "courseRegistration": loadCourseRegistrationForStudent(); break;
      case "results": renderMyResults(); break;
      case "gpaDashboard": renderGpaDashboard(); break;
      case "attendance": renderMyAttendance(); break;
      case "timetable": renderMyTimetable(); break;
      case "announcements": renderMyAnnouncements(); break;
      case "notifications": renderNotificationsList(); updateNotificationBadge(); break;
      case "support": renderMyTickets(); break;
      case "documents": loadStudentDocuments(); break;
      case "departmental": renderStudentDepartments(); break;
    }
  };

  function empty(icon, msg) {
    return `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px; margin:15px 0;"><i class="fas ${icon}" style="font-size:24px; color:var(--accent-color);"></i><p style="margin-top:8px;">${msg}</p></div>`;
  }

  function renderHome() {
    const s = me();
    $("studentHomeName").textContent = s.name;
    $("studentHomeMeta").textContent = `${s.admission} · ${s.department} · ${s.level}`;
    const regs = RegistrationService.getByStudent(s.admission, DEFAULT_SESSION, DEFAULT_SEMESTER).length;
    const published = ResultService.getByStudent(s.admission).filter(r => r.published).length;
    const unread = app.visibleAnnouncements().filter(a => !NotificationCenterService.isRead(a.id)).length;
    const myCourses = CourseService.filter({ department: s.department, level: s.level }).length;
    const tiles = [
      ["courses", "fa-book", myCourses, "My Courses"],
      ["courseRegistration", "fa-clipboard-list", regs, "Registered Courses"],
      ["results", "fa-file-lines", published, "Published Results"],
      ["notifications", "fa-bell", unread, "Unread Notifications"]
    ];
    $("studentHomeTiles").innerHTML = tiles.map(t => `<button class="tile" onclick="showSection('${t[0]}')"><i class="fas ${t[1]}"></i><b>${t[2]}</b><span>${t[3]}</span></button>`).join("");
    const latest = app.visibleAnnouncements().slice(0, 3);
    $("studentHomeAnnouncements").innerHTML = latest.length
      ? latest.map(a => `<div class="mini-item"><b>${esc(a.title)}</b><div style="opacity:.8; margin-top:3px;">${esc(a.message)}</div></div>`).join("")
      : `<p style="opacity:.7;">No announcements yet.</p>`;
  }

  function renderMyCourses() {
    const s = me();
    const c = $("myCoursesContainer");
    const list = CourseService.filter({ department: s.department, level: s.level });
    $("myCoursesHeading").textContent = `${s.department} · ${s.level}`;
    if (!list.length) { c.innerHTML = empty("fa-book", "No courses have been added for your department and level yet."); return; }
    c.innerHTML = list.map(x => `
      <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; background:var(--bg-card-2); border-radius:8px; padding:12px 16px; margin-top:8px;">
        <div><h4 style="margin:0;">${esc(x.code)} — ${esc(x.title)}</h4>
        <small style="color:#bfe8cd;">${esc(x.semester)} Semester · ${esc(x.unit)} Unit(s) · ${esc(x.type)}${x.lecturer ? " · " + esc(x.lecturer) : ""}</small></div>
      </div>`).join("");
  }

  function renderMyResults() {
    const s = me();
    const c = $("myResultsContainer");
    const courses = CourseService.getAll();
    const rs = ResultService.getByStudent(s.admission).filter(r => r.published);
    if (!rs.length) { c.innerHTML = empty("fa-file-circle-question", "No published results yet. Check back after your lecturers release them."); return; }
    const groups = {};
    rs.forEach(r => { const k = `${r.session} — ${r.semester} Semester`; (groups[k] = groups[k] || []).push(r); });
    c.innerHTML = Object.keys(groups).map(k => {
      const rows = groups[k].map(r => {
        const co = courses.find(x => x.code === r.courseCode);
        const bad = r.grade === "F";
        return `<tr><td style="padding:7px 0;">${esc(r.courseCode)}</td><td>${co ? esc(co.title) : "—"}</td><td>${co ? esc(co.unit) : "—"}</td><td>${esc(r.caScore)}</td><td>${esc(r.examScore)}</td><td>${esc(r.total)}</td><td style="font-weight:800; color:${bad ? "#ff8a8a" : "var(--accent-color)"};">${esc(r.grade)}</td></tr>`;
      }).join("");
      return `<h3 style="margin-top:22px; color:var(--accent-color);">${esc(k)}</h3>
        <div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; margin-top:8px;">
        <thead><tr style="text-align:left; border-bottom:1px solid var(--accent-color);"><th>Code</th><th>Title</th><th>Unit</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }).join("");
  }

  function renderMyAttendance() {
    const s = me();
    const sel = $("attendanceLookupCourseFilter");
    const mine = CourseService.filter({ department: s.department, level: s.level });
    const keep = sel.value;
    sel.innerHTML = `<option value="">All Courses</option>` + mine.map(c => `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.title)}</option>`).join("");
    sel.value = keep;
    renderAttendanceReport();
  }

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function renderMyTimetable() {
    const s = me();
    const c = $("myTimetableContainer");
    const entries = TimetableService.filter({ department: s.department, level: s.level });
    const courses = CourseService.getAll();
    if (!entries.length) { c.innerHTML = empty("fa-calendar-days", "No timetable has been published for your department and level yet."); return; }
    c.innerHTML = DAYS.map(day => {
      const list = entries.filter(e => e.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (!list.length) return "";
      return `<h3 style="margin-top:18px; color:var(--accent-color);">${day}</h3>` + list.map(e => {
        const co = courses.find(x => x.code === e.courseCode);
        return `<div style="background:var(--bg-card-2); border-radius:8px; padding:10px 14px; margin-top:6px;"><strong>${esc(e.startTime)} - ${esc(e.endTime)}</strong> · ${esc(e.courseCode)}${co ? " — " + esc(co.title) : ""}<div style="font-size:12px; color:#bfe8cd;">${e.venue ? "Venue: " + esc(e.venue) : ""}</div></div>`;
      }).join("");
    }).join("");
  }

  function renderMyAnnouncements() {
    const c = $("myAnnouncementsContainer");
    const list = app.visibleAnnouncements();
    if (!list.length) { c.innerHTML = empty("fa-bullhorn", "No announcements yet."); return; }
    c.innerHTML = list.map(a => `
      <div style="background:var(--bg-card-2); border-left:4px solid ${priorityColor(a.priority)}; border-radius:8px; padding:14px 16px; margin-top:10px;">
        <h4 style="margin:0;">${esc(a.title)}</h4>
        <small style="color:#bfe8cd;">${esc(a.audience)}${a.department ? " · " + esc(a.department) : ""} · ${esc(a.priority)} Priority</small>
        <p style="margin-top:8px; font-size:14px;">${esc(a.message)}</p>
      </div>`).join("");
  }

  function renderStudentDepartments() {
    const s = me();
    const grid = $("departmentGrid");
    const names = Object.keys(deptData).sort((a, b) => (a === s.department ? -1 : b === s.department ? 1 : 0));
    grid.innerHTML = names.map((d, i) => `
      <div class="setting-box" ${d === s.department ? 'style="border:2px solid var(--accent-color);"' : ""}>
        <h3><i class="fas fa-building-columns" style="color:var(--accent-color); margin-right:8px;"></i>${esc(d)}</h3>
        ${d === s.department ? '<small style="color:var(--accent-2);">Your department</small>' : ""}
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="theme-select-btn" onclick="openPaper(Object.keys(deptData)[${Object.keys(deptData).indexOf(d)}],'ND1')">ND 1 Paper</button>
          <button class="theme-select-btn" onclick="openPaper(Object.keys(deptData)[${Object.keys(deptData).indexOf(d)}],'ND2')">ND 2 Paper</button>
        </div>
      </div>`).join("");
  }

  return app;
})();
