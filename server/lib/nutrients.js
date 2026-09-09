// The lab marker list itself now lives in the lab_test_types table (see
// migrations/004_lab_test_types.sql) so staff can manage it from the app.
// This just keeps the flagging logic in one place -- informational only,
// not medical advice.
function flagFor(nutrient, value) {
  if (value == null || Number.isNaN(value)) return 'unknown';
  if (nutrient.ref_low != null && value < nutrient.ref_low) return 'low';
  if (nutrient.ref_high != null && value > nutrient.ref_high) return 'high';
  return 'normal';
}

module.exports = { flagFor };
