import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../api/client';

export default function VisitEntry() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [patientId, setPatientId] = useState(searchParams.get('patientId') || '');
  const [complaint, setComplaint] = useState('');
  const [assessment, setAssessment] = useState('');
  const [lifestyleAdvice, setLifestyleAdvice] = useState('');
  const [nextFollowupDate, setNextFollowupDate] = useState('');
  const [products, setProducts] = useState([]);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    apiFetch('/products').then(setProducts).catch((err) => setError(err.message));
  }, []);

  function toggleProduct(id) {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await apiFetch('/visits', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: Number(patientId),
          complaint,
          assessment,
          lifestyle_advice: lifestyleAdvice,
          next_followup_date: nextFollowupDate || null,
          products: selectedProductIds.map((product_id) => ({ product_id })),
        }),
      });
      setSuccess('Visit logged.');
      setTimeout(() => navigate(`/staff/patients/${patientId}`), 600);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page-narrow">
      <h2>New visit</h2>
      <form onSubmit={handleSubmit} className="card">
        <div className="form-field">
          <label className="field-label" htmlFor="patientId">Patient ID</label>
          <input
            id="patientId"
            className="input"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="complaint">Complaint</label>
          <textarea id="complaint" className="textarea" value={complaint} onChange={(e) => setComplaint(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="assessment">Assessment</label>
          <textarea id="assessment" className="textarea" value={assessment} onChange={(e) => setAssessment(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="lifestyleAdvice">Lifestyle advice</label>
          <textarea
            id="lifestyleAdvice"
            className="textarea"
            value={lifestyleAdvice}
            onChange={(e) => setLifestyleAdvice(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="nextFollowupDate">Next follow-up date</label>
          <input
            id="nextFollowupDate"
            className="input"
            type="date"
            value={nextFollowupDate}
            onChange={(e) => setNextFollowupDate(e.target.value)}
          />
        </div>

        <fieldset className="field-fieldset">
          <legend>Products / supplements used</legend>
          <div className="checkbox-grid">
            {products.map((p) => (
              <label key={p.id} className="checkbox-item">
                <input
                  type="checkbox"
                  checked={selectedProductIds.includes(p.id)}
                  onChange={() => toggleProduct(p.id)}
                />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p className="alert alert-error">{error}</p>}
        {success && <p className="alert alert-success">{success}</p>}
        <button type="submit" className="btn btn-primary btn-block">
          Save visit
        </button>
      </form>
    </div>
  );
}
