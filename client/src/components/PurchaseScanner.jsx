import { useState } from 'react';
import { apiFetch, apiUpload } from '../api/client';

// Shared "scan a photo -> confirm candidates -> save" flow, plus a manual
// entry fallback for when OCR reads a name wrong. Used both by a patient
// scanning/adding a single product they have, and by staff scanning a
// parapharmacy sales invoice for a patient. Only the confirmed names are
// ever saved -- the photo itself never leaves this form.
export default function PurchaseScanner({ patientId, onSaved }) {
  const [mode, setMode] = useState('scan');
  const [candidates, setCandidates] = useState(null);
  const [manualName, setManualName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setError('');
    setSuccess('');
    setCandidates(null);
    try {
      const formData = new FormData();
      if (patientId) formData.append('patient_id', patientId);
      formData.append('image', file);
      const { candidates: found } = await apiUpload('/purchases/scan', formData);
      setCandidates(
        found.map((c) => ({ ...c, include: c.confidence >= 0.5 }))
      );
      if (found.length === 0) {
        setError('No product-like text was found in that photo. Try a clearer photo, or add it manually below.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  function addManualEntry(e) {
    e.preventDefault();
    if (!manualName.trim()) return;
    setCandidates((prev) => [
      ...(prev || []),
      { product_id: null, product_name: manualName.trim(), confidence: 0, include: true },
    ]);
    setManualName('');
    setSuccess('');
  }

  function updateCandidate(index, patch) {
    setCandidates((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  async function handleConfirm() {
    setBusy(true);
    setError('');
    try {
      const items = candidates
        .filter((c) => c.include && c.product_name.trim())
        .map((c) => ({ product_id: c.product_id, product_name: c.product_name.trim() }));
      const body = { items };
      if (patientId) body.patient_id = patientId;
      await apiFetch('/purchases/confirm', { method: 'POST', body: JSON.stringify(body) });
      setSuccess('Saved to purchase history.');
      setCandidates(null);
      if (onSaved) onSaved();
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
          Add manually
        </button>
      </div>

      {mode === 'scan' ? (
        <div className="scan-box">
          <p className="muted">Take or upload a photo of a product or sales invoice.</p>
          <input type="file" accept="image/*" capture="environment" onChange={handleFile} disabled={busy} />
          <p className="disclaimer">Only the product name(s) are saved -- the photo itself is never stored.</p>
        </div>
      ) : (
        <form onSubmit={addManualEntry} className="row-actions">
          <input
            className="input"
            placeholder="Product name"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary">Add</button>
        </form>
      )}

      {busy && <p className="muted">Reading photo…</p>}
      {error && <p className="alert alert-error">{error}</p>}
      {success && <p className="alert alert-success">{success}</p>}

      {candidates && candidates.length > 0 && (
        <div className="card mt-3">
          <p className="field-label">Confirm what to save:</p>
          {candidates.map((c, i) => (
            <div key={i} className="candidate-row">
              <input
                type="checkbox"
                checked={c.include}
                onChange={(e) => updateCandidate(i, { include: e.target.checked })}
              />
              <input
                className="input"
                value={c.product_name}
                onChange={(e) => updateCandidate(i, { product_name: e.target.value, product_id: null })}
              />
              {c.product_id && c.confidence >= 0.5 && <span className="badge badge-status-upcoming">matched</span>}
            </div>
          ))}
          <button className="btn btn-primary btn-block mt-3" onClick={handleConfirm} disabled={busy}>
            Save to purchase history
          </button>
        </div>
      )}
    </div>
  );
}
