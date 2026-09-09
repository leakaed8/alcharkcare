import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/client';
import Shop from '../../components/Shop';
import PurchaseScanner from '../../components/PurchaseScanner';

export default function ShopPage() {
  const { user } = useAuth();
  const [purchases, setPurchases] = useState([]);

  function loadPurchases() {
    apiFetch(`/purchases/${user.id}`).then(setPurchases).catch(() => {});
  }

  return (
    <div>
      <p className="p-greeting">Shop</p>
      <p className="muted">Order ahead and pay in store when you pick it up.</p>
      <Shop patientId={user.id} />

      <p className="p-section-title">Already bought something elsewhere?</p>
      <p className="muted">Scan it to add it to your purchase history so your pharmacist can see what you're taking.</p>
      <PurchaseScanner onSaved={loadPurchases} />

      {purchases.length > 0 && (
        <>
          <p className="p-section-title">Purchase history</p>
          <ul className="followup-list">
            {purchases.map((p) => (
              <li key={p.id}>{p.product_name} <span className="muted">— {new Date(p.purchased_at).toLocaleDateString()}</span></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
