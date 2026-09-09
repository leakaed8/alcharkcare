import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import StaffLayout from './components/StaffLayout';
import Login from './pages/Login';
import MyCare from './pages/patient/MyCare';
import FollowupDashboard from './pages/staff/FollowupDashboard';
import InvoiceScan from './pages/staff/InvoiceScan';
import ManagerDashboard from './pages/staff/ManagerDashboard';
import PatientSearch from './pages/staff/PatientSearch';
import PatientTimeline from './pages/staff/PatientTimeline';
import ProductManager from './pages/staff/ProductManager';
import VisitEntry from './pages/staff/VisitEntry';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/staff"
        element={
          <ProtectedRoute roles={['staff', 'admin']}>
            <StaffLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="patients" replace />} />
        <Route path="patients" element={<PatientSearch />} />
        <Route path="patients/:id" element={<PatientTimeline />} />
        <Route path="patients/:id/scan-invoice" element={<InvoiceScan />} />
        <Route path="visits/new" element={<VisitEntry />} />
        <Route path="followups" element={<FollowupDashboard />} />
        <Route path="products" element={<ProductManager />} />
        <Route
          path="manager"
          element={
            <ProtectedRoute roles={['admin']}>
              <ManagerDashboard />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route
        path="/patient"
        element={
          <ProtectedRoute roles={['patient']}>
            <MyCare />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
