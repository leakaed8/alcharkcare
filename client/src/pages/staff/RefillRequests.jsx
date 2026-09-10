import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/client';

const RESPONSE_LABELS = { pending: 'Pending', yes: 'Wants refill', snoozed: 'Snoozed', no: 'Declined' };
const NO_REASON_LABELS = {
  product_problem: 'Product problem', too_expensive: 'Too expensive',
  switching_product: 'Switching product', other: 'Other',
};

function waLink(phone, patientName, productName) {
  const digits = phone.replace(/[^\d]/g, '');
  const message = `Hi ${patientName}, following up on your ${productName} -- would you like us to have a refill ready?`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export default function RefillRequests() {
  const [requests, setRequests] = useState([]);
  const [responseFilter, setResponseFilter] = useState('yes');
  const [error, setError] = useState('');

  function load() {
    const query = responseFilter ? `?response=${responseFilter}` : '';
    apiFetch(`/refill-checks${query}`).then(setRequests).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, [responseFilter]);

  return (
    <div>
      <div className="page-header">
        <h2>Refill requests</h2>
      </div>
      <p className="muted">Patient responses to automatic "running low?" prompts, driven by each product's duration and the refill setting on their recommendation.</p>
      {error && <p className="alert alert-error">{error}</p>}

      <div className="tab-group mb-3">
        {['', ...Object.keys(RESPONSE_LABELS)].map((s) => (
          <button key={s} type="button" className={`tab-btn ${responseFilter === s ? 'active' : ''}`} onClick={() => setResponseFilter(s)}>
            {s ? RESPONSE_LABELS[s] : 'All'}
          </button>
        ))}
      </div>

      {requests.length === 0 && <p className="muted">No refill requests.</p>}
      {requests.map((r) => (
        <div key={r.id} className="visit-card">
          <div className="visit-card__row">
            <b><Link to={`/staff/patients/${r.patient_id}`}>{r.patient_name}</Link></b>
            {' '}· {r.patient_phone} · {new Date(r.prompted_at).toLocaleDateString()}
            {' '}<span className={`badge badge-status-${r.response === 'yes' ? 'started' : r.response === 'no' ? 'cancelled' : r.response === 'snoozed' ? 'upcoming' : 'pending'}`}>
              {RESPONSE_LABELS[r.response] || r.response}
            </span>
          </div>
          <p><b>Product:</b> {r.product_name}</p>
          {r.response === 'no' && r.no_reason && (
            <p className="muted">Reason: {NO_REASON_LABELS[r.no_reason] || r.no_reason}{r.no_reason_note ? ` -- ${r.no_reason_note}` : ''}</p>
          )}
          {r.response === 'snoozed' && r.snooze_until && (
            <p className="muted">Asking again on {new Date(r.snooze_until).toLocaleDateString()}</p>
          )}
          {r.response === 'yes' && (
            <div className="row-actions mt-2">
              <a className="btn btn-sm btn-secondary" href={waLink(r.patient_phone, r.patient_name, r.product_name)} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
              <Link className="btn btn-sm btn-primary" to={`/staff/patients/${r.patient_id}`}>View patient</Link>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
