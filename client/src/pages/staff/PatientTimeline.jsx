import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import CarePlanList from '../../components/CarePlanList';
import ProgressPhotos from '../../components/ProgressPhotos';
import VisitHistoryList from '../../components/VisitHistoryList';

const FLAG_LABELS = { low: 'Low', normal: 'Normal', high: 'High', unknown: 'Unclear' };

export default function PatientTimeline() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [labResults, setLabResults] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/patients/${id}`).then(setData).catch((err) => setError(err.message));
    apiFetch(`/purchases/${id}`).then(setPurchases).catch((err) => setError(err.message));
    apiFetch(`/labs/${id}`).then(setLabResults).catch((err) => setError(err.message));
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
            {patient.skin_type && <> · Skin: {patient.skin_type}</>}
          </div>
          {patient.allergies && patient.allergies.length > 0 && (
            <div className="patient-header__meta">
              <span className="badge badge-flag-low">Allergies: {patient.allergies.join(', ')}</span>
            </div>
          )}
        </div>
        <div className="row-actions">
          <Link className="btn btn-secondary" to={`/staff/patients/${patient.id}/scan-invoice`}>
            Scan sales invoice
          </Link>
          <Link className="btn btn-primary" to={`/staff/visits/new?patientId=${patient.id}`}>
            Log a new visit
          </Link>
        </div>
      </div>

      <h3 className="section-title">Care plans</h3>
      <CarePlanList patientId={id} canManage />

      <h3 className="section-title">Visit history</h3>
      <VisitHistoryList visits={visits} />

      <h3 className="section-title">Progress photos</h3>
      <ProgressPhotos patientId={id} />

      <h3 className="section-title">Purchase history</h3>
      {purchases.length === 0 && <p className="muted">No purchases logged.</p>}
      <ul className="followup-list">
        {purchases.map((p) => (
          <li key={p.id}>
            {p.product_name} <span className="muted">— {new Date(p.purchased_at).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>

      <h3 className="section-title">Lab scans</h3>
      {labResults.length === 0 && <p className="muted">No lab results scanned.</p>}
      {labResults.map((lab) => (
        <div key={lab.id} className="visit-card">
          <div className="visit-card__date">{new Date(lab.scanned_at).toLocaleDateString()}</div>
          {lab.markers.map((m) => (
            <div key={m.nutrient_key} className="visit-card__row">
              <b>{m.label}:</b> {m.value} {m.unit}{' '}
              <span className={`badge badge-flag-${m.flag}`}>{FLAG_LABELS[m.flag] || m.flag}</span>
              <div className="muted">{m.insight}</div>
            </div>
          ))}
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
