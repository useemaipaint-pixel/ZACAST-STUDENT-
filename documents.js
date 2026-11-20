/* ==========================================================================
   DOCUMENTS
   Reuses the existing html2pdf pipeline (already used for student profile
   PDFs and registration slips) rather than a new one. generateAndPrintStudentIDCard
   is unchanged, from script.js.
   ========================================================================== */

function loadStudentDocuments() {
  const admission = document.getElementById("documentsLookupAdmission").value.trim();
  const container = document.getElementById("documentsListContainer");
  if (!admission) { showNotification("Please enter an admission number.", "warning"); return; }

  const student = StudentService.getByAdmission(admission);
  if (!student) { showNotification("No student found with that admission number.", "error"); container.innerHTML = ""; return; }

  container.innerHTML = `
    <div class="card"><h2>${student.name}</h2><p>${student.admission} · ${student.department} · ${student.level}</p></div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:15px;">
      <button class="action-btn btn-pdf" onclick="generateAdmissionLetter('${student.admission}')"><i class="fas fa-file-lines"></i> Admission Letter</button>
      <button class="action-btn btn-pdf" onclick="generateRegistrationSlipDocument('${student.admission}')"><i class="fas fa-clipboard-list"></i> Registration Slip</button>
      <button class="action-btn btn-pdf" onclick="generateResultSlipDocument('${student.admission}')"><i class="fas fa-file-lines"></i> Result Slip</button>
      <button class="action-btn btn-pdf" onclick="generateTranscriptDocument('${student.admission}')"><i class="fas fa-graduation-cap"></i> Transcript</button>
      <button class="action-btn btn-pdf" onclick="generateAndPrintStudentIDCard('${student.admission}')"><i class="fas fa-id-card"></i> Student ID Card</button>
    </div>
    <div id="documentPreviewContainer" style="margin-top:20px;"></div>
  `;
}

function downloadPrintableDocumentPDF(filenameBase) {
  const el = document.getElementById("printableDocument");
  if (!el || typeof exportHTMLToPDF === "undefined") { showNotification("PDF export isn't available right now.", "error"); return; }
  showNotification("Generating PDF...", "info");
  exportHTMLToPDF(el, filenameBase + ".pdf", { orientation: "portrait", width: 800 })
    .then(() => showNotification("PDF generated successfully", "success"))
    .catch(() => showNotification("Something went wrong generating the PDF", "error"));
}

function documentActionsBar(filenameBase) {
  return `
    <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
      <button class="action-btn btn-pdf" onclick="downloadPrintableDocumentPDF('${filenameBase}')"><i class="fas fa-file-pdf"></i> Download PDF</button>
      <button class="action-btn btn-print" onclick="window.print()"><i class="fas fa-print"></i> Print</button>
    </div>
  `;
}

function generateAdmissionLetter(admission) {
  const student = StudentService.getByAdmission(admission);
  if (!student) return;
  const container = document.getElementById("documentPreviewContainer");
  container.innerHTML = `
    <div class="card" id="printableDocument">
      <h2>Admission Letter</h2>
      <p>Date: ${new Date().toLocaleDateString()}</p>
      <p>Dear ${student.name},</p>
      <p>We are pleased to confirm your admission into ${student.department}, ${student.level} program${student.year ? ", " + student.year + " academic year" : ""}, at ZACAST — Zamfara College of Arts &amp; Science Technology.</p>
      <p>Your admission number is <strong>${student.admission}</strong>. Please keep this document for your records and quote it in all future correspondence.</p>
      <p style="margin-top:20px;">Congratulations, and welcome to ZACAST.</p>
    </div>
    ${documentActionsBar("Admission_Letter_" + student.admission)}
  `;
}

function generateRegistrationSlipDocument(admission) {
  const student = StudentService.getByAdmission(admission);
  if (!student) return;
  const registrations = RegistrationService.getByStudent(admission, DEFAULT_SESSION, DEFAULT_SEMESTER);
  const courses = CourseService.getAll();
  const container = document.getElementById("documentPreviewContainer");

  if (!registrations.length) {
    container.innerHTML = `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px;">
      <i class="fas fa-clipboard-list" style="font-size:24px; color:var(--accent-color,#3fdd33);"></i>
      <p style="margin-top:8px;">${student.name} hasn't registered any courses for ${DEFAULT_SESSION}, ${DEFAULT_SEMESTER} Semester yet.</p>
    </div>`;
    return;
  }

  let totalUnits = 0;
  const rows = registrations.map(reg => {
    const course = courses.find(c => c.code === reg.courseCode);
    const unit = course ? course.unit : 0;
    totalUnits += unit;
    return `<tr><td style="padding:6px 0;">${reg.courseCode}</td><td>${course ? course.title : "—"}</td><td>${unit}</td></tr>`;
  }).join("");

  container.innerHTML = `
    <div class="card" id="printableDocument">
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
    ${documentActionsBar("Registration_Slip_" + student.admission)}
  `;
}

