export default function VisitHistoryList({ visits }) {
  if (visits.length === 0) return <p className="muted">No visits yet.</p>;

  return visits.map((v) => (
    <div key={v.id} className="visit-card">
      <div className="visit-card__date">{new Date(v.visit_date).toLocaleDateString()}</div>
      {v.staff_name && <div className="visit-card__meta">seen by {v.staff_name}</div>}
      <p className="visit-card__row"><b>Complaint:</b> {v.complaint || '—'}</p>
      <p className="visit-card__row"><b>Assessment:</b> {v.assessment || '—'}</p>
      <p className="visit-card__row"><b>Lifestyle advice:</b> {v.lifestyle_advice || '—'}</p>
      {v.products.length > 0 && (
        <p className="visit-card__row">
          <b>Products:</b>{' '}
          {v.products.map((p, i) => (
            <span key={i}>
              {i > 0 && ', '}
              {p.product_name}
              {p.dosing_notes && <span className="muted"> ({p.dosing_notes})</span>}
            </span>
          ))}
        </p>
      )}
      {v.next_followup_date && (
        <p className="visit-card__row"><b>Next follow-up:</b> {v.next_followup_date}</p>
      )}
    </div>
  ));
}
