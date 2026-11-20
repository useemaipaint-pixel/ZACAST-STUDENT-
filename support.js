/* ==========================================================================
   SUPPORT TICKETS
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {
  renderAllTickets();
});

function submitSupportTicket() {
  const admission = document.getElementById("ticketAdmission").value.trim();
  const subject = document.getElementById("ticketSubject").value.trim();
  const category = document.getElementById("ticketCategory").value;
  const message = document.getElementById("ticketMessage").value.trim();

  if (!admission || !subject || !message) {
    showNotification("Please fill in your admission number, subject and message.", "warning");
    return;
  }
  const student = StudentService.getByAdmission(admission);
  if (!student) { showNotification("No student found with that admission number.", "error"); return; }

  SupportTicketService.add({ studentAdmission: admission, subject, category, message });
  logActivity("Support Ticket Submitted", `${admission} — ${subject}`);
  showNotification("Support ticket submitted successfully", "success");

  document.getElementById("ticketSubject").value = "";
  document.getElementById("ticketMessage").value = "";
  renderAllTickets();
}

function ticketStatusColor(status) {
  if (status === "Resolved") return "#4CAF50";
  if (status === "In Progress") return "#f39c12";
  if (status === "Closed") return "#888";
  return "var(--accent-color,#3fdd33)"; // Pending
}

function renderMyTickets() {
  const admission = document.getElementById("myTicketsLookupAdmission").value.trim();
  const container = document.getElementById("myTicketsContainer");
  if (!admission) { showNotification("Please enter your admission number.", "warning"); return; }

  const tickets = SupportTicketService.getByStudent(admission).slice().reverse();
  if (!tickets.length) {
    container.innerHTML = `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px;">
      <i class="fas fa-headset" style="font-size:24px; color:var(--accent-color,#3fdd33);"></i>
      <p style="margin-top:8px;">No tickets submitted yet.</p>
    </div>`;
    return;
  }
  container.innerHTML = tickets.map(t => renderTicketCard(t, false)).join("");
}

function renderAllTickets() {
  const container = document.getElementById("allTicketsContainer");
  if (!container) return;
  const statusFilter = document.getElementById("ticketStatusFilter")?.value || "All";

  let tickets = SupportTicketService.getAll().slice().reverse();
  if (statusFilter !== "All") tickets = tickets.filter(t => t.status === statusFilter);

  if (!tickets.length) {
    container.innerHTML = `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px;">
      <i class="fas fa-headset" style="font-size:24px; color:var(--accent-color,#3fdd33);"></i>
      <p style="margin-top:8px;">No tickets found for this filter.</p>
    </div>`;
    return;
  }
  container.innerHTML = tickets.map(t => renderTicketCard(t, true)).join("");
}

function renderTicketCard(t, showAdminControls) {
  const student = StudentService.getByAdmission(t.studentAdmission);
  return `
    <div style="background:#005a33; border-left:4px solid ${ticketStatusColor(t.status)}; border-radius:8px; padding:14px 16px; margin-top:10px;">
      <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <div>
          <h4 style="margin:0; color:#eee;">${t.subject}</h4>
          <small style="color:#b9dcc6;">${student ? student.name + " · " : ""}${t.studentAdmission} · ${t.category} · ${t.createdAt}</small>
        </div>
        <span style="color:${ticketStatusColor(t.status)}; font-weight:bold; font-size:12px;">${t.status}</span>
      </div>
      <p style="margin-top:8px; color:#ccc; font-size:14px;">${t.message}</p>
      ${t.adminResponse ? `<div style="margin-top:8px; background:#005a33; border-radius:6px; padding:10px;"><small style="color:#b9dcc6;">Admin response:</small><p style="margin:4px 0 0; color:#ddd;">${t.adminResponse}</p></div>` : ""}
      ${showAdminControls ? `
        <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
          <select id="statusSelect_${t.id}" style="flex:1; min-width:140px;">
            ${["Pending", "In Progress", "Resolved", "Closed"].map(s => `<option value="${s}" ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
          <input type="text" id="responseInput_${t.id}" placeholder="Write a response..." style="flex:2; min-width:180px;" value="${t.adminResponse || ""}">
          <button class="action-btn btn-edit" onclick="respondToTicket('${t.id}')"><i class="fas fa-reply"></i> Update</button>
        </div>
      ` : ""}
    </div>
  `;
}

function respondToTicket(id) {
  const statusSelect = document.getElementById(`statusSelect_${id}`);
  const responseInput = document.getElementById(`responseInput_${id}`);
  SupportTicketService.updateStatus(id, statusSelect.value, responseInput.value.trim());
  logActivity("Support Ticket Updated", `Ticket ${id} set to ${statusSelect.value}`);
  showNotification("Ticket updated successfully", "success");
  renderAllTickets();
}
