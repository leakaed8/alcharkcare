import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

const NAV_ITEMS = [
  { to: '/patient', label: 'Home', icon: '🏠', end: true },
  { to: '/patient/visits', label: 'Visits', icon: '📋' },
  { to: '/patient/plan', label: 'Plan', icon: '🌿' },
  { to: '/patient/find', label: 'Find', icon: '🔍' },
  { to: '/patient/shop', label: 'Shop', icon: '🛍️' },
  { to: '/patient/profile', label: 'Profile', icon: '👤' },
];

// Shared shell for the whole patient portal: a warm, simple header plus
// navigation that becomes a bottom tab bar on mobile (where this portal is
// mostly used) and a top bar on wider screens. Every patient page renders
// inside this via <Outlet />.
export default function PatientLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="patient-shell">
      <header className="patient-topbar">
        <div className="patient-topbar__brand">Al Chark</div>
        <nav className="patient-topbar__nav">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="patient-topbar__link">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="patient-topbar__user">
          <span>{user?.name}</span>
          <button className="btn btn-sm btn-outline-light" onClick={logout}>Log out</button>
        </div>
      </header>

      <main className="patient-content">
        <Outlet />
      </main>

      <nav className="patient-bottom-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `patient-bottom-nav__item ${isActive ? 'active' : ''}`}
          >
            <span className="patient-bottom-nav__icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
