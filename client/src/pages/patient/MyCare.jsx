import { useAuth } from '../../auth/AuthContext';

// Placeholder patient landing page. The full read-only care timeline,
// progress photos, and shop are later build-order steps (5+).
export default function MyCare() {
  const { user, logout } = useAuth();

  return (
    <div className="patient-shell">
      <div className="patient-card">
        <div className="patient-card__mark">AC</div>
        <h1>Welcome, {user?.name}</h1>
        <p>Your care timeline, notifications, and shop are coming soon.</p>
        <button className="btn btn-secondary" onClick={logout}>
          Log out
        </button>
      </div>
    </div>
  );
}
