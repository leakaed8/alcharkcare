// Default check-in schedule, matching the examples given for this feature.
// Staff can add/edit/disable questions afterward from the admin screen --
// this just seeds a sensible starting point so "due today" has something
// to surface on day one. Safe to re-run (skips if a question with the same
// text + day_offset already exists).
require('dotenv').config();
const pool = require('./pool');

const MOOD_OPTIONS = [
  { label: 'Good', value: 'good', emoji: '😊', is_problem: false },
  { label: 'Okay', value: 'okay', emoji: '😐', is_problem: false },
  { label: 'Having difficulty', value: 'difficulty', emoji: '🙁', is_problem: true },
];

const YES_NO_PROBLEM_ON_YES = [
  { label: 'No', value: 'no', is_problem: false },
  { label: 'Yes', value: 'yes', is_problem: true },
];

const YES_NO_NEUTRAL = [
  { label: 'No', value: 'no', is_problem: false },
  { label: 'Yes', value: 'yes', is_problem: false },
];

const QUESTIONS = [
  { text: 'Did you have any difficulty starting your routine?', day_offset: 1, response_type: 'yes_no', options: YES_NO_PROBLEM_ON_YES },
  { text: 'How are you finding the product?', day_offset: 3, response_type: 'mood', options: MOOD_OPTIONS },
  { text: 'How is your routine going?', day_offset: 7, response_type: 'mood', options: MOOD_OPTIONS },
  { text: 'Any irritation or difficulty?', day_offset: 14, response_type: 'yes_no', options: YES_NO_PROBLEM_ON_YES },
  { text: 'Would you like to speak to your pharmacist?', day_offset: 30, response_type: 'yes_no', options: YES_NO_NEUTRAL },
];

async function seed() {
  for (const q of QUESTIONS) {
    const existing = await pool.query(
      'SELECT id FROM checkin_questions WHERE text = $1 AND day_offset = $2',
      [q.text, q.day_offset]
    );
    if (existing.rows.length > 0) continue;
    await pool.query(
      `INSERT INTO checkin_questions (text, day_offset, target_scope, response_type, options)
       VALUES ($1, $2, 'all', $3, $4)`,
      [q.text, q.day_offset, q.response_type, JSON.stringify(q.options)]
    );
  }
  console.log('Check-in question seed complete.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Check-in question seed failed:', err);
  process.exit(1);
});
