/* ==========================================================================
   GLOBAL DATA STRUCTURES
   All persistence goes through the service layer in /services — this
   file only touches localStorage directly for UI-only preferences
   (sidebar state, theme, notification-sound mute) that will never be
   part of a database. See services/storageAdapter.js and
   DATABASE_SCHEMA.md.
   ========================================================================== */
   window.addEventListener("storage",function(){

    // Another tab changed student data — pick up the fresh copy.
    students = StudentService.getAll();

});
let students = StudentService.getAll();
let activities = ActivityService.getAll();
let adminAccounts = [];

/* ==========================================================================
   CENTRAL PDF EXPORT ENGINE
   --------------------------------------------------------------------------
   Every "Download PDF" button in the app now goes through this one
   function instead of calling html2pdf() directly. This fixes the
   "downloaded PDF is a blank page" bug everywhere at once. The bug had
   three independent causes, all handled below:

   1. SCROLL POSITION: if the user had scrolled the page down before
      clicking the button, html2canvas captured the wrong region of the
      document (empty space) because it wasn't told to correct for the
      current scroll offset. This was the main cause of totally blank
      pages. Fixed with scrollX/scrollY + windowWidth/windowHeight below.
   2. THEME COLOR: some printable elements inherit the app's active
      theme (dark background, light/matrix/cyberpunk text colors), but a
      PDF page is plain white — so light-on-dark text became invisible
      light-on-white text, which also looks "blank". Fixed by cloning the
      content onto a dedicated white/black print surface before capture,
      no matter which theme is active on screen.
   3. IMAGE TIMING: student photos/signatures sometimes hadn't finished
      loading yet when html2canvas took its snapshot. Fixed by waiting
      for every <img> in the clone to finish loading first.
   ========================================================================== */
function exportHTMLToPDF(sourceEl, filename, options = {}) {
  return new Promise((resolve, reject) => {
    if (!sourceEl) { reject(new Error("Nothing to export")); return; }
    if (typeof html2pdf === "undefined") { reject(new Error("PDF engine not loaded")); return; }

    const orientation = options.orientation || "portrait";
    const format = options.format || "a4";
    const widthPx = options.width || (orientation === "landscape" ? 1100 : 800);

    const clone = sourceEl.cloneNode(true);
    clone.removeAttribute("id");

    const surface = document.createElement("div");
    surface.className = "pdf-print-surface";
    surface.style.cssText = `position:fixed; left:0; top:0; width:${widthPx}px; background:#ffffff; z-index:999999999; padding:24px; font-family:Arial, sans-serif;`;
    surface.appendChild(clone);
    document.body.appendChild(surface);

    const waitForImages = () => {
      const imgs = Array.from(surface.querySelectorAll("img"));
      if (!imgs.length) return Promise.resolve();
      return Promise.all(imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 3000); });
      }));
    };

    waitForImages().then(() => {
      html2pdf().set({
        filename: filename,
        margin: options.margin ?? 10,
        image: { type: "jpeg", quality: 1 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          scrollX: 0,
          scrollY: -window.scrollY,
          windowWidth: document.documentElement.scrollWidth,
          windowHeight: document.documentElement.scrollHeight
        },
        jsPDF: { unit: "mm", format: format, orientation: orientation }
      }).from(surface).save()
        .then(() => { surface.remove(); resolve(); })
        .catch(err => { surface.remove(); reject(err); });
    });
  });
}

/* ==========================================================================
   ADMIN PASSWORD SECURITY (SHA-256 HASHING)
   Passwords are no longer stored or compared in plain text. Every account
   password is hashed with SHA-256 before it ever touches localStorage.
   Note: since this app has no server, this raises the bar against someone
   glancing at localStorage/source, but a fully secure login still needs a
   real backend — client-side auth can always be bypassed via DevTools.
   ========================================================================== */
async function hashText(str) {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Migrates any plain-text password already in storage to a SHA-256 hash.
// A stored value that's already a 64-character hex string is left alone.
async function migrateAdminAccountsSecurity() {
  let changed = false;
  for (const acc of adminAccounts) {
    if (!/^[a-f0-9]{64}$/.test(acc.password)) {
      acc.password = await hashText(acc.password);
      changed = true;
    }
  }
  if (changed) AuthService.saveAccounts(adminAccounts);
}

let appReactions = ReactionService.get();
let publicComments = CommentService.getAll();

let currentAdminPage = 1;
const recordsPerPage = 5;
let adminPanelSearchQuery = "";

// Signature Tracking Variables
let isDrawingSignature = false;
let signatureCanvasContext = null;
let savedSignatureBase64 = "";

/* ==========================================================================
   CRITICAL SESSION SHIELD: WANNAN SHINE ZAI HANA BAYANAI BACEWA KO SAKE NEMBAN LOGIN
   ========================================================================== */
document.addEventListener("DOMContentLoaded", function() {
  // Each app (student / staff) provides its own start-up in ZacastApp.onReady().
  if (window.ZacastApp && typeof ZacastApp.onReady === "function") ZacastApp.onReady();
});

function logActivity(type, detail) {
  activities = ActivityService.log(type, detail);
}
function setupEditStudentProfile(globalIndex) {

    const st = students[globalIndex];

    showSection('register');

    document.getElementById('editIndex').value = globalIndex;

    document.getElementById('registerTitle').innerText = "Edit Student Profile";

    document.getElementById('name').value = st.name;

    document.getElementById('admission').value = st.admission;

    document.getElementById('deptSearch').value = st.department;

    document.getElementById('dob').value = st.dob || "";

    document.getElementById('level').value = st.level;

    document.getElementById('year').value = st.year;

    document.getElementById('program').value = st.program;

    document.getElementById('gender').value = st.gender;

    document.getElementById('stateInput').value = st.state;

    updateLgaList();

    document.getElementById('lgaInput').value = st.lga;

    document.getElementById('phone').value = st.phone;

    document.getElementById('email').value = st.email;

    document.getElementById('studentStatusInput').value = st.status;

    document.getElementById('address').value = st.address;

    document.getElementById('preview').src = st.image;

    document.getElementById('preview').style.display = "block";

    const emptyState = document.getElementById('imageDropzoneEmpty');
    const filledState = document.getElementById('imageDropzoneFilled');
    if (st.image && filledState && emptyState) {
      emptyState.style.display = 'none';
      filledState.style.display = 'flex';
    }

}

/* ==========================================================================
   AUTOGENERATED MATRIC NUMBER ENGINE
   ========================================================================== */
function generateAutoAdmissionNumber() {
  const currentYear = new Date().getFullYear(); // 2026
  const secureRandomIndex = Math.floor(1000 + Math.random() * 9000); 
  const formattedNo = `ZACAST/${currentYear}/${secureRandomIndex}`;
  
  document.getElementById('admission').value = formattedNo;
  checkDuplicateAdmission();
}

/* ==========================================================================
   CANVAS SIGNATURE DRAWING PAD CONTROLS
   ========================================================================== */
function initializeDigitalSignaturePad() {
  const canvas = document.getElementById('signaturePad');
  if (!canvas) return;
  
  signatureCanvasContext = canvas.getContext('2d');
  signatureCanvasContext.strokeStyle = "#000000";
  signatureCanvasContext.lineWidth = 2;

  // Mouse Engine Events
  canvas.addEventListener('mousedown', (e) => {
    isDrawingSignature = true;
    signatureCanvasContext.beginPath();
    signatureCanvasContext.moveTo(e.offsetX, e.offsetY);
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawingSignature) return;
    signatureCanvasContext.lineTo(e.offsetX, e.offsetY);
    signatureCanvasContext.stroke();
  });

  canvas.addEventListener('mouseup', () => { isDrawingSignature = false; });
  canvas.addEventListener('mouseleave', () => { isDrawingSignature = false; });

  // Touch Mobile Screen Friendly Engine Events
  canvas.addEventListener('touchstart', (e) => {
    isDrawingSignature = true;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    signatureCanvasContext.beginPath();
    signatureCanvasContext.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
    e.preventDefault();
  });

  canvas.addEventListener('touchmove', (e) => {
    if (!isDrawingSignature) return;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    signatureCanvasContext.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
    signatureCanvasContext.stroke();
    e.preventDefault();
  });

  canvas.addEventListener('touchend', () => { isDrawingSignature = false; });
}

function clearSignatureCanvas() {
  const canvas = document.getElementById('signaturePad');
  if (!canvas) return;
  signatureCanvasContext.clearRect(0, 0, canvas.width, canvas.height);
  savedSignatureBase64 = "";
}

/* ==========================================================================
   GATEWAY SYSTEM ACCESS CONTROL WITH PERMANENT SESSION SAVER
   ========================================================================== */
function triggerGatewayAccessVerification() {
  const inputField = document.getElementById('gatewaySearchInput').value.trim().toLowerCase();
  
  if (inputField === "") {
    showNotification("Don Allah shigar da Suna ko Admission Number dinka don ka shiga!");
    return;
  }

  const matchFound = students.some(st => st.name.toLowerCase() === inputField || st.admission.toLowerCase() === inputField);

  if (matchFound) {
    document.getElementById('professionalLoadingOverlay').style.display = 'flex';
    
    setTimeout(() => {
      document.getElementById('professionalLoadingOverlay').style.display = 'none';
      document.getElementById('gatewayWelcomePage').style.display = 'none';
      document.getElementById('appMainWorkspace').style.display = 'grid'; 

      // ADANA MUTUM A MATSAYIN ACTIVE AMFANIN LOCALSTORAGE NA DIN-DIN-DIN
      AuthService.startSession(inputField);

      // Idan dalibi ne, kai shi shafin Login dinsa kai tsaye
      const isStudent = students.find(st => st.name.toLowerCase() === inputField || st.admission.toLowerCase() === inputField);
      if (isStudent) {
         showSection('studentLoginSection');
         document.getElementById('studentLoginAdmission').value = isStudent.admission;
         loginAsStudent();
      } else {
         showSection('home');
      }

      showNotification("Getway Verification passed", "success");
      logActivity("Gateway Verification", `Verified identity access: ${inputField}`);
    }, 2000);

  } else {
    showNotification("Ba a sami dacewar bayanai cikin tsarin ba! Idan baka yi rajista ba, danna madannin Register a ƙasa.");
  }
}

function redirectGatewayToRegistrationPage() {
  document.getElementById('gatewayWelcomePage').style.display = 'none';
  document.getElementById('appMainWorkspace').style.display = 'grid';
  showSection('register');
}

