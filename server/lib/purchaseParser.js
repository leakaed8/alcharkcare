// Free-tier OCR on receipts/product labels is noisy, so this pulls out
// lines that plausibly name a product and leaves the confirming to a human
// (staff or the patient) rather than guessing silently.
const NOISE_LINE = /^(qty|quantity|total|subtotal|tax|vat|date|invoice|receipt|cash|change|thank you|no\.?|#|www\.|tel:?)\b/i;
const DATE_LINE = /^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$/;
const MONEY_LINE = /^\$?\d+([.,]\d{1,2})?$/;

function looksLikeProductLine(line) {
  if (line.length < 3 || line.length > 60) return false;
  if (!/[a-zA-Z]{3,}/.test(line)) return false;
  if (MONEY_LINE.test(line) || DATE_LINE.test(line) || NOISE_LINE.test(line)) return false;
  return true;
}

function extractCandidateLines(rawText) {
  return (rawText || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/[\d$.,]+$/, '').trim()) // drop a trailing price
    .filter(looksLikeProductLine);
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(a, b) {
  const aWords = new Set(normalize(a).split(' ').filter(Boolean));
  const bWords = new Set(normalize(b).split(' ').filter(Boolean));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let overlap = 0;
  for (const w of aWords) if (bWords.has(w)) overlap += 1;
  return overlap / Math.max(aWords.size, bWords.size);
}

// Best-guess catalog match for a candidate line, or null if nothing is
// close enough -- staff/patient still gets to confirm or correct either way.
function matchAgainstCatalog(candidateText, products) {
  let best = null;
  for (const product of products) {
    const score = similarity(candidateText, product.name);
    if (!best || score > best.score) best = { product, score };
  }
  if (best && best.score >= 0.5) {
    return { product_id: best.product.id, product_name: best.product.name, confidence: best.score };
  }
  return { product_id: null, product_name: candidateText, confidence: 0 };
}

module.exports = { extractCandidateLines, matchAgainstCatalog };
