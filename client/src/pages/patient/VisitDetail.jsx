import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/client';

const STATUS_LABELS = { recommended: 'Recommended', started: 'Started', completed: 'Completed', cancelled: 'Cancelled' };

export default function VisitDetail() {
  const { user } = useAuth();
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/patients/${user.id}`).then(setData).catch((err) => setError(err.message));
  }, [user.id]);

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const visit = data.visits.find((v) => String(v.id) === id);
  if (!visit) {
    return (
      <div>
        <p className="alert alert-error">That visit couldn't be found.</p>
        <Link className="p-cta p-cta--secondary" to="/patient/visits">← Back to my visits</Link>
      </div>
    );
  }

  const followup = data.followups.find((f) => f.visit_id === visit.id);
  const started = visit.products.filter((p) => p.status === 'started');
  const recommended = visit.products.filter((p) => p.status === 'recommended');

  return (
    <div>
      <Link className="muted" to="/patient/visits">← Back to my visits</Link>
      <p className="p-greeting" style={{ marginTop: 10 }}>
        {new Date(visit.visit_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
      <p className="muted">{visit.complaint || 'Consultation'}{visit.staff_name && ` · seen by ${visit.staff_name}`}</p>

      <p className="p-section-title">Summary</p>
      <div className="p-card">
        <p className="p-card__body">
          {visit.patient_summary || 'Your pharmacist reviewed this visit. Ask in-store if you’d like more detail on what was discussed.'}
        </p>
        {visit.lifestyle_advice && (
          <>
            <p className="p-card__title" style={{ fontSize: 14, marginTop: 12 }}>Advice given</p>
            <p className="p-card__body">{visit.lifestyle_advice}</p>
          </>
        )}
      </div>

      {started.length > 0 && (
        <>
          <p className="p-section-title">Products started</p>
          {started.map((p) => (
            <div key={p.id} className="p-card">
              <div className="p-card__title">{p.product_name}</div>
              {p.reason && <p className="p-card__body">Why: {p.reason}</p>}
              {p.dosing_notes && <p className="p-card__body">How to use: {p.dosing_notes}</p>}
              <Link className="p-cta p-cta--secondary" to={`/patient/shop/${p.product_id}`}>View product →</Link>
            </div>
          ))}
        </>
      )}

      {recommended.length > 0 && (
        <>
          <p className="p-section-title">Products recommended</p>
          {recommended.map((p) => (
            <div key={p.id} className="p-card">
              <div className="p-card__title">{p.product_name}</div>
              {p.reason && <p className="p-card__body">Why: {p.reason}</p>}
              {p.dosing_notes && <p className="p-card__body">How to use: {p.dosing_notes}</p>}
              <Link className="p-cta p-cta--secondary" to={`/patient/shop/${p.product_id}`}>View product →</Link>
            </div>
          ))}
        </>
      )}

      {visit.next_followup_date && (
        <>
          <p className="p-section-title">Follow-up</p>
          <div className="p-card">
            <div className="p-card__title">{new Date(visit.next_followup_date).toLocaleDateString()}</div>
            {followup && <p className="p-card__body">Status: {followup.status}</p>}
          </div>
        </>
      )}
    </div>
  );
}
