import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import CarePlanList from '../../components/CarePlanList';
import LabScanner from '../../components/LabScanner';
import ProgressPhotos from '../../components/ProgressPhotos';
import VisitHistoryList from '../../components/VisitHistoryList';

const STATUS_LABELS = {
  CRITICAL: 'Critical', DEFICIENT: 'Deficient', LOW: 'Low', BORDERLINE: 'Borderline',
  ADEQUATE: 'Generally adequate', NORMAL: 'Not elevated', HIGH: 'High',
  NORMAL_BY_LAB: 'Normal by lab', REVIEW: 'Review', UNKNOWN: 'Not established',
};

function severityBadgeClass(status) {
  return `badge badge-severity-${(status || 'unknown').toLowerCase()}`;
}

function PharmacistReviewActions({ marker, onSaved }) {
  const [note, setNote] = useState(marker.pharmacist_notes || '');
  const [followupDate, setFollowupDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function saveNote(markReviewed) {
    setBusy(true);
    setMsg('');
    try {
      await apiFetch(`/labs/marker/${marker.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pharmacist_notes: note, mark_reviewed: markReviewed }),
      });
      setMsg(markReviewed ? 'Marked reviewed.' : 'Note saved.');
      if (onSaved) onSaved();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createFollowup() {
    if (!followupDate) {
      setMsg('Pick a follow-up date first.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      await apiFetch('/followups/from-lab-result', {
        method: 'POST',
        body: JSON.stringify({ lab_result_id: marker.lab_result_id, scheduled_date: followupDate, note: `Follow-up for ${marker.label}` }),
      });
      setMsg('Follow-up created.');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lab-clinical-card__section">
      <textarea
        className="input"
        rows={2}
        placeholder="Add pharmacist note…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="row-actions mt-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => saveNote(false)}>
          Save note
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || marker.reviewed_at} onClick={() => saveNote(true)}>
          {marker.reviewed_at ? `Reviewed ${new Date(marker.reviewed_at).toLocaleDateString()}` : 'Mark reviewed'}
        </button>
        <input className="input" type="date" value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} />
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={createFollowup}>
          Create follow-up
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}

function LabMarkerCard({ marker, labResultId, onSaved }) {
  const m = { ...marker, lab_result_id: labResultId };
  return (
    <div className="lab-clinical-card">
      <div className="lab-clinical-card__head">
        <strong>{m.label}</strong>
        <div className="lab-clinical-card__statuses">
          {m.lab_status && (
            <span className={severityBadgeClass(m.lab_status)}>Lab status: {STATUS_LABELS[m.lab_status] || m.lab_status}</span>
          )}
          <span className={severityBadgeClass(m.nutritional_status)}>
            Nutritional interpretation: {STATUS_LABELS[m.nutritional_status] || m.nutritional_status}
          </span>
        </div>
      </div>
      <div className="marker-card__value">
        {m.result_text || `${m.value} ${m.unit}`}
        {(m.reference_min != null || m.reference_max != null) && (
          <span className="muted"> — lab reference: {m.reference_min ?? '?'}-{m.reference_max ?? '?'} {m.unit}</span>
        )}
        {m.test_date && <span className="muted"> · {new Date(m.test_date).toLocaleDateString()}</span>}
        {m.lab_name && <span className="muted"> · {m.lab_name}</span>}
      </div>
      {m.message && <p className="lab-clinical-card__section">{m.message}</p>}
      {m.recommended_action && <p className="lab-clinical-card__section muted">Consider: {m.recommended_action}</p>}

      {m.related_tests?.length > 0 && (
        <div className="lab-clinical-card__section">
          <b>Related tests:</b> {m.related_tests.map((t) => t.test_key).join(', ')}
        </div>
      )}
      {m.safety_flags?.map((f, i) => (
        <div key={i} className="safety-flag">⚠ {f.warning_text}</div>
      ))}
      {m.recommendations?.map((r, i) => (
        <div key={i} className="recommendation-box">
          {r.recommendation_text}
          {r.safety_warning && <div className="muted">⚠ {r.safety_warning}</div>}
        </div>
      ))}
      <p className="lab-clinical-card__section muted">{m.insight}</p>

      <PharmacistReviewActions marker={m} onSaved={onSaved} />
    </div>
  );
}

export default function PatientTimeline() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [labData, setLabData] = useState(null);
  const [error, setError] = useState('');

  function loadLabs() {
    apiFetch(`/labs/${id}`).then(setLabData).catch((err) => setError(err.message));
  }

  function loadPatient() {
    apiFetch(`/patients/${id}`).then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadPatient();
    apiFetch(`/purchases/${id}`).then(setPurchases).catch((err) => setError(err.message));
    apiFetch(`/checkins/${id}`).then(setCheckins).catch((err) => setError(err.message));
    loadLabs();
  }, [id]);

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const { patient, visits, followups } = data;
  const labResults = labData?.results || [];

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
      <VisitHistoryList visits={visits} onProductStatusChanged={loadPatient} />

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

      <h3 className="section-title">Check-ins</h3>
      {checkins.length === 0 && <p className="muted">No check-ins logged.</p>}
      <ul className="followup-list">
        {checkins.map((c) => (
          <li key={c.id}>
            {c.is_problem && <span className="badge badge-flag-low">Reported difficulty</span>}{' '}
            {c.response_label}
            {c.product_name && <span className="muted"> — {c.product_name}</span>}
            <span className="muted"> — {new Date(c.created_at).toLocaleDateString()}</span>
            {c.notes && <div className="muted">{c.notes}</div>}
          </li>
        ))}
      </ul>

      <h3 className="section-title">Laboratory &amp; nutritional assessment</h3>
      <p className="muted">Scan a photo or enter values manually -- both feed the same pharmacist decision-support interpretation below.</p>
      <LabScanner patientId={id} onScanned={loadLabs} />

      {labResults.length === 0 && <p className="muted">No lab results on file.</p>}
      {labResults.map((lab) => (
        <div key={lab.id} className="visit-card">
          <div className="visit-card__date">{new Date(lab.scanned_at).toLocaleDateString()}</div>
          {lab.markers.map((m) => (
            <LabMarkerCard key={m.id} marker={m} labResultId={lab.id} onSaved={loadLabs} />
          ))}
        </div>
      ))}
      {labData?.disclaimer && <p className="disclaimer">{labData.disclaimer}</p>}

      <h3 className="section-title">Follow-ups</h3>
      {followups.length === 0 && <p className="muted">No follow-ups logged.</p>}
      <ul className="followup-list">
        {followups.map((f) => (
          <li key={f.id}>
            {new Date(f.scheduled_date).toLocaleDateString()} — {f.status} {f.response ? `(${f.response})` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
