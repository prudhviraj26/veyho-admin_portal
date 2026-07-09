import React, { useState, useEffect } from 'react';
import { 
  School, Plus, Search, Mail, Phone, Copy, Check, ShieldAlert, Loader2, X,
  Pause, Play, Archive, RefreshCw, Trash2, History, AlertTriangle, ChevronDown,
  Calendar, User, FileText, Lock, LayoutDashboard, Users, GraduationCap, Settings, ClipboardList, Clock, CreditCard, MessageSquare, BarChart3
} from 'lucide-react';
import { apiClient } from '../../lib/axios';

const getModuleIcon = (key: string) => {
  switch (key) {
    case 'dashboard': return <LayoutDashboard className="w-4 h-4" />;
    case 'staff': return <Users className="w-4 h-4" />;
    case 'students': return <GraduationCap className="w-4 h-4" />;
    case 'settings': return <Settings className="w-4 h-4" />;
    case 'admissions': return <ClipboardList className="w-4 h-4" />;
    case 'attendance': return <Clock className="w-4 h-4" />;
    case 'fees': return <CreditCard className="w-4 h-4" />;
    case 'communication': return <MessageSquare className="w-4 h-4" />;
    case 'reports': return <BarChart3 className="w-4 h-4" />;
    case 'certificates': return <FileText className="w-4 h-4" />;
    default: return <Settings className="w-4 h-4" />;
  }
};

interface SchoolData {
  id: string;
  name: string;
  shortName: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED' | 'PURGED';
  restoreDeadline: string | null;
  purgeStatus: 'PENDING' | 'COMPLETED' | 'FAILED' | null;
  createdAt: string;
  phonePrimary: string | null;
  emailPrimary: string | null;
  studentCount: number;
  staffCount: number;
  classCount: number;
  groupId?: string | null;
  admin: {
    firstName: string;
    lastName: string;
    email: string;
    mobilePrimary: string | null;
  } | null;
}

interface NewSchoolCredentials {
  school: {
    id: string;
    name: string;
  };
  admin: {
    firstName: string;
    lastName: string;
    email: string;
    mobilePrimary: string;
  };
  tempPassword?: string;
}

interface HistoryLog {
  id: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
  changedAt: string;
  operatorName: string;
}

