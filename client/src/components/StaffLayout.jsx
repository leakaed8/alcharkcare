import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiFetch } from '../api/client';

const POLL_INTERVAL_MS = 20000;
const BASE_TITLE = 'Al Chark — Staff';

// Push/Telegram notifications only reach staff who have them configured --
// this polls for new patient messages and unacknowledged check-in problems
// so every staff member sees them, on every page, whether or not those are
// set up. Same 20s-poll pattern as the Orders queue.
function NotificationBadges() {
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unacknowledgedCheckins, setUnacknowledgedCheckins] = useState(0);

  useEffect(() => {
    function poll() {
      apiFetch('/messages')
        // unread_count comes back from a Postgres COUNT(*), which node-pg
        // returns as a string (bigint) -- Number() it or this "adds" as
        // string concatenation ("0" + "1" = "01") instead of arithmetic.
        .then((rows) => setUnreadMessages(rows.reduce((sum, r) => sum + Number(r.unread_count || 0), 0)))
        .catch(() => {});
      apiFetch('/checkins?unacknowledged=true')
        .then((rows) => setUnacknowledgedCheckins(rows.length))
        .catch(() => {});
    }
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const total = unreadMessages + unacknowledgedCheckins;
    document.title = total > 0 ? `(${total}) ${BASE_TITLE}` : BASE_TITLE;
  }, [unreadMessages, unacknowledgedCheckins]);

  return (
    <>
      <NavLink to="/staff/messages">
        Messages{unreadMessages > 0 && <span className="nav-badge">{unreadMessages}</span>}
      </NavLink>
      <NavLink to="/staff/checkins">
        Check-ins{unacknowledgedCheckins > 0 && <span className="nav-badge">{unacknowledgedCheckins}</span>}
      </NavLink>
    </>
  );
}

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
          <NotificationBadges />
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
