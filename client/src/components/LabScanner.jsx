import { useEffect, useState } from 'react';
import { apiFetch, apiUpload } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const STATUS_LABELS = {
  CRITICAL: 'Critical', DEFICIENT: 'Deficient', LOW: 'Low', BORDERLINE: 'Borderline',
  ADEQUATE: 'Generally adequate', NORMAL: 'Not elevated', HIGH: 'High',
  NORMAL_BY_LAB: 'Normal by lab', REVIEW: 'Review', UNKNOWN: 'Not established',
};

function severityBadgeClass(status) {
  return `badge badge-severity-${(status || 'unknown').toLowerCase()}`;
}

// Full pharmacist-facing detail: both lab_status (this patient's own lab
// range) and nutritional_status (the authoritative-source interpretation
// layer) are always shown, since the two can legitimately differ.
function PharmacistMarkerCard({ m }) {
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
        {m.original_value != null && <span className="muted"> (entered as {m.original_value} {m.original_unit})</span>}
        {(m.reference_min != null || m.reference_max != null) && (
          <span className="muted"> — lab reference: {m.reference_min ?? '?'}-{m.reference_max ?? '?'} {m.unit}</span>
        )}
      </div>
      {m.message && <p className="lab-clinical-card__section">{m.message}</p>}
      {m.recommended_action && <p className="lab-clinical-card__section muted">Consider: {m.recommended_action}</p>}
      {m.requires_review && <p className="lab-clinical-card__section"><strong>Flagged for pharmacist review.</strong></p>}

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
    </div>
  );
}

// Patient-safe view: no rule ids, no internal safety-flag/related-test
// wiring -- just the plain status, the value, and the "is a product
// helping" insight, which is already written in gentle language.
function PatientMarkerCard({ m }) {
  const plainStatus = m.lab_status
    ? (m.lab_status === 'NORMAL_BY_LAB' ? 'Within your lab\'s reference range' : m.lab_status === 'LOW' ? 'Below your lab\'s reference range' : 'Above your lab\'s reference range')
    : (m.requires_review ? 'Flagged for your pharmacist to review' : 'No reference range available for this result');
  return (
    <div className="lab-clinical-card">
      <div className="lab-clinical-card__head">
        <strong>{m.label}</strong>
        <span className={severityBadgeClass(m.lab_status || 'unknown')}>{plainStatus}</span>
      </div>
      <div className="marker-card__value">{m.result_text || `${m.value} ${m.unit}`}</div>
      <p className="lab-clinical-card__section muted">{m.insight}</p>
    </div>
  );
}

function MarkerResults({ markers, disclaimer, isPatientView }) {
  if (!markers || markers.length === 0) return null;
  return (
    <div>
      {markers.map((m) => (isPatientView
        ? <PatientMarkerCard key={m.nutrient_key} m={m} />
        : <PharmacistMarkerCard key={m.nutrient_key} m={m} />
      ))}
      {disclaimer && <p className="disclaimer">{disclaimer}</p>}
    </div>
  );
}

