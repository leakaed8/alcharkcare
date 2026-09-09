import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import CarePlanList from '../../components/CarePlanList';
import PatientPicker from '../../components/PatientPicker';
import ProductPicker from '../../components/ProductPicker';
import ProgressPhotos from '../../components/ProgressPhotos';
import VisitHistoryList from '../../components/VisitHistoryList';

const SKIN_TYPES = ['normal', 'oily', 'dry', 'combination', 'sensitive'];

export default function VisitEntry() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const lockedPatientId = searchParams.get('patientId');

  const [patientId, setPatientId] = useState(lockedPatientId ? Number(lockedPatientId) : null);
  const [patientData, setPatientData] = useState(null); // { patient, visits, followups }
  const [skinType, setSkinType] = useState('');
  const [allergies, setAllergies] = useState('');

  const [carePlanId, setCarePlanId] = useState('');
  const [activePlans, setActivePlans] = useState([]);

  const [complaint, setComplaint] = useState('');
  const [assessment, setAssessment] = useState('');
  const [patientSummary, setPatientSummary] = useState('');
  const [lifestyleAdvice, setLifestyleAdvice] = useState('');
  const [nextFollowupDate, setNextFollowupDate] = useState('');
  const [products, setProducts] = useState([]);
  const [productItems, setProductItems] = useState([]); // [{ product_id, dosing_notes }]
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/products').then(setProducts).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const urlId = searchParams.get('patientId');
    if (urlId) setPatientId(Number(urlId));
  }, [searchParams]);

  useEffect(() => {
    if (!patientId) return;
    setPatientData(null);
    apiFetch(`/patients/${patientId}`)
      .then((data) => {
        setPatientData(data);
        setSkinType(data.patient.skin_type || '');
        setAllergies((data.patient.allergies || []).join(', '));
      })
      .catch((err) => setError(err.message));
  }, [patientId]);

  function handleProductCreated(product) {
    setProducts((prev) => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)));
  }

  function handlePlansLoaded(plans) {
    setActivePlans(plans.filter((p) => p.status === 'active'));
  }

  function changePatient() {
    setPatientId(null);
    setPatientData(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const originalSkinType = patientData.patient.skin_type || '';
      const originalAllergies = (patientData.patient.allergies || []).join(', ');
      if (skinType !== originalSkinType || allergies !== originalAllergies) {
        await apiFetch(`/patients/${patientId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            skin_type: skinType || null,
            allergies: allergies ? allergies.split(',').map((a) => a.trim()).filter(Boolean) : [],
          }),
        });
      }

      await apiFetch('/visits', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: patientId,
          care_plan_id: carePlanId || null,
          complaint,
          assessment,
          patient_summary: patientSummary,
          lifestyle_advice: lifestyleAdvice,
          next_followup_date: nextFollowupDate || null,
          products: productItems,
        }),
      });
      setSuccess('Visit logged.');
      setTimeout(() => navigate(`/staff/patients/${patientId}`), 600);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!patientId) {
    return (
      <div className="page-narrow">
        <h2>New visit</h2>
        <p className="muted">Find the patient, or add a new one, to start a treatment session.</p>
        <PatientPicker onSelect={setPatientId} />
      </div>
    );
  }

  if (!patientData) {
    return <p className="muted">Loading patient…</p>;
  }

  const { patient, visits } = patientData;

  return (
    <div className="page-narrow">
      <div className="page-header">
        <div>
          <h2>{patient.name}</h2>
          <p className="muted">
            {patient.phone} · <span className={`badge badge-${patient.loyalty_tier}`}>{patient.loyalty_tier}</span>
          </p>
        </div>
        {!lockedPatientId && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={changePatient}>
            Change patient
          </button>
        )}
      </div>

      {error && <p className="alert alert-error">{error}</p>}

      <h3 className="section-title">History</h3>
      <VisitHistoryList visits={visits} />

      <h3 className="section-title">Care plans</h3>
      <CarePlanList patientId={patientId} canManage onPlansLoaded={handlePlansLoaded} />

      <h3 className="section-title">Patient profile</h3>
      <div className="card mb-5">
        <div className="form-field">
          <label className="field-label" htmlFor="skinType">Skin type</label>
          <select id="skinType" className="input" value={skinType} onChange={(e) => setSkinType(e.target.value)}>
            <option value="">Not set</option>
            {SKIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="allergies">Allergies (comma-separated)</label>
          <input
            id="allergies"
            className="input"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
            placeholder="e.g. penicillin, latex"
          />
        </div>
      </div>

      <h3 className="section-title">Treatment session</h3>
      <form onSubmit={handleSubmit} className="card">
        {activePlans.length > 0 && (
          <div className="form-field">
            <label className="field-label" htmlFor="carePlan">Part of care plan</label>
            <select id="carePlan" className="input" value={carePlanId} onChange={(e) => setCarePlanId(e.target.value)}>
              <option value="">No plan</option>
              {activePlans.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        )}
        <div className="form-field">
          <label className="field-label" htmlFor="complaint">Complaint</label>
          <textarea id="complaint" className="textarea" value={complaint} onChange={(e) => setComplaint(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="assessment">Assessment (internal -- never shown to the patient)</label>
          <textarea id="assessment" className="textarea" value={assessment} onChange={(e) => setAssessment(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="patientSummary">Patient-visible summary (optional)</label>
          <textarea
            id="patientSummary"
            className="textarea"
            value={patientSummary}
            onChange={(e) => setPatientSummary(e.target.value)}
            placeholder="A short, plain-language summary the patient will see in their portal. If left blank, they'll see a generic message instead."
          />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="lifestyleAdvice">Treatment suggestion / lifestyle advice</label>
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
          <ProductPicker
            products={products}
            items={productItems}
            onChange={setProductItems}
            onProductCreated={handleProductCreated}
          />
        </fieldset>

        {success && <p className="alert alert-success">{success}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          Save visit
        </button>
      </form>

      <h3 className="section-title">Progress photos</h3>
      <ProgressPhotos patientId={patientId} />
    </div>
  );
}
