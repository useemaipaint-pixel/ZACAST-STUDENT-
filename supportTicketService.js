/* ==========================================================================
   SUPPORT TICKET SERVICE
   ==========================================================================
   Maps to the "support_tickets" table in DATABASE_SCHEMA.md.
   ========================================================================== */
window.SupportTicketService = (function (storage) {
  const KEY = "supportTickets";

  function getAll() {
    return storage.getJSON(KEY, []);
  }

  function saveAll(list) {
    return storage.setJSON(KEY, list);
  }

  function add(ticket) {
    const list = getAll();
    ticket.id = "tix_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    ticket.status = "Pending";
    ticket.createdAt = new Date().toLocaleString();
    list.push(ticket);
    saveAll(list);
    return ticket;
  }

  function getByStudent(admission) {
    const target = String(admission || "").trim().toLowerCase();
    return getAll().filter(t => (t.studentAdmission || "").toLowerCase() === target);
  }

  function getById(id) {
    return getAll().find(t => t.id === id) || null;
  }

  function updateStatus(id, status, response) {
    const list = getAll();
    const idx = list.findIndex(t => t.id === id);
    if (idx === -1) return false;
    list[idx].status = status;
    if (response !== undefined) list[idx].adminResponse = response;
    saveAll(list);
    return true;
  }

  return { getAll, saveAll, add, getByStudent, getById, updateStatus };

})(window.ZacastStorage);
