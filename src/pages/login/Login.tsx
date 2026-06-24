import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../lib/axios';
import { Shield, Mail, Lock, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.post('/auth/login', {
        email: email.trim(),
        password,
        platform: 'web',
      });

      const { user, accessToken } = res.data;

      // Verify the user is a platform owner
      if (user.role === 'platform_owner' || user.roles.includes('platform_owner')) {
        login(accessToken, user);
        navigate('/', { replace: true });
      } else {
        setError('Unauthorized. Only Veyho Platform Owners can access this portal.');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Invalid email or password';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-zinc-950 to-black flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-sky-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[450px] h-[450px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Login Card */}
      <div className="w-full max-w-md bg-zinc-900/60 backdrop-blur-xl border border-zinc-800/80 p-8 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] relative z-10 transition-all duration-300 hover:border-zinc-700/60">
        
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-tr from-sky-600 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/20 mb-4 animate-pulse">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent tracking-tight">
            Veyho Platform
          </h1>
          <p className="text-zinc-500 text-xs mt-1 font-mono uppercase tracking-widest">
            Internal Operations Portal
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-red-400 text-sm flex items-start gap-2">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email field */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-400 tracking-wide block">
              Operator Email
            </label>
            <div className="relative group">
              <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500 transition-colors group-focus-within:text-sky-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@veyho.com"
                className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg py-3 pl-11 pr-4 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 transition-all text-sm font-sans"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-400 tracking-wide block">
              Access Code
            </label>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500 transition-colors group-focus-within:text-sky-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg py-3 pl-11 pr-11 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 transition-all text-sm font-sans"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-zinc-500 hover:text-zinc-300 focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Security Banner */}
          <div className="p-3 bg-zinc-950/50 border border-zinc-800/40 rounded-lg text-[11px] text-zinc-500 leading-relaxed font-mono">
            ℹ This system is restricted to authorized Veyho personnel. All actions, logins, and IP addresses are audited for security compliance.
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-sky-600/15 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed group text-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying credentials...</span>
              </>
            ) : (
              <>
                <span>Sign In to Terminal</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
