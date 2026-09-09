import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../../api/client';

export default function PatientTimeline() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/patients/${id}`).then(setData).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const { patient, visits, followups } = data;

  return (
    <div>
      <div className="card patient-header">
        <div>
          <h2>{patient.name}</h2>
          <div className="patient-header__meta">
            {patient.phone} · <span className={`badge badge-${patient.loyalty_tier}`}>{patient.loyalty_tier}</span>
          </div>
        </div>
        <Link className="btn btn-primary" to={`/staff/visits/new?patientId=${patient.id}`}>
          Log a new visit
        </Link>
      </div>

      <h3 className="section-title">Visit history</h3>
      {visits.length === 0 && <p className="muted">No visits yet.</p>}
      {visits.map((v) => (
        <div key={v.id} className="visit-card">
          <div className="visit-card__date">{new Date(v.visit_date).toLocaleDateString()}</div>
          <div className="visit-card__meta">seen by {v.staff_name}</div>
          <p className="visit-card__row"><b>Complaint:</b> {v.complaint || '—'}</p>
          <p className="visit-card__row"><b>Assessment:</b> {v.assessment || '—'}</p>
          <p className="visit-card__row"><b>Lifestyle advice:</b> {v.lifestyle_advice || '—'}</p>
          {v.products.length > 0 && (
            <p className="visit-card__row"><b>Products:</b> {v.products.map((p) => p.product_name).join(', ')}</p>
          )}
          {v.next_followup_date && (
            <p className="visit-card__row"><b>Next follow-up:</b> {v.next_followup_date}</p>
          )}
        </div>
      ))}

      <h3 className="section-title">Follow-ups</h3>
      {followups.length === 0 && <p className="muted">No follow-ups logged.</p>}
      <ul className="followup-list">
        {followups.map((f) => (
          <li key={f.id}>
            {f.scheduled_date} — {f.status} {f.response ? `(${f.response})` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
