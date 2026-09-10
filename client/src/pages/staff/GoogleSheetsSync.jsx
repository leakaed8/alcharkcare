import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../api/client';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'conflicts', label: 'Conflicts' },
  { key: 'lifestyle', label: 'Lifestyle options' },
];

function formatValue(v) {
  if (v == null) return '—';
  return Array.isArray(v) ? v.join(', ') : String(v);
}

function StatusRow({ log }) {
  const [expanded, setExpanded] = useState(false);
  const issueCount = (log.errors?.length || 0) + (log.warnings?.length || 0);
  return (
    <div className="visit-card">
      <div className="visit-card__row">
        <b>{new Date(log.started_at).toLocaleString()}</b>
        {' '}· <span className={`badge badge-status-${log.status === 'success' ? 'published' : log.status === 'failed' ? 'not_available' : log.status === 'partial' ? 'review_required' : 'pending'}`}>{log.status}</span>
        {' '}· {log.sync_type}
      </div>
      <p className="muted">
        {log.rows_created} created · {log.rows_updated} updated · {log.rows_skipped} skipped
        {log.rows_conflicted > 0 && ` · ${log.rows_conflicted} conflict(s)`}
      </p>
      {issueCount > 0 && (
        <>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Hide' : 'View'} errors/warnings ({issueCount})
          </button>
          {expanded && (
            <div className="mt-2">
              {(log.errors || []).map((e, i) => <p key={`e${i}`} className="alert alert-error">{e}</p>)}
              {(log.warnings || []).map((w, i) => <p key={`w${i}`} className="muted">{w}</p>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Overview({ user }) {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [settingsForm, setSettingsForm] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  function load() {
    apiFetch('/sheets-sync/status').then((s) => {
      setStatus(s);
      setSettingsForm({
        sheet_id: s.sheet_id || '',
        products_tab: s.products_tab || 'PRODUCTS',
        lifestyle_tab: s.lifestyle_tab || 'LIFESTYLE',
        auto_sync_enabled: s.auto_sync_enabled,
        auto_sync_interval_hours: s.auto_sync_interval_hours,
      });
    }).catch((err) => setError(err.message));
    apiFetch('/sheets-sync/logs').then(setLogs).catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  async function runSync() {
    setSyncing(true);
    setError('');
    try {
      await apiFetch('/sheets-sync/run', { method: 'POST' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSavingSettings(true);
    setError('');
    try {
      await apiFetch('/sheets-sync/settings', { method: 'PATCH', body: JSON.stringify(settingsForm) });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  if (!status || !settingsForm) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="card mb-4">
        <p className="field-label">Connection</p>
        {status.configured ? (
          <p className="alert alert-success">Service account credentials are configured on the server.</p>
        ) : (
          <p className="alert alert-error">
            Not connected yet -- set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY on the server, then a Sheet ID below.
          </p>
        )}
        {error && <p className="alert alert-error">{error}</p>}

        {user?.role === 'admin' ? (
          <form onSubmit={saveSettings} className="mt-3">
            <div className="form-field">
              <label className="field-label" htmlFor="sheet-id">Google Sheet ID</label>
              <input
                id="sheet-id"
                className="input"
                value={settingsForm.sheet_id}
                onChange={(e) => setSettingsForm({ ...settingsForm, sheet_id: e.target.value })}
                placeholder="The long ID in the sheet's URL"
              />
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="products-tab">Products tab name</label>
              <input
                id="products-tab"
                className="input"
                value={settingsForm.products_tab}
                onChange={(e) => setSettingsForm({ ...settingsForm, products_tab: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="lifestyle-tab">Lifestyle options tab name (optional)</label>
              <input
                id="lifestyle-tab"
                className="input"
                value={settingsForm.lifestyle_tab}
                onChange={(e) => setSettingsForm({ ...settingsForm, lifestyle_tab: e.target.value })}
              />
              <p className="muted">A single column of lifestyle-advice suggestions, one per row below a header row. If this tab doesn't exist, it's just skipped.</p>
            </div>
            <div className="form-field">
              <label className="field-label">
                <input
                  type="checkbox"
                  checked={settingsForm.auto_sync_enabled}
                  onChange={(e) => setSettingsForm({ ...settingsForm, auto_sync_enabled: e.target.checked })}
                /> Auto sync
              </label>
            </div>
            {settingsForm.auto_sync_enabled && (
              <div className="form-field">
                <label className="field-label" htmlFor="sync-interval">Every (hours)</label>
                <input
                  id="sync-interval"
                  type="number"
                  min="1"
                  className="input"
                  value={settingsForm.auto_sync_interval_hours}
                  onChange={(e) => setSettingsForm({ ...settingsForm, auto_sync_interval_hours: Number(e.target.value) })}
                />
              </div>
            )}
            <button type="submit" className="btn btn-secondary mt-2" disabled={savingSettings}>Save settings</button>
          </form>
        ) : (
          <p className="muted mt-2">Sheet: {status.sheet_id || 'not set'} · Tab: {status.products_tab} · Auto sync {status.auto_sync_enabled ? 'on' : 'off'}</p>
        )}

        <div className="row-actions mt-3">
          <button className="btn btn-primary" onClick={runSync} disabled={syncing || !status.configured}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          {status.pending_conflicts > 0 && (
            <span className="badge badge-status-review_required">{status.pending_conflicts} conflict(s) pending</span>
          )}
        </div>
      </div>

      <p className="p-subsection-title">Sync history</p>
      {logs.length === 0 && <p className="muted">No syncs yet.</p>}
      {logs.map((log) => <StatusRow key={log.id} log={log} />)}
    </div>
  );
}

function Conflicts() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [conflicts, setConflicts] = useState([]);
  const [error, setError] = useState('');

  function load() {
    apiFetch(`/sheets-sync/conflicts?status=${statusFilter}`).then(setConflicts).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  async function resolve(id, resolution) {
    try {
      await apiFetch(`/sheets-sync/conflicts/${id}`, { method: 'PATCH', body: JSON.stringify({ resolution }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="tab-group mb-3">
        {['pending', 'all'].map((s) => (
          <button key={s} type="button" className={`tab-btn ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
            {s === 'pending' ? 'Pending' : 'All'}
          </button>
        ))}
      </div>
      {error && <p className="alert alert-error">{error}</p>}
      {conflicts.length === 0 && <p className="muted">No conflicts.</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th><th>Field</th><th>App value</th><th>Sheet value</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/staff/products`}>{c.product_name}</Link> {c.product_sku && <span className="muted">({c.product_sku})</span>}</td>
                <td>{c.field_name}</td>
                <td>{formatValue(c.app_value)}</td>
                <td>{formatValue(c.sheet_value)}</td>
                <td>{c.status === 'pending' ? 'Pending' : c.status === 'kept_app' ? 'Kept app value' : 'Used sheet value'}</td>
                <td>
                  {c.status === 'pending' && (
                    <div className="row-actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => resolve(c.id, 'keep_app')}>Keep app</button>
                      <button className="btn btn-sm btn-primary" onClick={() => resolve(c.id, 'use_sheet')}>Use sheet</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => resolve(c.id, 'review_later')}>Review later</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LifestyleOptions() {
  const [options, setOptions] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch('/lifestyle-options/all').then(setOptions).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch('/lifestyle-options', { method: 'POST', body: JSON.stringify({ text: text.trim() }) });
      setText('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(opt) {
    try {
      await apiFetch(`/lifestyle-options/${opt.id}`, { method: 'PATCH', body: JSON.stringify({ active: !opt.active }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <p className="muted">
        These show up as checkboxes on the New Visit form's lifestyle advice section. Add them here, or via the
        Sheets sync's lifestyle tab (see Overview settings) -- either way, only active ones appear on the form.
      </p>
      <form onSubmit={add} className="row-actions mb-3">
        <input className="input" placeholder="e.g. Increase water intake" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={saving || !text.trim()}>Add</button>
      </form>
      {error && <p className="alert alert-error">{error}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Text</th><th>Source</th><th>Active</th><th></th></tr>
          </thead>
          <tbody>
            {options.map((opt) => (
              <tr key={opt.id}>
                <td>{opt.text}</td>
                <td>{opt.source}</td>
                <td>{opt.active ? 'Yes' : 'No'}</td>
                <td>
                  <button className="btn btn-sm btn-ghost" onClick={() => toggleActive(opt)}>
                    {opt.active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
            {options.length === 0 && <tr><td colSpan={4} className="muted">No lifestyle options yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GoogleSheetsSync() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');

  return (
    <div>
      <div className="page-header">
        <h2>Google Sheets sync</h2>
      </div>
      <p className="muted">Imports and updates products from a connected Google Sheet. The sheet feeds the app -- it never replaces it, and new products always start as drafts until approved.</p>

      <div className="tab-group mb-3">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview user={user} />}
      {tab === 'conflicts' && <Conflicts />}
      {tab === 'lifestyle' && <LifestyleOptions />}
    </div>
  );
}