function logoutEntireSystemWorkspace() {
  // Goge duka Session na rike mutum idan har ya danna Exit da kansa
  AuthService.endSession();
  
  document.getElementById('appMainWorkspace').style.display = 'none';
  document.getElementById('gatewaySearchInput').value = "";
  document.getElementById('gatewayWelcomePage').style.display = 'flex';
}

function showSection(sectionId) {
  if (window.ZacastApp && ZacastApp.canOpen && !ZacastApp.canOpen(sectionId)) { showNotification("You do not have access to that page.", "warning"); return; }
  const sections = document.querySelectorAll('.section');
  sections.forEach(sec => sec.classList.remove('active'));
  
  const target = document.getElementById(sectionId);
  if (target) {
    // Force a reflow before re-adding "active" so the CSS entrance
    // animation reliably restarts every time a section is opened, not
    // just the first time (browsers can otherwise coalesce the
    // remove+add of the same class within one tick).
    void target.offsetWidth;
    target.classList.add('active');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  closeMobileSidebar(); // tapping a menu item on mobile should close the drawer
  updateActiveNavLink(sectionId);
  if (window.ZacastApp && ZacastApp.onSectionOpen) { try { ZacastApp.onSectionOpen(sectionId); } catch (e) { console.warn(e); } }
}

/* ==========================================================================
   MOBILE SIDEBAR DRAWER (hamburger menu for small screens)
   ========================================================================== */
function toggleMobileSidebar() {
  document.querySelector('.sidebar').classList.toggle('mobile-open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
  document.getElementById('mobileMenuBtn').classList.toggle('open');
}
function closeMobileSidebar() {
  document.querySelector('.sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('show');
  document.getElementById('mobileMenuBtn').classList.remove('open');
}

/* ==========================================================================
   SIDEBAR NAVIGATION STATE
   Active-link highlighting, collapsible groups, and a collapsible
   (icon-only) desktop sidebar — all persisted across sessions.
   ========================================================================== */
function updateActiveNavLink(sectionId) {
  document.querySelectorAll('.sidebar .nav-link[data-section]').forEach(btn => {
    const isActive = btn.dataset.section === sectionId;
    btn.classList.toggle('nav-active', isActive);
    if (isActive) { btn.setAttribute('aria-current', 'page'); }
    else { btn.removeAttribute('aria-current'); }
  });
  const activeBtn = document.querySelector('.sidebar .nav-link[data-section="' + sectionId + '"]');
  if (activeBtn) {
    const group = activeBtn.closest('.nav-group');
    if (group) openNavGroup(group.dataset.group);
  }
}

function toggleNavGroup(name) {
  const group = document.querySelector('.nav-group[data-group="' + name + '"]');
  if (!group) return;
  const willOpen = !group.classList.contains('open');
  group.classList.toggle('open', willOpen);
  const header = group.querySelector('.nav-group-header');
  if (header) header.setAttribute('aria-expanded', String(willOpen));
  saveNavGroupState();
}

function openNavGroup(name) {
  const group = document.querySelector('.nav-group[data-group="' + name + '"]');
  if (!group || group.classList.contains('open')) return;
  group.classList.add('open');
  const header = group.querySelector('.nav-group-header');
  if (header) header.setAttribute('aria-expanded', 'true');
  saveNavGroupState();
}

function saveNavGroupState() {
  const state = {};
  document.querySelectorAll('.nav-group').forEach(g => { state[g.dataset.group] = g.classList.contains('open'); });
  localStorage.setItem('sidebarNavGroupState', JSON.stringify(state));
}

function restoreNavGroupState() {
  let state = {};
  try { state = JSON.parse(localStorage.getItem('sidebarNavGroupState')) || {}; } catch (e) { state = {}; }
  document.querySelectorAll('.nav-group').forEach(g => {
    const isOpen = state.hasOwnProperty(g.dataset.group) ? state[g.dataset.group] : true;
    g.classList.toggle('open', isOpen);
    const header = g.querySelector('.nav-group-header');
    if (header) header.setAttribute('aria-expanded', String(isOpen));
  });
}

const SIDEBAR_COLLAPSE_MIN_WIDTH = 901; // icon-only collapse is a desktop-only feature

function toggleSidebarCollapse() {
  if (window.innerWidth < SIDEBAR_COLLAPSE_MIN_WIDTH) return; // no-op on mobile — nothing to toggle
  const wrapper = document.querySelector('.app-workspace-wrapper');
  if (!wrapper) return;
  const collapsed = wrapper.classList.toggle('sidebar-collapsed');
  localStorage.setItem('sidebarCollapsed', collapsed ? 'true' : 'false');
  const btn = document.getElementById('sidebarCollapseBtn');
  if (btn) {
    btn.querySelector('i').className = collapsed ? 'fas fa-angles-right' : 'fas fa-angles-left';
    btn.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  }
}

function restoreSidebarCollapseState() {
  const wrapper = document.querySelector('.app-workspace-wrapper');
  if (!wrapper) return;
  // Never start collapsed on a phone, even if a wider screen saved that
  // preference earlier — there's no button to undo it on mobile.
  if (window.innerWidth < SIDEBAR_COLLAPSE_MIN_WIDTH) return;
  const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  if (collapsed) {
    wrapper.classList.add('sidebar-collapsed');
    const btn = document.getElementById('sidebarCollapseBtn');
    if (btn) {
      btn.querySelector('i').className = 'fas fa-angles-right';
      btn.setAttribute('title', 'Expand sidebar');
      btn.setAttribute('aria-label', 'Expand sidebar');
    }
  }
}

// Safety net: if the window is resized or rotated down into mobile
// width while collapsed (e.g. a tablet turned to portrait), drop the
// collapsed class so the sidebar never gets stuck icon-only.
window.addEventListener('resize', function () {
  if (window.innerWidth < SIDEBAR_COLLAPSE_MIN_WIDTH) {
    const wrapper = document.querySelector('.app-workspace-wrapper');
    if (wrapper) wrapper.classList.remove('sidebar-collapsed');
  }
});

function updateHomeLiveClock() {
  const clockEl = document.getElementById('homeLiveClock');
  if (clockEl) {
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString() + " | " + now.toLocaleDateString();
  }
}

/* ==========================================================================
   INTERACTIVE COMMENTARY & REACTION MECHANICS
   ========================================================================== */
function submitReaction(type, event) {
  appReactions = ReactionService.increment(type);
  
  const iconClass = (type === 'love') ? 'fa-solid fa-heart' : 'fa-solid fa-thumbs-down';
  const popper = document.createElement('div');
  popper.className = 'popping-emoji';
  popper.innerHTML = `<i class="${iconClass}"></i>`;
  popper.style.color = (type === 'love') ? '#ff4d6d' : '#888';
  
  popper.style.left = event.clientX + 'px';
  popper.style.top = event.clientY + 'px';
  document.body.appendChild(popper);
  
  setTimeout(() => { popper.remove(); }, 1000);
  updateAdminDashboardStats();
  showNotification(`Nagode! Reaction dinka na "${type}" ya isa Admin Panel.`);
}

function addPublicComment() {
  const nameInput = document.getElementById('commenterName');
  const textInput = document.getElementById('commentText');
  
  if (!nameInput.value.trim() || !textInput.value.trim()) {
   showNotification("Don Allah cika sunanka da bayanin comment dinka.");
    return;
  }
  
  const newComment = {
    name: nameInput.value.trim(),
    text: textInput.value.trim(),
    timestamp: new Date().toLocaleString()
  };
  
  publicComments = CommentService.add(newComment);
  
  nameInput.value = '';
  textInput.value = '';
  loadCommentsDisplay();
}

function loadCommentsDisplay() {
  const wrapper = document.getElementById('publicCommentsWrapper');
  if (!wrapper) return;
  wrapper.innerHTML = '';
  
  publicComments.slice().reverse().forEach(item => {
    const bubble = document.createElement('div');
    bubble.className = 'comment-bubble';
    bubble.innerHTML = `<strong>${item.name}</strong> <small style="color:#c6e4d0; float:right;">${item.timestamp}</small><p style="margin-top:5px; color:#ddd;">${item.text}</p>`;
    wrapper.appendChild(bubble);
  });
}

function triggerSkillBarsAnimation() {
  const bars = document.querySelectorAll('.bar-inner');
  bars.forEach(bar => {
    const targetWidth = bar.getAttribute('data-width');
    setTimeout(() => { bar.style.width = targetWidth; }, 300);
  });
}

/* ==========================================================================
   REGISTER CONTROL PIPELINES WITH CLOUD EMAIL NOTIFICATION
   ========================================================================== */
function previewFile() {
  const fileInput = document.getElementById('image');
  const preview = document.getElementById('preview');
  const file = fileInput.files[0];
  const emptyState = document.getElementById('imageDropzoneEmpty');
  const filledState = document.getElementById('imageDropzoneFilled');
  const loadingState = document.getElementById('imageDropzoneLoading');
  const errorText = document.getElementById('imageUploadError');

  if (!file) return;

  if (errorText) errorText.style.display = 'none';

  const allowedTypes = ['image/jpeg', 'image/png'];
  if (!allowedTypes.includes(file.type)) {
    if (errorText) { errorText.textContent = 'Please select a JPG or PNG image.'; errorText.style.display = 'block'; }
    fileInput.value = '';
    return;
  }

  const maxSizeBytes = 5 * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    if (errorText) { errorText.textContent = 'That image is too large. Please choose a file under 5MB.'; errorText.style.display = 'block'; }
    fileInput.value = '';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (filledState) filledState.style.display = 'none';
  if (loadingState) loadingState.style.display = 'flex';

  const reader = new FileReader();
  reader.onloadend = function () {
    preview.src = reader.result;
    if (loadingState) loadingState.style.display = 'none';
    if (filledState) filledState.style.display = 'flex';
  };
  reader.onerror = function () {
    if (loadingState) loadingState.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
    if (errorText) { errorText.textContent = 'Could not read that file. Please try again.'; errorText.style.display = 'block'; }
  };
  reader.readAsDataURL(file);
}

function removeSelectedPicture() {
  const fileInput = document.getElementById('image');
  const preview = document.getElementById('preview');
  const emptyState = document.getElementById('imageDropzoneEmpty');
  const filledState = document.getElementById('imageDropzoneFilled');
  if (fileInput) fileInput.value = '';
  if (preview) preview.src = '';
  if (filledState) filledState.style.display = 'none';
  if (emptyState) emptyState.style.display = 'flex';
}

function checkDuplicateAdmission() {
  const admNum = document.getElementById('admission').value.trim();
  const warning = document.getElementById('duplicateWarning');
  const editIndex = document.getElementById('editIndex').value;
  
  if (admNum === '') { warning.style.display = 'none'; return; }
  const isDuplicate = StudentService.isAdmissionTaken(admNum, editIndex === '' ? -1 : editIndex);
  warning.style.display = isDuplicate ? 'block' : 'none';
}

function saveStudent() {
  if (!validateAge()) {
    return;
}

  // 1. Kira validation da farko
  if (!validateForm()) {
    return; // Idan validateForm ya dawo da false, aikin zai tsaya nan
  }

  // 2. Ɗaukar bayanai daga Form
  const name = document.getElementById('name').value.trim();
  const admission = document.getElementById('admission').value.trim();
const department = document.getElementById("deptSearch").value.trim(); 
  const dob = document.getElementById('dob').value;
 const level = document.getElementById('level').value.trim();
  const year = document.getElementById('year').value;
  const program = document.getElementById('program').value;
  const gender = document.getElementById('gender').value;
  const state = document.getElementById('stateInput').value.trim(); 
  const lga = document.getElementById('lgaInput').value.trim();     
  const phone = document.getElementById('phone').value.trim();
  const email = document.getElementById('email').value.trim();
  const status = document.getElementById('studentStatusInput').value;
  const address = document.getElementById('address').value.trim();
  const imgInput = document.getElementById('image');
  const editIndex = document.getElementById('editIndex').value;
  
  // 3. Signature
  const canvas = document.getElementById('signaturePad');
  let savedSignatureBase64 = "";
  if (canvas) { savedSignatureBase64 = canvas.toDataURL(); }
  
  // 4. Hoto (Image Logic)
  if (imgInput && imgInput.files && imgInput.files[0]) {
    ZacastImage.compress(imgInput.files[0], 420, 0.82).then(function(photo) {
      commitSaveAction(name, admission, department, dob, level, year, program, gender, state, lga, phone, email, status, address, photo, savedSignatureBase64, editIndex);
    }).catch(function() { showNotification("Could not read that photo. Please choose another one.", "error"); });
  } else {
    let existingImg = "placeholder.jpg";
    let existingSign = "";
    if (editIndex !== "") {
      existingImg = students[parseInt(editIndex)].image || "placeholder.jpg";
      existingSign = students[parseInt(editIndex)].signature || "";
    }
    commitSaveAction(name, admission, department, dob, level, year, program, gender, state, lga, phone, email, status, address, existingImg, savedSignatureBase64 || existingSign, editIndex);
  }
}
function commitSaveAction(name, admission, department, dob, level, year, program, gender, state, lga, phone, email, status, address, imgBase64, signBase64, editIndex) {
  let record = {
    name, admission, department, dob, level, year, program, gender, state, lga, phone, email, status, address,
    image: imgBase64,
    signature: signBase64,
    registrationDate: new Date().toLocaleString()
  };
  
  if (editIndex === "") {
    students.push(record);
    logActivity("Student Registration", `Registered: ${name}`);
    if (window.ZacastApp && ZacastApp.onStudentRegistered) ZacastApp.onStudentRegistered(admission);
  } else {
    if (window.ZacastApp && ZacastApp.sanitizeEdit) record = ZacastApp.sanitizeEdit(record, students[parseInt(editIndex)]);
    students[parseInt(editIndex)] = record;
    logActivity("Student Modification", `Updated: ${admission}`);
    document.getElementById('editIndex').value = "";
    document.getElementById('registerTitle').innerText = "Register New Student";
  }
  
 StudentService.saveAll(students);

const btn = document.getElementById("saveBtn");

btn.disabled = true;
btn.classList.add("save-loading");

btn.innerHTML = `
<i class="fas fa-spinner"></i>
Saving Student...
`;

const sound = document.getElementById("notificationSound");

setTimeout(()=>{

    clearRegistrationForm();
    clearSignatureCanvas();

    btn.classList.remove("save-loading");
    btn.classList.add("save-success");

    btn.innerHTML = `
<i class="fas fa-circle-check"></i>
Saved Successfully
`;

    if(sound){

        sound.currentTime = 0;

        sound.play().catch(()=>{});

    }

    setTimeout(()=>{

        btn.classList.remove("save-success");

        btn.disabled = false;

        btn.innerHTML = `
<i class="fas fa-save"></i>
Save Student
`;

    },1500);

},2000);
}


function clearRegistrationForm() {

    document.getElementById("name").value = "";

    document.getElementById("admission").value = "";

    document.getElementById("deptSearch").value = "";

    document.getElementById("dob").value = "";

    document.getElementById("level").value = "";

    document.getElementById("year").value = "";

    document.getElementById("program").value = "";

    document.getElementById("gender").value = "";

    document.getElementById("stateInput").value = "";

    document.getElementById("lgaInput").value = "";

    document.getElementById("phone").value = "";

    document.getElementById("email").value = "";

    document.getElementById("studentStatusInput").value = "Status";

    document.getElementById("address").value = "";

    document.getElementById("editIndex").value = "";

    document.getElementById("image").value = "";

    document.getElementById("preview").src = "";

    document.getElementById("preview").style.display = "none";

    const dzEmpty = document.getElementById("imageDropzoneEmpty");
    const dzFilled = document.getElementById("imageDropzoneFilled");
    if (dzFilled) dzFilled.style.display = "none";
    if (dzEmpty) dzEmpty.style.display = "flex";
    const dzError = document.getElementById("imageUploadError");
    if (dzError) dzError.style.display = "none";

    const warning = document.getElementById("duplicateWarning");

    if (warning) {
        warning.style.display = "none";
    }

}


/* ==========================================================================
   SEARCH PORTAL TYPING DETECTORS
   ========================================================================== */
function liveSearchTyping() {
  const input = document.getElementById('searchInput').value.toLowerCase().trim();
  const dropdown = document.getElementById('liveSearchDropdown');
  if (input === "") { dropdown.style.display = "none"; return; }
  
  const matches = students.filter(st => st.name.toLowerCase().startsWith(input) || st.admission.toLowerCase().includes(input));
  if (matches.length === 0) { dropdown.style.display = "none"; return; }
  
  dropdown.innerHTML = '';
  dropdown.style.display = "block";
  matches.forEach(student => {
    const row = document.createElement('div');
    row.className = 'live-search-item';
    row.innerHTML = `<i class="fas fa-user"></i> <b>${student.name}</b> (${student.admission})`;
    row.onclick = function() {
      document.getElementById('searchInput').value = student.name;
      dropdown.style.display = "none";
      renderSingleStudentSearchResult(student);
    };
    dropdown.appendChild(row);
  });
}

function searchStudent() {
  const input = document.getElementById('searchInput').value.toLowerCase().trim();
  const resultDiv = document.getElementById('result');
  resultDiv.innerHTML = '';
  
  const found = students.find(st => st.name.toLowerCase() === input || st.admission.toLowerCase() === input);
  if (found) { renderSingleStudentSearchResult(found); }
  else { resultDiv.innerHTML = `<p style="color:red; margin-top:15px;">Ba a sami wani dalibi ba!</p>`; }
}

function renderSingleStudentSearchResult(student) {

const resultDiv=document.getElementById("result");

resultDiv.innerHTML=`

<div class="card">

<h2>${student.name}</h2>

<div style="display:flex;gap:20px;flex-wrap:wrap;">

<img src="${student.image}" onclick="openZoomModal(this.src)">

<div>

<p><b>Admission:</b> ${student.admission}</p>

<p><b>Department:</b> ${student.department}</p>

<p><b>Date of Birth:</b> ${student.dob}</p>

<p><b>Level:</b> ${student.level}</p>

<p><b>Academic Year:</b> ${student.year}</p>

<p><b>Program:</b> ${student.program}</p>

<p><b>Gender:</b> ${student.gender}</p>

<p><b>State:</b> ${student.state}</p>

<p><b>LGA:</b> ${student.lga}</p>

<p><b>Phone:</b> ${student.phone}</p>

<p><b>Email:</b> ${student.email}</p>

<p><b>Status:</b> ${student.status}</p>

<p><b>Address:</b> ${student.address}</p>

<p><b>Registered:</b> ${student.registrationDate}</p>

${student.signature?

`<p><b>Signature</b><br>

<img src="${student.signature}" style="width:150px;border:1px solid #999;color:white;background:white">

</p>`:""}

</div>

</div>

</div>

`;

}


/* ==========================================================================
   STUDENT PORTAL DATA EXTRACTIONS
   ========================================================================== */
function loginAsStudent() {
 
  const admField = document.getElementById('studentLoginAdmission').value.trim();
  const dashboard = document.getElementById('studentPortalDashboard');
  dashboard.innerHTML = '';
  
  const student = students.find(st => st.admission.toLowerCase() === admField.toLowerCase());
  if (!student) { showNotification("Wannan Admission number ba ta cikin bayananmu!"); return; }
  
  const actualGlobalIndex = students.findIndex(st => st.admission === student.admission);
  dashboard.innerHTML=`

<div class="card">

<h2>${student.name}</h2>

<div style="display:flex;gap:20px;flex-wrap:wrap;">

<img src="${student.image}" onclick="openZoomModal(this.src)">
 

<div>

<p><b>Admission:</b> ${student.admission}</p>

<p><b>Department:</b> ${student.department}</p>

<p><b>Date of birth:</b> ${student.dob}</p>

<p><b>Level:</b> ${student.level}</p>

<p><b>Academic Year:</b> ${student.year}</p>

<p><b>Program:</b> ${student.program}</p>

<p><b>Gender:</b> ${student.gender}</p>


<p><b>State:</b> ${student.state}</p>

<p><b>LGA:</b> ${student.lga}</p>

<p><b>Phone:</b> ${student.phone}</p>

<p><b>Email:</b> ${student.email}</p>

<p><b>Status:</b> ${student.status}</p>

<p><b>Address:</b> ${student.address}</p>

</div>

</div>

${student.signature?

`<h3>Digital Signature</h3>

<img src="${student.signature}" style="width:180px;color:white;background:white" >`

:""}

<br>

<button class="action-btn btn-print"

onclick="generateAndPrintStudentIDCard('${student.admission}')">
<i class="fas fa-print"></i>

Print ID Card

</button>

<button class="action-btn btn-edit" data-admin="1" 

onclick="setupEditStudentProfile(${actualGlobalIndex})">

Edit Profile

</button>
   <button class="action-btn btn-pdf" onclick="exportSingleStudentProfileToPDF('${student.admission}')">
   <i class="fas fa-file-pdf"></i> PDF</button>


</div>

`;
}

const stateLgaData = {
    "Abia": ["Aba North", "Aba South", "Arochukwu", "Bende", "Ikwuano", "Isiala Ngwa North", "Isiala Ngwa South", "Isuikwuato", "Obi Ngwa", "Ohafia", "Osisioma", "Ugwunagbo", "Ukwa West", "Ukwa East", "Umuahia North", "Umuahia South", "Umunneochi"],
  "Adamawa": ["Madagali", "Michika", "Mubi North", "Mubi South", "Hong", "Gombi", "Song", "Girei", "Yola North", "Yola South", "Fufore", "Mayo Belwa", "Jada", "Ganye", "Toungo", "Lamurde", "Numuman", "Guyuk", "Shelleng", "Demsa"],
  "Akwa Ibom": ["Abak", "Eastern Obolo", "Eket", "Esit Eket", "Essien Udim", "Etim Ekpo", "Etinan", "Ibeno", "Ibesikpo Asutan", "Ibiono-Ibom", "Ika", "Ikono", "Ikot Abasi", "Ikot Ekpene", "Ini", "Itu", "Mbo", "Mkpat-Enin", "Nsit-Atai", "Nsit-Ibom", "Nsit-Ubium", "Obobi", "Okobo", "Onna", "Oron", "Oruk Anam", "Udung-Uko", "Ukanafan", "Uruan", "Urue-Offong/Oruko", "Uyo"],
  "Anambra": ["Aguata", "Anambra East", "Anambra West", "Anaocha", "Awka North", "Awka South", "Ayamelum", "Dunukofia", "Ekwusigo", "Idemili North", "Idemili South", "Ihiala", "Njikoka", "Nnewi North", "Nnewi South", "Ogbaru", "Onitsha North", "Onitsha South", "Orumba North", "Orumba South", "Oyi"],
  "Bauchi": ["Alkaleri", "Bauchi", "Bogoro", "Dambam", "Darazo", "Dass", "Gamawa", "Ganjuwa", "Giade", "Itas/Gadau", "Jama'are", "Katagum", "Kirfi", "Misau", "Ningi", "Shira", "Tafawa Balewa", "Toro", "Warji", "Zaki"],
  "Bayelsa": ["Brass", "Ekeremor", "Kolokuma/Opokuma", "Nembe", "Ogbia", "Sagbama", "Southern Ijaw", "Yenagoa"],
  "Benue": ["Agatu", "Apa", "Ado", "Buruku", "Gboko", "Guma", "Gwer East", "Gwer West", "Katsina-Ala", "Konshisha", "Kwande", "Logo", "Makurdi", "Obi", "Ogbadibo", "Ohimini", "Oju", "Okpokwu", "Oturkpo", "Tarka", "Ukum", "Ushongo", "Vandeikya"],
  "Borno": ["Abadam", "Askira/Uba", "Bama", "Bayo", "Biu", "Chibok", "Damboa", "Dikwa", "Gubio", "Guzamala", "Gwoza", "Hawul", "Jere", "Kaga", "Kala/Balge", "Konduga", "Kukawa", "Kwaya Kusar", "Mafa", "Magumeri", "Maiduguri", "Marte", "Mobbar", "Monguno", "Ngala", "Nganzai", "Shani"],
  "Cross River": ["Abi", "Akamkpa", "Akpabuyo", "Bakassi", "Bekwarra", "Biase", "Boki", "Calabar Municipal", "Calabar South", "Etung", "Ikom", "Obanliku", "Obubra", "Obudu", "Odukpani", "Ogoja", "Yakuur", "Yala"],
  "Delta": ["Aniocha North", "Aniocha South", "Bomadi", "Burutu", "Ethiope East", "Ethiope West", "Ika North East", "Ika South", "Isoko North", "Isoko South", "Ndokwa East", "Ndokwa West", "Okpe", "Oshimili North", "Oshimili South", "Patani", "Sapele", "Udu", "Ughelli North", "Ughelli South", "Ukwuani", "Uvwie", "Warri North", "Warri South", "Warri South West"],
  "Ebonyi": ["Abakaliki", "Afikpo North", "Afikpo South", "Ebonyi", "Ezza North", "Ezza South", "Ikwo", "Ishielu", "Ivo", "Izzi", "Ohaozara", "Ohaukwu", "Onicha"],
  "Edo": ["Akoko-Edo", "Egor", "Esan Central", "Esan North-East", "Esan South-East", "Esan West", "Etsako Central", "Etsako East", "Etsako West", "Igueben", "Ikpoba Okha", "Orhionmwon", "Oredo", "Ovia North-East", "Ovia South-West", "Owan East", "Owan West", "Uhunmwonde"],
  "Ekiti": ["Ado Ekiti", "Efon", "Ekiti East", "Ekiti South-West", "Ekiti West", "Emure", "Gbonyin", "Ido Osi", "Ijero", "Ikere", "Ikole", "Ilemeji", "Irepodun/Ifelodun", "Ise/Orun", "Moba", "Oye"],
  "Enugu": ["Aninri", "Awgu", "Enugu East", "Enugu North", "Enugu South", "Ezeagu", "Igbo Etiti", "Igbo Eze North", "Igbo Eze South", "Isi Uzo", "Nkanu East", "Nkanu West", "Nsukka", "Oji River", "Udenu", "Udi", "Uzo Uwani"],
  "FCT - Abuja": ["Abaji", "Bwari", "Gwagwalada", "Kuje", "Kwali", "Municipal Area Council"],
  "Gombe": ["Akko", "Balanga", "Billiri", "Dukku", "Funakaye", "Gombe", "Kaltungo", "Kwami", "Nafada", "Shongom", "Yamaltu/Deba"],
  "Imo": ["Aboh Mbaise", "Ahiazu Mbaise", "Ehime Mbano", "Ezinihitte", "Ideato North", "Ideato South", "Ihitte/Uboma", "Ikeduru", "Isiala Mbano", "Isu", "Mbaitoli", "Ngor Okpala", "Njaba", "Nkwerre", "Nwangele", "Obowo", "Oguta", "Ohaji/Egbema", "Okigwe", "Orlu", "Orsu", "Oru East", "Oru West", "Owerri Municipal", "Owerri North", "Owerri South", "Njaba"],
  "Jigawa": ["Auyo", "Babura", "Biriniwa", "Birnin Kudu", "Buji", "Dutse", "Gagarawa", "Garki", "Gumel", "Guri", "Gwaram", "Gwiwa", "Hadejia", "Jahun", "Kafim Hausa", "Kaugama", "Kazaure", "Kiri Kasama", "Kiyawa", "Maigatari", "Malam Madori", "Miga", "Ringim", "Roni", "Sule Tankarkar", "Taura", "Yankwashi"],
  "Kaduna": ["Birnin Gwari", "Chikun", "Giwa", "Igabi", "Ikara", "Jaba", "Jema'a", "Kachia", "Kaduna North", "Kaduna South", "Kagarko", "Kajuru", "Kaura", "Kauru", "Kubau", "Kudan", "Lere", "Makarfi", "Sabon Gari", "Sanga", "Soba", "Zangon Kataf", "Zaria"],
  "Kano": ["Ajingi", "Albasu", "Bagwai", "Bebeji", "Bichi",
     "Bunkure", "Dala", "Dambatta", "Dawakin Kudu", "Dawakin Tofa", "Doguwa", "Fagge", "Gabasawa", "Garko", "Garun Mallam", "Gaya", "Gezawa", "Gwale", "Gwarzo", "Kabo", "Kano Municipal", "Karaye", "Kibiya", "Kiru", "Kumbotso", "Kunchi", "Kura", "Madobi", "Minjibir", "Nasarawa", "Rano", "Rimin Gado", "Rogo", "Shanono", "Sumaila", "Takai", "Tarauni", "Tofa", "Tsanyawa", "Tudun Wada", "Ungogo", "Warawa", "Wudil"],
  "Katsina": ["Bakori", "Batagarawa", "Batsari", "Baure", "Bindawa", "Charanchi", "Dandume", "Danja", "Dan Musa", "Daura", "Dutsin Ma", "Faskari", "Funtua", "Ingawa", "Jibia", "Kafur", "Kaita", "Kankara", "Kankia", "Katsina", "Kurfi", "Kusada", "Mai'Adua", "Malumfashi", "Mani", "Mashi", "Matazu", "Musawa", "Rimi", "Sabuwa", "Safana", "Sandamu", "Zango"],
  "Kebbi": ["Aleiro", "Arewa Dandi", "Argungu", "Augie", "Bagudo", "Birnin Kebbi", "Bunza", "Dandi", "Fakai", "Gwandu", "Jega", "Kalgo", "Koko/Besse", "Maiyama", "Ngaski", "Sakaba", "Shanga", "Suru", "Wasagu/Danko", "Yauri", "Zuru"],
  "Kogi": ["Adavi", "Ajaokuta", "Ankpa", "Bassa", "Dekina", "Ibaji", "Idah", "Igalamela Odolu", "Ijumu", "Kabba/Bunu", "Kogi", "Lokoja", "Mopa Muro", "Ofu", "Ogori/Magongo", "Okehi", "Okene", "Olamaboro", "Omala", "Yagba East", "Yagba West"],
  "Kwara": ["Asa", "Baruten", "Edu", "Ekiti", "Ifelodun", "Ilorin East", "Ilorin South", "Ilorin West", "Irepodun", "Isin", "Kaiama", "Moro", "Offa", "Oke Ero", "Oyun", "Pategi"],
  "Lagos": ["Agege", "Ajeromi-Ifelodun", "Alimosho", "Amuwo-Odofin", "Apapa", "Badagry", "Epe", "Eti Osa", "Ibeju-Lekki", "Ifako-Ijaiye", "Ikorodu", "Kosofe", "Lagos Island", "Lagos Mainland", "Mushin", "Ojo", "Oshodi-Isolo", "Shomolu", "Surulere"],
  "Nasarawa": ["Akwanga", "Awe", "Doma", "Karu", "Keana", "Keffi", "Kokona", "Lafia", "Nasarawa", "Nasarawa Egon", "Obi", "Toto", "Wamba"],
  "Niger": ["Agaie", "Agwara", "Bida", "Borgu", "Bosso", "Chanchaga", "Edati", "Gbako", "Gurara", "Katcha", "Kontagora", "Lapai", "Lavun", "Magama", "Mariga", "Mashegu", "Mokwa", "Moya", "Paikoro", "Rafi", "Rijau", "Shiroro", "Suleja", "Tafa", "Wushishi"],
  "Ogun": ["Abeokuta North", "Abeokuta South", "Ado-Odo/Ota", "Egbado North", "Egbado South", "Ewekoro", "Ifo", "Ijebu East", "Ijebu North", "Ijebu North East", "Ijebu Ode", "Ikenne", "Imeko Afon", "Ipokia", "Obafemi Owode", "Odeda", "Odogbolu", "Ogun Waterside", "Remo North", "Shagamu"],
  "Ondo": ["Akoko North-East", "Akoko North-West", "Akoko South-West", "Akoko South-East", "Akure North", "Akure South", "Ese Odo", "Idanre", "Ifedore", "Ilaje", "Ile Oluji/Okeigbo", "Irele", "Odigbo", "Okitipupa", "Ondo East", "Ondo West", "Ose", "Owo"],
  "Osun": ["Atakunmosa East", "Atakunmosa West", "Aiyedaade", "Aiyedire", "Boluwaduro", "Boripe", "Ede North", "Ede South", "Ife Central", "Ife East", "Ife North", "Ife South", "Egbedore", "Ejigbo", "Ifedayo", "Ifelodun", "Ila", "Ilesa North", "Ilesa South", "Irepodun", "Irewole", "Isokan", "Iwo", "Obokun", "Odo Otin", "Ola Oluwa", "Olorunda", "Oriade", "Orolu", "Osogbo"],
  "Oyo": ["Afijio", "Akinyele", "Atiba", "Atisbo", "Egbeda", "Ibadan North", "Ibadan North-East", "Ibadan North-West", "Ibadan South-East", "Ibadan South-West", "Ibarapa Central", "Ibarapa East", "Ibarapa North", "Ido", "Irepo", "Iseyin", "Itesiwaju", "Iwajowa", "Kajola", "Lagelu", "Ogbomosho North", "Ogbomosho South", "Ogo Oluwa", "Olorunsogo", "Oluyole", "Ona Ara", "Orelope", "Ori Ire", "Oyo", "Oyo East", "Saki East", "Saki West", "Surulere"],
  "Plateau": ["Bokkos", "Barkin Ladi", "Bassa", "Jos East", "Jos North", "Jos South", "Kanam", "Kanke", "Langtang North", "Langtang South", "Mangu", "Mikang", "Pankshin", "Qua'an Pan", "Riyom", "Shendam", "Wase"],
  "Rivers": ["Abua/Odual", "Ahoada East", "Ahoada West", "Akuku Toru", "Andoni", "Asari-Toru", "Bonny", "Degema", "Eleme", "Emuoha", "Etche", "Ikwerre", "Oyigbo", "Port Harcourt", "Khana", "Obio/Akpor", "Ogba/Egbema/Ndoni", "Ogu/Bolo", "Okrika", "Opobo/Nkoro", "Omuma", "Tai"],
  "Sokoto": ["Binji", "Bodinga", "Dange Shuni", "Gada", "Goronyo", "Gudu", "Gwadabawa", "Illela", "Isa", "Kebbe", "Kware", "Rabah", "Sabon Birni", "Shagari", "Silame", "Sokoto North", "Sokoto South", "Tambuwal", "Tangaza", "Tureta", "Wamako", "Wurno", "Yabo"],
  "Taraba": ["Ardo Kola", "Bali", "Donga", "Gashaka", "Gassol", "Ibi", "Jalingo", "Karim Lamido", "Kumi", "Lau", "Sardauna", "Takum", "Ussa", "Wukari", "Yorro", "Zing"],
  "Yobe": ["Bade", "Bursari", "Damaturu", "Fika", "Fune", "Geidam", "Gujba", "Gulani", "Jakusko", "Karasuwa", "Machina", "Nangere", "Nguru", "Potiskum", "Tarmuwa", "Yunusari", "Yusufari"],
  "Zamfara": ["Anka", "Bakura", "Birnin Magaji/Kiyaw", "Bukkuyum", "Bungudu", "Gummi", "Gusau", "Kaura Namoda", "Maradun", "Maru", "Shinkafi", "Talata Mafara", "Tsafe", "Zurmi"]
};

// Cika State list
function initStates() {
    const list = document.getElementById('stateList');
    Object.keys(stateLgaData).forEach(state => {
        list.innerHTML += `<option value="${state}">`;
    });
}

// Update LGA list lokacin da aka zaba State
function updateLgaList() {
    const selectedState = document.getElementById('stateInput').value;
    const lgaList = document.getElementById('lgaList');
    const lgaInput = document.getElementById('lgaInput');
    
    lgaInput.value = ""; // Share tsohon LGA
    lgaList.innerHTML = ""; // Share tsohon list
    
    if (stateLgaData[selectedState]) {
        stateLgaData[selectedState].forEach(lga => {
            lgaList.innerHTML += `<option value="${lga}">`;
        });
    }
}

// Kira wannan lokacin da shafi ya tashi
document.addEventListener("DOMContentLoaded", initStates);


/* ==========================================================================
   ADMIN AUTHENTICATIONS & CONTROL DASHBOARD ROSTER LISTS
   ========================================================================== */
function triggerAdminLoginModal() { document.getElementById('adminLoginModalOverlay').style.display = 'flex'; }
function closeAdminLoginModal() { document.getElementById('adminLoginModalOverlay').style.display = 'none'; }

async function executeAdminAuthentication() {
  const userStr = document.getElementById('adminUserField').value.trim();
  const passStr = document.getElementById('adminPassField').value.trim();
  const passHash = await hashText(passStr);

  if (adminAccounts.some(acc => acc.username === userStr && acc.password === passHash)) {
    closeAdminLoginModal();
    showSection('admin');
    loadAdminPanel();
  } else { showNotification("Incorrect password, access denied."); }
}

function executeAdminPanelLiveSearch() {
  adminPanelSearchQuery = document.getElementById('adminPanelLiveSearchBar').value.toLowerCase().trim();
  currentAdminPage = 1;
  renderAdminStudentRosterAccordions();
}

function initializeFilterOptions() {
  const filterDropdown = document.getElementById('adminDeptFilter');
  if (!filterDropdown) return;
  filterDropdown.innerHTML = '<option value="All">All Departments</option>';
  [...new Set(students.map(st => st.department).filter(Boolean))].forEach(dp => {
    filterDropdown.innerHTML += `<option value="${dp}">${dp}</option>`;
  });
}

function loadAdminPanel() {
  updateAdminDashboardStats();
  renderAdminStudentRosterAccordions();
  renderRecentRegistrations();
  renderActivityLogsDashboard();
  refreshProfessionalDashboard();
}

function updateAdminDashboardStats() {
  const departments = [...new Set(students.map(st => st.department).filter(Boolean))];
  const active = students.filter(st => String(st.status || '').toLowerCase() === 'active').length;
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.innerText = value; };
  set('totalStudents', students.length);
  set('totalDepartments', departments.length);
  set('activeStudentsCount', active);
  set('adminReactionCount', `Loves: ${appReactions.love} | Hates: ${appReactions.hate}`);
  const attendance = window.AttendanceService ? AttendanceService.getAll() : [];
  let attendanceRate = null;
  if (Array.isArray(attendance) && attendance.length) {
    const present = attendance.filter(a => String(a.status || '').toLowerCase() === 'present').length;
    attendanceRate = Math.round((present / attendance.length) * 100);
  }
  set('attendanceHealth', attendanceRate === null ? '—' : `${attendanceRate}%`);
}

function refreshProfessionalDashboard() {
  updateAdminDashboardStats();
  renderDepartmentMiniChart();
  renderProfessionalActivityTimeline();
}

function renderDepartmentMiniChart() {
  const el = document.getElementById('departmentMiniChart');
  if (!el) return;
  const counts = {};
  students.forEach(st => { const d = st.department || 'Unassigned'; counts[d] = (counts[d] || 0) + 1; });
  const rows = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 7);
  if (!rows.length) { el.innerHTML = '<div class="timeline-detail">No student data available yet.</div>'; return; }
  const max = Math.max(...rows.map(r => r[1]), 1);
  el.innerHTML = rows.map(([name,count]) => `
    <div class="dept-bar-row"><span class="dept-bar-label" title="${escapeNotificationText(name)}">${escapeNotificationText(name)}</span>
      <div class="dept-bar-track"><div class="dept-bar-fill" style="width:${Math.max(6,(count/max)*100)}%"></div></div>
      <span class="dept-bar-count">${count}</span></div>`).join('');
}

function renderProfessionalActivityTimeline() {
  const el = document.getElementById('professionalActivityTimeline');
  if (!el) return;
  const list = (typeof activities !== 'undefined' ? activities : (window.ActivityService ? ActivityService.getAll() : [])).slice().reverse().slice(0, 8);
  if (!list.length) { el.innerHTML = '<div class="timeline-detail">No recent activity recorded.</div>'; return; }
  el.innerHTML = list.map(item => {
    const icon = /student/i.test(item.type) ? 'fa-user' : /result/i.test(item.type) ? 'fa-file-lines' : /announcement/i.test(item.type) ? 'fa-bullhorn' : /backup/i.test(item.type) ? 'fa-database' : 'fa-bolt';
    return `<div class="timeline-item"><div class="timeline-dot"><i class="fas ${icon}"></i></div><div><div class="timeline-type">${escapeNotificationText(item.type || 'Activity')}</div><div class="timeline-detail">${escapeNotificationText(item.detail || '')}</div></div><div class="timeline-time">${escapeNotificationText(item.time || '')}</div></div>`;
  }).join('');
}


function renderAdminStudentRosterAccordions() {
  const container = document.getElementById('adminStudentsRoster');
  if (!container) return;
  container.innerHTML = '';
  
  const activeFilter = document.getElementById('adminDeptFilter').value;
  let filteredList = students;
  
  if (activeFilter !== "All") filteredList = filteredList.filter(st => st.department === activeFilter);
  if (adminPanelSearchQuery !== "") {
    filteredList = filteredList.filter(st => st.name.toLowerCase().includes(adminPanelSearchQuery) || st.admission.toLowerCase().includes(adminPanelSearchQuery));
  }
  
  const startIndex = (currentAdminPage - 1) * recordsPerPage;
  document.getElementById('pageNumberDisplay').innerText = `Page ${currentAdminPage} of ${Math.ceil(filteredList.length / recordsPerPage) || 1}`;
  
  filteredList.slice(startIndex, startIndex + recordsPerPage).forEach((student) => {
    const actualGlobalIndex = students.findIndex(st => st.admission === student.admission);
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="roster-header-tab" onclick="toggleAccordionContentDisplay(this)">
        <h4><i class="fas fa-chevron-circle-down"></i> ${student.name} (${student.admission})</h4>
        <span style="font-size:12px;">${student.department}</span>
      </div>
      <div class="roster-body-content">
        <div style="flex:1; font-size:13px; line-height:1.7;">
   <img src="${student.image || 'placeholder.jpg'}"
style="
width:120px;
height:120px;
object-fit:cover;
border-radius:8px;
border:2px solid var(--accent-color);
display:block;
"
onclick="openZoomModal(this.src)">

<div><b>Name:</b> ${student.name}</div>

<div><b>Admission No:</b> ${student.admission}</div>

<div><b>Department:</b> ${student.department}</div>

<div><b>Date of Birth:</b> ${student.dob}</div>

<div><b>Level:</b> ${student.level}</div>

<div><b>Academic Year:</b> ${student.year}</div>

<div><b>Program:</b> ${student.program}</div>

<div><b>Gender:</b> ${student.gender}</div>


<div><b>State:</b> ${student.state}</div>

<div><b>LGA:</b> ${student.lga}</div>

<div><b>Phone:</b> ${student.phone}</div>

<div><b>Email:</b> ${student.email}</div>

<div><b>Status:</b> ${student.status}</div>

<div><b>Address:</b> ${student.address}</div>

<div><b>Registered:</b> ${student.registrationDate}</div>

${student.signature ? `
<hr>

<b>Student Signature</b><br>

<img src="${student.signature}" style="width:120px;height:40px;border:1px solid #999;background:#fff;"  onclick="openZoomModal(this.src)">
` : ""}

</div>
        </div>
        <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:5px;">
          <button class="action-btn btn-edit" data-admin="1"  onclick="setupEditStudentProfile(${actualGlobalIndex})"><i class="fas fa-edit"></i> Edit</button>
          <button class="action-btn btn-pdf" onclick="exportSingleStudentProfileToPDF('${student.admission}')"><i class="fas fa-file-pdf"></i> PDF</button>
          <button class="action-btn btn-print" onclick="generateAndPrintStudentIDCard('${student.admission}')"><i class="fas fa-print"></i> ID Card</button>
          <button class="action-btn" style="background:red;" onclick="deleteStudentDataRecord(${actualGlobalIndex})"><i class="fas fa-trash"></i> Delete</button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}

function toggleAccordionContentDisplay(element) {
  const panel = element.nextElementSibling;
  const isVisible = panel.style.display === "block";
  document.querySelectorAll('.roster-body-content').forEach(p => p.style.display = "none");
  panel.style.display = isVisible ? "none" : "block";
}

function changePage(direction) {
  currentAdminPage += direction;
  if(currentAdminPage < 1) currentAdminPage = 1;
  renderAdminStudentRosterAccordions();
}

function renderRecentRegistrations() {
  const container = document.getElementById('recentRegistrations');
  if (!container) return; container.innerHTML = '';
  students.slice(-3).reverse().forEach(st => {
    container.innerHTML += `<div class="activity"><strong>${st.name}</strong> sabon dalibi ne a sashen ${st.department}.</div>`;
  });
}

/* ==========================================================================
   ACTIVITY LOG (History) — searchable, filterable, with per-type icons
   and a staggered entrance animation for a more interactive feel.
   ========================================================================== */
const ACTIVITY_ICONS = {
  "Student Registration": "fa-user-plus",
  "Student Deletion": "fa-user-xmark",
  "Data Backup": "fa-database",
  "Data Restore": "fa-upload",
  "Roster Export": "fa-file-pdf",
  "Profile Update": "fa-user-pen"
};
function iconForActivityType(type) {
  for (const key in ACTIVITY_ICONS) {
    if (type && type.toLowerCase().includes(key.toLowerCase().split(" ")[0])) return ACTIVITY_ICONS[key];
  }
  return "fa-circle-info";
}

function populateActivityTypeFilter() {
  const select = document.getElementById('activityLogTypeFilter');
  if (!select) return;
  const currentValue = select.value;
  const types = Array.from(new Set(activities.map(a => a.type).filter(Boolean))).sort();
  select.innerHTML = `<option value="">All activity types</option>` +
    types.map(t => `<option value="${t}">${t}</option>`).join("");
  select.value = currentValue;
}

function clearActivityLogFilters() {
  const search = document.getElementById('activityLogSearch');
  const typeFilter = document.getElementById('activityLogTypeFilter');
  if (search) search.value = "";
  if (typeFilter) typeFilter.value = "";
  renderActivityLogsDashboard();
}

function renderActivityLogsDashboard() {
  const container = document.getElementById('activities');
  if (!container) return;

  populateActivityTypeFilter();

  const query = (document.getElementById('activityLogSearch')?.value || "").trim().toLowerCase();
  const typeFilter = document.getElementById('activityLogTypeFilter')?.value || "";

  const filtered = activities.slice().reverse().filter(act => {
    const matchesType = !typeFilter || act.type === typeFilter;
    const matchesQuery = !query || `${act.type} ${act.detail}`.toLowerCase().includes(query);
    return matchesType && matchesQuery;
  });

  const statsEl = document.getElementById('activityLogStats');
  if (statsEl) {
    statsEl.innerHTML = `<span><i class="fas fa-list-check"></i> ${filtered.length} of ${activities.length} event${activities.length === 1 ? "" : "s"}</span>`;
  }

  container.innerHTML = '';
  filtered.forEach((act, i) => {
    const row = document.createElement('div');
    row.className = 'activity activity-animated';
    row.style.animationDelay = `${Math.min(i, 20) * 35}ms`;
    row.innerHTML = `<i class="fas ${iconForActivityType(act.type)} activity-icon"></i>
      <div class="activity-text"><small>${act.time}</small> - <b>${act.type}</b>: ${act.detail}</div>`;
    container.appendChild(row);
  });

  const emptyEl = document.getElementById('activityLogEmpty');
  if (emptyEl) emptyEl.style.display = filtered.length ? "none" : "block";
}

let pendingDeleteIndex = null;

// Opens a real confirmation dialog before deleting — replaces the old logic
// that showed a "Deleted Successfully" toast without ever deleting anything.
function deleteStudentDataRecord(globalIndex) {
  const student = students[globalIndex];
  if (!student) return;
  pendingDeleteIndex = globalIndex;
  document.getElementById('deleteConfirmName').textContent = `${student.name} (${student.admission})`;
  document.getElementById('deleteConfirmModal').style.display = 'flex';
}

function closeDeleteConfirmModal() {
  pendingDeleteIndex = null;
  document.getElementById('deleteConfirmModal').style.display = 'none';
}

function confirmDeleteStudent() {
  if (pendingDeleteIndex === null) return;
  const removed = students[pendingDeleteIndex];
  students.splice(pendingDeleteIndex, 1);
  StudentService.saveAll(students);
  logActivity("Student Deletion", `Deleted: ${removed ? removed.admission : 'unknown'}`);
  closeDeleteConfirmModal();
  loadAdminPanel();
  showNotification("Student deleted successfully", "success");
}

/* ==========================================================================
   EXPORT MANAGEMENT ARCHITECTURES WITH SIGNATURE INCLUSION
   ========================================================================== */
function exportToExcel() {
  if (!students.length) { showNotification("There are no students to export yet.", "warning"); return; }
  showNotification("Exporting roster to Excel...", "info");
  const rows = students.map((st, i) => ({ "S/N": i + 1, "Name": st.name, "Admission No": st.admission, "Department": st.department }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Roster");
  XLSX.writeFile(workbook, "Zacast_Roster.xlsx");
  showNotification("Roster exported successfully", "success");
}

function exportSingleStudentProfileToPDF(admissionNumber) {
 

    const student = students.find(st => st.admission === admissionNumber);

    if (!student) {
       showNotification("Student not found!", "error");
        return;
    }
    showNotification("Generating PDF...", "info");

    const content = document.createElement("div");
    content.innerHTML = `
        <div style="padding:20px;font-family:Arial;">
            <h2 style="text-align:center;">
                ZAMFARA COLLEGE OF ARTS AND SCIENCE TECHNOLOGY
            </h2>

            <hr>

            <img src="${student.image || 'placeholder.jpg'}"
                 style="width:120px;height:130px;border:1px solid #000;object-fit:cover;">

            <p><b>Name:</b> ${student.name}</p>
            <p><b>Admission:</b> ${student.admission}</p>
            <p><b>Department:</b> ${student.department}</p>
            <p><b>Level:</b> ${student.level}</p>
            <p><b>Academic year:</b> ${student.year}</p>
            <p><b>Program:</b> ${student.program}</p>
            <p><b>Gender:</b> ${student.gender}</p>
            <p><b>State:</b> ${student.state}</p>
            <p><b>Local government:</b> ${student.lga}</p>
            <p><b>Phone number:</b> ${student.phone}</p>
            <p><b>Status:</b> ${student.status}</p>
            <p><b>Email:</b> ${student.email}</p>

            ${
              student.signature
                ? `<p><b>Signature</b><br>
                   <img src="${student.signature}" style="width:150px;">
                   </p>`
                : ""
            }

        </div>
    `;

    exportHTMLToPDF(content, `Profile_${student.admission}.pdf`, { orientation: "portrait", width: 800 })
        .then(() => showNotification("PDF generated successfully", "success"))
        .catch(() => showNotification("Something went wrong generating the PDF", "error"));
}
function generateAndPrintStudentIDCard(admissionNumber) {
  const student = students.find(st => st.admission === admissionNumber);
  if (!student) return;
  const image = student.image || "";
const signature = student.signature || "";
const phone = student.phone || "";
const gender = student.gender || "";
const state = student.state || "";
const lga = student.lga || "";
const program = student.program || "";
const year = student.year || "";
const status = student.status || "";
  
  const cardWindow = window.open('', '_blank', 'width=450,height=600');
  cardWindow.document.write(`
    <html>
    <head>
      <style>
        body { display:flex; justify-content:center; align-items:center; height:100vh; margin:0; font-family:sans-serif;}
        .card { width:350px; height:220px; border:3px solid var(--accent-color); border-radius:10px; background:#005a33; color:#fff; padding:12px; position:relative; box-sizing:border-box; }
        .hdr { font-size:11px; text-align:center; color:var(--accent-color); margin-bottom:10px; border-bottom:1px solid var(--accent-color); padding-bottom:4px; }
        .box { display:flex; gap:10px; }
        .pic { width:80px; height:90px; border:1px solid var(--accent-color); object-fit:cover; }
        .info { font-size:10px; line-height:1.4; font-family:monospace; }
        .sign-slot { position:absolute; bottom:10px; right:15px; text-align:center; }
        .sign-img { width:90px; height:30px; object-fit:contain; background:#fff; border-radius:2px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="hdr">ZAMFARA COLLEGE OF ARTS & SCIENCE TECHNOLOGY</div>
        <div class="box">
          <img class="pic" src="${image}">
          <div class="info">

<div><b>NAME:</b> ${student.name}</div>

<div><b>ADM NO:</b> ${student.admission}</div>

<div><b>DEPARTMENT:</b> ${student.department}</div>

<div><b>DATE OF BIRTH:</b> ${student.dob}</div>

<div><b>LEVEL:</b> ${student.level}</div>

<div><b>YEAR:</b> ${year}</div>

<div><b>PROGRAM:</b> ${program}</div>

<div><b>GENDER:</b> ${gender}</div>


<div><b>STATE:</b> ${state}</div>

<div><b>LGA:</b> ${lga}</div>

<div><b>PHONE:</b> ${phone}</div>

<div><b>STATUS:</b> ${status}</div>

</div>
        </div>
        ${student.signature ? `<div class="sign-slot"><img class="sign-img" src="${signature}"><div style="font-size:7px; color:var(--accent-color);">STUDENT SIGN</div></div>` : ''}
        <div id="qrCodeContainer" style="position:absolute; bottom:10px; left:15px; background:#fff; padding:3px; border-radius:3px; line-height:0;"></div>
      </div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
      <script>
        window.onload = function() {
          try {
            new QRCode(document.getElementById('qrCodeContainer'), {
              text: '${window.ZACAST_VERIFY_BASE()}?verify=${encodeURIComponent(student.admission)}',
              width: 54, height: 54, colorDark: '#000000', colorLight: '#ffffff'
            });
          } catch (e) {}
          setTimeout(function(){ window.print(); setTimeout(function(){ window.close(); }, 500); }, 350);
        };
      <\/script>
    </body>
    </html>
  `);
  cardWindow.document.close();
}

/* ==========================================================================
   PHOTO ZOOM CAPABILITIES
   ========================================================================== */
function openZoomModal(imageSrc) {
  const overlay = document.getElementById('photoZoomModalOverlay');
  const targetImg = document.getElementById('zoomedImageDisplay');
  if (overlay && targetImg) { targetImg.src = imageSrc; overlay.style.display = 'flex'; }
}
window.closeZoomModal = function() {
  const overlay = document.getElementById('photoZoomModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

/* ==========================================================================
   THEME SETTINGS WITH NEW EXTENDED THREE SPECIAL COLOR MODES
   ========================================================================== */
function applyThemeScheme(themeClass) {
  document.body.classList.remove('matrix-theme', 'brown-theme', 'midnight-theme', 'ocean-theme', 'cyberpunk-theme');
  if (['matrix', 'brown', 'midnight', 'ocean', 'cyberpunk'].includes(themeClass)) {
    document.body.classList.add(`${themeClass}-theme`);
    localStorage.setItem('zacastSavedTheme', themeClass);
  } else {
    localStorage.removeItem('zacastSavedTheme');
  }
  showNotification("Theme changed successfully", "success");
  logActivity("Theme Change", `App theme interface loaded: ${themeClass}`);
}

// Re-applies whichever theme the user picked last time, on every page load.
function restoreSavedTheme() {
  // One-time reset: the new green/white design is the default, so drop any
  // old theme (brown, matrix, ...) saved before this version was installed.
  try {
    if (localStorage.getItem('zacastDesignV2') !== '1') {
      localStorage.removeItem('zacastSavedTheme');
      localStorage.setItem('zacastDesignV2', '1');
    }
  } catch (e) {}
  const saved = localStorage.getItem('zacastSavedTheme');
  if (saved && ['matrix', 'brown', 'midnight', 'ocean', 'cyberpunk'].includes(saved)) {
    document.body.classList.add(`${saved}-theme`);
  }
}

async function changeAdminPasswordSystem() {
  const targetUser = document.getElementById('targetAdminUser').value.trim();
  const oldKey = document.getElementById('currentPass').value.trim();
  const newKey = document.getElementById('newPass').value.trim();

  if (!targetUser || !oldKey || !newKey) {
    showNotification("Please fill in all password fields.", "warning");
    return;
  }
  if (newKey.length < 6) {
    showNotification("New password should be at least 6 characters.", "warning");
    return;
  }

  const oldHash = await hashText(oldKey);
  const index = adminAccounts.findIndex(acc => acc.username === targetUser && acc.password === oldHash);
  if (index !== -1) {
    adminAccounts[index].password = await hashText(newKey);
    AuthService.saveAccounts(adminAccounts);
    document.getElementById('targetAdminUser').value = "";
    document.getElementById('currentPass').value = "";
    document.getElementById('newPass').value = "";
    showNotification("Ansamu nasarar canza password sirri!", "success");
    logActivity("Admin Security", `Password changed for account: ${targetUser}`);
  } else {
    showNotification("Incorrect username or current password.", "error");
  }
}

/* ==========================================================================
   BACKUP & RESTORE DATA PACKETS
   ========================================================================== */
function backupSystemData() {
  // Admin credentials are intentionally left out of backups, even hashed,
  // so a shared/exported backup file can never be used to attempt login.
  const bundle = BackupService.buildBundle();
  // Blob + object URL instead of a data: URI — data: URIs can silently
  // fail to download (or get truncated) once student photos/signatures
  // push the backup past a few MB, which a growing roster hits fast.
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const dl = document.createElement('a');
  dl.href = objectUrl;
  dl.download = "Zacast_Backup.json";
  document.body.appendChild(dl);
  dl.click();
  dl.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  logActivity("Data Backup", "System data exported to JSON backup file.");
  showNotification("Backup downloaded successfully", "success");
}

function triggerRestoreData() { document.getElementById('restoreFileInput').click(); }
function executeRestoreData(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch (err) {
      showNotification("That file isn't a valid backup (invalid JSON).", "error");
      event.target.value = '';
      return;
    }

    if (!BackupService.validateBundle(data)) {
      showNotification("That file doesn't look like a Zacast backup — missing student data.", "error");
      event.target.value = '';
      return;
    }

    const confirmed = window.confirm(
      `This backup contains ${data.students.length} student record(s) and will replace all current data. This cannot be undone. Continue?`
    );
    if (!confirmed) { event.target.value = ''; return; }

    BackupService.applyBundle(data);
    // Refresh in-memory copies from the service layer so the UI reflects
    // exactly what was actually persisted.
    students = StudentService.getAll();
    activities = ActivityService.getAll();
    appReactions = ReactionService.get();
    publicComments = CommentService.getAll();
    loadCommentsDisplay();

    logActivity("Data Restore", `Restored ${students.length} student record(s) from backup file.`);
    loadAdminPanel();
    showNotification("Data restored successfully", "success");
    event.target.value = '';
  };
  reader.onerror = function() {
    showNotification("Could not read that backup file. Please try again.", "error");
    event.target.value = '';
  };
  reader.readAsText(file);
}
const deptData = {
    "Computer Science": { "ND1": "com 1.png","ND2": "com 2.png" },
    "I.T": { "ND1": "it_nd1.jpg", "ND2": "it_nd2.jpg" },
    "S.L.T": { "ND1": "slt_nd1.jpg", "ND2": "slt_nd2.jpg" },
    "Civil Law": { "ND1": "law_nd1.jpg", "ND2": "law_nd2.jpg" },
    "Shari'a and Civil Law": { "ND1": "sharia_nd1.jpg", "ND2": "sharia_nd2.jpg" },
    "Inter Science": { "ND1": "inter_nd1.jpg", "ND2": "inter_nd2.jpg" },
    "Hausa": { "ND1": "hausa_nd1.jpg", "ND2": "hausa_nd2.jpg" },
    "Mass Comm": { "ND1": "mass_nd1.jpg", "ND2": "mass_nd2.jpg" },
    "Business Admin": { "ND1": "bus_nd1.jpg", "ND2": "bus_nd2.jpg" },
    "Social Studies": { "ND1": "soc_nd1.jpg", "ND2": "soc_nd2.jpg" },
    "Public Admin": { "ND1": "pub_nd1.jpg", "ND2": "pub_nd2.jpg" },
    "Math and Statistics": { "ND1": "math_nd1.jpg", "ND2": "math_nd2.jpg" },
    "Islamic Studies": { "ND1": "islam_nd1.jpg", "ND2": "islam_nd2.jpg" },
    "Arabic": { "ND1": "arabic_nd1.jpg", "ND2": "arabic_nd2.jpg" },
    "Computer Engineering": { "ND1": "ce_nd1.jpg", "ND2": "ce_nd2.jpg" },
    "Pharmacy": { "ND1": "pharm_nd1.jpg", "ND2": "pharm_nd2.jpg" }
};

function openPaper(dept, level) {
    const imgUrl = deptData[dept][level];
    const modal = document.getElementById('paperModal');
    const content = document.getElementById('paperContent');

    // Mun ba da 'id' na musamman ga div ɗin da ke ɗauke da hoton don PDF ya gane shi
    // onerror swaps to a friendly "not uploaded yet" placeholder instead of a
    // broken image icon, for the departments whose paper scans aren't bundled yet.
    content.innerHTML = `
        <div id="printablePaper">
            <h3>${dept} - ${level}</h3>
            <img src="${imgUrl}" style="width:160px; border:2px solid var(--accent-color);"
                 onerror="this.replaceWith(Object.assign(document.createElement('div'), {
                    className: 'paper-placeholder',
                    innerHTML: '<i class=\\'fas fa-file-circle-exclamation\\'></i><p>This paper has not been uploaded yet.</p>'
                 }))">
        </div>
        <div style="margin-top:15px;">
            <button class="action-btn btn-print" onclick="window.print()">Print</button>
            <button class="action-btn btn-pdf" onclick="downloadPaperAsPDF('${dept}', '${level}')">Download PDF</button>
        </div>
    `;
    modal.style.display = 'flex';
}

// Function ɗin da zai yi aikin PDF
function downloadPaperAsPDF(dept, level) {
    const element = document.getElementById('printablePaper');
    if (!element) { showNotification("Nothing to download.", "error"); return; }
    showNotification("Generating PDF...", "info");
    exportHTMLToPDF(element, `${dept}_${level}_Paper.pdf`, { orientation: "portrait", format: "letter", width: 700 })
        .then(() => showNotification("PDF generated successfully", "success"))
        .catch(() => showNotification("Something went wrong generating the PDF", "error"));
}
// Derived from deptData (not a separately hand-typed list) so the names used
// here for registration always match the names used by courses, results,
// attendance and the department dashboard. The two lists used to be typed
// out separately with slightly different spelling ("Computer Science" vs
// "Computer science", "I.T" vs "I.T information technology", etc.), which
// silently broke every department-based filter/join in the app.
const departmentList = Object.keys(deptData);

const input = document.getElementById("deptSearch");
const dropdown = document.getElementById("departmentDropdown");

function renderDepartments(filter=""){

dropdown.innerHTML="";

const result=departmentList.filter(item=>
item.toLowerCase().includes(filter.toLowerCase())
);

result.forEach(dept=>{

const div=document.createElement("div");

div.className="dept-item";

div.innerHTML = `
<i class="fa-solid fa-building-columns"></i>
<span>${dept}</span>
`;

div.onclick=function(){

input.value=dept;

dropdown.style.display="none";

};

dropdown.appendChild(div);

});

dropdown.style.display=result.length?"block":"none";

}

input.addEventListener("input",function(){

renderDepartments(this.value);

});

input.addEventListener("focus",function(){

renderDepartments(this.value);

});

document.addEventListener("click",function(e){

if(!dropdown.contains(e.target) && e.target!==input){

dropdown.style.display="none";

}

});

function validateForm() {
    const name = document.getElementById('name').value.trim();
    const admission = document.getElementById('admission').value.trim();
    
    // 1. Suna (Dole ya zama haruffa kawai)
    const nameRegex = /^[A-Za-z\s]+$/;
    if (name === "" || !nameRegex.test(name)) {
       showNotification("Don Allah, ka saka ingantaccen suna (haruffa kawai, babu lambobi).");
        return false;
    }
    
    // 2. Admission Number (Dole ya zama lambobi kawai)
    if (admission.trim() === "") {
    showNotification("Don Allah, ka saka Admission Number.");
    return false;
}
    
    // 3. Duba sauran filayen (misali State da LGA)
    if (document.getElementById('stateInput').value === "" || document.getElementById('lgaInput').value === "") {
     showNotification("Don Allah, ka zaɓi State da LGA.");
        return false;
    }

    return true;
}
function openGallery(src){

document.getElementById("galleryModal").style.display="flex";

document.getElementById("galleryPreview").src=src;

}

function closeGallery(){

document.getElementById("galleryModal").style.display="none";

}

// ==============================
// NOTIFICATION SOUND PREFERENCE
// ==============================
function toggleNotificationSound(enabled) {
    localStorage.setItem('notificationSoundMuted', enabled ? 'false' : 'true');
}

function restoreNotificationSoundPreference() {
    const toggle = document.getElementById('notificationSoundToggle');
    if (!toggle) return;
    const muted = localStorage.getItem('notificationSoundMuted') === 'true';
    toggle.checked = !muted;
}

// ==============================
// BEAUTIFUL NOTIFICATION SYSTEM
// ==============================

function setNotificationDuration(value) {
    localStorage.setItem('notificationDuration', String(Number(value) || 4000));
}

function getNotificationDuration() {
    return Number(localStorage.getItem('notificationDuration') || 4000);
}

function restoreNotificationPreferences() {
    restoreNotificationSoundPreference();
    const select = document.getElementById('notificationDurationSelect');
    if (select) select.value = String(getNotificationDuration());
}

function showNotification(message, type = "info", title = "System Notification") {
    const container = document.getElementById("notification-container");
    const sound = document.getElementById("notificationSound");
    if (!container) return;

    const config = {
        success: { icon: "fa-circle-check", title: title === "System Notification" ? "Success" : title },
        error: { icon: "fa-circle-xmark", title: title === "System Notification" ? "Action Failed" : title },
        warning: { icon: "fa-triangle-exclamation", title: title === "System Notification" ? "Attention Required" : title },
        info: { icon: "fa-circle-info", title: title === "System Notification" ? "Information" : title }
    };
    const meta = config[type] || config.info;
    const duration = getNotificationDuration();

    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.style.setProperty('--notification-duration', `${duration}ms`);
    notification.innerHTML = `
        <div class="notification-icon"><i class="fa-solid ${meta.icon}"></i></div>
        <div class="notification-copy">
            <div class="notification-title">${escapeNotificationText(meta.title)}</div>
            <div class="notification-message">${escapeNotificationText(String(message))}</div>
        </div>
        <button class="notification-close" type="button" aria-label="Close notification"><i class="fas fa-xmark"></i></button>
        <div class="notification-progress"></div>
    `;
    container.appendChild(notification);

    const close = () => {
        if (notification.classList.contains('hide')) return;
        notification.classList.add('hide');
        setTimeout(() => notification.remove(), 320);
    };
    notification.querySelector('.notification-close').addEventListener('click', close);

    const soundMuted = localStorage.getItem('notificationSoundMuted') === 'true';
    if (sound && !soundMuted) {
        sound.currentTime = 0;
        sound.play().catch(() => {});
    }

    setTimeout(close, duration);
}

function escapeNotificationText(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}

// ==========================
// AMAZING WELCOME SCREEN
// ==========================

const welcomeMessage = "Welcome to ZACAST System";
const welcomeSubMessage = "Student Industrial Work Experience Scheme Portal";
let typingIndex = 0;
let typingSubIndex = 0;

function typeWelcomeText() {
    const typing = document.getElementById("typingText");

    if (!typing) return;

    if (typingIndex < welcomeMessage.length) {
        typing.innerHTML += welcomeMessage.charAt(typingIndex);
        typingIndex++;
        setTimeout(typeWelcomeText, 80);
    } else {
        setTimeout(typeWelcomeSubText, 300);
    }
}

// Types the second welcome line once the first finishes — gives the
// previously-empty duplicate heading a real, animated purpose.
function typeWelcomeSubText() {
    const typing = document.getElementById("typingSubText");
    if (!typing) return;

    if (typingSubIndex < welcomeSubMessage.length) {
        typing.innerHTML += welcomeSubMessage.charAt(typingSubIndex);
        typingSubIndex++;
        setTimeout(typeWelcomeSubText, 45);
    }
}

document.addEventListener("DOMContentLoaded", () => {

    // Fara typing effect
    typeWelcomeText();

    // Notification bayan 1 second
    setTimeout(() => {
        showNotification("👋 Welcome to ZACAST Student Management System", "success");
    }, 1000);

    // Boye welcome screen bayan 4.5 seconds
    setTimeout(() => {

        const welcome = document.getElementById("welcomeScreen");

        if (welcome) {

            welcome.classList.add("fadeWelcome");

            setTimeout(() => {
                welcome.style.display = "none";
            }, 800);

        }

    }, 4500);

});

function validateAge() {
    const dob = document.getElementById("dob").value;
    const error = document.getElementById("ageError");
    const saveBtn = document.getElementById("saveBtn");

    if (!dob) {
        error.style.display = "none";
        saveBtn.disabled = false;
        return true;
    }

    const birthDate = new Date(dob);
    const today = new Date();

    let age = today.getFullYear() - birthDate.getFullYear();

    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
        age--;
    }

    if (age < 18) {
        error.style.display = "block";
        saveBtn.disabled = true;
        return false;
    }

    error.style.display = "none";
    saveBtn.disabled = false;
    return true;
}
window.addEventListener("DOMContentLoaded", () => {

    const dob = document.getElementById("dob");

    const today = new Date();

    today.setFullYear(today.getFullYear() - 18);

    dob.max = today.toISOString().split("T")[0];

});

/* ==========================================================================
   NEW: BACK-TO-TOP BUTTON
   ========================================================================== */
window.addEventListener("scroll", () => {
    const btn = document.getElementById("backToTopBtn");
    if (!btn) return;
    btn.classList.toggle("show", window.scrollY > 300);
});
function scrollPageToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ==========================================================================
   NEW: RIPPLE CLICK EFFECT ON BUTTONS (event delegation — works for every
   button added now or later, including ones injected dynamically)
   ========================================================================== */
document.addEventListener("click", (e) => {
    const btn = e.target.closest(".submitBtn, .action-btn, .gateway-btn-primary, .gateway-btn-secondary, .theme-select-btn, .sidebar button, .pagination-container button");
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    const size = Math.max(rect.width, rect.height);

    ripple.className = "ripple-effect";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
});

/* ==========================================================================
   NEW: EXPORT FULL STUDENT ROSTER TO PDF (admin dashboard)
   ========================================================================== */
function exportRosterToPDF() {
    if (students.length === 0) {
        showNotification("There are no students to export yet.", "warning");
        return;
    }

    const rows = students.map((st, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${st.name}</td>
            <td>${st.admission}</td>
            <td>${st.department || ""}</td>
            <td>${st.level || ""}</td>
            <td>${st.phone || ""}</td>
            <td>${st.status || ""}</td>
        </tr>`).join("");

    const frame = document.createElement("div");
    frame.style.cssText = "position:fixed;left:0;top:0;width:900px;background:#fff;color:#000;z-index:999999;padding:20px;font-family:Arial;";
    frame.innerHTML = `
        <h2 style="text-align:center;">ZAMFARA COLLEGE OF ARTS AND SCIENCE TECHNOLOGY</h2>
        <h3 style="text-align:center;color:#555;">Full Student Roster — ${new Date().toLocaleDateString()}</h3>
        <table style="width:100%;border-collapse:collapse;margin-top:15px;font-size:12px;">
            <thead>
                <tr style="background:#eee;">
                    <th style="border:1px solid #999;padding:6px;">S/N</th>
                    <th style="border:1px solid #999;padding:6px;">Name</th>
                    <th style="border:1px solid #999;padding:6px;">Admission No</th>
                    <th style="border:1px solid #999;padding:6px;">Department</th>
                    <th style="border:1px solid #999;padding:6px;">Level</th>
                    <th style="border:1px solid #999;padding:6px;">Phone</th>
                    <th style="border:1px solid #999;padding:6px;">Status</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
    frame.querySelectorAll("td, th").forEach(cell => { cell.style.border = "1px solid #999"; cell.style.padding = "6px"; });

    showNotification("Generating PDF...", "info");
    exportHTMLToPDF(frame, "Zacast_Full_Roster.pdf", { orientation: "landscape", width: 1100 })
        .then(() => {
            logActivity("Roster Export", "Full student roster exported to PDF.");
            showNotification("Roster PDF downloaded successfully", "success");
        })
        .catch(() => showNotification("Something went wrong generating the PDF", "error"));
}
/* ==========================================================================
   HELP CENTER — live search across every guide topic
   ========================================================================== */
function filterHelpGuide(query) {
  const q = query.trim().toLowerCase();
  const topics = document.querySelectorAll('#helpGuideList .help-topic');
  let visibleCount = 0;
  topics.forEach(topic => {
    const haystack = (topic.dataset.helpTitle + " " + topic.textContent).toLowerCase();
    const matches = !q || haystack.includes(q);
    topic.style.display = matches ? "" : "none";
    if (matches) visibleCount++;
    if (q && matches) topic.open = true;
  });
  const noResults = document.getElementById('helpNoResults');
  if (noResults) noResults.style.display = visibleCount ? "none" : "block";
}
