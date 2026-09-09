// General adult reference ranges, for informational context only -- not
// medical advice. Used to flag a scanned lab value as low/normal/high and
// to match OCR'd text against a known marker name.
const NUTRIENTS = [
  { key: 'vitamin_d', label: 'Vitamin D (25-OH)', unit: 'ng/mL', refLow: 30, refHigh: 100, aliases: ['vitamin d', '25-oh vitamin d', '25(oh)d', 'vit d', 'vitamin d3'] },
  { key: 'vitamin_b12', label: 'Vitamin B12', unit: 'pg/mL', refLow: 200, refHigh: 900, aliases: ['vitamin b12', 'vit b12', 'b12', 'cobalamin'] },
  { key: 'ferritin', label: 'Ferritin (iron stores)', unit: 'ng/mL', refLow: 20, refHigh: 250, aliases: ['ferritin'] },
  { key: 'calcium', label: 'Calcium', unit: 'mg/dL', refLow: 8.5, refHigh: 10.5, aliases: ['calcium'] },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg/dL', refLow: 1.7, refHigh: 2.2, aliases: ['magnesium'] },
  { key: 'folate', label: 'Folate', unit: 'ng/mL', refLow: 3, refHigh: 20, aliases: ['folate', 'folic acid'] },
  { key: 'zinc', label: 'Zinc', unit: 'mcg/dL', refLow: 60, refHigh: 120, aliases: ['zinc'] },
  { key: 'vitamin_c', label: 'Vitamin C', unit: 'mg/L', refLow: 4, refHigh: 20, aliases: ['vitamin c', 'ascorbic acid'] },
];

function findByKey(key) {
  return NUTRIENTS.find((n) => n.key === key);
}

function flagFor(nutrient, value) {
  if (value == null || Number.isNaN(value)) return 'unknown';
  if (value < nutrient.refLow) return 'low';
  if (value > nutrient.refHigh) return 'high';
  return 'normal';
}

module.exports = { NUTRIENTS, findByKey, flagFor };
