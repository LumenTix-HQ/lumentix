'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import {
  CapacityAlertLevel,
  CapacityMonitor,
  CapacitySnapshot,
  SensorStatus,
  SensorSummary,
  SensorType,
  SpaceOptimisation,
} from '@/types/iot-capacity';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('lumentix_access_token') ?? '' : '';
}

// ── Alert level styles ────────────────────────────────────────────────────────
const ALERT_STYLES: Record<CapacityAlertLevel, { bar: string; badge: string; text: string }> = {
  [CapacityAlertLevel.NORMAL]:   { bar: 'bg-emerald-500',  badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',  text: 'text-emerald-400' },
  [CapacityAlertLevel.WARNING]:  { bar: 'bg-yellow-500',   badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',    text: 'text-yellow-400' },
  [CapacityAlertLevel.CRITICAL]: { bar: 'bg-orange-500',   badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30',    text: 'text-orange-400' },
  [CapacityAlertLevel.OVER]:     { bar: 'bg-red-500',      badge: 'bg-red-500/15 text-red-400 border-red-500/30',             text: 'text-red-400' },
};

const SENSOR_STATUS_DOT: Record<SensorStatus, string> = {
  [SensorStatus.ONLINE]:   'bg-emerald-400',
  [SensorStatus.OFFLINE]:  'bg-gray-500',
  [SensorStatus.DEGRADED]: 'bg-yellow-400',
  [SensorStatus.FAULT]:    'bg-red-500',
};

const SENSOR_TYPE_LABEL: Record<SensorType, string> = {
  [SensorType.ENTRY_COUNTER]:  'Entry Counter',
  [SensorType.EXIT_COUNTER]:   'Exit Counter',
  [SensorType.OCCUPANCY]:      'Occupancy',
  [SensorType.WEIGHT_PLATE]:   'Weight Plate',
  [SensorType.CAMERA_AI]:      'Camera AI',
  [SensorType.ENVIRONMENTAL]:  'Environmental',
};

// ── Occupancy gauge ───────────────────────────────────────────────────────────
function OccupancyGauge({ pct, alertLevel }: { pct: number; alertLevel: CapacityAlertLevel }) {
  const style = ALERT_STYLES[alertLevel];
  const clamped = Math.min(pct, 100);
  return (
    <div className="relative w-40 h-40 mx-auto">
      <svg className="w-40 h-40 -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="15.9" fill="none"
          stroke="currentColor"
          className={style.text}
          strokeWidth="3"
          strokeDasharray={`${clamped} 100`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-extrabold ${style.text}`}>{pct.toFixed(1)}%</span>
        <span className="text-xs text-gray-500 mt-0.5">occupancy</span>
      </div>
    </div>
  );
}

// ── Sensor card ───────────────────────────────────────────────────────────────
function SensorCard({ sensor }: { sensor: SensorSummary }) {
  const dot = SENSOR_STATUS_DOT[sensor.status];
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-white truncate">{sensor.name}</span>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} title={sensor.status} />
      </div>
      <div className="text-xs text-gray-500 mb-3">{SENSOR_TYPE_LABEL[sensor.type]}</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-gray-600">Entries</div>
          <div className="text-white font-semibold">{sensor.cumulativeEntries.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-600">Exits</div>
          <div className="text-white font-semibold">{sensor.cumulativeExits.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-600">Last reading</div>
          <div className="text-white font-semibold">{sensor.lastReading}</div>
        </div>
        <div>
          <div className="text-gray-600">Updated</div>
          <div className="text-white font-semibold">
            {sensor.lastReadingAt ? new Date(sensor.lastReadingAt).toLocaleTimeString() : '—'}
          </div>
        </div>
      </div>
      {sensor.location && (
        <div className="mt-2 text-[11px] text-gray-600 truncate">📍 {sensor.location}</div>
      )}
    </div>
  );
}

// ── Mini sparkline ────────────────────────────────────────────────────────────
function Sparkline({ snapshots }: { snapshots: CapacitySnapshot[] }) {
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const values = sorted.map(s => Number(s.occupancyPercent));
  const max = Math.max(...values, 1);
  const w = 300; const h = 60;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// ── Register sensor modal ─────────────────────────────────────────────────────
function RegisterSensorModal({ eventId, onClose, onSuccess }: { eventId: string; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<SensorType>(SensorType.ENTRY_COUNTER);
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await apiClient.registerSensor(eventId, { name, type, location: location || undefined }, getToken()) as any;
      setApiKey(res.apiKeyPlaintext);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register sensor.');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0e0e14] border border-white/[0.1] rounded-2xl p-6 w-full max-w-md">
        {apiKey ? (
          <>
            <h3 className="text-lg font-bold text-white mb-2">Sensor Registered ✓</h3>
            <p className="text-sm text-gray-400 mb-3">Copy this API key — it will only be shown once.</p>
            <div className="bg-black/40 border border-white/[0.1] rounded-xl px-4 py-3 font-mono text-xs text-emerald-400 break-all mb-4">{apiKey}</div>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500">Done</button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-white mb-4">Register IoT Sensor</h3>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Sensor Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Gate A Entry Counter"
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Sensor Type</label>
                <select value={type} onChange={e => setType(e.target.value as SensorType)}
                  className="w-full bg-gray-900 border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50">
                  {Object.values(SensorType).map(t => <option key={t} value={t}>{SENSOR_TYPE_LABEL[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Physical Location (optional)</label>
                <input value={location} onChange={e => setLocation(e.target.value)} placeholder="North entrance, pillar 3"
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50" />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/[0.1] text-gray-400 text-sm hover:text-white">Cancel</button>
                <button type="submit" disabled={loading || !name.trim()} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-60">
                  {loading ? 'Registering…' : 'Register'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ── Update capacity modal ─────────────────────────────────────────────────────
function UpdateCapacityModal({ eventId, current, onClose, onSuccess }: {
  eventId: string; current: number | null; onClose: () => void; onSuccess: () => void;
}) {
  const [limit, setLimit] = useState(String(current ?? ''));
  const [reason, setReason] = useState('');
  const [pauseSales, setPauseSales] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      await apiClient.updateCapacityLimits(eventId, {
        maxAttendees: parseInt(limit, 10) || 0,
        reason: reason || undefined,
        pauseSalesAtLimit: pauseSales,
      }, getToken());
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update capacity.');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0e0e14] border border-white/[0.1] rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-white mb-4">Update Capacity Limit</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">New Limit (0 = unlimited)</label>
            <input type="number" min="0" value={limit} onChange={e => setLimit(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Reason</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Fire marshal instruction"
              className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={pauseSales} onChange={e => setPauseSales(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm text-gray-300">Pause ticket sales when limit is reached</span>
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/[0.1] text-gray-400 text-sm hover:text-white">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-60">
              {loading ? 'Updating…' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VenueCapacityPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [monitor, setMonitor] = useState<CapacityMonitor | null>(null);
  const [optimise, setOptimise] = useState<SpaceOptimisation | null>(null);
  const [history, setHistory] = useState<CapacitySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'monitor' | 'optimise' | 'sensors' | 'history'>('monitor');
  const [showRegister, setShowRegister] = useState(false);
  const [showUpdateLimit, setShowUpdateLimit] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const t = getToken();
    if (!t || !eventId) return;
    try {
      const [m, o, h] = await Promise.all([
        apiClient.monitorVenueCapacity(eventId, t) as Promise<CapacityMonitor>,
        apiClient.optimizeSpaceUsage(eventId, t) as Promise<SpaceOptimisation>,
        apiClient.getCapacityHistory(eventId, t, 30) as Promise<CapacitySnapshot[]>,
      ]);
      setMonitor(m);
      setOptimise(o);
      setHistory(h);
    } catch { /* show stale data */ }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => {
    load();
    // Auto-refresh every 30 seconds
    pollRef.current = setInterval(load, 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const alertStyle = monitor ? ALERT_STYLES[monitor.alertLevel] : ALERT_STYLES[CapacityAlertLevel.NORMAL];

  return (
    <main className="min-h-screen bg-[#060609] text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-blue-600/[0.04] rounded-full blur-[150px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-indigo-600/[0.03] rounded-full blur-[130px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
              Venue Capacity
            </h1>
            <p className="text-gray-500 text-sm mt-1">Real-time IoT monitoring · auto-refreshes every 30s</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowRegister(true)}
              className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm text-gray-300 hover:text-white hover:bg-white/[0.1] transition-colors">
              + Register Sensor
            </button>
            <button onClick={() => setShowUpdateLimit(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors">
              Update Limit
            </button>
          </div>
        </div>

        {/* Alert banner */}
        {monitor && monitor.alertLevel !== CapacityAlertLevel.NORMAL && (
          <div className={`mb-6 px-5 py-3 rounded-xl border ${alertStyle.badge} flex items-center gap-3`}>
            <span className="text-lg">{monitor.alertLevel === CapacityAlertLevel.OVER ? '🚨' : '⚠️'}</span>
            <span className="text-sm font-medium">
              {monitor.alertLevel === CapacityAlertLevel.OVER
                ? `OVER CAPACITY — ${monitor.actualOccupancy} people inside, limit is ${monitor.capacityLimit}`
                : monitor.alertLevel === CapacityAlertLevel.CRITICAL
                  ? `Critical: ${monitor.occupancyPercent.toFixed(1)}% capacity reached`
                  : `Warning: ${monitor.occupancyPercent.toFixed(1)}% capacity — monitor closely`}
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl mb-6 w-fit">
          {(['monitor', 'optimise', 'sensors', 'history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-white/[0.03] animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* ── Monitor tab ── */}
            {tab === 'monitor' && monitor && (
              <div className="space-y-6">
                {/* KPI row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Actual Occupancy', value: monitor.actualOccupancy.toLocaleString(), sub: 'people inside' },
                    { label: 'Tickets Sold', value: monitor.ticketsSold.toLocaleString(), sub: 'confirmed' },
                    { label: 'Capacity Limit', value: monitor.capacityLimit?.toLocaleString() ?? '∞', sub: 'max attendees' },
                    { label: 'Remaining', value: monitor.remainingCapacity?.toLocaleString() ?? '∞', sub: 'slots free' },
                  ].map(k => (
                    <div key={k.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                      <div className="text-2xl font-bold text-white">{k.value}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
                      <div className="text-[11px] text-gray-700">{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Gauge + alert level */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 flex flex-col sm:flex-row items-center gap-8">
                  <OccupancyGauge pct={monitor.occupancyPercent} alertLevel={monitor.alertLevel} />
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${alertStyle.badge}`}>
                        {monitor.alertLevel}
                      </span>
                      <span className="text-xs text-gray-500">{monitor.activeSensorCount} active sensor{monitor.activeSensorCount !== 1 ? 's' : ''}</span>
                    </div>
                    {/* Occupancy bar */}
                    <div className="w-full h-3 rounded-full bg-white/[0.06] overflow-hidden mb-2">
                      <div className={`h-full rounded-full transition-all duration-700 ${alertStyle.bar}`}
                        style={{ width: `${Math.min(monitor.occupancyPercent, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-600">
                      <span>0</span>
                      <span className="text-yellow-500">70% warn</span>
                      <span className="text-orange-500">85% crit</span>
                      <span className="text-red-500">95% over</span>
                    </div>
                    <div className="mt-3 text-xs text-gray-500">
                      Last updated: {new Date(monitor.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                {/* Section breakdown */}
                {monitor.sectionBreakdown && Object.keys(monitor.sectionBreakdown).length > 0 && (
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Section Breakdown</h3>
                    <div className="space-y-2">
                      {Object.entries(monitor.sectionBreakdown).map(([id, count]) => (
                        <div key={id} className="flex items-center gap-3 text-sm">
                          <span className="text-gray-500 font-mono text-xs w-24 truncate">{id.slice(0, 8)}…</span>
                          <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                            <div className="h-full rounded-full bg-blue-500/50" style={{ width: `${Math.min((count / (monitor.actualOccupancy || 1)) * 100, 100)}%` }} />
                          </div>
                          <span className="text-white font-semibold w-8 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Optimise tab ── */}
            {tab === 'optimise' && optimise && (
              <div className="space-y-6">
                {optimise.estimatedMinutesToCritical !== null && (
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-5 py-3 text-sm text-orange-300">
                    ⏱ At current trend, capacity will reach critical in ~{optimise.estimatedMinutesToCritical} minute{optimise.estimatedMinutesToCritical !== 1 ? 's' : ''}.
                  </div>
                )}

                {/* Recommendations */}
                {optimise.recommendations.length > 0 && (
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-3">Recommendations</h3>
                    <ul className="space-y-2">
                      {optimise.recommendations.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-blue-400 mt-0.5 flex-shrink-0">→</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Section utilisation */}
                {Object.keys(optimise.sectionUtilisation).length > 0 && (
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Section Utilisation</h3>
                    <div className="space-y-3">
                      {Object.entries(optimise.sectionUtilisation).map(([name, data]) => {
                        const pct = data.utilisationPercent;
                        const color = pct > 85 ? 'bg-red-500/60' : pct > 70 ? 'bg-yellow-500/60' : 'bg-emerald-500/50';
                        return (
                          <div key={name}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-gray-300">{name}</span>
                              <span className="text-gray-500">{data.occupancy}/{data.capacity} ({pct}%)</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                              <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Rebalancing actions */}
                {optimise.rebalancingActions.length > 0 && (
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-3">Rebalancing Actions</h3>
                    <ul className="space-y-2">
                      {optimise.rebalancingActions.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-yellow-400 mt-0.5 flex-shrink-0">⚡</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* ── Sensors tab ── */}
            {tab === 'sensors' && monitor && (
              <div>
                {monitor.sensors.length === 0 ? (
                  <div className="text-center py-16 text-gray-600">
                    <div className="text-4xl mb-3">📡</div>
                    <p>No sensors registered yet.</p>
                    <button onClick={() => setShowRegister(true)} className="mt-4 px-5 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-500">
                      Register First Sensor
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {monitor.sensors.map(s => <SensorCard key={s.id} sensor={s} />)}
                  </div>
                )}
              </div>
            )}

            {/* ── History tab ── */}
            {tab === 'history' && (
              <div className="space-y-4">
                {history.length > 0 && (
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-3">Occupancy Trend</h3>
                    <Sparkline snapshots={history} />
                  </div>
                )}
                <div className="space-y-2">
                  {history.map(snap => {
                    const s = ALERT_STYLES[snap.alertLevel];
                    return (
                      <div key={snap.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                        <div className="text-xs text-gray-500">{new Date(snap.createdAt).toLocaleString()}</div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-gray-400">{snap.actualOccupancy} inside</span>
                          <span className="text-gray-400">{snap.ticketsSold} sold</span>
                          <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full border ${s.badge}`}>{snap.alertLevel}</span>
                          <span className={`font-bold ${s.text}`}>{Number(snap.occupancyPercent).toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
                  {history.length === 0 && (
                    <div className="text-center py-12 text-gray-600">No snapshots yet. Monitoring will begin once sensors are active.</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showRegister && (
        <RegisterSensorModal eventId={eventId} onClose={() => setShowRegister(false)} onSuccess={load} />
      )}
      {showUpdateLimit && monitor && (
        <UpdateCapacityModal
          eventId={eventId}
          current={monitor.capacityLimit}
          onClose={() => setShowUpdateLimit(false)}
          onSuccess={load}
        />
      )}
    </main>
  );
}
