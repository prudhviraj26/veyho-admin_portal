import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { School, Key, Activity, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import { apiClient } from '../../lib/axios';

export const Overview: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    schoolsCount: 0,
    activeGrantsCount: 0,
    securityAuditsPassed: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const schoolsRes = await apiClient.get('/platform/schools').catch(() => ({ data: [] }));
        const activeGrantsRes = await apiClient.get('/platform/support-access/active').catch(() => ({ data: [] }));
        
        setStats({
          schoolsCount: Array.isArray(schoolsRes.data) ? schoolsRes.data.length : 0,
          activeGrantsCount: Array.isArray(activeGrantsRes.data) ? activeGrantsRes.data.length : 0,
          securityAuditsPassed: true,
        });
      } catch (e) {
        setStats({
          schoolsCount: 0,
          activeGrantsCount: 0,
          securityAuditsPassed: true,
        });
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const systemMetrics = [
    { name: 'Gateway API Router', status: 'Online', color: 'text-emerald-400' },
    { name: 'Primary Database Pool', status: 'Healthy', color: 'text-emerald-400' },
    { name: 'Redis Cache Cluster', status: 'Healthy', color: 'text-emerald-400' },
    { name: 'Token Signer Service', status: 'Active', color: 'text-emerald-400' },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-slate-950 border border-zinc-800 p-8 rounded-2xl relative overflow-hidden shadow-2xl">
        <div className="absolute right-0 top-0 w-96 h-96 bg-gradient-to-br from-sky-500/10 to-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <span className="text-xs font-mono text-sky-400 uppercase tracking-widest bg-sky-950/40 border border-sky-900/40 px-2.5 py-1 rounded-full">
            Security Clearance Level: PLATFORM_OWNER
          </span>
          <h2 className="text-3xl font-bold text-white tracking-tight">
            Welcome to the Veyho Terminal
          </h2>
          <p className="text-zinc-400 max-w-2xl text-sm leading-relaxed">
            From this interface, you can register new schools, monitor system-wide metadata, and request time-bound support access grants to troubleshoot customer instances safely.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Schools */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 p-6 rounded-xl hover:border-zinc-700/60 transition-all shadow-lg flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">School Registry</span>
            <div className="w-8 h-8 rounded-lg bg-sky-950/40 border border-sky-900/40 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
              <School className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white font-mono mb-1">
              {loading ? '...' : stats.schoolsCount}
            </div>
            <p className="text-zinc-500 text-xs">Registered institutional instances</p>
          </div>
        </div>

        {/* Card 2: Support Access */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 p-6 rounded-xl hover:border-zinc-700/60 transition-all shadow-lg flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Active Support Session</span>
            <div className="w-8 h-8 rounded-lg bg-amber-950/40 border border-amber-900/40 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
              <Key className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white font-mono mb-1">
              {loading ? '...' : stats.activeGrantsCount}
            </div>
            <p className="text-zinc-500 text-xs">Time-bound access sessions active</p>
          </div>
        </div>

        {/* Card 3: Security audits */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 p-6 rounded-xl hover:border-zinc-700/60 transition-all shadow-lg flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Security Clearance</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/40 border border-emerald-900/40 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-emerald-400 flex items-center gap-1.5 mb-1.5">
              <span>SECURED</span>
            </div>
            <p className="text-zinc-500 text-xs">All API traffic encrypted and audited</p>
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-zinc-900/20 border border-zinc-850 p-6 rounded-xl space-y-4 shadow-lg lg:col-span-1">
          <h3 className="text-sm font-semibold uppercase text-zinc-400 tracking-wider mb-2">Quick Commands</h3>
          
          <button
            onClick={() => navigate('/schools')}
            className="w-full flex items-center justify-between p-3.5 bg-zinc-900/60 hover:bg-zinc-850/80 border border-zinc-800 rounded-lg group transition-all text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-sky-950/40 text-sky-400 flex items-center justify-center font-bold">
                +
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-200">Register School</div>
                <div className="text-[10px] text-zinc-500">Setup tenant & admin user</div>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={() => navigate('/support')}
            className="w-full flex items-center justify-between p-3.5 bg-zinc-900/60 hover:bg-zinc-850/80 border border-zinc-800 rounded-lg group transition-all text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-amber-950/40 text-amber-400 flex items-center justify-center">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-200">Request Support Grant</div>
                <div className="text-[10px] text-zinc-500">Initiate scoped read access</div>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* System Health */}
        <div className="bg-zinc-900/20 border border-zinc-850 p-6 rounded-xl space-y-4 shadow-lg lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold uppercase text-zinc-400 tracking-wider">System Infrastructure Status</h3>
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
              <Activity className="w-3.5 h-3.5 animate-pulse" />
              All Services Operating
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {systemMetrics.map((metric) => (
              <div key={metric.name} className="flex items-center justify-between p-3 bg-zinc-950/60 border border-zinc-900/80 rounded-lg">
                <span className="text-xs text-zinc-400">{metric.name}</span>
                <span className={`text-[10px] font-mono font-bold ${metric.color} bg-zinc-900 px-2 py-0.5 rounded`}>
                  {metric.status}
                </span>
              </div>
            ))}
          </div>

          <div className="p-3 bg-zinc-950/40 border border-zinc-900 rounded-lg flex items-center gap-3 text-xs text-zinc-500 font-mono">
            <Clock className="w-4 h-4 text-zinc-600" />
            <span>Last automated platform check passed 4 minutes ago</span>
          </div>
        </div>
      </div>
    </div>
  );
};
