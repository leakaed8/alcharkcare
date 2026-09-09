// One-off credential rotation, run via the Start Command trick since the
// free Render plan has no Shell access:
//   STAFF_USERNAME=staff NEW_STAFF_PASSWORD=... npm run set-password
// Reads from env vars rather than argv so the new password never appears
// in a Render deploy log line. Safe to leave in the repo -- it does
// nothing unless NEW_STAFF_PASSWORD is explicitly set.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function setPassword() {
  const username = process.env.STAFF_USERNAME || 'staff';
  const newPassword = process.env.NEW_STAFF_PASSWORD;

  if (!newPassword) {
    console.log('NEW_STAFF_PASSWORD not set -- skipping password change.');
    await pool.end();
    return;
  }
  if (newPassword.length < 8) {
    console.error('NEW_STAFF_PASSWORD must be at least 8 characters. Skipping.');
    await pool.end();
    process.exit(1);
  }

  const hash = await bcrypt.hash(newPassword, 10);
  const { rowCount } = await pool.query(
    'UPDATE staff SET password_hash = $1 WHERE username = $2',
    [hash, username]
  );

  if (rowCount === 0) {
    console.error(`No staff account found with username "${username}".`);
    await pool.end();
    process.exit(1);
  }

  console.log(`Password updated for staff account "${username}".`);
  await pool.end();
}

setPassword().catch((err) => {
  console.error('Password update failed:', err);
  process.exit(1);
});
