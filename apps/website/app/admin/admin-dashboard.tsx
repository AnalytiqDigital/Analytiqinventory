'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { DashboardStats, LocationCount } from '../../lib/analytics';
import { formatNaira } from '../../lib/format';

const STORAGE_KEY = 'analytiq-admin-token';

function moment(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  });
}

function Breakdown({ rows, empty }: { rows: LocationCount[]; empty: string }) {
  if (rows.length === 0) return <p className="admin-empty">{empty}</p>;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">Location</th>
            <th scope="col">Clicks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{row.count.toLocaleString('en-NG')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminDashboard() {
  const [token, setToken] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (value: string): Promise<void> => {
    const supplied = value.trim();
    if (!supplied) {
      setError('Enter the admin token.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/stats', {
        headers: { 'x-admin-token': supplied },
        cache: 'no-store',
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        stats?: DashboardStats;
      };
      if (!response.ok || !body.ok || !body.stats) {
        throw new Error(body.error ?? 'Could not load dashboard statistics');
      }
      setStats(body.stats);
      sessionStorage.setItem(STORAGE_KEY, supplied);
    } catch (cause) {
      setStats(null);
      setError(cause instanceof Error ? cause.message : 'Could not load dashboard statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY) ?? '';
    if (saved) {
      setToken(saved);
      void load(saved);
    }
  }, [load]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void load(token);
  }

  function signOut(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken('');
    setStats(null);
    setError('');
  }

  return (
    <section className="admin-dashboard">
      <form className="admin-token card" onSubmit={submit}>
        <div className="field full">
          <label htmlFor="admin-token">Admin token</label>
          <input
            id="admin-token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paste the ADMIN_DASHBOARD_TOKEN value"
            autoComplete="off"
            required
          />
          <span className="hint">
            The token stays in this browser tab until you close or sign out.
          </span>
        </div>
        <div className="admin-actions">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Opening…' : stats ? 'Refresh' : 'Open dashboard'}
          </button>
          {stats ? (
            <button className="btn btn-outline" type="button" onClick={signOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </form>

      {error ? (
        <div className="alert" role="alert">
          {error}
        </div>
      ) : null}

      {stats ? (
        <>
          <p className="fine-print admin-updated">
            Data from {moment(stats.generatedAt)} (Africa/Lagos). Installer clicks are not confirmed
            installs; location is approximate, from hosting headers.
          </p>

          <div className="admin-grid">
            <div className="card admin-stat">
              <span>Installer clicks</span>
              <strong>{stats.totals.downloads.toLocaleString('en-NG')}</strong>
            </div>
            <div className="card admin-stat">
              <span>Paid orders</span>
              <strong>{stats.totals.paidOrders.toLocaleString('en-NG')}</strong>
            </div>
            <div className="card admin-stat">
              <span>Revenue</span>
              <strong>{formatNaira(stats.totals.revenueKobo)}</strong>
            </div>
            <div className="card admin-stat">
              <span>Redemptions</span>
              <strong>{stats.totals.redemptions.toLocaleString('en-NG')}</strong>
            </div>
            <div className="card admin-stat">
              <span>Discount given</span>
              <strong>{formatNaira(stats.totals.discountKobo)}</strong>
            </div>
          </div>

          <p className="fine-print">
            Also tracked: {stats.totals.leads.toLocaleString('en-NG')} demo/quote requests and{' '}
            {stats.totals.activeLicences.toLocaleString('en-NG')} active licence bindings.
          </p>

          <div className="admin-section card">
            <h2>Discount codes</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Label</th>
                    <th scope="col">State</th>
                    <th scope="col">Redemptions</th>
                    <th scope="col">Discounted</th>
                    <th scope="col">Net revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.discounts.map((discount) => (
                    <tr key={discount.code}>
                      <td className="admin-code">{discount.code}</td>
                      <td>{discount.label}</td>
                      <td>{discount.active ? 'Active' : 'Inactive'}</td>
                      <td>{discount.redemptions.toLocaleString('en-NG')}</td>
                      <td>{formatNaira(discount.discountKobo)}</td>
                      <td>{formatNaira(discount.revenueKobo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-section card">
            <h2>Recent downloaders</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Business</th>
                    <th scope="col">Email</th>
                    <th scope="col">Source</th>
                    <th scope="col">Location</th>
                    <th scope="col">Installer</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentDownloads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        No installer clicks recorded yet.
                      </td>
                    </tr>
                  ) : (
                    stats.recentDownloads.map((download) => (
                      <tr key={`${download.at}-${download.reference}-${download.email}`}>
                        <td>{moment(download.at)}</td>
                        <td>{download.business || download.reference || 'Anonymous'}</td>
                        <td>{download.email || '—'}</td>
                        <td>{download.source || '—'}</td>
                        <td>
                          {[download.city, download.country].filter(Boolean).join(', ') ||
                            'Unknown'}
                        </td>
                        <td>{download.installerVersion || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-split">
            <div className="card admin-section">
              <h2>Downloads by country</h2>
              <Breakdown rows={stats.downloadsByCountry} empty="No country headers recorded yet." />
            </div>
            <div className="card admin-section">
              <h2>Downloads by city</h2>
              <Breakdown rows={stats.downloadsByCity} empty="No city headers recorded yet." />
            </div>
          </div>
        </>
      ) : (
        <div className="card admin-empty admin-welcome">
          Enter the token to see downloads, orders and discount redemptions.
        </div>
      )}
    </section>
  );
}
