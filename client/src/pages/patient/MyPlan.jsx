import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/client';
import CarePlanList from '../../components/CarePlanList';
import LabScanner from '../../components/LabScanner';

const TABS = [
  { key: 'current', label: 'Current' },
  { key: 'recommended', label: 'Recommended' },
  { key: 'previous', label: 'Previous' },
];

const LAB_STATUS_PLAIN = {
  NORMAL_BY_LAB: "Within your lab's reference range",
  LOW: "Below your lab's reference range",
  HIGH: "Above your lab's reference range",
};

// Keeps only each product's most recent status across every visit, so a
// product recommended twice (or started then later completed) shows once.
function groupProducts(visits) {
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
    current: items.filter((i) => i.status === 'started'),
    recommended: items.filter((i) => i.status === 'recommended'),
    previous: items.filter((i) => i.status === 'completed' || i.status === 'cancelled'),
  };
}

export default function MyPlan() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [labData, setLabData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('current');

  useEffect(() => {
    apiFetch(`/patients/${user.id}`).then(setData).catch((err) => setError(err.message));
    apiFetch(`/labs/${user.id}`).then(setLabData).catch(() => {});
  }, [user.id]);

  const groups = useMemo(() => (data ? groupProducts(data.visits) : null), [data]);

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!data || !groups) return <p className="muted">Loading…</p>;

  const items = groups[tab];

  return (
    <div>
      <p className="p-greeting">My plan</p>
      <p className="muted">Everything your pharmacist has recommended, in one place.</p>

      <p className="p-section-title">Care plan</p>
      <CarePlanList patientId={user.id} canManage={false} />

      <p className="p-section-title">Products</p>
      <div className="p-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`p-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {items.length === 0 && (
        <div className="p-card p-empty">
          {tab === 'current' && <p>You don't currently have any active products.</p>}
          {tab === 'recommended' && <p>Your pharmacist hasn't added any recommendations yet.</p>}
          {tab === 'previous' && <p>No previous products yet.</p>}
        </div>
      )}

      {items.map((p) => (
        <div key={p.product_id} className="p-card">
          <div className="p-card__title">{p.product_name}</div>
          <p className="muted">
            {p.status === 'started' && p.started_date ? `Started ${new Date(p.started_date).toLocaleDateString()}` : `Recommended ${new Date(p.visit_date).toLocaleDateString()}`}
          </p>
          {p.reason && <p className="p-card__body">Why: {p.reason}</p>}
          {p.dosing_notes && <p className="p-card__body">How to use: {p.dosing_notes}</p>}
          <div className="row-actions mt-2">
            <Link className="p-cta p-cta--secondary" to={`/patient/shop/${p.product_id}`}>View product →</Link>
            {tab === 'recommended' && (
              <Link className="p-cta p-cta--secondary" to="/patient/find">Ask about it</Link>
            )}
          </div>
        </div>
      ))}

      <p className="p-section-title">Lab check-ins</p>
      <p className="muted">See if a product you're taking looks like it's helping your levels.</p>
      <LabScanner onScanned={() => apiFetch(`/labs/${user.id}`).then(setLabData)} />

      {labData?.results.map((lab) => (
        <div key={lab.id} className="p-card">
          <div className="p-card__meta">{new Date(lab.scanned_at).toLocaleDateString()}</div>
          {lab.markers.map((m) => (
            <div key={m.id} className="mb-2">
              <b>{m.label}</b>{' '}
              <span className={`badge badge-severity-${(m.lab_status || 'unknown').toLowerCase()}`}>
                {m.lab_status ? LAB_STATUS_PLAIN[m.lab_status] : 'No reference range on file'}
              </span>
              <div className="muted">{m.insight}</div>
            </div>
          ))}
        </div>
      ))}
      {labData?.disclaimer && <p className="disclaimer">{labData.disclaimer}</p>}
    </div>
  );
}