// Scans a lab-result photo, extracts known markers, and shows whether a
// product the patient is taking looks like it's helping. Also offers a
// manual-entry fallback for when OCR reads a photo wrong, or when the
// lab's own printed reference range should be captured directly.
export default function LabScanner({ patientId, onScanned }) {
  const { user } = useAuth();
  const isPatientView = user?.role === 'patient';
  const [mode, setMode] = useState('scan');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [testTypes, setTestTypes] = useState([]);
  const [entries, setEntries] = useState([{ key: '', value: '', result_text: '', reference_min: '', reference_max: '' }]);
  const [testDate, setTestDate] = useState('');
  const [labName, setLabName] = useState('');
  const [fastingStatus, setFastingStatus] = useState('');

  useEffect(() => {
    if (mode === 'manual' && testTypes.length === 0) {
      apiFetch('/lab-test-types').then(setTestTypes).catch((err) => setError(err.message));
    }
  }, [mode]);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      if (patientId) formData.append('patient_id', patientId);
      formData.append('image', file);
      const data = await apiUpload('/labs/scan', formData);
      setResult(data);
      if (data.markers.length === 0) {
        setError('No recognized markers were found in that photo. You can add them manually below instead.');
      }
      if (onScanned) onScanned();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  function updateEntry(i, patch) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }

  function addEntryRow() {
    setEntries((prev) => [...prev, { key: '', value: '', result_text: '', reference_min: '', reference_max: '' }]);
  }

  function removeEntryRow(i) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const markers = entries
        .filter((en) => en.key && (en.value !== '' || (en.result_text && en.result_text.trim())))
        .map((en) => ({
          key: en.key,
          value: en.value,
          result_text: en.result_text || undefined,
          reference_min: en.reference_min === '' ? undefined : en.reference_min,
          reference_max: en.reference_max === '' ? undefined : en.reference_max,
        }));
      const body = { markers, test_date: testDate || undefined, lab_name: labName || undefined, fasting_status: fastingStatus || undefined };
      if (patientId) body.patient_id = patientId;
      const data = await apiFetch('/labs/manual', { method: 'POST', body: JSON.stringify(body) });
      setResult(data);
      if (data.skipped?.length > 0) {
        setError(data.skipped.map((s) => `${s.key}: ${s.reason}`).join(' '));
      }
      setEntries([{ key: '', value: '', result_text: '', reference_min: '', reference_max: '' }]);
      if (onScanned) onScanned();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="tab-group mb-3">
        <button type="button" className={`tab-btn ${mode === 'scan' ? 'active' : ''}`} onClick={() => setMode('scan')}>
          Scan a photo
        </button>
        <button type="button" className={`tab-btn ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
          Enter manually
        </button>
      </div>

      {mode === 'scan' ? (
        <div className="scan-box">
          <p className="muted">Take or upload a photo of your lab results.</p>
          <input type="file" accept="image/*" capture="environment" onChange={handleFile} disabled={busy} />
          <p className="disclaimer">Only the extracted text/values are saved -- the photo itself is never stored.</p>
        </div>
      ) : (
        <form onSubmit={handleManualSubmit} className="card">
          <div className="row-actions mb-3">
            <input className="input" type="date" placeholder="Test date" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
            <input className="input" placeholder="Lab name (optional)" value={labName} onChange={(e) => setLabName(e.target.value)} />
            <select className="input" value={fastingStatus} onChange={(e) => setFastingStatus(e.target.value)}>
              <option value="">Fasting status (optional)</option>
              <option value="fasting">Fasting</option>
              <option value="non_fasting">Non-fasting</option>
            </select>
          </div>

          {entries.map((entry, i) => (
            <div key={i} className="card mb-3">
              <div className="row-actions mb-3">
                <select
                  className="input"
                  value={entry.key}
                  onChange={(ev) => updateEntry(i, { key: ev.target.value })}
                >
                  <option value="">Select a test…</option>
                  {testTypes.map((t) => (
                    <option key={t.key} value={t.key}>{t.label} ({t.unit})</option>
                  ))}
                </select>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  placeholder="Value"
                  value={entry.value}
                  onChange={(ev) => updateEntry(i, { value: ev.target.value })}
                />
                {entries.length > 1 && (
                  <button type="button" className="chip-remove" onClick={() => removeEntryRow(i)} aria-label="Remove">
                    ×
                  </button>
                )}
              </div>
              {!isPatientView && (
                <div className="row-actions">
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    placeholder="Lab's reference min (optional)"
                    value={entry.reference_min}
                    onChange={(ev) => updateEntry(i, { reference_min: ev.target.value })}
                  />
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    placeholder="Lab's reference max (optional)"
                    value={entry.reference_max}
                    onChange={(ev) => updateEntry(i, { reference_max: ev.target.value })}
                  />
                </div>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm mb-3" onClick={addEntryRow}>
            + Add another test
          </button>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            Save results
          </button>
        </form>
      )}

      {busy && <p className="muted">{mode === 'scan' ? 'Reading photo…' : 'Saving…'}</p>}
      {error && <p className="alert alert-error">{error}</p>}

      <MarkerResults markers={result?.markers} disclaimer={result?.disclaimer} isPatientView={isPatientView} />
    </div>
  );
}
