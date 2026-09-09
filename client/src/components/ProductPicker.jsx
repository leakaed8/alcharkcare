import { useState } from 'react';
import { apiFetch } from '../api/client';

// Multi-select product/supplement picker. Typing filters the catalog;
// if nothing matches, an inline "create new" option adds it to the
// catalog (POST /api/products) and selects it immediately.
export default function ProductPicker({ products, selectedIds, onChange, onProductCreated }) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const selected = products.filter((p) => selectedIds.includes(p.id));
  const q = query.trim().toLowerCase();
  const matches = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  const exactMatch = products.some((p) => p.name.toLowerCase() === q);

  function toggle(id) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  function remove(id) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  async function createAndSelect() {
    setCreating(true);
    setError('');
    try {
      const product = await apiFetch('/products', { method: 'POST', body: JSON.stringify({ name: query.trim() }) });
      onProductCreated(product);
      onChange([...selectedIds, product.id]);
      setQuery('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      {selected.length > 0 && (
        <div className="row-actions mb-3">
          {selected.map((p) => (
            <span key={p.id} className="badge badge-status-upcoming">
              {p.name}{' '}
              <button type="button" className="chip-remove" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        className="input"
        placeholder="Search products/supplements…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="product-picker__list">
        {matches.map((p) => (
          <label key={p.id} className="checkbox-item">
            <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />
            {p.name}
          </label>
        ))}
        {matches.length === 0 && <p className="muted">No matches.</p>}
      </div>

      {q && !exactMatch && (
        <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={createAndSelect} disabled={creating}>
          + Add "{query.trim()}" as a new product
        </button>
      )}
      {error && <p className="alert alert-error">{error}</p>}
    </div>
  );
}
