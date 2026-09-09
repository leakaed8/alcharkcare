import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/client';

export default function PatientSearch() {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState([]);
  const [error, setError] = useState('');

  async function search(q) {
    try {
      const results = await apiFetch(`/patients?q=${encodeURIComponent(q)}`);
      setPatients(results);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    search('');
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    search(query);
  }

  return (
    <div>
      <div className="page-header">
        <h2>Patients</h2>
      </div>

      <form onSubmit={handleSubmit} className="search-bar">
        <input
          className="input"
          placeholder="Search by name or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {error && <p className="alert alert-error">{error}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Tier</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.phone}</td>
                <td>
                  <span className={`badge badge-${p.loyalty_tier}`}>{p.loyalty_tier}</span>
                </td>
                <td>
                  <div className="row-actions">
                    <Link to={`/staff/patients/${p.id}`}>View timeline</Link>
                    <span className="muted">|</span>
                    <Link to={`/staff/visits/new?patientId=${p.id}`}>New visit</Link>
                  </div>
                </td>
              </tr>
            ))}
            {patients.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No patients found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
