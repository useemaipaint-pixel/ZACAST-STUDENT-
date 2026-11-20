/* ==========================================================================
   ANNOUNCEMENTS + NOTIFICATION CENTER
   ==========================================================================
   Announcements are created here; the notification center simply lists
   every published announcement with a read/unread state, since that's
   the only notification-generating event this phase implements. (The
   architecture supports other types — success/info/warning/academic/
   attendance/result — see NotificationCenterService's docstring; wiring
   attendance/result events into it is a natural small follow-up.)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {
  populateAnnouncementDepartmentDropdown();
  renderAnnouncementsList();
  renderNotificationsList();
  updateNotificationBadge();
});

function populateAnnouncementDepartmentDropdown() {
  const select = document.getElementById("announcementDepartment");
  if (!select) return;
  const deptNames = Object.keys(typeof deptData !== "undefined" ? deptData : {});
  select.innerHTML = `<option value="">Select Department</option>` +
    deptNames.map(d => `<option value="${d}">${d}</option>`).join("");
}

function toggleAnnouncementDeptField() {
  const audience = document.getElementById("announcementAudience").value;
  document.getElementById("announcementDepartment").style.display = audience === "Department" ? "block" : "none";
}

/* ---------------- CREATE / EDIT / DELETE (admin) ---------------- */

function resetAnnouncementForm() {
  document.getElementById("announcementEditId").value = "";
  document.getElementById("announcementFormTitle").textContent = "Create Announcement";
  document.getElementById("announcementTitle").value = "";
  document.getElementById("announcementMessage").value = "";
  document.getElementById("announcementAudience").value = "All";
  document.getElementById("announcementDepartment").value = "";
  document.getElementById("announcementDepartment").style.display = "none";
  document.getElementById("announcementPriority").value = "Normal";
  document.getElementById("announcementPublishAt").value = "";
}

function saveAnnouncement() {
  const editId = document.getElementById("announcementEditId").value;
  const title = document.getElementById("announcementTitle").value.trim();
  const message = document.getElementById("announcementMessage").value.trim();
  const audience = document.getElementById("announcementAudience").value;
  const department = document.getElementById("announcementDepartment").value;
  const priority = document.getElementById("announcementPriority").value;
  const publishAt = document.getElementById("announcementPublishAt").value;

  if (!title || !message) { showNotification("Please fill in a title and message.", "warning"); return; }
  if (audience === "Department" && !department) { showNotification("Please select a department for this announcement.", "warning"); return; }

  const record = {
    title, message, audience,
    department: audience === "Department" ? department : "",
    priority,
    publishAt: publishAt || "",
    createdAt: editId ? (AnnouncementService.getById(editId)?.createdAt || new Date().toISOString()) : new Date().toISOString()
  };

  if (editId) {
    AnnouncementService.updateById(editId, record);
    logActivity("Announcement Updated", title);
    showNotification("Announcement updated successfully", "success");
  } else {
    AnnouncementService.add(record);
    logActivity("Announcement Published", title);
    showNotification("Announcement published successfully", "success");
  }

  resetAnnouncementForm();
  renderAnnouncementsList();
  renderNotificationsList();
  updateNotificationBadge();
}

function editAnnouncement(id) {
  const a = AnnouncementService.getById(id);
  if (!a) return;
  document.getElementById("announcementEditId").value = a.id;
  document.getElementById("announcementFormTitle").textContent = "Edit Announcement";
  document.getElementById("announcementTitle").value = a.title;
  document.getElementById("announcementMessage").value = a.message;
  document.getElementById("announcementAudience").value = a.audience;
  document.getElementById("announcementDepartment").value = a.department || "";
  document.getElementById("announcementDepartment").style.display = a.audience === "Department" ? "block" : "none";
  document.getElementById("announcementPriority").value = a.priority;
  document.getElementById("announcementPublishAt").value = a.publishAt || "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteAnnouncement(id) {
  const a = AnnouncementService.getById(id);
  if (!a) return;
  if (!window.confirm(`Delete announcement "${a.title}"? This cannot be undone.`)) return;
  AnnouncementService.removeById(id);
  logActivity("Announcement Deleted", a.title);
  showNotification("Announcement deleted", "success");
  renderAnnouncementsList();
  renderNotificationsList();
  updateNotificationBadge();
}

function priorityColor(priority) {
  if (priority === "High") return "#c0392b";
  if (priority === "Low") return "#888";
  return "var(--accent-color,#3fdd33)";
}

