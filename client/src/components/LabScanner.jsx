import { useState } from 'react';
import { apiUpload } from '../api/client';

const FLAG_LABELS = { low: 'Low', normal: 'Normal', high: 'High', unknown: 'Unclear' };

// Scans a lab-result photo, extracts known markers, and shows whether a
// product the patient is taking looks like it's helping. Informational
// only -- not medical advice.
export default function LabScanner({ patientId, onScanned }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
        setError('No recognized markers (Vitamin D, B12, Ferritin, etc.) were found in that photo.');
      }
      if (onScanned) onScanned();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <div>
      <div className="scan-box">
        <p className="muted">Take or upload a photo of your lab results.</p>
        <input type="file" accept="image/*" capture="environment" onChange={handleFile} disabled={busy} />
        <p className="disclaimer">Only the extracted text/values are saved -- the photo itself is never stored.</p>
      </div>

      {busy && <p className="muted">Reading photo…</p>}
      {error && <p className="alert alert-error">{error}</p>}

      {result && result.markers.length > 0 && (
        <div>
          {result.markers.map((m) => (
            <div key={m.nutrient_key} className="marker-card">
              <div className="marker-card__head">
                <strong>{m.label}</strong>
                <span className={`badge badge-flag-${m.flag}`}>{FLAG_LABELS[m.flag] || m.flag}</span>
              </div>
              <div className="marker-card__value">
                {m.value} {m.unit} <span className="muted">(range {m.ref_low}-{m.ref_high})</span>
              </div>
              <p className="marker-card__insight">{m.insight}</p>
            </div>
          ))}
          <p className="disclaimer">Informational only, based on general reference ranges -- not medical advice.</p>
        </div>
      )}
    </div>
  );
}
