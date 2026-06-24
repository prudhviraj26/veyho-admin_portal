import React, { useState, useEffect } from 'react';
import { School, Plus, Search, Mail, Phone, Copy, Check, ShieldAlert, Loader2, X } from 'lucide-react';
import { apiClient } from '../../lib/axios';

interface SchoolData {
  id: string;
  name: string;
  createdAt: string;
  phonePrimary: string | null;
  emailPrimary: string | null;
  studentCount: number;
  staffCount: number;
  classCount: number;
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

  const [formData, setFormData] = useState({
    name: '',
    phonePrimary: '',
    emailPrimary: '',
    adminFirstName: '',
    adminLastName: '',
    adminEmail: '',
    adminMobile: '',
  });

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    setFormError(null);

    try {
      const res = await apiClient.post('/platform/schools', formData);
      setCredentials(res.data);
      // Refresh list
      fetchSchools();
      // Reset form
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

  const filtered = schools.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.emailPrimary && s.emailPrimary.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
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
                  <th className="p-4">Primary Contact</th>
                  <th className="p-4">Metrics</th>
                  <th className="p-4">Registry Date</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-900/10 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-white text-sm">{s.name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{s.id}</div>
                    </td>
                    <td className="p-4 space-y-1">
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
                      <button
                        onClick={() => {
                          localStorage.setItem('shq_support_school_id', s.id);
                          window.location.reload();
                        }}
                        className="text-[10px] bg-sky-950/40 hover:bg-sky-900/60 text-sky-400 font-semibold px-2.5 py-1.5 rounded border border-sky-900/40 transition-colors"
                      >
                        Enter Support Mode
                      </button>
                    </td>
                  </tr>
                ))}
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
    </div>
  );
};