function renderAnnouncementsList() {
  const container = document.getElementById("announcementsListContainer");
  if (!container) return;
  const announcements = AnnouncementService.getAll().slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  if (!announcements.length) {
    container.innerHTML = `<div class="paper-placeholder" style="width:auto; min-height:auto; padding:24px;">
      <i class="fas fa-bullhorn" style="font-size:24px; color:var(--accent-color,#3fdd33);"></i>
      <p style="margin-top:8px;">No announcements yet.</p>
    </div>`;
    return;
  }

  container.innerHTML = announcements.map(a => {
    const published = AnnouncementService.isPublished(a);
    return `
      <div style="background:#005a33; border-left:4px solid ${priorityColor(a.priority)}; border-radius:8px; padding:14px 16px; margin-top:10px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
          <div>
            <h4 style="margin:0; color:#eee;">${a.title} ${!published ? '<span style="font-size:11px; color:#f39c12;">(Scheduled)</span>' : ''}</h4>
            <small style="color:#b9dcc6;">${a.audience}${a.department ? " · " + a.department : ""} · ${a.priority} Priority</small>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="action-btn btn-edit" onclick="editAnnouncement('${a.id}')" aria-label="Edit announcement"><i class="fas fa-edit"></i></button>
            <button class="action-btn" data-admin="1" style="background:#c0392b;" onclick="deleteAnnouncement('${a.id}')" aria-label="Delete announcement"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        <p style="margin-top:8px; color:#ccc; font-size:14px;">${a.message}</p>
      </div>
    `;
  }).join("");
}

/* ---------------- NOTIFICATION CENTER ---------------- */

function renderNotificationsList() {
  const container = document.getElementById("notificationsListContainer");
  if (!container) return;

  const announcements = visibleAnnouncements()
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  if (!announcements.length) {
    container.innerHTML = `<div class="paper-placeholder notification-empty-state"><i class="fas fa-bell-slash"></i><h3>You're all caught up</h3><p>No notifications are waiting for you right now.</p></div>`;
    return;
  }

  const unread = announcements.filter(a => !NotificationCenterService.isRead(a.id)).length;
  container.innerHTML = `
    <div class="notification-center-toolbar">
      <div><span class="eyebrow">NOTIFICATION CENTER</span><h3>${unread ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'All notifications read'}</h3></div>
      <span class="notification-center-status"><i class="fas fa-shield-check"></i> Live</span>
    </div>
    <div class="notification-center-list">
      ${announcements.map(a => {
        const read = NotificationCenterService.isRead(a.id);
        const priority = String(a.priority || 'Normal').toLowerCase();
        const icon = priority === 'high' ? 'fa-triangle-exclamation' : 'fa-bullhorn';
        return `
          <div class="notification-center-item ${read ? 'read' : 'unread'}" onclick="markNotificationReadAndRefresh('${a.id}')">
            <div class="notification-center-icon ${priority}"><i class="fas ${icon}"></i></div>
            <div class="notification-center-copy">
              <div class="notification-center-title-row"><strong>${escapeNotificationText(a.title)}</strong>${!read ? '<span class="unread-dot"></span>' : ''}</div>
              <p>${escapeNotificationText(a.message)}</p>
              <small>${escapeNotificationText(a.audience)}${a.department ? ' · ' + escapeNotificationText(a.department) : ''} · ${escapeNotificationText(a.priority || 'Normal')} priority</small>
            </div>
            <i class="fas fa-chevron-right notification-chevron"></i>
          </div>`;
      }).join('')}
    </div>`;
}

function escapeNotificationText(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function markNotificationReadAndRefresh(id) {
  NotificationCenterService.markRead(id);
  renderNotificationsList();
  updateNotificationBadge();
}

function markAllNotificationsRead() {
  const ids = visibleAnnouncements().map(a => a.id);
  if (!ids.length) { showNotification("No notifications to mark as read.", "info"); return; }
  NotificationCenterService.markAllRead(ids);
  renderNotificationsList();
  updateNotificationBadge();
  showNotification("All notifications marked as read", "success");
}

function updateNotificationBadge() {
  const badge = document.getElementById("notificationUnreadBadge");
  if (!badge) return;
  const published = visibleAnnouncements();
  const unreadCount = published.filter(a => !NotificationCenterService.isRead(a.id)).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    badge.style.display = "inline-flex";
  } else {
    badge.style.display = "none";
  }
}
