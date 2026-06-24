import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield, School, Key, LogOut, Menu, X, Terminal, User as UserIcon } from 'lucide-react';

interface SidebarItem {
  name: string;
  path: string;
  icon: React.ComponentType<any>;
}

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [supportActive, setSupportActive] = useState(false);
  const [_supportSchoolId, setSupportSchoolId] = useState<string | null>(null);

  useEffect(() => {
    const activeId = localStorage.getItem('shq_support_school_id');
    setSupportActive(!!activeId);
    setSupportSchoolId(activeId);
  }, [location]);

  const menuItems: SidebarItem[] = [
    { name: 'Terminal Dashboard', path: '/', icon: Terminal },
    { name: 'School Registry', path: '/schools', icon: School },
    { name: 'Support Grants', path: '/support', icon: Key },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const clearSupportMode = () => {
    localStorage.removeItem('shq_support_school_id');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-black flex text-zinc-300 font-sans">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col bg-zinc-950 border-r border-zinc-800/80 shrink-0">
        {/* Brand */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-zinc-900">
          <div className="w-8 h-8 bg-gradient-to-tr from-sky-600 to-emerald-500 rounded-lg flex items-center justify-center shadow-md">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white tracking-wide bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            Veyho Admin
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.name}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-zinc-900 text-white border-l-2 border-sky-500 pl-3.5'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-zinc-500'}`} />
                {item.name}
              </button>
            );
          })}
        </nav>

        {/* User Info / Logout */}
        <div className="p-4 border-t border-zinc-900 space-y-3 bg-zinc-950">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <UserIcon className="w-4.5 h-4.5 text-zinc-400" />
            </div>
            <div className="truncate">
              <div className="text-xs font-semibold text-zinc-200 truncate">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono truncate">
                {user?.email}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-red-950/20 hover:text-red-400 text-zinc-400 rounded-lg text-xs font-medium border border-zinc-800/60 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Terminate Session</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex w-64 max-w-xs flex-col bg-zinc-950 border-r border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-6">
              <span className="font-bold text-white">Veyho Admin</span>
              <button onClick={() => setMobileOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1">
              {menuItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <button
                    key={item.name}
                    onClick={() => {
                      navigate(item.path);
                      setMobileOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-zinc-500" />
                    {item.name}
                  </button>
                );
              })}
            </nav>
            <div className="pt-4 border-t border-zinc-900 space-y-3">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900 text-zinc-400 rounded-lg text-xs font-medium border border-zinc-800"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-zinc-950/40 backdrop-blur-md border-b border-zinc-900 flex items-center justify-between px-4 md:px-8 shrink-0 relative z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden text-zinc-400 hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden md:flex items-center gap-2 text-zinc-500 text-xs font-mono">
              <span className="text-zinc-600">STATUS:</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-400 uppercase font-semibold">Terminal Active</span>
            </div>
          </div>

          {/* Active Support Access Warning Banner in Header */}
          {supportActive && (
            <div className="flex items-center gap-3 bg-amber-950/40 border border-amber-800/40 px-4 py-1.5 rounded-lg text-xs text-amber-300 shadow-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span>
                Support Session Active
              </span>
              <button
                onClick={clearSupportMode}
                className="text-[10px] bg-amber-900/60 hover:bg-amber-800 text-white font-semibold px-2 py-0.5 rounded border border-amber-700/60 transition-colors"
              >
                Exit Session
              </button>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs">
            <span className="bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800/60 text-zinc-400 font-mono">
              v1.0.0-terminal
            </span>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-zinc-950/10">
          {children}
        </main>
      </div>
    </div>
  );
};
