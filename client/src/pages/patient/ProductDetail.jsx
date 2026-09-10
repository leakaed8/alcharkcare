import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/client';
import { addToCart } from '../../lib/cart';
import AvailabilityBadge from '../../components/patient/AvailabilityBadge';

export default function ProductDetail() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch(`/products/${id}`).then(setProduct).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, [id]);

  async function markStarted() {
    if (!product?.recommendation?.visit_product_id) return;
    setBusy(true);
    try {
      await apiFetch(`/visits/products/${product.recommendation.visit_product_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'started' }),
      });
      load();
      setMessage("Marked as started -- you'll see it under Currently Using in My Plan.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleAdd() {
    addToCart(user.id, product);
    setMessage(`${product.name} added to cart.`);
  }

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!product) return <p className="muted">Loading…</p>;

  const canAddToCart = product.availability.level === 'green' || product.availability.level === 'orange';

  return (
    <div>
      <Link className="muted" to="/patient/shop">← Back to shop</Link>

      {product.image_url && <img src={product.image_url} alt={product.name} style={{ width: '100%', borderRadius: 16, marginTop: 12, maxHeight: 260, objectFit: 'cover' }} />}

      {product.recommendation && (
        <div className="p-card p-card--highlight" style={{ marginTop: 12 }}>
          <b>Recommended for you</b> during your {new Date(product.recommendation.visit_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} visit.
          {product.recommendation.dosing_notes && <p className="muted">How to use: {product.recommendation.dosing_notes}</p>}
          {product.recommendation.status === 'recommended' && (
            <button className="p-cta" disabled={busy} onClick={markStarted}>I'm using this</button>
          )}
        </div>
      )}

      <p className="p-greeting" style={{ marginTop: 12 }}>{product.name}</p>
      {product.brand && <p className="muted">{product.brand}</p>}
      <AvailabilityBadge availability={product.availability} />
      {product.price != null && <p style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>${product.price}</p>}
      {product.description && <p className="p-card__body">{product.description}</p>}

      {(product.directions_for_use || product.frequency) && (
        <div className="p-card mt-2">
          <p className="p-card__title" style={{ fontSize: 15 }}>How to use</p>
          {product.frequency && <p className="p-card__body">{product.frequency}</p>}
          {product.directions_for_use && <p className="p-card__body">{product.directions_for_use}</p>}
        </div>
      )}
      {product.benefits && (
        <div className="p-card mt-2">
          <p className="p-card__title" style={{ fontSize: 15 }}>Benefits</p>
          <p className="p-card__body">{product.benefits}</p>
        </div>
      )}
      {product.ingredients && (
        <div className="p-card mt-2">
          <p className="p-card__title" style={{ fontSize: 15 }}>Ingredients</p>
          <p className="p-card__body">{product.ingredients}</p>
        </div>
      )}

      {message && <p className="alert alert-success">{message}</p>}

      <div className="row-actions mt-3">
        {canAddToCart ? (
          <button className="p-cta" onClick={handleAdd}>Add to Cart</button>
        ) : (
          <Link className="p-cta" to="/patient/find">Ask Al Chark to Order</Link>
        )}
        <Link className="p-cta p-cta--secondary" to="/patient/find">Ask About Product</Link>
      </div>

      {product.related_products?.length > 0 && (
        <>
          <p className="p-section-title">Related products</p>
          <div className="product-grid">
            {product.related_products.map((p) => (
              <div key={p.id} className="product-card">
                {p.image_url && <img src={p.image_url} alt={p.name} />}
                <strong>{p.name}</strong>
                {p.price != null && <span>${p.price}</span>}
                <AvailabilityBadge availability={p.availability} />
                <button className="btn btn-sm btn-secondary" onClick={() => navigate(`/patient/shop/${p.id}`)}>View</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