export const SchoolRegistry: React.FC = () => {
  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [modalOpen, setModalOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  
  // Registration result
  const [credentials, setCredentials] = useState<NewSchoolCredentials | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset Password states
  const [resetSchool, setResetSchool] = useState<SchoolData | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetCredentials, setResetCredentials] = useState<{
    temporaryPassword: string;
    adminName: string;
    adminEmail: string;
    schoolName: string;
  } | null>(null);
  const [copiedReset, setCopiedReset] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    phonePrimary: '',
    emailPrimary: '',
    adminFirstName: '',
    adminLastName: '',
    adminEmail: '',
    adminMobile: '',
  });

  // Lifecycle action state
  const [actionType, setActionType] = useState<'pause' | 'unpause' | 'archive' | 'unarchive' | 'delete' | 'restore' | 'purge' | 'retry-purge' | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<SchoolData | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [confirmationInput, setConfirmationInput] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // History Drawer state
  const [historySchool, setHistorySchool] = useState<SchoolData | null>(null);
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Dropdown states keyed by school ID
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Module Entitlements Drawer state
  interface ModuleItem {
    moduleKey: string;
    moduleName: string;
    isEnabled: boolean;
    disabledAt: string | null;
    disabledReason: string | null;
    isCore?: boolean;
  }

  const [activeSchool, setActiveSchool] = useState<SchoolData | null>(null);
  const [drawerTab, setDrawerTab] = useState<'details' | 'modules'>('modules');
  const [modulesList, setModulesList] = useState<ModuleItem[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [modulesError, setModulesError] = useState<string | null>(null);

  // Disable confirmation modal state
  const [disablingModule, setDisablingModule] = useState<ModuleItem | null>(null);
  const [disableReason, setDisableReason] = useState('');
  const [submittingDisable, setSubmittingDisable] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  const fetchModules = async (schoolId: string) => {
    setLoadingModules(true);
    setModulesError(null);
    try {
      const res = await apiClient.get(`/platform/schools/${schoolId}/modules`);
      setModulesList(res.data);
    } catch (err: any) {
      console.error('Failed to fetch modules', err);
      setModulesError(err.response?.data?.error || 'Failed to retrieve modules. Please try again.');
    } finally {
      setLoadingModules(false);
    }
  };

  useEffect(() => {
    if (activeSchool) {
      fetchModules(activeSchool.id);
      setDrawerTab('modules');
    }
  }, [activeSchool]);

  const handleToggleModule = async (module: ModuleItem) => {
    if (!activeSchool) return;

    if (module.isEnabled) {
      setDisablingModule(module);
      setDisableReason('');
      setDisableError(null);
    } else {
      try {
        const res = await apiClient.patch(
          `/platform/schools/${activeSchool.id}/modules/${module.moduleKey}`,
          { isEnabled: true }
        );
        setModulesList(res.data);
      } catch (err: any) {
        console.error('Failed to enable module', err);
        alert(err.response?.data?.error || 'Failed to enable module.');
      }
    }
  };

  const handleConfirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchool || !disablingModule) return;

    if (disableReason.trim().length < 10) {
      setDisableError('Reason must be at least 10 characters.');
      return;
    }

    setSubmittingDisable(true);
    setDisableError(null);
    try {
      const res = await apiClient.patch(
        `/platform/schools/${activeSchool.id}/modules/${disablingModule.moduleKey}`,
        {
          isEnabled: false,
          reason: disableReason.trim()
        }
      );
      setModulesList(res.data);
      setDisablingModule(null);
    } catch (err: any) {
      console.error('Failed to disable module', err);
      setDisableError(err.response?.data?.error || 'Failed to disable module.');
    } finally {
      setSubmittingDisable(false);
    }
  };

  const fetchSchools = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/platform/schools');
      setSchools(res.data);
      setError(null);
    } catch (e: any) {
      setError('Failed to retrieve school registry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchools();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = () => setActiveDropdown(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    setFormError(null);

    try {
      const res = await apiClient.post('/platform/schools', formData);
      setCredentials(res.data);
      fetchSchools();
      setFormData({
        name: '',
        phonePrimary: '',
        emailPrimary: '',
        adminFirstName: '',
        adminLastName: '',
        adminEmail: '',
        adminMobile: '',
      });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to register school.';
      setFormError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setRegistering(false);
    }
  };

  const copyToClipboard = () => {
    if (!credentials) return;
    const text = `Veyho School Registry Success!
School: ${credentials.school.name}
School ID: ${credentials.school.id}
Admin: ${credentials.admin.firstName} ${credentials.admin.lastName}
Admin Email: ${credentials.admin.email}
Admin Mobile: ${credentials.admin.mobilePrimary}
Temporary Password: ${credentials.tempPassword || 'Check DB/Platform Logs'}

Link: https://schools.veyho.com/login (or local portal)`;
    
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyResetToClipboard = () => {
    if (!resetCredentials) return;
    const text = `Veyho Reset Admin Password Success!
School: ${resetCredentials.schoolName}
Admin: ${resetCredentials.adminName}
Admin Email: ${resetCredentials.adminEmail}
Temporary Password: ${resetCredentials.temporaryPassword}

Link: https://schools.veyho.com/login (or local portal)`;
    
    navigator.clipboard.writeText(text);
    setCopiedReset(true);
    setTimeout(() => setCopiedReset(false), 2000);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetSchool) return;
    setResettingPassword(true);
    setResetError(null);
    try {
      const res = await apiClient.post(`/platform/schools/${resetSchool.id}/reset-admin-password`);
      setResetCredentials({
        temporaryPassword: res.data.temporaryPassword,
        adminName: `${resetSchool.admin?.firstName || ''} ${resetSchool.admin?.lastName || ''}`.trim(),
        adminEmail: resetSchool.admin?.email || '',
        schoolName: resetSchool.name,
      });
      setResetConfirmOpen(false);
    } catch (err: any) {
      setResetError(err.response?.data?.error || 'Failed to reset admin password.');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleLifecycleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool || !actionType) return;

    const minLength = actionType === 'purge' ? 20 : 10;
    if (actionReason.trim().length < minLength) {
      setActionError(`Audit reason must be at least ${minLength} characters.`);
      return;
    }

    if (actionType === 'purge') {
      const expected = `PERMANENTLY DELETE ${selectedSchool.shortName || selectedSchool.id}`;
      if (confirmationInput !== expected) {
        setActionError(`Confirmation phrase must match exactly: "${expected}"`);
        return;
      }
    }

    setSubmittingAction(true);
    setActionError(null);

    try {
      if (actionType === 'purge') {
        await apiClient.post(`/platform/schools/${selectedSchool.id}/purge`, {
          reason: actionReason,
          confirmationPhrase: confirmationInput
        });
      } else {
        await apiClient.post(`/platform/schools/${selectedSchool.id}/${actionType}`, {
          reason: actionReason
        });
      }

      setActionType(null);
      setSelectedSchool(null);
      setActionReason('');
      setConfirmationInput('');
      fetchSchools();
    } catch (err: any) {
      setActionError(err.response?.data?.error || `Failed to perform ${actionType} action.`);
    } finally {
      setSubmittingAction(false);
    }
  };

  const fetchHistory = async (school: SchoolData) => {
    setHistorySchool(school);
    setLoadingHistory(true);
    setHistoryLogs([]);
    try {
      const res = await apiClient.get(`/platform/schools/${school.id}/history`);
      setHistoryLogs(res.data);
    } catch (err) {
      console.error('Failed to retrieve status history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const filtered = schools.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.emailPrimary && s.emailPrimary.toLowerCase().includes(search.toLowerCase()))
  );

  const getStatusBadge = (school: SchoolData) => {
    if (school.status === 'PURGED' && school.purgeStatus === 'PENDING') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-950/40 text-purple-400 border border-purple-900/40 animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin" />
          PURGING...
        </span>
      );
    }
    if (school.status === 'PURGED' && school.purgeStatus === 'FAILED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-950/40 text-red-400 border border-red-900/40">
          <AlertTriangle className="w-3 h-3 text-red-400" />
          PURGE FAILED
        </span>
      );
    }

    switch (school.status) {
      case 'ACTIVE':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-900/40">ACTIVE</span>;
      case 'PAUSED':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/40 text-amber-400 border border-amber-900/40">PAUSED</span>;
      case 'ARCHIVED':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950/40 text-blue-400 border border-blue-900/40">ARCHIVED</span>;
      case 'DELETED':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-950/40 text-red-400 border border-red-900/40">DELETED</span>;
      case 'PURGED':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-800/40 text-zinc-400 border border-zinc-700/40">PURGED</span>;
      default:
        return null;
    }
  };

  const getActionLabel = (type: string) => {
    switch (type) {
      case 'pause': return 'Pause Operations';
      case 'unpause': return 'Reactivate School';
      case 'archive': return 'Archive Database';
      case 'unarchive': return 'Unarchive Database';
      case 'delete': return 'Mark for Deletion';
      case 'restore': return 'Restore to Active';
      case 'purge': return 'Permanently Purge';
      case 'retry-purge': return 'Retry Purge Operation';
      default: return '';
    }
  };

  return (
    <div className="space-y-6 relative min-h-[500px]">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <School className="w-6 h-6 text-sky-400" />
            School Registry
          </h2>
          <p className="text-zinc-500 text-sm">
            Overview of all active institutional databases and tenant registries.
          </p>
        </div>
        <button
          onClick={() => {
            setCredentials(null);
            setModalOpen(true);
          }}
          className="bg-sky-600 hover:bg-sky-500 text-white font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-sky-600/10 transition-all text-xs shrink-0 self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>Register New School</span>
        </button>
      </div>

      {/* Registry Table */}
      <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Filter by school name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-950/80 border border-zinc-850 rounded-lg py-2 pl-9 pr-4 text-zinc-300 placeholder-zinc-650 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 transition-all text-xs"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-zinc-500 text-xs font-mono flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
            LOADING PLATFORM RECORDS...
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-400 text-xs font-mono">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-zinc-600 text-xs font-mono">
            NO RECORDS MATCHING CRITERIA
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-950/50 border-b border-zinc-800 text-zinc-400 font-medium">
                  <th className="p-4">School Profile</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Primary Contact</th>
                  <th className="p-4">Metrics</th>
                  <th className="p-4">Registry Date</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850">
                {filtered.map((s) => {
                  const isDeletedExpired = s.status === 'DELETED' && s.restoreDeadline && new Date() > new Date(s.restoreDeadline);
                  return (
                    <tr 
                      key={s.id} 
                      onClick={() => setActiveSchool(s)}
                      className="hover:bg-zinc-900/30 transition-colors cursor-pointer"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-white text-sm">{s.name}</div>
                          {s.shortName && (
                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[9px] border border-zinc-700">
                              {s.shortName}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{s.id}</div>
                      </td>
                      <td className="p-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            {getStatusBadge(s)}
                            {s.status === 'PURGED' && s.purgeStatus === 'FAILED' && (
                              <button
                                onClick={() => {
                                  setSelectedSchool(s);
                                  setActionType('retry-purge');
                                }}
                                className="text-[9px] bg-red-955/80 hover:bg-red-900 text-red-400 hover:text-white font-semibold px-2 py-0.5 rounded border border-red-900/40 transition-colors flex items-center gap-1"
                              >
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '3s' }} />
                                Retry Purge
                              </button>
                            )}
                          </div>
                          {s.status === 'DELETED' && s.restoreDeadline && (
                            <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>
                                {isDeletedExpired ? 'Restoration expired' : `Restore by: ${new Date(s.restoreDeadline).toLocaleDateString()}`}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4 space-y-1">
                        {s.admin ? (
                          <>
                            <div className="flex items-center gap-1.5 text-white font-medium">
                              <User className="w-3.5 h-3.5 text-zinc-500" />
                              <span>{s.admin.firstName} {s.admin.lastName}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-zinc-400">
                              <Mail className="w-3.5 h-3.5 text-zinc-650" />
                              <span>{s.admin.email}</span>
                            </div>
                            {s.admin.mobilePrimary && (
                              <div className="flex items-center gap-1.5 text-zinc-400">
                                <Phone className="w-3.5 h-3.5 text-zinc-655" />
                                <span>{s.admin.mobilePrimary}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {s.emailPrimary && (
                              <div className="flex items-center gap-1.5 text-zinc-400">
                                <Mail className="w-3.5 h-3.5 text-zinc-600" />
                                <span>{s.emailPrimary}</span>
                              </div>
                            )}
                            {s.phonePrimary && (
                              <div className="flex items-center gap-1.5 text-zinc-400">
                                <Phone className="w-3.5 h-3.5 text-zinc-600" />
                                <span>{s.phonePrimary}</span>
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-4">
                          <div>
                            <span className="text-[10px] text-zinc-500 uppercase font-mono block">Students</span>
                            <span className="text-zinc-200 font-semibold">{s.studentCount}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-500 uppercase font-mono block">Staff</span>
                            <span className="text-zinc-200 font-semibold">{s.staffCount}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-500 uppercase font-mono block">Classes</span>
                            <span className="text-zinc-200 font-semibold">{s.classCount}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-zinc-400 font-mono">
                        {new Date(s.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="p-4 text-right">
                        <div className="relative inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              localStorage.setItem('shq_support_school_id', s.id);
                              window.location.reload();
                            }}
                            className="text-[10px] bg-sky-950/40 hover:bg-sky-900/60 text-sky-400 font-semibold px-2.5 py-1.5 rounded border border-sky-900/40 transition-colors"
                          >
                            Support Mode
                          </button>

                          <button
                            onClick={() => fetchHistory(s)}
                            className="p-1.5 bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
                            title="View Status History Logs"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {s.status !== 'PURGED' && (
                            <div className="relative">
                              <button
                                onClick={() => setActiveDropdown(activeDropdown === s.id ? null : s.id)}
                                className="bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium px-2 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors text-[10px]"
                              >
                                <span>Manage</span>
                                <ChevronDown className="w-3 h-3 text-zinc-500" />
                              </button>

                              {activeDropdown === s.id && (
                                <div className="absolute right-0 mt-1.5 w-44 bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl z-20 py-1 font-sans text-left">
                                  {s.admin && (
                                    <button
                                      onClick={() => {
                                        setResetSchool(s);
                                        setResetConfirmOpen(true);
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white flex items-center gap-2 border-b border-zinc-900"
                                    >
                                      <Lock className="w-3.5 h-3.5 text-zinc-500" /> Reset Password
                                    </button>
                                  )}
                                  {s.status === 'ACTIVE' && (
                                    <>
                                      <button
                                        onClick={() => { setSelectedSchool(s); setActionType('pause'); }}
                                        className="w-full text-left px-3 py-2 text-xs text-amber-400 hover:bg-amber-950/20 hover:text-amber-300 flex items-center gap-2"
                                      >
                                        <Pause className="w-3.5 h-3.5" /> Pause School
                                      </button>
                                      <button
                                        onClick={() => { setSelectedSchool(s); setActionType('archive'); }}
                                        className="w-full text-left px-3 py-2 text-xs text-blue-400 hover:bg-blue-950/20 hover:text-blue-300 flex items-center gap-2"
                                      >
                                        <Archive className="w-3.5 h-3.5" /> Archive Database
                                      </button>
                                    </>
                                  )}

                                  {s.status === 'PAUSED' && (
                                    <>
                                      <button
                                        onClick={() => { setSelectedSchool(s); setActionType('unpause'); }}
                                        className="w-full text-left px-3 py-2 text-xs text-emerald-400 hover:bg-emerald-950/20 hover:text-emerald-300 flex items-center gap-2"
                                      >
                                        <Play className="w-3.5 h-3.5" /> Reactivate School
                                      </button>
                                      <button
                                        onClick={() => { setSelectedSchool(s); setActionType('archive'); }}
                                        className="w-full text-left px-3 py-2 text-xs text-blue-400 hover:bg-blue-950/20 hover:text-blue-300 flex items-center gap-2"
                                      >
                                        <Archive className="w-3.5 h-3.5" /> Archive Database
                                      </button>
                                    </>
                                  )}

                                  {s.status === 'ARCHIVED' && (
                                    <button
                                      onClick={() => { setSelectedSchool(s); setActionType('unarchive'); }}
                                      className="w-full text-left px-3 py-2 text-xs text-emerald-400 hover:bg-emerald-950/20 hover:text-emerald-300 flex items-center gap-2"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" /> Restore Database
                                    </button>
                                  )}

                                  {s.status !== 'DELETED' && (
                                    <button
                                      onClick={() => { setSelectedSchool(s); setActionType('delete'); }}
                                      className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-950/20 hover:text-red-400 border-t border-zinc-900 flex items-center gap-2"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" /> Delete School
                                    </button>
                                  )}

                                  {s.status === 'DELETED' && (
                                    <>
                                      {!isDeletedExpired && (
                                        <button
                                          onClick={() => { setSelectedSchool(s); setActionType('restore'); }}
                                          className="w-full text-left px-3 py-2 text-xs text-emerald-400 hover:bg-emerald-950/20 hover:text-emerald-300 flex items-center gap-2"
                                        >
                                          <RefreshCw className="w-3.5 h-3.5" /> Restore School
                                        </button>
                                      )}
                                      <button
                                        onClick={() => { setSelectedSchool(s); setActionType('purge'); }}
                                        className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-950/30 hover:text-red-400 flex items-center gap-2"
                                      >
                                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Permanently Purge
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          
          <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-6 overflow-hidden">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            {!credentials ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="mb-2">
                  <h3 className="text-lg font-bold text-white">Register School Tenant</h3>
                  <p className="text-zinc-500 text-xs">Provision a new dedicated database space and admin user.</p>
                </div>

                {formError && (
                  <div className="p-3 bg-red-950/40 border border-red-800/40 rounded-lg text-red-400 text-xs">
                    {formError}
                  </div>
                )}

                <div className="space-y-3">
                  {/* School name */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">School Name</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Springfield High School"
                      className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 text-zinc-300 focus:outline-none focus:border-sky-500 text-xs"
                    />
                  </div>

                  {/* Contacts */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Primary Phone</label>
                      <input
                        type="text"
                        value={formData.phonePrimary}
                        onChange={(e) => setFormData({ ...formData, phonePrimary: e.target.value })}
                        placeholder="+91 9999988888"
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 text-zinc-300 focus:outline-none focus:border-sky-500 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Primary Email</label>
                      <input
                        type="email"
                        value={formData.emailPrimary}
                        onChange={(e) => setFormData({ ...formData, emailPrimary: e.target.value })}
                        placeholder="info@springfield.edu"
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 text-zinc-300 focus:outline-none focus:border-sky-500 text-xs"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-800 mt-2">
                    <span className="text-xs font-bold text-zinc-300 block mb-3">Principal / Administrator Profile</span>
                  </div>

                  {/* Admin Names */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">First Name</label>
                      <input
                        type="text"
                        required
                        value={formData.adminFirstName}
                        onChange={(e) => setFormData({ ...formData, adminFirstName: e.target.value })}
                        placeholder="John"
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 text-zinc-300 focus:outline-none focus:border-sky-500 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Last Name</label>
                      <input
                        type="text"
                        required
                        value={formData.adminLastName}
                        onChange={(e) => setFormData({ ...formData, adminLastName: e.target.value })}
                        placeholder="Doe"
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 text-zinc-300 focus:outline-none focus:border-sky-500 text-xs"
                      />
                    </div>
                  </div>

                  {/* Admin Email / Mobile */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Admin Email</label>
                      <input
                        type="email"
                        required
                        value={formData.adminEmail}
                        onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                        placeholder="admin@springfield.edu"
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 text-zinc-300 focus:outline-none focus:border-sky-500 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">Admin Mobile</label>
                      <input
                        type="text"
                        required
                        value={formData.adminMobile}
                        onChange={(e) => setFormData({ ...formData, adminMobile: e.target.value })}
                        placeholder="9999988888"
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 text-zinc-300 focus:outline-none focus:border-sky-500 text-xs"
                      />
                    </div>
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
                    disabled={registering}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-55"
                  >
                    {registering ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Registering...</span>
                      </>
                    ) : (
                      <span>Complete Registration</span>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-950/40 border border-emerald-900 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                    <Check className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Tenant Registry Complete!</h3>
                  <p className="text-zinc-500 text-xs">The school database instance has been allocated successfully.</p>
                </div>

                <div className="p-4 bg-zinc-950/80 border border-zinc-850 rounded-lg space-y-3 font-mono text-xs">
                  <div>
                    <span className="text-zinc-500 text-[10px] block uppercase">School ID</span>
                    <span className="text-zinc-200 select-all">{credentials.school.id}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-zinc-500 text-[10px] block uppercase">Admin Username</span>
                      <span className="text-zinc-200 select-all">{credentials.admin.email}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block uppercase">Temporary Password</span>
                      <span className="text-amber-400 font-bold select-all">{credentials.tempPassword}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-amber-950/30 border border-amber-900/30 rounded-lg flex gap-2.5 text-[11px] text-amber-300 leading-relaxed">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Important:</strong> Copy these credentials now. The temporary password will not be shown again and requires a password change upon first administrative login.
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={copyToClipboard}
                    className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Copied to Clipboard</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-zinc-400" />
                        <span>Copy Profile Summary</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setModalOpen(false)}
                    className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lifecycle Action Modal */}
      {actionType && selectedSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setActionType(null); setActionError(null); }} />
          
          <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-6 overflow-hidden">
            <button
              onClick={() => { setActionType(null); setActionError(null); }}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <form onSubmit={handleLifecycleAction} className="space-y-4">
              <div className="flex gap-3 mb-2">
                <div className={`p-2.5 rounded-lg shrink-0 ${
                  actionType === 'purge' || actionType === 'delete' ? 'bg-red-950/50 text-red-400 border border-red-900/40' :
                  actionType === 'pause' ? 'bg-amber-950/50 text-amber-400 border border-amber-900/40' :
                  'bg-blue-950/50 text-blue-400 border border-blue-900/40'
                }`}>
                  {actionType === 'purge' || actionType === 'delete' ? <Trash2 className="w-5 h-5" /> :
                   actionType === 'pause' ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{getActionLabel(actionType)}</h3>
                  <p className="text-zinc-500 text-xs mt-0.5">Target: <strong className="text-zinc-300">{selectedSchool.name}</strong></p>
                </div>
              </div>

              {/* Informative warnings */}
              {actionType === 'retry-purge' && (
                <div className="p-3 bg-red-950/20 border border-red-900/30 rounded-lg text-[11px] text-red-300/90 leading-normal">
                  <strong>Warning:</strong> Retrying a purge will restart the permanent data scrubbing job. This is destructive and cannot be undone.
                </div>
              )}
              {actionType === 'pause' && (
                <div className="p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg text-[11px] text-amber-300/90 leading-normal">
                  <strong>Warning:</strong> Pausing a school blocks all administrative and parent logins. The portal will display a read-only message. Operational data is protected, and standard license billing persists.
                </div>
              )}
              {actionType === 'archive' && (
                <div className="p-3 bg-blue-950/20 border border-blue-900/30 rounded-lg text-[11px] text-blue-300/90 leading-normal">
                  <strong>Notice:</strong> Archiving restricts general system login. Records are preserved intact in a read-only state. This action can be reversed at any time by unarchiving.
                </div>
              )}
              {actionType === 'delete' && (
                <div className="p-3 bg-red-950/20 border border-red-900/30 rounded-lg text-[11px] text-red-300/90 leading-normal">
                  <strong>Important:</strong> Deleting a school starts a 90-day grace period where school data is suspended but restorable. After the 90 days elapse, the school becomes eligible for permanent purging.
                </div>
              )}
              {actionType === 'purge' && (
                <div className="p-3 bg-red-950/30 border border-red-900/40 rounded-lg space-y-2 text-[11px] leading-normal">
                  <span className="text-red-400 font-bold block flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> CRITICAL: DESTRUCTIVE AND IRREVERSIBLE ACTION
                  </span>
                  <span className="text-zinc-400 block">
                    This will permanently anonymise student PII (names, Aadhaar, DOB, photos). All staff records and operational tables (attendance, notices, chat threads) will be erased. Fee logs will be preserved anonymously for 7 years.
                  </span>
                </div>
              )}

              {actionError && (
                <div className="p-3 bg-red-950/40 border border-red-900/40 rounded-lg text-red-400 text-xs">
                  {actionError}
                </div>
              )}

              <div className="space-y-3">
                {/* Reason Text Input */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                    Audit Reason (Min {actionType === 'purge' ? 20 : 10} characters)
                  </label>
                  <textarea
                    required
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="e.g. Account suspended due to non-payment of license fees."
                    rows={3}
                    className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 text-zinc-300 focus:outline-none focus:border-sky-500 text-xs placeholder-zinc-700"
                  />
                </div>

                {/* Purge confirmation phrase */}
                {actionType === 'purge' && (
                  <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                    <label className="text-[11px] font-semibold text-red-400 uppercase tracking-wider block">
                      To confirm, type: <code className="text-white select-all font-mono">PERMANENTLY DELETE {selectedSchool.shortName || selectedSchool.id}</code>
                    </label>
                    <input
                      type="text"
                      required
                      value={confirmationInput}
                      onChange={(e) => setConfirmationInput(e.target.value)}
                      placeholder="Type the confirmation phrase exactly"
                      className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 text-zinc-300 focus:outline-none focus:border-red-500 text-xs font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-zinc-800/40">
                <button
                  type="button"
                  onClick={() => { setActionType(null); setActionError(null); }}
                  className="px-4 py-2 border border-zinc-800 rounded-lg hover:bg-zinc-850 text-zinc-400 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className={`px-4 py-2 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-55 ${
                    actionType === 'purge' || actionType === 'delete' ? 'bg-red-600 hover:bg-red-500' : 'bg-sky-600 hover:bg-sky-500'
                  }`}
                >
                  {submittingAction ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>Confirm Action</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status History Drawer */}
      {historySchool && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xs transition-opacity" onClick={() => setHistorySchool(null)} />
          
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md">
              <div className="h-full flex flex-col bg-zinc-950 border-l border-zinc-850 shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-zinc-850 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <History className="w-4 h-4 text-sky-400" />
                      Status Log Audit
                    </h3>
                    <p className="text-zinc-500 text-xs mt-0.5">{historySchool.name}</p>
                  </div>
                  <button
                    onClick={() => setHistorySchool(null)}
                    className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-900 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {loadingHistory ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3 text-zinc-500 text-xs font-mono">
                      <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                      RETRIEVING STATUS LOGS...
                    </div>
                  ) : historyLogs.length === 0 ? (
                    <div className="text-center py-12 text-zinc-600 text-xs font-mono">
                      NO STATUS TRANSITION LOGS FOUND FOR THIS SCHOOL
                    </div>
                  ) : (
                    <div className="relative border-l border-zinc-800 ml-3.5 space-y-8 py-2">
                      {historyLogs.map((log) => (
                        <div key={log.id} className="relative pl-6">
                          {/* Dot marker */}
                          <span className="absolute -left-2.5 top-1.5 w-5 h-5 rounded-full bg-zinc-950 border-2 border-sky-500 flex items-center justify-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                          </span>

                          <div className="space-y-2">
                            {/* Header details */}
                            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>{new Date(log.changedAt).toLocaleString()}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <User className="w-3 h-3 text-zinc-600" />
                                <span>{log.operatorName}</span>
                              </div>
                            </div>

                            {/* Status badge transitions */}
                            <div className="flex items-center gap-2 pt-0.5">
                              <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-zinc-850 text-zinc-400 border border-zinc-800">
                                {log.fromStatus}
                              </span>
                              <span className="text-zinc-500">➔</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-mono border ${
                                log.toStatus === 'ACTIVE' ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/30' :
                                log.toStatus === 'PAUSED' ? 'bg-amber-950/30 text-amber-400 border-amber-900/30' :
                                log.toStatus === 'ARCHIVED' ? 'bg-blue-950/30 text-blue-400 border-blue-900/30' :
                                'bg-red-950/30 text-red-400 border-red-900/30'
                              }`}>
                                {log.toStatus}
                              </span>
                            </div>

                            {/* Reason details */}
                            <div className="p-3 bg-zinc-900/60 border border-zinc-850/60 rounded-lg text-xs text-zinc-300 flex items-start gap-2">
                              <FileText className="w-3.5 h-3.5 text-zinc-550 shrink-0 mt-0.5" />
                              <p className="leading-relaxed italic">"{log.reason}"</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Confirmation Modal */}
      {resetConfirmOpen && resetSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setResetConfirmOpen(false); setResetSchool(null); setResetError(null); }} />
          
          <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-6 overflow-hidden">
            <button
              onClick={() => { setResetConfirmOpen(false); setResetSchool(null); setResetError(null); }}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="flex gap-3 mb-2">
                <div className="p-2.5 rounded-lg shrink-0 bg-blue-950/50 text-blue-400 border border-blue-900/40">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Reset Admin Password</h3>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    Reset password for <strong className="text-zinc-300">{resetSchool.admin?.firstName} {resetSchool.admin?.lastName}</strong> at <strong className="text-zinc-300">{resetSchool.name}</strong>?
                  </p>
                </div>
              </div>

              <div className="p-3 bg-blue-950/20 border border-blue-900/30 rounded-lg text-[11px] text-blue-300/90 leading-normal">
                A new temporary password will be generated and displayed once. Share it directly with the admin.
              </div>

              {resetError && (
                <div className="p-3 bg-red-950/40 border border-red-900/40 rounded-lg text-red-400 text-xs">
                  {resetError}
                </div>
              )}

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-zinc-800/40">
                <button
                  type="button"
                  onClick={() => { setResetConfirmOpen(false); setResetSchool(null); setResetError(null); }}
                  className="px-4 py-2 border border-zinc-800 rounded-lg hover:bg-zinc-850 text-zinc-400 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resettingPassword}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-55"
                >
                  {resettingPassword ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Resetting...</span>
                    </>
                  ) : (
                    <span>Reset Password</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Success Modal */}
      {resetCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setResetCredentials(null); }} />
          
          <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-6 overflow-hidden">
            <button
              onClick={() => { setResetCredentials(null); }}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-5">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-950/40 border border-emerald-900 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                  <Check className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">Password Reset Successful!</h3>
                <p className="text-zinc-500 text-xs">A new temporary password has been generated.</p>
              </div>

              <div className="p-4 bg-zinc-950/80 border border-zinc-850 rounded-lg space-y-3 font-mono text-xs">
                <div>
                  <span className="text-zinc-500 text-[10px] block uppercase">School</span>
                  <span className="text-zinc-200">{resetCredentials.schoolName}</span>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] block uppercase">Admin Name</span>
                  <span className="text-zinc-200">{resetCredentials.adminName}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-zinc-500 text-[10px] block uppercase">Admin Username</span>
                    <span className="text-zinc-200 select-all">{resetCredentials.adminEmail}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] block uppercase">Temporary Password</span>
                    <span className="text-amber-400 font-bold select-all">{resetCredentials.temporaryPassword}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-amber-950/30 border border-amber-900/30 rounded-lg flex gap-2.5 text-[11px] text-amber-300 leading-relaxed">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Important:</strong> Copy this password now. It will not be shown again and the admin must change it upon logging in.
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={copyResetToClipboard}
                  className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  {copiedReset ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Copied to Clipboard</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-zinc-400" />
                      <span>Copy Credentials</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setResetCredentials(null)}
                  className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* School Details & Modules Drawer */}
      {activeSchool && (
        <div className="fixed inset-0 z-40 overflow-hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xs transition-opacity" onClick={() => setActiveSchool(null)} />
          
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md">
              <div className="h-full flex flex-col bg-zinc-950 border-l border-zinc-850 shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-zinc-850">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <School className="w-4 h-4 text-sky-400" />
                        School Management
                      </h3>
                      <p className="text-zinc-500 text-xs mt-0.5">{activeSchool.name}</p>
                    </div>
                    <button
                      onClick={() => setActiveSchool(null)}
                      className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-900 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Tabs Selector */}
                  <div className="flex border-b border-zinc-850 mt-5 -mb-6">
                    <button
                      onClick={() => setDrawerTab('modules')}
                      className={`flex-1 pb-3 text-xs font-semibold border-b-2 transition-colors ${
                        drawerTab === 'modules' ? 'border-sky-500 text-sky-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      Module Entitlements
                    </button>
                    <button
                      onClick={() => setDrawerTab('details')}
                      className={`flex-1 pb-3 text-xs font-semibold border-b-2 transition-colors ${
                        drawerTab === 'details' ? 'border-sky-500 text-sky-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      General Details
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {drawerTab === 'modules' ? (
                    <div className="space-y-4">
                      {loadingModules ? (
                        <div className="flex flex-col items-center justify-center h-48 gap-3 text-zinc-500 text-xs font-mono">
                          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                          RETRIEVING MODULES...
                        </div>
                      ) : modulesError ? (
                        <div className="text-center py-12 text-red-400 text-xs font-semibold">
                          {modulesError}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {modulesList.map((mod) => {
                            const isCore = mod.isCore;
                            return (
                              <div
                                key={mod.moduleKey}
                                className={`p-4 border rounded-xl flex items-center justify-between transition-all ${
                                  isCore
                                    ? 'bg-zinc-900/20 border-zinc-850/40 opacity-55'
                                    : mod.isEnabled
                                    ? 'bg-zinc-900/40 border-zinc-850 hover:border-zinc-800'
                                    : 'bg-red-950/5 border-red-900/10'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-lg ${
                                    isCore ? 'bg-zinc-900 text-zinc-500' : mod.isEnabled ? 'bg-sky-950/30 text-sky-400' : 'bg-red-950/20 text-red-400'
                                  }`}>
                                    {getModuleIcon(mod.moduleKey)}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-bold text-white">{mod.moduleName}</span>
                                      {isCore ? (
                                        <span className="text-[9px] text-zinc-500 font-medium px-1.5 py-0.5 rounded bg-zinc-900/60 uppercase tracking-wider">
                                          Core
                                        </span>
                                      ) : mod.isEnabled ? (
                                        <span className="text-[9px] text-emerald-400 font-medium px-1.5 py-0.5 rounded bg-emerald-950/20 uppercase tracking-wider">
                                          Active
                                        </span>
                                      ) : (
                                        <span className="text-[9px] text-red-450 font-medium px-1.5 py-0.5 rounded bg-red-950/30 uppercase tracking-wider">
                                          Disabled
                                        </span>
                                      )}
                                    </div>
                                    {isCore ? (
                                      <p className="text-[10px] text-zinc-500 mt-0.5 font-medium">Core — always enabled</p>
                                    ) : !mod.isEnabled ? (
                                      <div className="mt-1 space-y-0.5 text-[9px] text-zinc-500 leading-normal">
                                        <p className="font-semibold text-red-300/80">Reason: {mod.disabledReason}</p>
                                        {mod.disabledAt && (
                                          <p>Disabled on: {new Date(mod.disabledAt).toLocaleDateString()}</p>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="text-[10px] text-zinc-500 mt-0.5">Toggle to control access</p>
                                    )}
                                  </div>
                                </div>

                                {!isCore && (
                                  <button
                                    onClick={() => handleToggleModule(mod)}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      mod.isEnabled ? 'bg-sky-500' : 'bg-zinc-800'
                                    }`}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                        mod.isEnabled ? 'translate-x-4' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div>
                          <span className="text-[10px] text-zinc-500 uppercase font-mono block">School ID</span>
                          <span className="text-zinc-200 text-xs font-mono select-all bg-zinc-900 px-2 py-1 rounded border border-zinc-850 mt-1 block w-fit">{activeSchool.id}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 uppercase font-mono block">Group ID</span>
                          <span className="text-zinc-200 text-xs font-mono select-all bg-zinc-900 px-2 py-1 rounded border border-zinc-850 mt-1 block w-fit">{activeSchool.groupId || 'None'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 uppercase font-mono block">Status</span>
                          <div className="mt-1">{getStatusBadge(activeSchool)}</div>
                        </div>
                        {activeSchool.admin && (
                          <div className="pt-4 border-t border-zinc-850 space-y-3">
                            <h4 className="text-xs font-bold text-zinc-400">Primary Contact (Admin)</h4>
                            <div>
                              <span className="text-[10px] text-zinc-500 uppercase font-mono block">Name</span>
                              <span className="text-zinc-200 text-xs">{activeSchool.admin.firstName} {activeSchool.admin.lastName}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-zinc-555 uppercase font-mono block">Email</span>
                              <span className="text-zinc-200 text-xs">{activeSchool.admin.email}</span>
                            </div>
                            {activeSchool.admin.mobilePrimary && (
                              <div>
                                <span className="text-[10px] text-zinc-555 uppercase font-mono block">Mobile</span>
                                <span className="text-zinc-200 text-xs">{activeSchool.admin.mobilePrimary}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disable Module Confirmation Modal */}
      {disablingModule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/85 backdrop-blur-xs" onClick={() => setDisablingModule(null)} />
          
          <div className="relative bg-zinc-950 border border-zinc-850 rounded-xl max-w-md w-full shadow-2xl p-6 overflow-hidden z-10">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-red-950/30 text-red-400 rounded-lg shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Disable {disablingModule.moduleName}?</h3>
                <p className="text-zinc-400 text-xs mt-1 leading-normal">
                  Disabling this module locks access for the School Admin and staff at <strong>{activeSchool?.name}</strong>. Existing data remains safe and preserved.
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmDisable} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                  Disable Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  value={disableReason}
                  onChange={(e) => setDisableReason(e.target.value)}
                  placeholder="e.g. Disabling the module due to client's plan downgrade."
                  rows={3}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded-lg p-2.5 text-zinc-300 focus:outline-none focus:border-red-500 text-xs placeholder-zinc-700"
                />
                <p className="text-[10px] text-zinc-600">Minimum 10 characters required.</p>
              </div>

              {disableError && (
                <div className="p-3 bg-red-950/20 border border-red-900/30 rounded-lg text-xs text-red-300/90 font-medium">
                  {disableError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-850">
                <button
                  type="button"
                  onClick={() => setDisablingModule(null)}
                  className="px-4 py-2 border border-zinc-800 rounded-lg hover:bg-zinc-850 text-zinc-400 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDisable || disableReason.trim().length < 10}
                  className="px-4 py-2 bg-red-650 hover:bg-red-550 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-55"
                >
                  {submittingDisable ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Disabling...</span>
                    </>
                  ) : (
                    <span>Disable Module</span>
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
