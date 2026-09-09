import { useEffect, useState } from 'react';
import { apiFetch, apiUpload } from '../api/client';

// Before/after progress photos. Unlike the lab/invoice OCR scans elsewhere
// in the app, this photo IS kept -- that's the point of a before/after
// comparison -- so the copy here deliberately doesn't repeat the "photo is
// never stored" language used by those other scan flows.
export default function ProgressPhotos({ patientId }) {
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bodyArea, setBodyArea] = useState('');

  async function load() {
    try {
      setPhotos(await apiFetch(`/photos/${patientId}`));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [patientId]);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('patient_id', patientId);
      formData.append('image', file);
      if (bodyArea) formData.append('body_area', bodyArea);
      await apiUpload('/photos', formData);
      setBodyArea('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function handleDelete(id) {
    try {
      await apiFetch(`/photos/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="form-field">
        <label className="field-label" htmlFor="body-area">Area (optional)</label>
        <input
          id="body-area"
          className="input"
          placeholder="e.g. face, scalp"
          value={bodyArea}
          onChange={(e) => setBodyArea(e.target.value)}
        />
      </div>
      <div className="scan-box">
        <p className="muted">Take or upload a before/after progress photo.</p>
        <input type="file" accept="image/*" capture="environment" onChange={handleFile} disabled={busy} />
        <p className="disclaimer">This photo is kept, for comparing progress over time.</p>
      </div>

      {busy && <p className="muted">Uploading…</p>}
      {error && <p className="alert alert-error">{error}</p>}

      {photos.length === 0 ? (
        <p className="muted">No photos yet.</p>
      ) : (
        <div className="photo-grid">
          {photos.map((p) => (
            <div key={p.id} className="photo-grid__item">
              <img src={p.photo_url} alt={p.body_area || 'Progress photo'} />
              <div className="photo-grid__meta">
                {p.body_area && <div>{p.body_area}</div>}
                <div>{new Date(p.taken_date).toLocaleDateString()}</div>
                <div className="row-actions">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDelete(p.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
