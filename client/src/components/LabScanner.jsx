import { useEffect, useState } from 'react';
import { apiFetch, apiUpload } from '../api/client';

const FLAG_LABELS = { low: 'Low', normal: 'Normal', high: 'High', unknown: 'Unclear' };

function MarkerResults({ markers }) {
  if (!markers || markers.length === 0) return null;
  return (
    <div>
      {markers.map((m) => (
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
  );
}

// Scans a lab-result photo, extracts known markers, and shows whether a
// product the patient is taking looks like it's helping. Also offers a
// manual-entry fallback for when OCR reads a photo wrong.
// Informational only -- not medical advice.
export default function LabScanner({ patientId, onScanned }) {
  const [mode, setMode] = useState('scan');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [testTypes, setTestTypes] = useState([]);
  const [entries, setEntries] = useState([{ key: '', value: '' }]);

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
    setEntries((prev) => [...prev, { key: '', value: '' }]);
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
      const body = { markers: entries.filter((en) => en.key && en.value !== '') };
      if (patientId) body.patient_id = patientId;
      const data = await apiFetch('/labs/manual', { method: 'POST', body: JSON.stringify(body) });
      setResult(data);
      setEntries([{ key: '', value: '' }]);
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
          {entries.map((entry, i) => (
            <div key={i} className="row-actions mb-3">
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

      <MarkerResults markers={result?.markers} />
    </div>
  );
}
