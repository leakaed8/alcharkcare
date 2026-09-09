// Generic audit trail writer for the Laboratory & Nutritional Assessment
// module -- shared by lab_result_marker creates/edits/reviews and future
// clinical-rule edits. Records are never updated/deleted by app code, only
// appended, so history can't be silently overwritten.
async function writeLabAudit(client, { entityType, entityId, action, staffId, previousValue, newValue, note }) {
  await client.query(
    `INSERT INTO lab_audit_log (entity_type, entity_id, action, changed_by_staff_id, previous_value, new_value, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entityType,
      entityId,
      action,
      staffId ?? null,
      previousValue != null ? JSON.stringify(previousValue) : null,
      newValue != null ? JSON.stringify(newValue) : null,
      note ?? null,
    ]
  );
}

module.exports = { writeLabAudit };
