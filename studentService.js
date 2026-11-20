/* ==========================================================================
   STUDENT SERVICE
   ==========================================================================
   Every read or write of student records goes through here instead of
   script.js touching localStorage("students") directly. Maps to the
   "students" table in DATABASE_SCHEMA.md.
   ========================================================================== */
window.StudentService = (function (storage) {
  const KEY = "students";

  function getAll() {
    return storage.getJSON(KEY, []);
  }

  function saveAll(list) {
    return storage.setJSON(KEY, list);
  }

  function getByIndex(index) {
    const list = getAll();
    return list[index] || null;
  }

  function getByAdmission(admissionNumber) {
    if (!admissionNumber) return null;
    const target = String(admissionNumber).trim().toLowerCase();
    return getAll().find(st => (st.admission || "").toLowerCase() === target) || null;
  }

  // excludeIndex lets the edit form check "is this admission number
  // used by someone ELSE" without flagging the record being edited.
  function isAdmissionTaken(admissionNumber, excludeIndex) {
    const target = String(admissionNumber || "").trim().toLowerCase();
    if (!target) return false;
    const exclude = Number(excludeIndex);
    return getAll().some((st, i) => i !== exclude && (st.admission || "").toLowerCase() === target);
  }

  function add(student) {
    const list = getAll();
    list.push(student);
    saveAll(list);
    return list.length - 1;
  }

  function updateAt(index, student) {
    const list = getAll();
    if (index < 0 || index >= list.length) return false;
    list[index] = student;
    saveAll(list);
    return true;
  }

  function removeAt(index) {
    const list = getAll();
    if (index < 0 || index >= list.length) return null;
    const [removed] = list.splice(index, 1);
    saveAll(list);
    return removed;
  }

  return { getAll, saveAll, getByIndex, getByAdmission, isAdmissionTaken, add, updateAt, removeAt };

})(window.ZacastStorage);
