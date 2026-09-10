import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function StaffLayout() {
  const { user, logout } = useAuth();

  return (
    <div>
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__mark">AC</span>
          Al Chark — Staff
        </div>
        <nav className="app-header__nav">
          <NavLink to="/staff/patients">Patients</NavLink>
          <NavLink to="/staff/visits/new">New visit</NavLink>
          <NavLink to="/staff/followups">Follow-ups</NavLink>
          <NavLink to="/staff/messages">Messages</NavLink>
          <NavLink to="/staff/checkins">Check-ins</NavLink>
          <NavLink to="/staff/orders">Orders</NavLink>
          <NavLink to="/staff/product-requests">Requests</NavLink>
          <NavLink to="/staff/products">Products</NavLink>
          <NavLink to="/staff/lab-tests">Lab tests</NavLink>
          <NavLink to="/staff/sheets-sync">Sheets Sync</NavLink>
          {user?.role === 'admin' && <NavLink to="/staff/manager">Manager</NavLink>}
        </nav>
        <div className="app-header__spacer" />
        <div className="app-header__user">
          <span>{user?.name}</span>
          <button className="btn btn-sm btn-outline-light" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
