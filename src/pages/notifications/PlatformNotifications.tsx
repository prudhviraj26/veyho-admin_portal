import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bell,
  Send,
  Search,
  Check,
  AlertTriangle,
  Info,
  ShieldAlert,
  Loader2,
  Pin,
  Clock,
  Eye,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import { apiClient } from '../../lib/axios';
import { getApiErrorMessage } from '../../lib/errors';

type Priority = 'INFO' | 'WARNING' | 'CRITICAL';

interface SchoolOption {
  id: string;
  name: string;
  shortName: string | null;
  status: string;
}

interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  priority: Priority;
  isPinnedBanner: boolean;
  actionLabel: string | null;
  actionUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  targets: Array<{
    schoolId: string;
    schoolName: string | null;
    shortName: string | null;
  }>;
  readCount: number;
}

const PRIORITY_STYLES: Record<Priority, { label: string; badge: string; icon: React.ReactNode }> = {
  INFO: {
    label: 'Info',
    badge: 'bg-sky-950/60 text-sky-300 border-sky-800/60',
    icon: <Info className="w-3.5 h-3.5 text-sky-400" />,
  },
  WARNING: {
    label: 'Warning',
    badge: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
  },
  CRITICAL: {
    label: 'Critical',
    badge: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
    icon: <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />,
  },
};

