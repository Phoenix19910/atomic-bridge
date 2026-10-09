import React, { useState } from 'react';
import { ConsortiumRole, SystemHealth } from '../types';
import {
  Building2,
  Landmark,
  ShieldCheck,
  Radio,
  ExternalLink,
  Menu,
  X,
  CreditCard,
  RefreshCw,
  Coins,
} from 'lucide-react';

interface NavbarProps {
  activeRole: ConsortiumRole;
  onSelectRole: (role: ConsortiumRole) => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  sseConnected: boolean;
  health: SystemHealth | null;
  onRefresh: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeRole,
  onSelectRole,
  activeTab,
  onSelectTab,
  sseConnected,
  health,
  onRefresh,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const roles: Array<{ id: ConsortiumRole; label: string; icon: any; jurisdiction: string; color: string }> = [
    { id: 'BankA-MSP', label: 'Bank A', icon: Building2, jurisdiction: 'India (INR)', color: '#f59e0b' },
    { id: 'BankC-MSP', label: 'Bank C', icon: Building2, jurisdiction: 'Singapore (USD)', color: '#06b6d4' },
    { id: 'RBI-MSP', label: 'RBI', icon: Landmark, jurisdiction: 'Regulator (India)', color: '#eab308' },
    { id: 'MAS-MSP', label: 'MAS', icon: Landmark, jurisdiction: 'Regulator (SG)', color: '#ef4444' },
    { id: 'Auditor-MSP', label: 'Auditor', icon: ShieldCheck, jurisdiction: 'Consortium', color: '#a855f7' },
  ];

  const tabs = [
    { id: 'bank', label: 'Commercial Banks', icon: Building2 },
    { id: 'regulator', label: 'Regulator Console', icon: Landmark },
    { id: 'auditor', label: 'Auditor Explorer', icon: ShieldCheck },
    { id: 'rtgs', label: 'Simulated RTGS Rail', icon: Coins },
    { id: 'events', label: 'Live SSE Feed', icon: Radio },
  ];

  const openInNewSession = (role: ConsortiumRole) => {
    const url = new URL(window.location.href);
    url.searchParams.set('role', role);
    window.open(url.toString(), '_blank');
  };

  return (
    <header className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(7,9,14,0.85)] sticky top-0 z-50 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Network Status */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-cyan-500 to-emerald-400 p-[1.5px] flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-[#07090e] rounded-[10px] flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight text-white">AtomicBridge</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/50">
                  corridor-channel
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Sovereign Cross-Border Settlement (INR / USD)
              </p>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 bg-slate-900/60 p-1 rounded-xl border border-white/5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md shadow-indigo-500/25'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Action: Role Selector & SSE status */}
          <div className="hidden sm:flex items-center space-x-3">
            {/* SSE Pulse Indicator */}
            <div
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium border ${
                sseConnected
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                  : 'bg-rose-950/40 text-rose-400 border-rose-800/40'
              }`}
              title={sseConnected ? 'Connected to live SSE stream' : 'Disconnected from SSE stream'}
            >
              <span
                className={`pulse-indicator ${
                  sseConnected ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              <span>{sseConnected ? 'SSE LIVE' : 'SSE RECONNECTING'}</span>
            </div>

            {/* Active Role Selector */}
            <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
              <label className="text-[11px] text-slate-400 px-2 font-medium">Session:</label>
              <select
                value={activeRole}
                onChange={(e) => onSelectRole(e.target.value as ConsortiumRole)}
                className="bg-slate-950 text-white text-xs font-semibold rounded px-2.5 py-1 border border-slate-700/60 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} — {r.jurisdiction}
                  </option>
                ))}
              </select>
              <button
                onClick={() => openInNewSession(activeRole)}
                className="p-1 text-slate-400 hover:text-cyan-400 transition"
                title="Open this role in a separate browser window/tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={onRefresh}
              className="p-2 text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800 rounded-lg border border-white/5 transition"
              title="Refresh ledger state"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile menu trigger */}
          <div className="flex sm:hidden items-center space-x-2">
            <span
              className={`pulse-indicator ${
                sseConnected ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-300 hover:text-white rounded-lg bg-slate-900"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-slate-800 bg-[#0d121f] px-4 pt-3 pb-6 space-y-4">
          <div>
            <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-1">
              Active Session Identity
            </label>
            <select
              value={activeRole}
              onChange={(e) => {
                onSelectRole(e.target.value as ConsortiumRole);
                setMobileMenuOpen(false);
              }}
              className="w-full bg-slate-950 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} ({r.jurisdiction})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    onSelectTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center space-x-2 p-2.5 rounded-lg text-xs font-semibold ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
            <span>Channel: corridor-channel</span>
            <span>SSE: {sseConnected ? 'Connected' : 'Reconnecting'}</span>
          </div>
        </div>
      )}
    </header>
  );
};
