import { useState } from 'react';
import { apiFetch } from '../api/client';

const STATUS_LABELS = { recommended: 'Recommended', started: 'Started', completed: 'Completed', cancelled: 'Cancelled' };

function ProductStatusRow({ product, onChanged }) {
  const [busy, setBusy] = useState(false);

  async function setStatus(status) {
    setBusy(true);
    try {
      await apiFetch(`/visits/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (onChanged) onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row-actions mb-2">
      <span>
        {product.product_name}
        {product.dosing_notes && <span className="muted"> ({product.dosing_notes})</span>}
      </span>
      <span className={`badge badge-status-${product.status || 'recommended'}`}>{STATUS_LABELS[product.status] || product.status}</span>
      {product.status !== 'started' && product.status !== 'completed' && (
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setStatus('started')}>
          Mark started
        </button>
      )}
      {product.status === 'started' && (
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setStatus('completed')}>
          Mark completed
        </button>
      )}
    </div>
  );
}

// `onProductStatusChanged` is optional -- pass it (and a visit that includes
// per-product `id`/`status`) to enable the inline status controls; without
// it this just renders the read-only history as before.
export default function VisitHistoryList({ visits, onProductStatusChanged }) {
  if (visits.length === 0) return <p className="muted">No visits yet.</p>;

  return visits.map((v) => (
    <div key={v.id} className="visit-card">
      <div className="visit-card__date">{new Date(v.visit_date).toLocaleDateString()}</div>
      {v.staff_name && <div className="visit-card__meta">seen by {v.staff_name}</div>}
      <p className="visit-card__row"><b>Complaint:</b> {v.complaint || '—'}</p>
      <p className="visit-card__row"><b>Assessment:</b> {v.assessment || '—'}</p>
      <p className="visit-card__row"><b>Lifestyle advice:</b> {v.lifestyle_advice || '—'}</p>
      {v.products.length > 0 && (
        <div className="visit-card__row">
          <b>Products:</b>
          {v.products[0]?.id != null ? (
            v.products.map((p) => <ProductStatusRow key={p.id} product={p} onChanged={onProductStatusChanged} />)
          ) : (
            <span>
              {' '}
              {v.products.map((p, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  {p.product_name}
                  {p.dosing_notes && <span className="muted"> ({p.dosing_notes})</span>}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      {v.next_followup_date && (
        <p className="visit-card__row"><b>Next follow-up:</b> {v.next_followup_date}</p>
      )}
    </div>
  ));
}
