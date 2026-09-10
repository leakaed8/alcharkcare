import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import PatientLayout from './components/patient/PatientLayout';
import StaffLayout from './components/StaffLayout';
import Login from './pages/Login';
import FindProducts from './pages/patient/FindProducts';
import Home from './pages/patient/Home';
import Messages from './pages/patient/Messages';
import MyProgress from './pages/patient/MyProgress';
import MyRoutine from './pages/patient/MyRoutine';
import ProductDetail from './pages/patient/ProductDetail';
import Profile from './pages/patient/Profile';
import ShopPage from './pages/patient/ShopPage';
import VisitDetail from './pages/patient/VisitDetail';
import Visits from './pages/patient/Visits';
import CheckinQuestions from './pages/staff/CheckinQuestions';
import FollowupDashboard from './pages/staff/FollowupDashboard';
import GoogleSheetsSync from './pages/staff/GoogleSheetsSync';
import InvoiceScan from './pages/staff/InvoiceScan';
import LabTestTypeManager from './pages/staff/LabTestTypeManager';
import ManagerDashboard from './pages/staff/ManagerDashboard';
import StaffMessages from './pages/staff/Messages';
import Orders from './pages/staff/Orders';
import PatientSearch from './pages/staff/PatientSearch';
import PatientTimeline from './pages/staff/PatientTimeline';
import ProductManager from './pages/staff/ProductManager';
import ProductRequests from './pages/staff/ProductRequests';
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
        <Route path="orders" element={<Orders />} />
        <Route path="product-requests" element={<ProductRequests />} />
        <Route path="products" element={<ProductManager />} />
        <Route path="lab-tests" element={<LabTestTypeManager />} />
        <Route path="messages" element={<StaffMessages />} />
        <Route path="checkins" element={<CheckinQuestions />} />
        <Route path="sheets-sync" element={<GoogleSheetsSync />} />
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
            <PatientLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="visits" element={<Visits />} />
        <Route path="visits/:id" element={<VisitDetail />} />
        <Route path="routine" element={<MyRoutine />} />
        <Route path="progress" element={<MyProgress />} />
        <Route path="messages" element={<Messages />} />
        <Route path="find" element={<FindProducts />} />
        <Route path="shop" element={<ShopPage />} />
        <Route path="shop/:id" element={<ProductDetail />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
