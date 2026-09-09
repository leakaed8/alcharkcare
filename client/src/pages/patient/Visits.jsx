import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/client';
import ProgressPhotos from '../../components/ProgressPhotos';

export default function Visits() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/patients/${user.id}`).then(setData).catch((err) => setError(err.message));
  }, [user.id]);

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const { visits } = data;

  return (
    <div>
      <p className="p-greeting">My visits</p>
      <p className="muted">A timeline of every visit and what came out of it.</p>

      {visits.length === 0 && (
        <div className="p-card p-empty">
          <div className="p-empty__icon">🩺</div>
          <p>You don't have any recorded visits yet.</p>
        </div>
      )}

      {visits.map((v) => {
        const started = v.products.filter((p) => p.status === 'started').length;
        const recommended = v.products.filter((p) => p.status === 'recommended').length;
        const followup = data.followups.find((f) => f.visit_id === v.id);
        return (
          <div key={v.id} className="p-card">
            <div className="p-card__meta">{new Date(v.visit_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div className="p-card__title">{v.complaint || 'Consultation'}</div>
            {v.staff_name && <p className="muted">Seen by {v.staff_name}</p>}
            <p className="p-card__body">
              {started > 0 && `${started} product${started === 1 ? '' : 's'} started`}
              {started > 0 && recommended > 0 && ' · '}
              {recommended > 0 && `${recommended} recommended`}
              {started === 0 && recommended === 0 && 'No products logged for this visit.'}
            </p>
            {v.next_followup_date && <p className="muted">Follow-up: {new Date(v.next_followup_date).toLocaleDateString()}</p>}
            {followup && <p className="muted">Follow-up status: {followup.status}</p>}
            <Link className="p-cta p-cta--secondary" to={`/patient/visits/${v.id}`}>View summary →</Link>
          </div>
        );
      })}

      <p className="p-section-title">Progress photos</p>
      <ProgressPhotos patientId={user.id} />
    </div>
  );
}
