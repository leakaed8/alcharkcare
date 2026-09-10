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

const MOOD_OPTIONS = [
  { value: 'good', emoji: '🙂', label: 'Good' },
  { value: 'okay', emoji: '😐', label: 'Okay' },
  { value: 'difficulty', emoji: '🙁', label: 'Having difficulty' },
];

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
  const [dueCheckin, setDueCheckin] = useState(undefined); // undefined = loading, null = none due
  const [reorder, setReorder] = useState([]);
  const [error, setError] = useState('');
  const [doneToday, setDoneToday] = useState(new Set());
  const [checkinDone, setCheckinDone] = useState(false);

  function loadDueCheckin() {
    apiFetch(`/checkins/due/${user.id}`).then(setDueCheckin).catch(() => setDueCheckin(null));
  }

  useEffect(() => {
    apiFetch(`/patients/${user.id}`).then(setData).catch((err) => setError(err.message));
    apiFetch(`/products/reorder/${user.id}`).then(setReorder).catch(() => {});
    loadDueCheckin();
  }, [user.id]);

  const plan = useMemo(() => (data ? summarizePlan(data.visits) : null), [data]);

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

  async function answerQuickCheckin(value) {
    setCheckinDone(true);
    try {
      await apiFetch('/checkins', {
        method: 'POST',
        body: JSON.stringify({ question_id: dueCheckin.question_id, visit_product_id: dueCheckin.visit_product_id, response_value: value }),
      });
    } catch {
      // still show the thank-you state -- a failed background log shouldn't block the patient
    }
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

      {dueCheckin && !checkinDone && (
        <>
          <p className="p-section-title">Quick check-in</p>
          <div className="p-card">
            <p className="p-card__body">{dueCheckin.text}</p>
            <div className="p-mood-row">
              {(dueCheckin.options || MOOD_OPTIONS).map((opt) => (
                <button key={opt.value} className="p-mood-btn" onClick={() => answerQuickCheckin(opt.value)}>
                  <span className="p-mood-btn__emoji">{opt.emoji || '•'}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {checkinDone && (
        <div className="p-card p-card--highlight">
          <p className="p-card__body">Thanks for letting us know! 🙏</p>
        </div>
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
