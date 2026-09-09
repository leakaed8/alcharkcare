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

// Groups every product ever recommended/started across all visits into the
// three buckets the rest of the portal uses, keeping only each product's
// most recent status (a product recommended twice shouldn't show twice).
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
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/patients/${user.id}`).then(setData).catch((err) => setError(err.message));
  }, [user.id]);

  const plan = useMemo(() => (data ? summarizePlan(data.visits) : null), [data]);

  const nextFollowup = useMemo(() => {
    if (!data) return null;
    const today = new Date().toISOString().slice(0, 10);
    return data.followups
      .filter((f) => f.status === 'pending' && f.scheduled_date >= today)
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))[0] || null;
  }, [data]);

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const latestVisit = data.visits[0];
  const firstName = (user?.name || '').split(' ')[0];

  return (
    <div>
      <p className="p-greeting">{greeting()}, {firstName}</p>
      <p className="muted">Here's where things stand with your care at Al Chark.</p>

      <p className="p-section-title">Latest visit</p>
      {latestVisit ? (
        <div className="p-card p-card--highlight">
          <div className="p-card__meta">{new Date(latestVisit.visit_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          <div className="p-card__title">{latestVisit.complaint || 'Consultation'}</div>
          <p className="p-card__body">
            {latestVisit.patient_summary || 'Your pharmacist reviewed your visit. Ask in-store for more detail on what was discussed.'}
          </p>
          <Link className="p-cta" to="/patient/visits">View visit summary →</Link>
        </div>
      ) : (
        <div className="p-card p-empty">
          <div className="p-empty__icon">🩺</div>
          <p>You don't have any recorded visits yet.</p>
        </div>
      )}

      <p className="p-section-title">Your current plan</p>
      {plan && (plan.started.length > 0 || plan.recommended.length > 0) ? (
        <div className="p-card">
          {plan.started.slice(0, 3).map((p) => (
            <div key={p.product_id} className="p-card__body" style={{ marginBottom: 10 }}>
              <b>{p.product_name}</b> <span className="badge badge-status-started">Started</span>
              {p.dosing_notes && <div className="muted">{p.dosing_notes}</div>}
            </div>
          ))}
          {plan.recommended.slice(0, 2).map((p) => (
            <div key={p.product_id} className="p-card__body" style={{ marginBottom: 10 }}>
              <b>{p.product_name}</b> <span className="badge badge-status-recommended">Recommended</span>
            </div>
          ))}
          <Link className="p-cta p-cta--secondary" to="/patient/plan">View my plan →</Link>
        </div>
      ) : (
        <div className="p-card p-empty">
          <p>Your pharmacist hasn't added any recommendations yet.</p>
        </div>
      )}

      <p className="p-section-title">Upcoming follow-up</p>
      {nextFollowup ? (
        <div className="p-card">
          <div className="p-card__title">{new Date(nextFollowup.scheduled_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          <p className="p-card__body">Follow-up recommended to review your response to your current plan.</p>
          <Link className="p-cta p-cta--secondary" to="/patient/visits">View follow-up →</Link>
        </div>
      ) : (
        <div className="p-card p-empty">
          <p>No follow-up scheduled right now.</p>
        </div>
      )}

      <p className="p-section-title">Quick actions</p>
      <div className="p-quick-actions">
        <Link className="p-quick-action" to="/patient/find">
          <span className="p-quick-action__icon">🔍</span> Find a Product
        </Link>
        <Link className="p-quick-action" to="/patient/find">
          <span className="p-quick-action__icon">💬</span> Ask About a Product
        </Link>
        <Link className="p-quick-action" to="/patient/visits">
          <span className="p-quick-action__icon">📋</span> View My Visits
        </Link>
        <Link className="p-quick-action" to="/patient/find">
          <span className="p-quick-action__icon">📞</span> Contact Al Chark
        </Link>
      </div>
    </div>
  );
}
