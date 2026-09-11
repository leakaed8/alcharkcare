import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';

const EMPTY_FORM = {
  title: '', description: '', image_url: '', event_date: '', start_time: '', end_time: '',
  location: '', capacity: '', is_active: true,
};

function AttendeesPanel({ event, onClose }) {
  const [attendees, setAttendees] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/events/${event.id}/attendees`).then(setAttendees).catch((err) => setError(err.message));
  }, [event.id]);

  return (
    <div className="card mb-3">
      <div className="row-actions">
        <p className="field-label" style={{ flex: 1 }}>Attendees -- {event.title}</p>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>Close</button>
      </div>
      {error && <p className="alert alert-error">{error}</p>}
      {!attendees && !error && <p className="muted">Loading…</p>}
      {attendees && attendees.length === 0 && <p className="muted">No RSVPs yet.</p>}
      {attendees && attendees.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Patient</th><th>Phone</th><th>Status</th><th>RSVP'd</th></tr></thead>
            <tbody>
              {attendees.map((a) => (
                <tr key={a.id}>
                  <td>{a.patient_name}</td>
                  <td>{a.patient_phone}</td>
                  <td>{a.status === 'going' ? 'Going' : 'Cancelled'}</td>
                  <td>{new Date(a.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function EventManager() {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [attendeesFor, setAttendeesFor] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch('/events').then(setEvents).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(e) {
    setEditingId(e.id);
    setForm({
      title: e.title, description: e.description || '', image_url: e.image_url || '',
      event_date: e.event_date, start_time: e.start_time || '', end_time: e.end_time || '',
      location: e.location || '', capacity: e.capacity ?? '', is_active: e.is_active,
    });
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function save(ev) {
    ev.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { ...form, capacity: form.capacity === '' ? null : Number(form.capacity) };
      if (editingId) {
        await apiFetch(`/events/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/events', { method: 'POST', body: JSON.stringify(body) });
      }
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(e) {
    try {
      await apiFetch(`/events/${e.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !e.is_active }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Events</h2>
      </div>
      <p className="muted">Health workshops, screenings, and in-store events patients can RSVP to from the app.</p>

      <form onSubmit={save} className="card mb-4">
        <p className="field-label">{editingId ? 'Edit event' : 'Add an event'}</p>
        <div className="form-field">
          <label className="field-label" htmlFor="ev-title">Title</label>
          <input id="ev-title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="ev-description">Description</label>
          <textarea id="ev-description" className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="ev-image">Image URL (optional)</label>
          <input id="ev-image" className="input" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="ev-date">Date</label>
          <input id="ev-date" className="input" type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="ev-start">Start time (optional)</label>
          <input id="ev-start" className="input" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="ev-end">End time (optional)</label>
          <input id="ev-end" className="input" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="ev-location">Location</label>
          <input id="ev-location" className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Al Chark Pharmacy, main floor" />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="ev-capacity">Capacity (optional, blank = unlimited)</label>
          <input id="ev-capacity" className="input" type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
        </div>
        <label className="field-label">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Visible to patients
        </label>

        {error && <p className="alert alert-error">{error}</p>}
        <div className="row-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{editingId ? 'Save changes' : 'Add event'}</button>
          {editingId && <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>}
        </div>
      </form>

      {attendeesFor && <AttendeesPanel event={attendeesFor} onClose={() => setAttendeesFor(null)} />}

      {events.map((e) => (
        <div key={e.id} className="visit-card">
          <div className="visit-card__row">
            <b>{e.title}</b> · {new Date(e.event_date).toLocaleDateString()}
            {e.start_time && ` · ${e.start_time.slice(0, 5)}`}
            {' '}<span className={`badge badge-status-${e.is_active ? 'started' : 'cancelled'}`}>{e.is_active ? 'Active' : 'Hidden'}</span>
          </div>
          {e.location && <p className="muted">{e.location}</p>}
          <p className="muted">
            {e.going_count} going{e.capacity != null ? ` / ${e.capacity} capacity` : ' (unlimited capacity)'}
          </p>
          <div className="row-actions mt-2">
            <button className="btn btn-sm btn-secondary" onClick={() => startEdit(e)}>Edit</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setAttendeesFor(e)}>View attendees</button>
            <button className="btn btn-sm btn-ghost" onClick={() => toggleActive(e)}>{e.is_active ? 'Hide' : 'Unhide'}</button>
          </div>
        </div>
      ))}
      {events.length === 0 && <p className="muted">No events yet.</p>}
    </div>
  );
}
