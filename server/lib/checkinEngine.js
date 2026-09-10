// Pure decision logic for which single check-in question (if any) is due
// for a patient right now. Kept separate from the DB-querying route so the
// core "is this due" rule is unit-testable without a database, matching
// the pattern used for the lab rule engine.
//
// Deliberately surfaces at most ONE due question at a time (never a stack
// of overdue prompts) and respects a weekly frequency cap -- the app must
// never feel like it's spamming the patient with check-ins.

function daysBetween(fromDateStr, toDateStr) {
  const ms = new Date(`${toDateStr}T00:00:00Z`) - new Date(`${fromDateStr}T00:00:00Z`);
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// questions: active checkin_questions rows.
// activeItems: [{ visit_product_id, product_id, category, started_date }] --
//   the patient's currently-started routine items.
// answeredKeys: Set of `${question_id}:${visit_product_id ?? 'all'}` already answered.
// today: 'YYYY-MM-DD'.
// checkinsThisWeek / maxPerWeek: frequency cap inputs.
function findDueCheckin({ questions, activeItems, answeredKeys, today, checkinsThisWeek, maxPerWeek }) {
  if (checkinsThisWeek >= maxPerWeek) return null;
  if (!activeItems || activeItems.length === 0) return null;

  const candidates = [];

  for (const q of questions) {
    if (!q.active) continue;

    if (q.target_scope === 'all') {
      const anchor = activeItems.reduce((min, i) => (!min || i.started_date < min ? i.started_date : min), null);
      if (!anchor) continue;
      const key = `${q.id}:all`;
      if (answeredKeys.has(key)) continue;
      const elapsed = daysBetween(anchor, today);
      if (elapsed >= q.day_offset) candidates.push({ question: q, visitProductId: null, overdueBy: elapsed - q.day_offset });
      continue;
    }

    const matches = activeItems.filter((i) =>
      (q.target_scope === 'product' && i.product_id === q.target_product_id) ||
      (q.target_scope === 'category' && i.category === q.target_category)
    );
    for (const item of matches) {
      const key = `${q.id}:${item.visit_product_id}`;
      if (answeredKeys.has(key)) continue;
      const elapsed = daysBetween(item.started_date, today);
      if (elapsed >= q.day_offset) candidates.push({ question: q, visitProductId: item.visit_product_id, overdueBy: elapsed - q.day_offset });
    }
  }

  if (candidates.length === 0) return null;
  // Most overdue first; among equally overdue, the earliest-scheduled one.
  candidates.sort((a, b) => b.overdueBy - a.overdueBy || a.question.day_offset - b.question.day_offset);
  return candidates[0];
}

module.exports = { findDueCheckin, daysBetween };
