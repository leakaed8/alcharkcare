const { flagFor } = require('./nutrients');

// Scans OCR'd lab report text line by line for known marker names followed
// by a number, e.g. "Vitamin D 25(OH)D    42.0 ng/mL   Range: 30-100".
// `testTypes` is the lab_test_types table's rows: [{ key, label, unit,
// ref_low, ref_high, aliases }].
function parseLabText(rawText, testTypes) {
  const lines = (rawText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const markers = [];
  const seen = new Set();

  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const nutrient of testTypes) {
      if (seen.has(nutrient.key)) continue;

      // A lab line often names the marker twice, e.g. "Vitamin D 25(OH)D
      // 42.0 ng/mL" -- anchor on whichever alias ends furthest right so the
      // value isn't mistaken for part of the marker's own standard name.
      let anchorEnd = -1;
      for (const alias of nutrient.aliases || []) {
        const idx = lower.indexOf(alias.toLowerCase());
        if (idx !== -1) anchorEnd = Math.max(anchorEnd, idx + alias.length);
      }
      if (anchorEnd === -1) continue;

      const afterAlias = lower.slice(anchorEnd);
      const match = afterAlias.match(/-?\d+(\.\d+)?/);
      if (!match) continue;

      const value = parseFloat(match[0]);
      markers.push({
        nutrient_key: nutrient.key,
        label: nutrient.label,
        value,
        unit: nutrient.unit,
        ref_low: nutrient.ref_low,
        ref_high: nutrient.ref_high,
        flag: flagFor(nutrient, value),
      });
      seen.add(nutrient.key);
    }
  }

  return markers;
}

module.exports = { parseLabText };
