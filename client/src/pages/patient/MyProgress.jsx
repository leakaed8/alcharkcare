import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch, apiUpload } from '../../api/client';
import LabScanner from '../../components/LabScanner';

const TABS = [
  { key: 'photos', label: 'Photos' },
  { key: 'labs', label: 'Lab check-ins' },
];

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'acne', label: 'Acne' },
  { value: 'pigmentation', label: 'Pigmentation' },
  { value: 'redness', label: 'Redness' },
  { value: 'texture', label: 'Texture' },
  { value: 'hair', label: 'Hair' },
  { value: 'skin', label: 'Skin' },
  { value: 'other', label: 'Other' },
];

const LAB_STATUS_PLAIN = {
  NORMAL_BY_LAB: "Within your lab's reference range",
  LOW: "Below your lab's reference range",
  HIGH: "Above your lab's reference range",
};

function PhotoLightbox({ photos, index, onClose, onNavigate }) {
  const photo = photos[index];
  if (!photo) return null;
  return (
    <div className="p-photo-lightbox" onClick={onClose}>
      <button className="p-photo-lightbox__close" onClick={onClose} aria-label="Close">✕</button>
      <div className="p-photo-lightbox__stage" onClick={(e) => e.stopPropagation()}>
        <button
          className="p-photo-lightbox__nav"
          disabled={index <= 0}
          onClick={() => onNavigate(index - 1)}
          aria-label="Previous photo"
        >
          ‹
        </button>
        <img className="p-photo-lightbox__img" src={photo.photo_url} alt={photo.category || 'Progress photo'} />
        <button
          className="p-photo-lightbox__nav"
          disabled={index >= photos.length - 1}
          onClick={() => onNavigate(index + 1)}
          aria-label="Next photo"
        >
          ›
        </button>
      </div>
      <p className="p-photo-lightbox__meta">
        {photo.category ? `${photo.category} · ` : ''}{new Date(photo.taken_date).toLocaleDateString()}
      </p>
    </div>
  );
}

function PhotosTab({ patientId }) {
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState('');
  const [filter, setFilter] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);

  function load() {
    apiFetch(`/photos/${patientId}`).then(setPhotos).catch((err) => setError(err.message));
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
      if (category) formData.append('category', category);
      await apiUpload('/photos', formData);
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

  const filtered = filter ? photos.filter((p) => p.category === filter) : photos;

  return (
    <div>
      <div className="p-card">
        <p className="p-card__body">Take a private before/after photo to track your progress over time. Only you and your pharmacist can see it.</p>
        <div className="form-field mt-2">
          <label className="field-label" htmlFor="photo-category">Category</label>
          <select id="photo-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.slice(1).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <input type="file" accept="image/*" capture="environment" onChange={handleFile} disabled={busy} />
        {busy && <p className="muted">Uploading…</p>}
      </div>

      {error && <p className="alert alert-error">{error}</p>}

      <div className="p-tabs">
        {CATEGORIES.map((c) => (
          <button key={c.value} type="button" className={`p-tab ${filter === c.value ? 'active' : ''}`} onClick={() => setFilter(c.value)}>
            {c.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="p-card p-empty">
          <p>No photos yet in this category.</p>
        </div>
      ) : (
        <div className="photo-grid">
          {filtered.map((p, i) => (
            <div key={p.id} className="photo-grid__item">
              <img src={p.photo_url} alt={p.category || 'Progress photo'} onClick={() => setLightboxIndex(i)} style={{ cursor: 'zoom-in' }} />
              <div className="photo-grid__meta">
                {p.category && <div>{p.category}</div>}
                <div>{new Date(p.taken_date).toLocaleDateString()}</div>
                <div className="row-actions">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDelete(p.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightboxIndex != null && (
        <PhotoLightbox
          photos={filtered}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

function LabsTab({ patientId }) {
  const [labData, setLabData] = useState(null);

  function load() {
    apiFetch(`/labs/${patientId}`).then(setLabData).catch(() => {});
  }

  useEffect(() => {
    load();
  }, [patientId]);

  return (
    <div>
      <p className="muted">See if a product you're taking looks like it's helping your levels.</p>
      <LabScanner onScanned={load} />

      {labData?.results.map((lab) => (
        <div key={lab.id} className="p-card">
          <div className="p-card__meta">{new Date(lab.scanned_at).toLocaleDateString()}</div>
          {lab.markers.map((m) => (
            <div key={m.id} className="mb-2">
              <b>{m.label}</b>{' '}
              <span className={`badge badge-severity-${(m.lab_status || 'unknown').toLowerCase()}`}>
                {m.lab_status ? LAB_STATUS_PLAIN[m.lab_status] : 'No reference range on file'}
              </span>
              <div className="muted">{m.insight}</div>
            </div>
          ))}
        </div>
      ))}
      {labData?.disclaimer && <p className="disclaimer">{labData.disclaimer}</p>}
    </div>
  );
}

export default function MyProgress() {
  const { user } = useAuth();
  const [tab, setTab] = useState('photos');

  const tabContent = useMemo(() => {
    if (tab === 'photos') return <PhotosTab patientId={user.id} />;
    return <LabsTab patientId={user.id} />;
  }, [tab, user.id]);

  return (
    <div>
      <p className="p-greeting">My progress</p>
      <p className="muted">Your photos and lab history, all in one place.</p>

      <div className="p-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`p-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tabContent}
    </div>
  );
}
