/* ==========================================================================
   ZACAST STUDENT APP — SETTINGS  (edit this file, nothing else)
   ==========================================================================
   1) SUPABASE_URL / SUPABASE_KEY : paste the "Project URL" and the public
      "anon / publishable" key from Supabase (Project Settings > API).
      BOTH apps (student + staff) must use the SAME project so they share data.
      Leave the placeholders as they are to run in "local only" mode.
   2) STUDENT_APP_URL : the web address of the STUDENT app once deployed
      (example: https://zacast-student.netlify.app). Printed ID-card QR codes
      open this address so anyone can verify a student.
   ========================================================================== */
window.ZACAST_CONFIG = {
  APP: "student",
  SUPABASE_URL: "https://xwlkamixrcyrnhdweooz.supabase.co",
  SUPABASE_KEY: "sb_publishable__ykWTWr-QE-z89ciS4qQZg_OXN6F7qx",
  STUDENT_APP_URL: "https://useemaipaint-pixel.github.io/ZACAST-STUDENT-/",
  SYNC_SECONDS: 15
};
