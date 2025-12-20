import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Truck, 
  Settings, 
  Search, 
  Bell, 
  ChevronRight, 
  Plus, 
  DollarSign, 
  Clock, 
  CheckCircle2 
} from 'lucide-react';

// --- IMPORTANT: Only uncomment these AFTER you have pasted code into those files ---
// import LeadDetail from './pages/LeadDetail';
// import DriverLog from './pages/DriverLog';

export default function App() {
  const [view, setView] = useState('dashboard');
  const [selectedLead, setSelectedLead] = useState(null);

  // Mock data for the table
  const leads = [
    { id: 'LD-8821', name: 'James Peterson', move: 'LA → NYC', date: '2023-11-20', quote: '$4,060', status: 'New' },
    { id: 'LD-8820', name: 'Sarah Miller', move: 'Chicago → Austin', date: '2023-11-22', quote: '$2,800', status: 'Contacted' },
  ];

  // LOGIC: The Navigation Switcher
  const renderContent = () => {
    // 1. If we are looking at a specific lead
    if (selectedLead) {
      return (
        <div className="p-8 flex flex-col items-center justify-center h-full text-center space-y-4">
          <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center text-blue-400">
            <Users size={32} />
          </div>
          <h2 className="text-2xl font-bold">Opening {selectedLead.name}...</h2>
          <p className="text-gray-500 max-w-sm">
            Once you paste the code into <b>src/pages/LeadDetail.jsx</b>, 
            uncomment the import line at the top of <b>App.jsx</b> to see the full profile.
          </p>
          <button 
            onClick={() => setSelectedLead(null)}
            className="px-6 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-bold hover:bg-white/10"
          >
            Back to List
          </button>
        </div>
      );
    }

    // 2. The Main Dashboard View (Built-in for safety)
    if (view === 'dashboard') {
      return (
        <div className="p-8 space-y-8 h-full overflow-y-auto">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Back Office Overview</h1>
            <button className="bg-blue-600 px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 flex items-center gap-2">
              <Plus size={16} /> New Lead
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-[#111111] border border-white/5 p-6 rounded-2xl">
               <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Total Leads</p>
               <p className="text-2xl font-bold text-white mt-1">1,248</p>
            </div>
            <div className="bg-[#111111] border border-white/5 p-6 rounded-2xl">
               <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Revenue</p>
               <p className="text-2xl font-bold text-white mt-1">$142.5k</p>
            </div>
            <div className="bg-[#111111] border border-white/5 p-6 rounded-2xl">
               <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Conversion</p>
               <p className="text-2xl font-bold text-white mt-1">22.4%</p>
            </div>
            <div className="bg-[#111111] border border-white/5 p-6 rounded-2xl">
               <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Active Jobs</p>
               <p className="text-2xl font-bold text-white mt-1">18</p>
            </div>
          </div>

          <div className="bg-[#111111] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/5">
                  <th className="px-6 py-4">Lead Detail</th>
                  <th className="px-6 py-4">Route</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {leads.map((lead) => (
                  <tr 
                    key={lead.id} 
                    onClick={() => setSelectedLead(lead)} 
                    className="group hover:bg-white/[0.02] cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-5 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-black text-xs border border-blue-500/10">
                        {lead.name[0]}
                      </div>
                      <span className="font-bold text-white">{lead.name}</span>
                    </td>
                    <td className="px-6 py-5 text-sm text-gray-400">{lead.move}</td>
                    <td className="px-6 py-5 text-right">
                      <ChevronRight size={18} className="inline text-gray-600 group-hover:text-white" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // 3. Fallback for other pages
    return (
      <div className="flex items-center justify-center h-full text-gray-500 uppercase font-bold tracking-widest">
        {view} Page Coming Soon
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#090909] text-gray-100 font-sans overflow-hidden">
      {/* Persistent Sidebar */}
      <aside className="w-64 border-r border-white/5 flex flex-col p-6 bg-black z-40">
        <div className="flex items-center gap-3 px-2 mb-10">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/40">
            <Truck size={18} className="text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">MoveCalc<span className="text-blue-500">PRO</span></span>
        </div>

        <nav className="flex-1 space-y-2">
          <button 
            onClick={() => { setView('dashboard'); setSelectedLead(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${view === 'dashboard' && !selectedLead ? 'bg-blue-600 shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <LayoutDashboard size={20} /><span className="text-sm font-medium">Overview</span>
          </button>
          <button 
            onClick={() => { setView('driver'); setSelectedLead(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${view === 'driver' ? 'bg-blue-600 shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <Truck size={20} /><span className="text-sm font-medium">Driver Portal</span>
          </button>
          <button 
            onClick={() => { setView('settings'); setSelectedLead(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${view === 'settings' ? 'bg-blue-600 shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <Settings size={20} /><span className="text-sm font-medium">Settings</span>
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <header className="h-16 border-b border-white/5 px-8 flex items-center justify-between bg-black/40 backdrop-blur-md">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <Search size={18} className="text-gray-500" />
            <input type="text" placeholder="Search project database..." className="bg-transparent border-none text-sm w-full outline-none" />
          </div>
          <div className="flex items-center gap-4">
            <button className="text-gray-500 hover:text-white"><Bell size={20} /></button>
            <div className="w-8 h-8 rounded-full bg-blue-600 border border-white/10" />
          </div>
        </header>

        <main className="flex-1 overflow-hidden relative bg-[#050505]">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