function generateResultSlipDocument(admission) {
  const student = StudentService.getByAdmission(admission);
  if (!student) return;
  const results = ResultService.getByStudent(admission).filter(r => r.published && r.session === DEFAULT_SESSION && r.semester === DEFAULT_SEMESTER);
  const courses = CourseService.getAll();
  const container = document.getElementById("documentPreviewContainer");

  if (!results.length) {
    container.innerHTML = `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px;">
      <i class="fas fa-file-lines" style="font-size:24px; color:var(--accent-color,#3fdd33);"></i>
      <p style="margin-top:8px;">No published results yet for ${student.name} this semester.</p>
    </div>`;
    return;
  }

  const gpa = ResultService.computeGpa(results, courses, { session: DEFAULT_SESSION, semester: DEFAULT_SEMESTER });
  const rows = results.map(r => {
    const course = courses.find(c => c.code === r.courseCode);
    return `<tr><td style="padding:6px 0;">${r.courseCode}</td><td>${course ? course.title : "—"}</td><td>${r.total}</td><td>${r.grade}</td></tr>`;
  }).join("");

  container.innerHTML = `
    <div class="card" id="printableDocument">
      <h2>Result Slip</h2>
      <p><b>Name:</b> ${student.name} &nbsp; <b>Admission No:</b> ${student.admission}</p>
      <p><b>Department:</b> ${student.department} &nbsp; <b>Level:</b> ${student.level}</p>
      <p><b>Session:</b> ${DEFAULT_SESSION} &nbsp; <b>Semester:</b> ${DEFAULT_SEMESTER}</p>
      <table style="width:100%; margin-top:10px; border-collapse:collapse;">
        <thead><tr style="text-align:left; border-bottom:1px solid var(--accent-color,#3fdd33);"><th>Code</th><th>Title</th><th>Total</th><th>Grade</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:10px;"><b>Semester GPA:</b> ${gpa.toFixed(2)}</p>
    </div>
    ${documentActionsBar("Result_Slip_" + student.admission)}
  `;
}

function generateTranscriptDocument(admission) {
  const student = StudentService.getByAdmission(admission);
  if (!student) return;
  const results = ResultService.getByStudent(admission).filter(r => r.published);
  const courses = CourseService.getAll();
  const container = document.getElementById("documentPreviewContainer");

  if (!results.length) {
    container.innerHTML = `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px;">
      <i class="fas fa-graduation-cap" style="font-size:24px; color:var(--accent-color,#3fdd33);"></i>
      <p style="margin-top:8px;">No published results yet for ${student.name}.</p>
    </div>`;
    return;
  }

  const cgpa = ResultService.computeGpa(results, courses);
  const rows = results
    .slice()
    .sort((a, b) => (a.session + a.semester).localeCompare(b.session + b.semester))
    .map(r => {
      const course = courses.find(c => c.code === r.courseCode);
      return `<tr><td style="padding:6px 0;">${r.session} ${r.semester}</td><td>${r.courseCode}</td><td>${course ? course.title : "—"}</td><td>${course ? course.unit : "—"}</td><td>${r.total}</td><td>${r.grade}</td></tr>`;
    }).join("");

  container.innerHTML = `
    <div class="card" id="printableDocument">
      <h2>Academic Transcript</h2>
      <p><b>Name:</b> ${student.name} &nbsp; <b>Admission No:</b> ${student.admission}</p>
      <p><b>Department:</b> ${student.department} &nbsp; <b>Level:</b> ${student.level}</p>
      <table style="width:100%; margin-top:10px; border-collapse:collapse;">
        <thead><tr style="text-align:left; border-bottom:1px solid var(--accent-color,#3fdd33);"><th>Session/Semester</th><th>Code</th><th>Title</th><th>Unit</th><th>Total</th><th>Grade</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:10px;"><b>Cumulative GPA (CGPA):</b> ${cgpa.toFixed(2)}</p>
    </div>
    ${documentActionsBar("Transcript_" + student.admission)}
  `;
}
