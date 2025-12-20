import React from 'react';
import { Users, DollarSign, CheckCircle2, Clock, Plus, ChevronRight } from 'lucide-react';

export default function LeadInbox({ onSelectLead }) {
  const leads = [
    { id: 'LD-8821', name: 'James Peterson', move: 'Beverly Hills → NYC', quote: '$4,060' },
    { id: 'LD-8820', name: 'Sarah Miller', move: 'Chicago → Austin', quote: '$2,850' },
  ];

  const Stat = ({ label, val, icon: Icon }) => (
    <div className="bg-[#111111] border border-white/5 p-6 rounded-2xl">
      <div className="p-2 w-fit mb-4 rounded-lg bg-amber-500/10 text-amber-500"><Icon size={18} /></div>
      <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-black text-white mt-1">{val}</p>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Active Pipeline</h1>
        <button className="bg-amber-500 text-black px-6 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all">
          <Plus size={16} /> New Lead
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Stat label="Total Leads" val="1,248" icon={Users} />
        <Stat label="Revenue" val="$142,500" icon={DollarSign} />
        <Stat label="Conversion" val="22.4%" icon={CheckCircle2} />
        <Stat label="Active Jobs" val="18" icon={Clock} />
      </div>
      <div className="bg-[#111111] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
        <table className="w-full text-left">
          <tbody className="divide-y divide-white/5">
            {leads.map((l) => (
              <tr key={l.id} onClick={() => onSelectLead(l)} className="group hover:bg-white/[0.02] cursor-pointer transition-all">
                <td className="px-6 py-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-black text-xs border border-amber-500/10">{l.name[0]}</div>
                  <div><p className="font-bold text-white group-hover:text-amber-500 transition-colors text-sm">{l.name}</p><p className="text-[10px] text-gray-500">ID: {l.id}</p></div>
                </td>
                <td className="px-6 py-5 text-sm text-gray-400">{l.move}</td>
                <td className="px-6 py-5 text-right"><ChevronRight size={18} className="inline text-gray-600 group-hover:text-amber-500 transition-all" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

