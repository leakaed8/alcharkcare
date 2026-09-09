import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/client';

const STATUS_LABELS = {
  requested: 'Requested', reviewing: 'Reviewing', ordered: 'Ordered', available: 'Available',
  not_available: 'Not available', fulfilled: 'Fulfilled', cancelled: 'Cancelled',
};
const STATUS_FLOW = ['requested', 'reviewing', 'ordered', 'available', 'fulfilled'];

export default function ProductRequests() {
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');

  function load() {
    const query = statusFilter ? `?status=${statusFilter}` : '';
    apiFetch(`/product-requests${query}`).then(setRequests).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  async function updateStatus(id, status) {
    try {
      await apiFetch(`/product-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function nextStatus(current) {
    const idx = STATUS_FLOW.indexOf(current);
    return idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Product requests</h2>
      </div>
      <p className="muted">Products patients asked about through "Ask Al Chark" in the portal.</p>
      {error && <p className="alert alert-error">{error}</p>}

      <div className="tab-group mb-3">
        {['', ...Object.keys(STATUS_LABELS)].map((s) => (
          <button key={s} type="button" className={`tab-btn ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
            {s ? STATUS_LABELS[s] : 'All'}
          </button>
        ))}
      </div>

      {requests.length === 0 && <p className="muted">No requests.</p>}
      {requests.map((r) => (
        <div key={r.id} className="visit-card">
          <div className="visit-card__row">
            <b><Link to={`/staff/patients/${r.patient_id}`}>{r.patient_name}</Link></b>
            {' '}· {r.patient_phone} · {new Date(r.requested_at).toLocaleDateString()}
            {' '}<span className={`badge badge-status-${r.status}`}>{STATUS_LABELS[r.status] || r.status}</span>
          </div>
          <p><b>Requested:</b> {r.requested_text}</p>
          {r.matched_product_name && <p className="muted">Matched to: {r.matched_product_name}</p>}
          {r.notes && <p className="muted">Notes: {r.notes}</p>}
          <div className="row-actions mt-2">
            {nextStatus(r.status) && (
              <button className="btn btn-sm btn-primary" onClick={() => updateStatus(r.id, nextStatus(r.status))}>
                Mark {STATUS_LABELS[nextStatus(r.status)]}
              </button>
            )}
            {r.status !== 'not_available' && r.status !== 'fulfilled' && r.status !== 'cancelled' && (
              <button className="btn btn-sm btn-ghost" onClick={() => updateStatus(r.id, 'not_available')}>
                Not available
              </button>
            )}
            {r.status !== 'cancelled' && r.status !== 'fulfilled' && (
              <button className="btn btn-sm btn-ghost" onClick={() => updateStatus(r.id, 'cancelled')}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
