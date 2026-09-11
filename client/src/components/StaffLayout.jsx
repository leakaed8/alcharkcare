import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiFetch } from '../api/client';

const POLL_INTERVAL_MS = 20000;
const BASE_TITLE = 'Al Chark — Staff';

// Icon + label per item, same spirit as the patient portal's bottom nav --
// on mobile this becomes a single-column dropdown (icons make each row
// scannable at a glance) instead of the old header's cramped multi-row
// wrap of small text links.
const NAV_ITEMS = [
  { to: '/staff/patients', label: 'Patients', icon: '🧑‍🤝‍🧑' },
  { to: '/staff/visits/new', label: 'New visit', icon: '📝' },
  { to: '/staff/followups', label: 'Follow-ups', icon: '📅' },
  { to: '/staff/messages', label: 'Messages', icon: '💬', badge: true },
  { to: '/staff/orders', label: 'Orders', icon: '🛒' },
  { to: '/staff/product-requests', label: 'Requests', icon: '📦' },
  { to: '/staff/refill-requests', label: 'Refills', icon: '🔁' },
  { to: '/staff/products', label: 'Products', icon: '🏷️' },
  { to: '/staff/expiring-soon', label: 'Expiring Soon', icon: '⏳' },
  { to: '/staff/promotions', label: 'Promotions', icon: '🎉' },
  { to: '/staff/events', label: 'Events', icon: '📣' },
  { to: '/staff/lab-tests', label: 'Lab tests', icon: '🧪' },
  { to: '/staff/sheets-sync', label: 'Sheets Sync', icon: '🔄' },
];

// Push/Telegram notifications only reach staff who have them configured --
// this polls for new patient messages so every staff member sees them, on
// every page, whether or not those are set up. Same 20s-poll pattern as
// the Orders queue.
function useUnreadMessages() {
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    function poll() {
      apiFetch('/messages')
        // unread_count comes back from a Postgres COUNT(*), which node-pg
        // returns as a string (bigint) -- Number() it or this "adds" as
        // string concatenation ("0" + "1" = "01") instead of arithmetic.
        .then((rows) => setUnreadMessages(rows.reduce((sum, r) => sum + Number(r.unread_count || 0), 0)))
        .catch(() => {});
    }
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.title = unreadMessages > 0 ? `(${unreadMessages}) ${BASE_TITLE}` : BASE_TITLE;
  }, [unreadMessages]);

  return unreadMessages;
}

export default function StaffLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const unreadMessages = useUnreadMessages();

  // A route change (nav link tap) always means the mobile menu should
  // close -- otherwise it stays open covering the page underneath.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const items = user?.role === 'admin' ? [...NAV_ITEMS, { to: '/staff/manager', label: 'Manager', icon: '⚙️' }] : NAV_ITEMS;

  return (
    <div>
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__mark">AC</span>
          Al Chark — Staff
        </div>

        <button
          type="button"
          className="app-header__menu-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>

        <nav className={`app-header__nav ${menuOpen ? 'app-header__nav--open' : ''}`}>
          {items.map((item) => (
            <NavLink key={item.to} to={item.to}>
              <span className="app-header__nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.badge && unreadMessages > 0 && <span className="nav-badge">{unreadMessages}</span>}
            </NavLink>
          ))}
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
