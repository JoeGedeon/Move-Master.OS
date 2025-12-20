import React, { useState } from 'react';
import { 
  LayoutDashboard, Users, Truck, Calendar, Settings as SettingsIcon, 
  Search, Bell, Menu, X, PieChart, DollarSign, ArrowRightLeft, 
  TrendingUp, CheckCircle2, MapPin, Camera, ArrowRight, ClipboardList,
  Plus, Sliders, ChevronRight, Filter, Info, Tv, Package, Bed, Armchair
} from 'lucide-react';

/**
 * ==========================================
 * SUB-COMPONENT: SYSTEM OVERVIEW (DASHBOARD)
 * ==========================================
 */
const BackOfficeDashboard = () => {
  const stats = [
    { label: "Active Revenue", val: "$124,500", trend: "+12%", icon: DollarSign },
    { label: "Lead Velocity", val: "42", trend: "+8%", icon: Users },
    { label: "Conversion Rate", val: "18.4%", trend: "+2%", icon: TrendingUp },
  ];

  return (
    <div className="h-full overflow-y-auto p-10 space-y-10 animate-in fade-in duration-500 bg-[#050505]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">System Overview</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium italic">Operational Health Metrics.</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg text-[10px] font-black text-amber-500 uppercase tracking-widest">Live Engine</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((s, i) => (
          <div key={i} className="bg-[#111111] border border-white/5 p-8 rounded-3xl group hover:border-amber-500/20 transition-all">
            <div className="flex justify-between items-start mb-6">
              <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-500 group-hover:bg-amber-500 group-hover:text-black transition-all">
                <s.icon size={24} />
              </div>
              <div className="text-emerald-400 text-xs font-bold">{s.trend}</div>
            </div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{s.label}</p>
            <p className="text-3xl font-black text-white tracking-tighter">{s.val}</p>
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white/[0.02] border border-white/5 p-10 rounded-[40px] flex flex-col items-center justify-center text-center h-64">
           <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-4 text-gray-600"><PieChart size={24}/></div>
           <p className="text-sm font-bold text-white uppercase tracking-widest font-black italic">Revenue Forecast</p>
           <p className="text-xs text-gray-500 mt-2">Connecting to analytics node...</p>
        </div>
        <div className="bg-amber-500/[0.03] border border-amber-500/10 p-10 rounded-[40px] flex flex-col items-center justify-center text-center h-64 shadow-lg shadow-amber-500/5">
           <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center mb-4 text-amber-500"><TrendingUp size={24}/></div>
           <p className="text-sm font-bold text-amber-500 uppercase tracking-widest font-black italic">Operational Audit</p>
           <p className="text-xs text-gray-500 mt-2">0 discrepancies detected in current load logic.</p>
        </div>
      </div>
    </div>
  );
};

/**
 * ==========================================
 * SUB-COMPONENT: LEAD PIPELINE (INBOX)
 * ==========================================
 */
const LeadInbox = ({ onSelectLead }) => {
  const leads = [
    { id: 'LD-8821', name: 'James Peterson', origin: '90210', dest: '10001', quote: '$4,060' },
    { id: 'LD-8820', name: 'Sarah Miller', origin: '60601', dest: '60614', quote: '$2,850' },
  ];

  return (
    <div className="h-full overflow-y-auto p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase italic text-white">Lead Pipeline</h1>
          <p className="text-sm text-gray-500 font-medium">Monitoring incoming move requests.</p>
        </div>
        <button className="bg-amber-500 text-black px-6 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-amber-500/20 flex items-center gap-2">
          <Plus size={16} /> New Lead
        </button>
      </div>

      <div className="bg-[#111111] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
        <table className="w-full text-left">
          <tbody className="divide-y divide-white/5">
            {leads.map((l) => (
              <tr key={l.id} onClick={() => onSelectLead(l)} className="group hover:bg-white/[0.02] cursor-pointer transition-all">
                <td className="px-8 py-6 flex items-center gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-black text-sm border border-amber-500/10 tracking-widest shadow-lg shadow-amber-500/5">{l.name[0]}</div>
                  <div>
                    <p className="font-black text-white group-hover:text-amber-500 transition-colors text-sm uppercase italic">{l.name}</p>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-0.5">REF: {l.id}</p>
                  </div>
                </td>
                <td className="px-8 py-6 text-xs text-gray-400 font-bold uppercase tracking-widest">{l.origin} → {l.dest}</td>
                <td className="px-8 py-6 text-right"><ChevronRight size={18} className="inline text-gray-700 group-hover:text-amber-500 transition-all" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * ==========================================
 * SUB-COMPONENT: LEAD DETAIL
 * ==========================================
 */
const LeadDetail = ({ onBack, lead }) => (
  <div className="h-full bg-[#050505] text-gray-100 font-sans overflow-y-auto">
    <header className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-black/60 backdrop-blur-xl sticky top-0 z-30">
      <div className="flex items-center gap-5">
        <button onClick={onBack} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-amber-400 transition-all"><ArrowLeft size={18} /></button>
        <div><h1 className="text-xl font-black text-white italic uppercase italic tracking-tighter">{lead?.name}</h1><p className="text-[10px] text-gray-500 font-bold uppercase mt-1 tracking-widest font-black">Ref ID: {lead?.id}</p></div>
      </div>
      <button className="px-6 py-2.5 bg-amber-500 text-black rounded-xl text-xs font-black shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all active:scale-95 hover:bg-amber-400"><CheckCircle2 size={16} /> Book Move</button>
    </header>
    <main className="p-8 space-y-8 animate-in slide-in-from-bottom-2 duration-500">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-[10px] font-black text-white uppercase tracking-widest">
         <div className="p-5 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3"><MapPin className="text-amber-500" size={18} /> Pickup: {lead?.origin}</div>
         <div className="p-5 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3"><MapPin className="text-amber-500" size={18} /> Delivery: {lead?.dest}</div>
         <div className="p-5 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3"><Calendar className="text-amber-500" size={18} /> Nov 24, 2023</div>
         <div className="p-5 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3"><Truck className="text-amber-500" size={18} /> 26ft Box</div>
      </div>
      <div className="bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 rounded-[40px] p-12 shadow-2xl">
        <h3 className="text-xl font-black mb-6 flex items-center gap-2 uppercase italic text-white"><DollarSign size={22} className="text-amber-500" /> Financial Snapshot</h3>
        <p className="text-[10px] font-bold text-amber-500/50 uppercase tracking-[0.3em] mb-1">Generated System Quote</p>
        <p className="text-7xl font-black text-white tracking-tighter">{lead?.quote}</p>
      </div>
    </main>
  </div>
);

/**
 * ==========================================
 * SUB-COMPONENT: SYSTEM CONFIG (AUDIT TOOL)
 * ==========================================
 */
const SettingsPage = () => {
  const [estCuFt, setEstCuFt] = useState(450);
  const [actCuFt, setActCuFt] = useState(485);
  
  const variance = actCuFt - estCuFt;
  const variancePercent = estCuFt > 0 ? ((variance / estCuFt) * 100).toFixed(1) : 0;

  return (
    <div className="h-full bg-[#050505] text-white flex flex-col font-sans animate-in fade-in duration-500 overflow-y-auto">
      <div className="px-8 py-8 border-b border-white/5 bg-black/20 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-500/20 shadow-lg shadow-amber-500/10">
            <Sliders size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight uppercase italic text-white">System Configuration</h1>
            <p className="text-sm text-gray-500 mt-1 font-medium tracking-tight italic">Auditing MoveCalc™ Volumetric Logic.</p>
          </div>
        </div>
        <button className="bg-amber-500 hover:bg-amber-400 text-black px-8 py-3 rounded-xl text-xs font-black shadow-lg shadow-amber-500/20 transition-all active:scale-95">
           Update System Logic
        </button>
      </div>

      <div className="p-10 space-y-12 max-w-4xl mx-auto w-full pb-32">
        <div className="space-y-6">
          <div className="flex items-center gap-3 font-bold uppercase tracking-[0.2em] text-[10px] text-amber-500">
            <DollarSign size={14} /> Global Pricing Standards
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2 flex-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Base Service Fee</label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                <input className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 pl-8 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all" defaultValue="250.00" />
              </div>
            </div>
            <div className="space-y-2 flex-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-black">Rate per Cu.Ft</label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                <input className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 pl-8 pr-12 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all font-black" defaultValue="4.50" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-[10px] font-black uppercase tracking-widest">cu.ft</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6 pt-10 border-t border-white/5">
          <div className="flex items-center gap-3 font-bold uppercase tracking-[0.2em] text-[10px] text-amber-500">
            <Truck size={14} /> Volumetric Comparison Logic
          </div>
          
          <div className="grid grid-cols-2 gap-6 bg-white/[0.02] p-8 rounded-[32px] border border-white/5 shadow-2xl">
            <div className="space-y-2 flex-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cubic Feet Estimate</label>
              <div className="relative group">
                <input 
                  type="number" 
                  className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-5 text-lg font-black text-white focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all" 
                  value={estCuFt} 
                  onChange={(e) => setEstCuFt(Number(e.target.value))} 
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 text-[10px] font-black uppercase tracking-widest">Quoted</span>
              </div>
            </div>
            <div className="space-y-2 flex-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cubic Feet Actual</label>
              <div className="relative group">
                <input 
                  type="number" 
                  className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-5 text-lg font-black text-white focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all" 
                  value={actCuFt} 
                  onChange={(e) => setActCuFt(Number(e.target.value))} 
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-amber-500 text-[10px] font-black uppercase tracking-widest">Onsite</span>
              </div>
            </div>
          </div>

          {/* Automated Variance Difference (THE CORE AUDIT TOOL) */}
          <div className="bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 rounded-[40px] p-8 flex items-center justify-between shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <TrendingUp size={120} />
            </div>
            <div className="flex items-center gap-6 relative z-10">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${variance >= 0 ? 'bg-amber-500 text-black shadow-amber-500/20' : 'bg-emerald-500 text-black shadow-emerald-500/20'}`}>
                <ArrowRightLeft size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Automated Volume Variance</p>
                <p className="text-3xl font-black text-white mt-1">
                  {variance > 0 ? `+${variance}` : variance} <span className="text-sm font-medium text-gray-500 tracking-normal ml-1">cubic feet difference</span>
                </p>
              </div>
            </div>
            <div className="text-right relative z-10">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">Margin Impact</p>
              <div className={`flex items-center justify-end gap-1 font-black text-2xl ${variance >= 0 ? 'text-amber-500' : 'text-emerald-400'}`}>
                <TrendingUp size={20} />
                {variancePercent}%
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-8 bg-white/[0.02] border border-white/5 rounded-3xl flex gap-4">
           <Info className="text-amber-500 shrink-0" size={20} />
           <p className="text-xs text-gray-500 leading-relaxed font-medium italic">
             Note: Consistent variances above 5% signal a need to recalibrate your Lead Magnet's inventory weights in the Configuration database.
           </p>
        </div>
      </div>
    </div>
  );
};

/**
 * ==========================================
 * MAIN APPLICATION WRAPPER (MASTER SWITCHER)
 * ==========================================
 */
export default function App() {
  const [view, setView] = useState('dashboard');
  const [selectedLead, setSelectedLead] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // LOGIC: Screen Swapper
  const renderView = () => {
    if (selectedLead) return <LeadDetail lead={selectedLead} onBack={() => setSelectedLead(null)} />;
    switch (view) {
      case 'dashboard': return <BackOfficeDashboard />;
      case 'inbox': return <LeadInbox onSelectLead={setSelectedLead} />;
      case 'settings': return <SettingsPage />;
      default: return <BackOfficeDashboard />;
    }
  };

  const NavButton = ({ id, icon: Icon, label }) => {
    const isActive = view === id && !selectedLead;
    return (
      <button 
        onClick={() => { setView(id); setSelectedLead(null); }}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
          isActive 
          ? 'bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)] font-black scale-[1.02]' 
          : 'text-gray-400 hover:bg-white/5 hover:text-amber-400'
        }`}
      >
        <Icon size={20} className={isActive ? 'text-black' : 'group-hover:text-amber-400'} />
        <span className="text-[11px] font-black tracking-[0.1em] uppercase">{label}</span>
      </button>
    );
  };

  return (
    <div className="flex h-screen bg-[#050505] text-gray-100 font-sans overflow-hidden">
      
      {/* SIDEBAR NAVIGATION */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-black border-r border-white/5 p-6 transition-transform duration-500 lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between mb-12 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Truck size={22} className="text-black" />
            </div>
            <span className="font-black text-xl tracking-tight text-white uppercase italic tracking-tighter">MoveCalc<span className="text-amber-500">PRO</span></span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-gray-400 hover:text-amber-500"><X size={20} /></button>
        </div>

        <nav className="flex-1 space-y-2">
          <NavButton id="dashboard" icon={LayoutDashboard} label="Command Center" />
          <NavButton id="inbox" icon={Users} label="Lead Pipeline" />
          <NavButton id="calendar" icon={Calendar} label="Move Calendar" />
        </nav>

        <div className="mt-auto pt-8 border-t border-white/5">
          <NavButton id="settings" icon={SettingsIcon} label="System Config" />
          <div className="mt-6 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
             <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500 shadow-lg shadow-amber-500/20 flex items-center justify-center text-black font-black text-xs">AR</div>
                <div><p className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Alex Rivera</p><p className="text-[9px] text-gray-500 font-bold mt-1 uppercase">Admin Access</p></div>
             </div>
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-16 border-b border-white/5 px-8 flex items-center justify-between bg-black/40 backdrop-blur-md z-20">
          <div className="flex items-center gap-4 flex-1">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden text-gray-400 hover:text-white"><Menu size={20} /></button>
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-5 py-2 flex-1 max-w-md focus-within:border-amber-500/50 transition-all group shadow-lg">
              <Search size={16} className="text-gray-500 group-focus-within:text-amber-500" />
              <input type="text" placeholder="Search system database..." className="bg-transparent border-none text-xs w-full outline-none text-white placeholder:text-gray-700 font-medium tracking-tight" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button className="text-gray-500 hover:text-amber-400 transition-colors relative"><Bell size={20} /><span className="absolute top-0 right-0 w-2 h-2 bg-amber-500 rounded-full border-2 border-black" /></button>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-400 to-amber-600 shadow-lg shadow-amber-500/20 border border-white/10 active:scale-95 transition-transform" />
          </div>
        </header>

        <main className="flex-1 overflow-hidden relative">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

const ArrowLeft = ({ size }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 1