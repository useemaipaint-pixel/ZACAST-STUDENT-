/* ==========================================================================
   DEPARTMENTAL PAPERS
   Stored in the cloud (blob:paper:<dept>|<level>) so the Admin can upload,
   replace, rename or delete any department's ND1 / ND2 paper and students
   instantly see the change. A bundled default only exists for Computer Science.
   ========================================================================== */
window.PaperStore = (function () {
  const LEVELS = ["ND1", "ND2"];
  const DEFAULTS = { "Computer Science": { ND1: "com 1.png", ND2: "com 2.png" } };
  const k = (d, l) => `paper:${d}|${l}`;

  async function get(dept, level) {
    const rec = await ZacastStorage.getBlob(k(dept, level));
    const def = (DEFAULTS[dept] || {})[level] || null;
    if (rec && rec.deleted) return { exists: false, title: `${dept} - ${level}` };
    if (rec && rec.image) return { exists: true, custom: true, src: rec.image, title: rec.title || `${dept} - ${level}`, updatedAt: rec.updatedAt, by: rec.by };
    if (def) return { exists: true, custom: false, src: def, title: (rec && rec.title) || `${dept} - ${level}` };
    return { exists: false, title: (rec && rec.title) || `${dept} - ${level}` };
  }
  async function save(dept, level, patch) {
    const old = (await ZacastStorage.getBlob(k(dept, level))) || {};
    const next = Object.assign({}, old, patch, { deleted: false, updatedAt: new Date().toLocaleString() });
    await ZacastStorage.setBlob(k(dept, level), next);
    return next;
  }
  async function remove(dept, level) {
    await ZacastStorage.setBlob(k(dept, level), { deleted: true, updatedAt: new Date().toLocaleString() });
  }
  return { LEVELS, get, save, remove };
})();

async function openPaper(dept, level) {
  const modal = document.getElementById("paperModal");
  const content = document.getElementById("paperContent");
  if (!modal || !content) return;
  content.innerHTML = `<p style="padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading paper…</p>`;
  modal.style.display = "flex";
  const p = await PaperStore.get(dept, level);
  const safeTitle = String(p.title).replace(/</g, "&lt;");
  content.innerHTML = `
    <div id="printablePaper">
      <h3>${safeTitle}</h3>
      <small style="opacity:.7;">${dept} · ${level}</small>
      ${p.exists
        ? `<div><img src="${p.src}" alt="${safeTitle}" style="max-width:100%; width:360px; margin-top:10px; border:2px solid var(--accent-color); cursor:zoom-in;" onclick="openZoomModal(this.src)"></div>`
        : `<div class="paper-placeholder"><i class="fas fa-file-circle-exclamation"></i><p>This paper has not been uploaded yet.</p></div>`}
    </div>
    ${p.exists ? `<div style="margin-top:15px;">
      <button class="action-btn btn-print" onclick="window.print()"><i class="fas fa-print"></i> Print</button>
      <button class="action-btn btn-pdf" onclick="downloadPaperAsPDF('${dept.replace(/'/g, "\\'")}','${level}')"><i class="fas fa-file-pdf"></i> Download PDF</button>
    </div>` : ""}`;
}

function downloadPaperAsPDF(dept, level) {
  const element = document.getElementById("printablePaper");
  if (!element) { showNotification("Nothing to download.", "error"); return; }
  showNotification("Generating PDF...", "info");
  exportHTMLToPDF(element, `${dept}_${level}_Paper.pdf`, { orientation: "portrait", format: "letter", width: 700 })
    .then(() => showNotification("PDF generated successfully", "success"))
    .catch(() => showNotification("Something went wrong generating the PDF", "error"));
}
