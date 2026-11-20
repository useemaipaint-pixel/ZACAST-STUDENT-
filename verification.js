/* ==========================================================================
   QR STUDENT VERIFICATION
   The ID card's QR code (added in script.js's generateAndPrintStudentIDCard)
   encodes a URL back to this app with ?verify=ADMISSION_NUMBER. On load,
   if that parameter is present, jump straight to the verification result
   — this is what "scanning the QR code" resolves to. A manual admission
   number field is also provided so this can be tested/used without an
   actual scan.

   Only non-sensitive fields are shown (name, admission number,
   department, level, status) — no photo, contact details, or address.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {
  const params = new URLSearchParams(window.location.search);
  const verifyAdmission = params.get("verify");
  if (verifyAdmission) {
    showSection("studentVerification");
    const input = document.getElementById("verifyAdmissionInput");
    if (input) { input.value = verifyAdmission; }
    renderVerificationResult();
  }
});

function renderVerificationResult() {
  const admission = document.getElementById("verifyAdmissionInput").value.trim();
  const container = document.getElementById("verificationResultContainer");
  if (!admission) { showNotification("Please enter an admission number.", "warning"); return; }

  const student = StudentService.getByAdmission(admission);

  if (!student) {
    container.innerHTML = `
      <div class="card" style="text-align:center; border:2px solid #c0392b; max-width:400px; margin:20px auto;">
        <i class="fas fa-circle-xmark" style="font-size:40px; color:#c0392b;"></i>
        <h2 style="color:#c0392b; margin-top:10px;">Not Verified</h2>
        <p>No student record found for this admission number.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="card" style="text-align:center; border:2px solid #4CAF50; max-width:400px; margin:20px auto;">
      <i class="fas fa-circle-check" style="font-size:40px; color:#4CAF50;"></i>
      <h2 style="color:#4CAF50; margin-top:10px;">Student Verified</h2>
      <p style="margin-top:10px;"><b>${student.name}</b></p>
      <p>Admission Number: ${student.admission}</p>
      <p>Department: ${student.department}</p>
      <p>Level: ${student.level}</p>
      <p>Status: ${student.status || "Active"}</p>
    </div>
  `;
}
