const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

const EVENT_COLUMNS = `events.id, events.title, events.description, events.image_url, events.event_date::text AS event_date,
  events.start_time, events.end_time, events.location, events.capacity, events.is_active, events.created_at, events.updated_at`;

// All events for staff management, most recent first. Staff/admin only.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${EVENT_COLUMNS},
            (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = events.id AND r.status = 'going') AS going_count
     FROM events ORDER BY event_date DESC`
  );
  res.json(rows.map((e) => ({ ...e, going_count: Number(e.going_count) })));
}));

// Upcoming, active events -- any signed-in user. For a patient, also
// reports their own RSVP status and how many spots remain (null capacity
// = unlimited, so remaining is never computed against it).
router.get('/upcoming', verifyToken, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${EVENT_COLUMNS},
            (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = events.id AND r.status = 'going') AS going_count
     FROM events
     WHERE is_active = true AND event_date >= CURRENT_DATE
     ORDER BY event_date ASC, start_time ASC NULLS LAST`
  );

  let myStatusByEvent = new Map();
  if (req.user.role === 'patient' && rows.length > 0) {
    const { rows: mine } = await pool.query(
      `SELECT event_id, status FROM event_rsvps WHERE patient_id = $1 AND event_id = ANY($2::int[])`,
      [req.user.id, rows.map((e) => e.id)]
    );
    myStatusByEvent = new Map(mine.map((r) => [r.event_id, r.status]));
  }

  res.json(rows.map((e) => {
    const goingCount = Number(e.going_count);
    return {
      ...e,
      going_count: goingCount,
      spots_remaining: e.capacity != null ? Math.max(e.capacity - goingCount, 0) : null,
      my_rsvp_status: myStatusByEvent.get(e.id) || null,
    };
  }));
}));

// A patient's own upcoming "going" RSVPs -- used for the Home upsell card.
router.get('/my/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  if (!isStaff && String(req.user.id) !== String(patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `SELECT ${EVENT_COLUMNS}
     FROM events
     JOIN event_rsvps r ON r.event_id = events.id
     WHERE r.patient_id = $1 AND r.status = 'going' AND events.is_active = true AND events.event_date >= CURRENT_DATE
     ORDER BY events.event_date ASC, events.start_time ASC NULLS LAST`,
    [patientId]
  );
  res.json(rows);
}));

// Attendee list for one event -- staff/admin only.
router.get('/:id/attendees', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.created_at, p.id AS patient_id, p.name AS patient_name, p.phone AS patient_phone
     FROM event_rsvps r JOIN patients p ON p.id = r.patient_id
     WHERE r.event_id = $1 ORDER BY r.status ASC, r.created_at ASC`,
    [id]
  );
  res.json(rows);
}));

// Create an event. Staff/admin only.
router.post('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { title, description, image_url, event_date, start_time, end_time, location, capacity } = req.body;
  if (!title || !event_date) {
    return res.status(400).json({ error: 'title and event_date are required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO events (title, description, image_url, event_date, start_time, end_time, location, capacity, created_by_staff_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${EVENT_COLUMNS}`,
    [title, description || null, image_url || null, event_date, start_time || null, end_time || null,
      location || null, capacity === '' || capacity == null ? null : Number(capacity), req.user.id]
  );
  res.status(201).json(rows[0]);
}));

// Edit an event, including deactivating it (is_active = false hides it
// from the patient-facing list without losing the RSVP history). Staff/admin only.
router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, image_url, event_date, start_time, end_time, location, capacity, is_active } = req.body;

  const { rows } = await pool.query(
    `UPDATE events SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       image_url = COALESCE($3, image_url),
       event_date = COALESCE($4, event_date),
       start_time = COALESCE($5, start_time),
       end_time = COALESCE($6, end_time),
       location = COALESCE($7, location),
       capacity = $8,
       is_active = COALESCE($9, is_active),
       updated_at = now()
     WHERE id = $10 RETURNING ${EVENT_COLUMNS}`,
    [title || null, description ?? null, image_url ?? null, event_date || null, start_time ?? null, end_time ?? null,
      location ?? null, capacity === undefined ? null : (capacity === '' || capacity == null ? null : Number(capacity)),
      is_active ?? null, id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Event not found' });
  }
  res.json(rows[0]);
}));

// RSVP "going". Patients only, for themselves. Enforces capacity against
// the current going-count -- rejected once full, unless this patient is
// already going (idempotent re-RSVP never double-counts, via the unique
// (event_id, patient_id) constraint + upsert).
router.post('/:id/rsvp', verifyToken, requireRole('patient'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows: eventRows } = await pool.query('SELECT id, capacity, is_active FROM events WHERE id = $1', [id]);
  const event = eventRows[0];
  if (!event || !event.is_active) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query(
      'SELECT status FROM event_rsvps WHERE event_id = $1 AND patient_id = $2 FOR UPDATE',
      [id, req.user.id]
    );

    if (!existing[0] || existing[0].status !== 'going') {
      if (event.capacity != null) {
        const { rows: countRows } = await client.query(
          `SELECT COUNT(*) AS n FROM event_rsvps WHERE event_id = $1 AND status = 'going'`,
          [id]
        );
        if (Number(countRows[0].n) >= event.capacity) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'This event is full' });
        }
      }
    }

    const { rows } = await client.query(
      `INSERT INTO event_rsvps (event_id, patient_id, status)
       VALUES ($1, $2, 'going')
       ON CONFLICT (event_id, patient_id) DO UPDATE SET status = 'going', updated_at = now()
       RETURNING *`,
      [id, req.user.id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Cancel an RSVP. Patients only, for themselves.
router.post('/:id/cancel', verifyToken, requireRole('patient'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `INSERT INTO event_rsvps (event_id, patient_id, status)
     VALUES ($1, $2, 'cancelled')
     ON CONFLICT (event_id, patient_id) DO UPDATE SET status = 'cancelled', updated_at = now()
     RETURNING *`,
    [id, req.user.id]
  );
  res.json(rows[0]);
}));

module.exports = router;
