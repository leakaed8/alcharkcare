import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/client';
import CarePlanList from '../../components/CarePlanList';

const TABS = [
  { key: 'current', label: 'Current' },
  { key: 'recommended', label: 'Recommended' },
  { key: 'previous', label: 'Previous' },
];

const STATUS_LABELS = { started: 'Started', paused: 'Paused', completed: 'Completed' };

// Keeps only each product's most recent status across every visit, so a
// product recommended twice (or started then later completed) shows once.
function groupProducts(visits) {
  const byProduct = new Map();
  for (const visit of visits) {
    for (const p of visit.products) {
      if (!p.product_id) continue;
      const existing = byProduct.get(p.product_id);
      if (!existing || new Date(visit.visit_date) > new Date(existing.visit_date)) {
        byProduct.set(p.product_id, { ...p, visit_date: visit.visit_date, category: p.category });
      }
    }
  }
  const items = [...byProduct.values()];
  return {
    current: items.filter((i) => i.status === 'started' || i.status === 'paused'),
    recommended: items.filter((i) => i.status === 'recommended'),
    previous: items.filter((i) => i.status === 'completed' || i.status === 'cancelled'),
  };
}

function groupByCategory(items) {
  const groups = {};
  for (const item of items) {
    const key = item.category || 'Your routine';
    (groups[key] = groups[key] || []).push(item);
  }
  return groups;
}

function RoutineItem({ item, onChanged }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function setStatus(status) {
    setBusy(true);
    setMsg('');
    try {
      await apiFetch(`/visits/products/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      onChanged();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reportDifficulty() {
    setBusy(true);
    setMsg('');
    try {
      await apiFetch('/checkins', {
        method: 'POST',
        body: JSON.stringify({ visit_product_id: item.id, response_value: 'difficulty', notes: `Reported from ${item.product_name}` }),
      });
      setMsg('Thanks -- your pharmacist has been notified.');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-card">
      <div className="p-card__head-row">
        <div className="p-card__title">{item.product_name}</div>
        <span className={`badge badge-status-${item.status}`}>{STATUS_LABELS[item.status] || item.status}</span>
      </div>
      {item.dosing_notes && <p className="p-card__body">{item.dosing_notes}</p>}
      {item.reason && <p className="muted">Why: {item.reason}</p>}
      {msg && <p className="muted">{msg}</p>}
      <div className="row-actions mt-2">
        {item.status === 'started' && (
          <button className="p-cta p-cta--secondary" disabled={busy} onClick={() => setStatus('paused')}>Pause</button>
        )}
        {item.status === 'paused' && (
          <button className="p-cta p-cta--secondary" disabled={busy} onClick={() => setStatus('started')}>Resume</button>
        )}
        <button className="p-cta p-cta--secondary" disabled={busy} onClick={() => setStatus('completed')}>Mark completed</button>
        <button className="p-cta p-cta--secondary" disabled={busy} onClick={reportDifficulty}>Report difficulty</button>
        <Link className="p-cta p-cta--secondary" to="/patient/messages">Ask pharmacist</Link>
      </div>
    </div>
  );
}

export default function MyRoutine() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('current');

  function load() {
    apiFetch(`/patients/${user.id}`).then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, [user.id]);

  const groups = useMemo(() => (data ? groupProducts(data.visits) : null), [data]);

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!data || !groups) return <p className="muted">Loading…</p>;

  const items = groups[tab];
  const byCategory = tab === 'current' ? groupByCategory(items) : null;

  return (
    <div>
      <p className="p-greeting">My routine</p>
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

      {tab === 'current' && byCategory && Object.entries(byCategory).map(([category, categoryItems]) => (
        <div key={category}>
          <p className="p-subsection-title">{category.toUpperCase()}</p>
          {categoryItems.map((item) => <RoutineItem key={item.product_id} item={item} onChanged={load} />)}
        </div>
      ))}

      {tab !== 'current' && items.map((p) => (
        <div key={p.product_id} className="p-card">
          <div className="p-card__title">{p.product_name}</div>
          <p className="muted">
            {p.status === 'started' && p.started_date ? `Started ${new Date(p.started_date).toLocaleDateString()}` : `Recommended ${new Date(p.visit_date).toLocaleDateString()}`}
          </p>
          {tab === 'recommended' && (
            <p className="p-card__body">{p.reason ? `Why: ${p.reason}` : 'Recommended by your pharmacist'}</p>
          )}
          {tab !== 'recommended' && p.reason && <p className="p-card__body">Why: {p.reason}</p>}
          {p.dosing_notes && <p className="p-card__body">How to use: {p.dosing_notes}</p>}
          <div className="row-actions mt-2">
            <Link className="p-cta p-cta--secondary" to={`/patient/shop/${p.product_id}`}>View product →</Link>
            {tab === 'recommended' && (
              <Link className="p-cta p-cta--secondary" to="/patient/find">Ask about it</Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