export const PlatformNotifications: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialSchoolId = searchParams.get('schoolId');

  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expiringId, setExpiringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [schoolSearch, setSchoolSearch] = useState('');
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>(
    initialSchoolId ? [initialSchoolId] : [],
  );
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<Priority>('INFO');
  const [isPinnedBanner, setIsPinnedBanner] = useState(false);
  const [actionLabel, setActionLabel] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [schoolsRes, notifRes] = await Promise.all([
        apiClient.get('/platform/schools'),
        apiClient.get('/platform/notifications'),
      ]);
      setSchools(
        Array.isArray(schoolsRes.data)
          ? schoolsRes.data.filter((s: SchoolOption) => s.status !== 'PURGED')
          : [],
      );
      setNotifications(Array.isArray(notifRes.data) ? notifRes.data : []);
    } catch {
      setError('Failed to load schools or notification history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadInitial = async () => {
      try {
        const [schoolsRes, notifRes] = await Promise.all([
          apiClient.get('/platform/schools'),
          apiClient.get('/platform/notifications'),
        ]);
        if (cancelled) return;
        setSchools(
          Array.isArray(schoolsRes.data)
            ? schoolsRes.data.filter((s: SchoolOption) => s.status !== 'PURGED')
            : [],
        );
        setNotifications(Array.isArray(notifRes.data) ? notifRes.data : []);
      } catch {
        if (!cancelled) {
          setError('Failed to load schools or notification history.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSchools = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.shortName && s.shortName.toLowerCase().includes(q)),
    );
  }, [schools, schoolSearch]);

  const activeSchools = useMemo(
    () => schools.filter((s) => s.status === 'ACTIVE'),
    [schools],
  );

  const toggleSchool = (id: string) => {
    setSelectedSchoolIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectAllActive = () => {
    setSelectedSchoolIds(activeSchools.map((s) => s.id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (selectedSchoolIds.length === 0) {
      setError('Select at least one target school.');
      return;
    }
    if (!title.trim() || !message.trim()) {
      setError('Both title and message are required.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/platform/notifications', {
        title: title.trim(),
        message: message.trim(),
        priority,
        schoolIds: selectedSchoolIds,
        isPinnedBanner,
        actionLabel: actionLabel.trim() || undefined,
        actionUrl: actionUrl.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });

      setSuccessMsg(
        `Notification dispatched to ${selectedSchoolIds.length} school(s) (school_admin users).`,
      );
      setTitle('');
      setMessage('');
      setPriority('INFO');
      setIsPinnedBanner(false);
      setActionLabel('');
      setActionUrl('');
      setExpiresAt('');
      await fetchData();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to send notification.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpire = async (id: string) => {
    setExpiringId(id);
    try {
      await apiClient.post(`/platform/notifications/${id}/expire`);
      await fetchData();
    } catch {
      setError('Failed to expire notification.');
    } finally {
      setExpiringId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <Bell className="w-6 h-6 text-sky-400" />
          School Notifications
        </h2>
        <p className="text-zinc-500 text-sm mt-1">
          Send targeted platform updates and critical notices directly to <code className="text-zinc-300">school_admin</code> users in selected schools.
        </p>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-800/60 text-rose-300 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white ml-4">
            Dismiss
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white ml-4">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Compose Notification Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 space-y-5 self-start"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
              Compose Update
            </h3>
            <span className="text-[11px] font-mono text-zinc-500">
              Audience: school_admin only
            </span>
          </div>

          {/* Target Schools Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">
                Target School(s) ({selectedSchoolIds.length} selected)
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={selectAllActive}
                  className="text-sky-400 hover:text-sky-300 font-medium"
                >
                  Select All Active ({activeSchools.length})
                </button>
                <span className="text-zinc-700">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedSchoolIds([])}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={schoolSearch}
                onChange={(e) => setSchoolSearch(e.target.value)}
                placeholder="Search schools..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="max-h-44 overflow-y-auto bg-zinc-900/60 border border-zinc-800 rounded-lg divide-y divide-zinc-800/60">
              {loading ? (
                <div className="p-4 text-center text-xs text-zinc-500">Loading schools...</div>
              ) : filteredSchools.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500">No matching schools found.</div>
              ) : (
                filteredSchools.map((s) => {
                  const checked = selectedSchoolIds.includes(s.id);
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => toggleSchool(s.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors ${
                        checked ? 'bg-sky-950/30 text-white' : 'text-zinc-300 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-sky-600 border-sky-500 text-white'
                              : 'border-zinc-700 bg-zinc-950'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                        <span className="truncate font-medium">{s.name}</span>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ml-2 ${
                          s.status === 'ACTIVE'
                            ? 'bg-emerald-950/60 text-emerald-400'
                            : 'bg-amber-950/60 text-amber-400'
                        }`}
                      >
                        {s.status}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">Priority</label>
            <div className="grid grid-cols-3 gap-2">
              {(['INFO', 'WARNING', 'CRITICAL'] as Priority[]).map((p) => {
                const active = priority === p;
                return (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                      active
                        ? PRIORITY_STYLES[p].badge
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {PRIORITY_STYLES[p].icon}
                    {PRIORITY_STYLES[p].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">Title</label>
            <input
              type="text"
              maxLength={200}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Scheduled Maintenance Window on Sunday"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">Message</label>
            <textarea
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write the update details for the school administrators..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500 resize-y"
            />
          </div>

          {/* Pinned Banner Toggle */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 cursor-pointer">
            <input
              type="checkbox"
              checked={isPinnedBanner}
              onChange={(e) => setIsPinnedBanner(e.target.checked)}
              className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-sky-500 focus:ring-sky-500"
            />
            <div className="text-xs">
              <div className="font-medium text-zinc-200 flex items-center gap-1.5">
                <Pin className="w-3.5 h-3.5 text-amber-400" />
                Pin as dismissible top banner
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Displays prominently at the top of the School Web App header until dismissed by each admin.
              </p>
            </div>
          </label>

          {/* Optional Action Link + Expiry */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-400">
                Action Label (optional)
              </label>
              <input
                type="text"
                maxLength={80}
                value={actionLabel}
                onChange={(e) => setActionLabel(e.target.value)}
                placeholder="e.g., View Settings"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-400">
                Action URL (optional)
              </label>
              <input
                type="text"
                maxLength={500}
                value={actionUrl}
                onChange={(e) => setActionUrl(e.target.value)}
                placeholder="/settings/general or https://..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400">
              Expires At (optional)
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-sky-600/10"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending Update...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Notification
              </>
            )}
          </button>
        </form>

        {/* Sent Notifications History */}
        <div className="lg:col-span-7 bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
              Sent History
            </h3>
            <span className="text-xs text-zinc-500 font-mono">
              {notifications.length} record(s)
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-zinc-500">Loading history...</div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
              No notifications sent yet. Use the form on the left to message a school.
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((n) => {
                const isExpired = !!n.expiresAt && new Date(n.expiresAt) <= new Date();
                const style = PRIORITY_STYLES[n.priority] || PRIORITY_STYLES.INFO;

                return (
                  <div
                    key={n.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      isExpired
                        ? 'bg-zinc-900/20 border-zinc-900 opacity-60'
                        : 'bg-zinc-900/40 border-zinc-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.badge}`}
                          >
                            {style.icon}
                            {style.label}
                          </span>
                          {n.isPinnedBanner && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-amber-300 border border-zinc-700">
                              <Pin className="w-2.5 h-2.5" />
                              Pinned Banner
                            </span>
                          )}
                          {isExpired && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-900 text-zinc-500 border border-zinc-800">
                              EXPIRED
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-semibold text-white">{n.title}</h4>
                      </div>

                      {!isExpired && (
                        <button
                          type="button"
                          onClick={() => handleExpire(n.id)}
                          disabled={expiringId === n.id}
                          className="text-[11px] text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-900/60 px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          {expiringId === n.id ? 'Expiring...' : 'Expire'}
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-zinc-400 mt-2 whitespace-pre-wrap leading-relaxed">
                      {n.message}
                    </p>

                    {n.actionUrl && (
                      <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-400">
                        <ExternalLink className="w-3 h-3" />
                        <span>{n.actionLabel || 'Link'}:</span>
                        <code className="text-sky-300">{n.actionUrl}</code>
                      </div>
                    )}

                    {/* Target schools chips */}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {n.targets.map((t) => (
                        <span
                          key={t.schoolId}
                          className="text-[10px] bg-zinc-950 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md"
                        >
                          {t.schoolName || t.schoolId}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-zinc-800/60 text-[11px] text-zinc-500">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(n.createdAt).toLocaleString()}
                        </span>
                        {n.createdBy && (
                          <span>
                            by {n.createdBy.firstName} {n.createdBy.lastName}
                          </span>
                        )}
                      </div>
                      <span className="flex items-center gap-1 text-zinc-400 font-mono">
                        <Eye className="w-3 h-3 text-emerald-400" />
                        {n.readCount} admin read(s)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
