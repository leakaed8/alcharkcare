import { useNavigate, useParams } from 'react-router-dom';
import PurchaseScanner from '../../components/PurchaseScanner';

export default function InvoiceScan() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="page-narrow">
      <h2>Scan sales invoice</h2>
      <p className="muted">Scan the parapharmacy invoice for this patient. Only product names are saved.</p>
      <PurchaseScanner patientId={id} onSaved={() => navigate(`/staff/patients/${id}`)} />
    </div>
  );
}
