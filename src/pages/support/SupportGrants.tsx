import React, { useState, useEffect } from 'react';
import { Key, Plus, Trash2, ShieldAlert, Loader2, Clock, X, Shield } from 'lucide-react';
import { apiClient } from '../../lib/axios';

interface SchoolOption {
  id: string;
  name: string;
}

interface SupportGrant {
  id: string;
  schoolId: string;
  reason: string;
  duration: number;
  requestedAt: string;
  expiresAt: string;
  school: {
    name: string;
  };
  staff: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export const SupportGrants: React.FC = () => {
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [modalOpen, setModalOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    schoolId: '',
    reason: '',
    duration: 4, // Default to 4 hours
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [grantsRes, schoolsRes] = await Promise.all([
        apiClient.get('/platform/support-access/active'),
        apiClient.get('/platform/schools'),
      ]);
      setGrants(grantsRes.data);
      setSchools(schoolsRes.data);
      setError(null);
    } catch (e) {
      setError('Failed to load support registry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.schoolId || !formData.reason) {
      setFormError('Please select a school and specify a valid audit reason.');
      return;
    }

    setRequesting(true);
    setFormError(null);

    try {
      await apiClient.post('/platform/support-access/grant', {
        schoolId: formData.schoolId,
        reason: formData.reason,
        duration: Number(formData.duration),
      });
      setModalOpen(false);
      setFormData({ schoolId: '', reason: '', duration: 4 });
      fetchData();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to request support access grant.';
      setFormError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setRequesting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Are you sure you want to immediately revoke this support access grant? This will log out any active session targeting this school.')) {
      return;
    }

    try {
      await apiClient.post(`/platform/support-access/revoke/${id}`);
      fetchData();
    } catch (e) {
      alert('Failed to revoke access grant.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Key className="w-6 h-6 text-amber-500" />
            Support Access Grants
          </h2>
          <p className="text-zinc-500 text-sm">
            Auditable, temporary access keys allowing operators to resolve customer issues.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-amber-600 hover:bg-amber-500 text-white font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-amber-600/10 transition-all text-xs shrink-0 self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>Request Support Access</span>
        </button>
      </div>

      {/* Warning Notice */}
      <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl flex gap-3 text-xs leading-relaxed max-w-4xl text-zinc-400">
        <Shield className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-zinc-200">Zero-Trust Protocol Active:</strong> Every support session creates an immutable audit trail mapping back to your operator account. Downstream portals will display a visual banner to school administrators signaling active internal access.
        </div>
      </div>

      {/* Grants Table */}
      <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-zinc-500 text-xs font-mono flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
            LOADING ACTIVE ACCESS GRANTS...
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-400 text-xs font-mono">
            {error}
          </div>
        ) : grants.length === 0 ? (
          <div className="p-12 text-center text-zinc-600 text-xs font-mono">
            NO ACTIVE SUPPORT SESSIONS
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-950/50 border-b border-zinc-800 text-zinc-400 font-medium">
                  <th className="p-4">Target School</th>
                  <th className="p-4">Audited Operator</th>
                  <th className="p-4">Reason / Purpose</th>
                  <th className="p-4">Expires</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850">
                {grants.map((g) => {
                  const expiryDate = new Date(g.expiresAt);
                  const timeLeftMs = expiryDate.getTime() - Date.now();
                  const hoursLeft = Math.max(0, Math.ceil(timeLeftMs / (1000 * 60 * 60)));

                  return (
                    <tr key={g.id} className="hover:bg-zinc-900/10 transition-colors">
                      <td className="p-4">
                        <div className="font-semibold text-white text-sm">{g.school.name}</div>
                        <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{g.schoolId}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-zinc-200 font-semibold">{g.staff.firstName} {g.staff.lastName}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">{g.staff.email}</div>
                      </td>
                      <td className="p-4 max-w-xs truncate text-zinc-300" title={g.reason}>
                        {g.reason}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-zinc-300 font-mono">
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                          <span>{hoursLeft} hr{hoursLeft !== 1 && 's'} left</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          {expiryDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            localStorage.setItem('shq_support_school_id', g.schoolId);
                            window.location.reload();
                          }}
                          className="text-[10px] bg-amber-950/40 hover:bg-amber-900/60 text-amber-400 font-semibold px-2.5 py-1.5 rounded border border-amber-900/40 transition-colors"
                        >
                          Enter Support
                        </button>
                        <button
                          onClick={() => handleRevoke(g.id)}
                          className="text-[10px] bg-zinc-900 hover:bg-red-950/20 text-zinc-400 hover:text-red-400 font-semibold px-2.5 py-1.5 rounded border border-zinc-800 transition-colors inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Revoke</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Request Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          
          <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-6 overflow-hidden">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <form onSubmit={handleCreateGrant} className="space-y-4">
              <div className="mb-2">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-500" />
                  Request Access Key
                </h3>
                <p className="text-zinc-500 text-xs">Temporary bypass key scoped to one customer database.</p>
              </div>

              {formError && (
                <div className="p-3 bg-red-950/40 border border-red-800/40 rounded-lg text-red-400 text-xs">
                  {formError}
                </div>
              )}

              <div className="space-y-3.5">
                {/* Select School */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Target School</label>
                  <select
                    required
                    value={formData.schoolId}
                    onChange={(e) => setFormData({ ...formData, schoolId: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 text-zinc-300 focus:outline-none focus:border-amber-500 text-xs"
                  >
                    <option value="">-- Choose Target Instance --</option>
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name} ({school.id.substring(0, 8)}...)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Duration */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Session Duration</label>
                  <select
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 text-zinc-300 focus:outline-none focus:border-amber-500 text-xs"
                  >
                    <option value={1}>1 Hour (Quick fix)</option>
                    <option value={4}>4 Hours (Standard debugging)</option>
                    <option value={8}>8 Hours (Full Shift)</option>
                    <option value={24}>24 Hours (Extended audit)</option>
                  </select>
                </div>

                {/* Audit Reason */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Reason for Access</label>
                  <textarea
                    required
                    rows={3}
                    maxLength={500}
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="Provide specific task description (e.g. Troubleshooting fee receipt pdf layout issues for Springfield)"
                    className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 text-zinc-300 focus:outline-none focus:border-amber-500 text-xs resize-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-zinc-800 rounded-lg hover:bg-zinc-850 text-zinc-400 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={requesting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-55"
                >
                  {requesting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating grant...</span>
                    </>
                  ) : (
                    <span>Authorize Grant</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
