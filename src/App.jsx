import React, { useState } from 'react';
import { LayoutDashboard, Users, Truck, Settings as SettingsIcon, Calculator } from 'lucide-react';
import BackOfficeDashboard from './pages/BackOfficeDashboard';
import LeadInbox from './pages/LeadInbox';
import Settings from './pages/Settings';
import LeadMagnet from './pages/LeadMagnet';

export default function App() {
  const [view, setView] = useState('dashboard');
  const renderView = () => {
    switch (view) {
      case 'dashboard': return <BackOfficeDashboard />;
      case 'inbox': return <LeadInbox />;
      case 'settings': return <Settings />;
      case 'magnet': return <LeadMagnet />;
      default: return <BackOfficeDashboard />;
    }
  };
  return (
    <div className="flex h-screen bg-[#050505] text-white font-sans">
      <aside className="w-64 bg-black border-r border-white/5 p-6 flex flex-col shrink-0">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-black shadow-lg"><Truck size={22} /></div>
          <span className="font-black text-xl italic uppercase tracking-tighter">MoveCalc<span className="text-amber-500">PRO</span></span>
        </div>
        <nav className="flex-1 space-y-2">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'dashboard' ? 'bg-amber-500 text-black font-black' : 'text-gray-500 hover:text-amber-500 hover:bg-white/5'}`}>
            <LayoutDashboard size={18} /> <span className="text-[10px] font-black uppercase tracking-widest">Overview</span>
          </button>
          <button onClick={() => setView('inbox')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'inbox' ? 'bg-amber-500 text-black font-black' : 'text-gray-500 hover:text-amber-500 hover:bg-white/5'}`}>
            <Users size={18} /> <span className="text-[10px] font-black uppercase tracking-widest">Pipeline</span>
          </button>
          <button onClick={() => setView('magnet')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'magnet' ? 'bg-amber-500 text-black font-black' : 'text-gray-500 hover:text-amber-500 hover:bg-white/5'}`}>
            <Calculator size={18} /> <span className="text-[10px] font-black uppercase tracking-widest">Lead Magnet</span>
          </button>
        </nav>
        <button onClick={() => setView('settings')} className={`mt-auto w-full flex items-center gap-3 px-4 py-3 rounded-xl ${view === 'settings' ? 'bg-amber-500 text-black font-black' : 'text-gray-500 hover:text-amber-500'}`}>
          <SettingsIcon size={18} /> <span className="text-[10px] font-black uppercase tracking-widest">Audit Config</span>
        </button>
      </aside>
      <main className="flex-1 overflow-auto bg-[#050505]">{renderView()}</main>
    </div>
  );
}
