import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/client';
import CarePlanList from '../../components/CarePlanList';
import LabScanner from '../../components/LabScanner';
import ProgressPhotos from '../../components/ProgressPhotos';
import PurchaseScanner from '../../components/PurchaseScanner';
import Shop from '../../components/Shop';
import VisitHistoryList from '../../components/VisitHistoryList';

const LAB_STATUS_PLAIN = {
  NORMAL_BY_LAB: "Within your lab's reference range",
  LOW: "Below your lab's reference range",
  HIGH: "Above your lab's reference range",
};

export default function MyCare() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [labData, setLabData] = useState(null);
  const [error, setError] = useState('');

  async function loadPurchases() {
    try {
      setPurchases(await apiFetch(`/purchases/${user.id}`));
    } catch (err) {
      setError(err.message);
    }
  }

  function loadLabs() {
    apiFetch(`/labs/${user.id}`).then(setLabData).catch((err) => setError(err.message));
  }

  useEffect(() => {
    apiFetch(`/patients/${user.id}`).then(setData).catch((err) => setError(err.message));
    loadPurchases();
    loadLabs();
  }, []);

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <div>
          <h1>Welcome, {user?.name}</h1>
          <p className="muted">Your care history, lab check-ins, and purchases.</p>
        </div>
        <button className="btn btn-secondary" onClick={logout}>
          Log out
        </button>
      </div>

      {error && <p className="alert alert-error">{error}</p>}

      <h3 className="section-title">Care plans</h3>
      <CarePlanList patientId={user.id} canManage={false} />

      <h3 className="section-title">Visit history</h3>
      {!data ? <p className="muted">Loading…</p> : <VisitHistoryList visits={data.visits} />}

      <h3 className="section-title">Progress photos</h3>
      <ProgressPhotos patientId={user.id} />

      <h3 className="section-title">Follow-ups</h3>
      {data && data.followups.length === 0 && <p className="muted">No follow-ups logged.</p>}
      {data && (
        <ul className="followup-list">
          {data.followups.map((f) => (
            <li key={f.id}>
              {new Date(f.scheduled_date).toLocaleDateString()} — {f.status} {f.response ? `(${f.response})` : ''}
            </li>
          ))}
        </ul>
      )}

      <h3 className="section-title">Scan a lab result</h3>
      <p className="muted">See if a product you're taking looks like it's helping your levels.</p>
      <LabScanner onScanned={loadLabs} />

      <h3 className="section-title">Your lab result history</h3>
      {(!labData || labData.results.length === 0) && <p className="muted">No lab results on file yet.</p>}
      {labData?.results.map((lab) => (
        <div key={lab.id} className="visit-card">
          <div className="visit-card__date">{new Date(lab.scanned_at).toLocaleDateString()}</div>
          {lab.markers.map((m) => (
            <div key={m.id} className="lab-clinical-card">
              <div className="lab-clinical-card__head">
                <strong>{m.label}</strong>
                <span className={`badge badge-severity-${(m.lab_status || 'unknown').toLowerCase()}`}>
                  {m.lab_status ? LAB_STATUS_PLAIN[m.lab_status] : (m.requires_review ? 'Flagged for your pharmacist to review' : 'No reference range on file')}
                </span>
              </div>
              <div className="marker-card__value">{m.result_text || `${m.value} ${m.unit}`}</div>
              <p className="lab-clinical-card__section muted">{m.insight}</p>
            </div>
          ))}
        </div>
      ))}
      {labData?.disclaimer && <p className="disclaimer">{labData.disclaimer}</p>}

      <h3 className="section-title">Shop</h3>
      <p className="muted">Order ahead and pay in store when you pick it up.</p>
      <Shop patientId={user.id} />

      <h3 className="section-title">Scan a product</h3>
      <p className="muted">Add something you're taking to your purchase history.</p>
      <PurchaseScanner onSaved={loadPurchases} />

      <h3 className="section-title">Purchase history</h3>
      {purchases.length === 0 && <p className="muted">Nothing logged yet.</p>}
      <ul className="followup-list">
        {purchases.map((p) => (
          <li key={p.id}>
            {p.product_name} <span className="muted">— {new Date(p.purchased_at).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
