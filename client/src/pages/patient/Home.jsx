import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/client';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const NO_REASONS = [
  { value: 'product_problem', label: 'A problem with the product' },
  { value: 'too_expensive', label: 'It\'s too expensive' },
  { value: 'switching_product', label: 'Switching to something else' },
  { value: 'other', label: 'Other' },
];

function RefillPrompt({ refill, onDone }) {
  const [step, setStep] = useState('ask'); // ask | reason | done
  const [busy, setBusy] = useState(false);

  async function respond(body) {
    setBusy(true);
    try {
      await apiFetch(`/refill-checks/${refill.id}/respond`, { method: 'POST', body: JSON.stringify(body) });
      setStep('done');
      setTimeout(onDone, 1500);
    } catch {
      // fall through -- the card just stays interactive rather than getting stuck
    } finally {
      setBusy(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="p-card p-card--highlight">
        <p className="p-card__body">Thanks for letting us know! 🙏</p>
      </div>
    );
  }

  return (
    <div className="p-card p-card--highlight">
      <div className="p-routine-row">
        {refill.image_url && <img className="p-routine-row__image" src={refill.image_url} alt="" />}
        <div style={{ flex: 1 }}>
          <div className="p-card__title">Running low on {refill.product_name}?</div>
        </div>
      </div>
      {step === 'ask' && (
        <div className="p-mood-row">
          <button className="p-mood-btn" disabled={busy} onClick={() => respond({ response: 'yes' })}>
            <span className="p-mood-btn__emoji">✅</span>
            <span>Yes, I need one</span>
          </button>
          <button className="p-mood-btn" disabled={busy} onClick={() => respond({ response: 'snooze', snooze_days: 7 })}>
            <span className="p-mood-btn__emoji">⏰</span>
            <span>Remind me later</span>
          </button>
          <button className="p-mood-btn" disabled={busy} onClick={() => setStep('reason')}>
            <span className="p-mood-btn__emoji">✖️</span>
            <span>No</span>
          </button>
        </div>
      )}
      {step === 'reason' && (
        <>
          <p className="muted mt-2">Mind telling us why?</p>
          <div className="p-mood-row">
            {NO_REASONS.map((r) => (
              <button key={r.value} className="p-mood-btn" disabled={busy} onClick={() => respond({ response: 'no', no_reason: r.value })}>
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Keeps only each product's most recent status across every visit.
function summarizePlan(visits) {
  const byProduct = new Map();
  for (const visit of visits) {
    for (const p of visit.products) {
      if (!p.product_id) continue;
      const existing = byProduct.get(p.product_id);
      if (!existing || new Date(visit.visit_date) > new Date(existing.visit_date)) {
        byProduct.set(p.product_id, { ...p, visit_date: visit.visit_date });
      }
    }
  }
  const items = [...byProduct.values()];
  return {
    started: items.filter((i) => i.status === 'started'),
    recommended: items.filter((i) => i.status === 'recommended'),
  };
}

export default function Home() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [reorder, setReorder] = useState([]);
  const [dueRefill, setDueRefill] = useState(undefined); // undefined = loading, null = none due
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [error, setError] = useState('');
  const [doneToday, setDoneToday] = useState(new Set());

  function loadDueRefill() {
    apiFetch(`/refill-checks/due/${user.id}`).then(setDueRefill).catch(() => setDueRefill(null));
  }

  useEffect(() => {
    apiFetch(`/patients/${user.id}`).then(setData).catch((err) => setError(err.message));
    apiFetch(`/products/reorder/${user.id}`).then(setReorder).catch(() => {});
    apiFetch('/events/upcoming').then(setUpcomingEvents).catch(() => {});
    loadDueRefill();
  }, [user.id]);

  const goingEvents = useMemo(() => upcomingEvents.filter((e) => e.my_rsvp_status === 'going').slice(0, 2), [upcomingEvents]);

  const plan = useMemo(() => (data ? summarizePlan(data.visits) : null), [data]);

  const dailyReminders = useMemo(() => {
    if (!plan) return [];
    return plan.started.filter((i) => i.reminder_frequency === 'daily' && i.daily_reminder_message);
  }, [plan]);

  const nextFollowup = useMemo(() => {
    if (!data) return null;
    const today = new Date().toISOString().slice(0, 10);
    return data.followups
      .filter((f) => f.status === 'pending' && f.scheduled_date >= today)
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))[0] || null;
  }, [data]);

  async function markDone(item) {
    setDoneToday((prev) => new Set(prev).add(item.product_id));
    apiFetch('/checkins', {
      method: 'POST',
      body: JSON.stringify({ visit_product_id: item.id, response_value: 'good', notes: 'Marked done from Home' }),
    }).catch(() => {});
  }

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!data || !plan) return <p className="muted">Loading…</p>;

  const firstName = (user?.name || '').split(' ')[0];

  return (
    <div>
      <p className="p-greeting">{greeting()}, {firstName} 👋</p>

      {plan.started.length > 0 && (
        <>
          <p className="p-section-title">Your routine today</p>
          {plan.started.map((item) => (
            <div key={item.product_id} className="p-card p-card--highlight">
              <div className="p-routine-row">
                {item.image_url && <img className="p-routine-row__image" src={item.image_url} alt="" />}
                <div style={{ flex: 1 }}>
                  <div className="p-card__title">{item.product_name}</div>
                  {item.dosing_notes && <p className="muted">{item.dosing_notes}</p>}
                </div>
              </div>
              <button
                className={`p-cta ${doneToday.has(item.product_id) ? 'p-cta--secondary' : ''}`}
                onClick={() => markDone(item)}
                disabled={doneToday.has(item.product_id)}
              >
                {doneToday.has(item.product_id) ? '✓ Done' : 'Mark done'}
              </button>
            </div>
          ))}
        </>
      )}

      {dailyReminders.length > 0 && (
        <>
          {dailyReminders.map((item) => (
            <div key={item.product_id} className="p-card">
              <p className="p-card__body">🔔 {item.daily_reminder_message}</p>
            </div>
          ))}
        </>
      )}

      {dueRefill && (
        <>
          <p className="p-section-title">Refill check</p>
          <RefillPrompt refill={dueRefill} onDone={loadDueRefill} />
        </>
      )}

      <p className="p-section-title">Your pharmacist</p>
      <div className="p-card">
        {nextFollowup ? (
          <>
            <p className="p-card__body">Your pharmacist would like to check in with you.</p>
            <Link className="p-cta" to="/patient/messages">Talk to my pharmacist</Link>
          </>
        ) : (
          <>
            <p className="p-card__body">Need help with anything?</p>
            <Link className="p-cta" to="/patient/messages">Ask my pharmacist</Link>
          </>
        )}
      </div>

      {plan.recommended.length > 0 && (
        <>
          <p className="p-section-title">Recommended for you</p>
          <div className="product-grid">
            {plan.recommended.slice(0, 4).map((item) => (
              <div key={item.product_id} className="product-card">
                {item.image_url && <img src={item.image_url} alt="" />}
                <strong>{item.product_name}</strong>
                <p className="muted" style={{ fontSize: 12 }}>{item.reason ? `Why: ${item.reason}` : 'Recommended by your pharmacist'}</p>
                <Link className="btn btn-sm btn-secondary" to={`/patient/shop/${item.product_id}`}>View product</Link>
              </div>
            ))}
          </div>
        </>
      )}

      {upcomingEvents.length > 0 && (
        <>
          <p className="p-section-title">Events</p>
          {goingEvents.length > 0 ? (
            goingEvents.map((e) => (
              <div key={e.id} className="p-card">
                <p className="p-card__title">{e.title}</p>
                <p className="muted">
                  {new Date(`${e.event_date}T00:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                  {e.start_time && ` · ${e.start_time.slice(0, 5)}`}
                </p>
                <Link className="p-cta p-cta--secondary" to="/patient/events">View all events</Link>
              </div>
            ))
          ) : (
            <div className="p-card">
              <p className="p-card__body">{upcomingEvents.length} upcoming event{upcomingEvents.length === 1 ? '' : 's'} at Al Chark.</p>
              <Link className="p-cta" to="/patient/events">Browse events</Link>
            </div>
          )}
        </>
      )}

      {reorder.length > 0 && (
        <>
          <p className="p-section-title">Running low?</p>
          {reorder.map((item) => (
            <div key={item.id} className="p-card">
              <div className="p-card__title">{item.name}</div>
              <p className="muted">{item.days_remaining <= 0 ? 'You may have run out' : `About ${item.days_remaining} day${item.days_remaining === 1 ? '' : 's'} left`}</p>
              <Link className="p-cta" to={`/patient/shop/${item.id}`}>Reorder</Link>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
