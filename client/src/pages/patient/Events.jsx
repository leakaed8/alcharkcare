import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';

function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function Events() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  function load() {
    apiFetch('/events/upcoming').then(setEvents).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function rsvp(event) {
    setBusyId(event.id);
    setError('');
    try {
      await apiFetch(`/events/${event.id}/rsvp`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(event) {
    setBusyId(event.id);
    setError('');
    try {
      await apiFetch(`/events/${event.id}/cancel`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (error && !events) return <p className="alert alert-error">{error}</p>;
  if (!events) return <p className="muted">Loading…</p>;

  return (
    <div>
      <p className="p-greeting">Events</p>
      <p className="muted">Health workshops, screenings, and in-store events -- RSVP to save your spot.</p>
      {error && <p className="alert alert-error">{error}</p>}

      {events.length === 0 && <p className="muted">No upcoming events right now.</p>}

      {events.map((e) => {
        const isFull = e.spots_remaining === 0 && e.my_rsvp_status !== 'going';
        return (
          <div key={e.id} className="p-card mb-3">
            {e.image_url && <img className="p-routine-row__image" src={e.image_url} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 12, marginBottom: 10 }} />}
            <p className="p-card__title">{e.title}</p>
            <p className="muted">{formatDate(e.event_date)}{e.start_time && ` · ${e.start_time.slice(0, 5)}`}</p>
            {e.location && <p className="muted">{e.location}</p>}
            {e.description && <p className="p-card__body">{e.description}</p>}
            {e.capacity != null && (
              <p className="muted" style={{ fontSize: 12 }}>
                {isFull ? 'Fully booked' : `${e.spots_remaining} spot${e.spots_remaining === 1 ? '' : 's'} left`}
              </p>
            )}

            {e.my_rsvp_status === 'going' ? (
              <div className="row-actions mt-2">
                <span className="badge badge-status-started">You're going</span>
                <button className="p-cta p-cta--secondary" disabled={busyId === e.id} onClick={() => cancel(e)}>Cancel RSVP</button>
              </div>
            ) : (
              <button className="p-cta mt-2" disabled={busyId === e.id || isFull} onClick={() => rsvp(e)}>
                {isFull ? 'Fully booked' : "I'm going"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
