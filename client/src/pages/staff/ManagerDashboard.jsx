import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';

function StatCard({ label, value }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div className="stat-card__value">{value}</div>
    </div>
  );
}

function TelegramConnect() {
  const [status, setStatus] = useState(null);
  const [deepLink, setDeepLink] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch('/telegram/status').then(setStatus).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  // Once a deep link is showing, poll for the webhook having recorded the
  // link -- the admin's action (opening Telegram, hitting Start) happens
  // outside this tab, so there's no other way to know it completed.
  useEffect(() => {
    if (!deepLink) return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [deepLink]);

  useEffect(() => {
    if (status?.linked) setDeepLink(null);
  }, [status]);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch('/telegram/connect', { method: 'POST' });
      setDeepLink(data.deep_link);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError('');
    try {
      await apiFetch('/telegram/disconnect', { method: 'POST' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <div className="card mb-5">
      <p className="field-label">Telegram notifications</p>
      {!status.bot_configured && (
        <p className="alert alert-error">Not available yet -- set TELEGRAM_BOT_TOKEN on the server first.</p>
      )}
      {status.bot_configured && status.linked && (
        <>
          <p className="alert alert-success">Connected -- staff notifications (new messages, patient-reported problems, refill requests, sync issues) are sent here.</p>
          <button className="btn btn-sm btn-ghost" onClick={disconnect} disabled={busy}>Disconnect</button>
        </>
      )}
      {status.bot_configured && !status.linked && !deepLink && (
        <>
          <p className="muted">Not connected yet. This links one shared Telegram chat for the whole pharmacy.</p>
          <button className="btn btn-secondary" onClick={connect} disabled={busy}>Connect Telegram</button>
        </>
      )}
      {deepLink && (
        <>
          <p className="muted">Open Telegram and tap Start to finish connecting -- this updates automatically.</p>
          <a className="btn btn-primary" href={deepLink} target="_blank" rel="noreferrer">Open Telegram</a>
        </>
      )}
      {error && <p className="alert alert-error">{error}</p>}
    </div>
  );
}

export default function ManagerDashboard() {
  const [overview, setOverview] = useState(null);
  const [segments, setSegments] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/manager/overview').then(setOverview).catch((err) => setError(err.message));
    apiFetch('/manager/segments').then(setSegments).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!overview || !segments) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <h2>Manager overview</h2>
      </div>

      <TelegramConnect />

      <div className="stat-grid">
        <StatCard label="Total patients" value={overview.total_patients} />
        <StatCard label="New patients (30d)" value={overview.new_patients_30d} />
        <StatCard label="Visits (30d)" value={overview.visits_30d} />
        <StatCard label="Lab scans" value={overview.lab_scans_total} />
        <StatCard label="Purchases logged" value={overview.purchases_total} />
      </div>

      <h3 className="section-title">Loyalty tier breakdown</h3>
      <div className="row-actions mb-5">
        {overview.tier_breakdown.map((t) => (
          <span key={t.loyalty_tier} className={`badge badge-${t.loyalty_tier}`}>
            {t.loyalty_tier}: {t.count}
          </span>
        ))}
      </div>

      <h3 className="section-title">Top products</h3>
      <div className="table-wrap mb-5">
        <table className="table">
          <thead>
            <tr><th>Product</th><th>Times taken/purchased</th></tr>
          </thead>
          <tbody>
            {overview.top_products.map((p) => (
              <tr key={p.product_name}><td>{p.product_name}</td><td>{p.times}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="section-title">Follow-up outcomes</h3>
      <div className="row-actions mb-5">
        {overview.followup_outcomes.length === 0 && <p className="muted">No follow-up responses logged yet.</p>}
        {overview.followup_outcomes.map((f) => (
          <span key={f.response} className="badge badge-status-upcoming">{f.response}: {f.count}</span>
        ))}
      </div>

      <h3 className="section-title">Marketing segments</h3>
      <p className="muted">Who to target for outreach/social campaigns.</p>

      <div className="page-header">
        <strong>Inactive 90+ days (win-back)</strong>
      </div>
      <div className="table-wrap mb-5">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Tier</th><th>Last visit</th></tr>
          </thead>
          <tbody>
            {segments.inactive_90d.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.phone}</td>
                <td><span className={`badge badge-${p.loyalty_tier}`}>{p.loyalty_tier}</span></td>
                <td>{p.last_visit ? new Date(p.last_visit).toLocaleDateString() : 'Never'}</td>
              </tr>
            ))}
            {segments.inactive_90d.length === 0 && (
              <tr><td colSpan={4} className="muted">No inactive patients.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="page-header">
        <strong>Frequent buyers (loyalty/referral targets)</strong>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Tier</th><th>Purchases</th></tr>
          </thead>
          <tbody>
            {segments.frequent_buyers.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.phone}</td>
                <td><span className={`badge badge-${p.loyalty_tier}`}>{p.loyalty_tier}</span></td>
                <td>{p.purchase_count}</td>
              </tr>
            ))}
            {segments.frequent_buyers.length === 0 && (
              <tr><td colSpan={4} className="muted">No purchases logged yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
