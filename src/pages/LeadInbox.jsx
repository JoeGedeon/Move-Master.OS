import React from 'react';
import { 
  Users, DollarSign, CheckCircle2, Clock, Plus, ChevronRight, Filter 
} from 'lucide-react';

const StatCard = ({ title, value, icon: Icon }) => (
  <div className="bg-[#111111] border border-white/5 p-6 rounded-2xl hover:border-amber-500/20 transition-all">
    <div className="p-2 w-fit mb-4 rounded-lg bg-amber-500/10 text-amber-500"><Icon size={18} /></div>
    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">{title}</p>
    <p className="text-2xl font-black text-white mt-1">{value}</p>
  </div>
);

export default function LeadInbox({ onSelectLead }) {
  const leads = [
    { id: 'LD-8821', name: 'James Peterson', move: 'Beverly Hills → NYC', quote: '$4,060' },
    { id: 'LD-8820', name: 'Sarah Miller', move: 'Chicago → Austin', quote: '$2,850' },
    { id: 'LD-8819', name: 'Robert Chen', move: 'Miami → Seattle', quote: '$6,120' },
  ];

  return (
    <div className="h-full overflow-y-auto p-8 space-y-8 custom-scrollbar">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Lead Pipeline</h1>
        <button className="bg-amber-500 hover:bg-amber-400 text-black px-6 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all">
          <Plus size={16} /> New Lead
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Total Leads" value="1,248" icon={Users} />
        <StatCard title="Pipeline Value" value="$142,500" icon={DollarSign} />
        <StatCard title="Conv. Rate" value="22.4%" icon={CheckCircle2} />
        <StatCard title="Active Jobs" value="18" icon={Clock} />
      </div>

      <div className="bg-[#111111] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
           <h3 className="font-bold text-sm uppercase tracking-widest text-gray-400">Recent Activity</h3>
           <button className="p-2 text-gray-500 hover:text-amber-500"><Filter size={16} /></button>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10px] font-black text-gray-600 uppercase tracking-widest border-b border-white/5">
              <th className="px-6 py-4">Client</th>
              <th className="px-6 py-4">Route</th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {leads.map((lead) => (
              <tr 
                key={lead.id} 
                onClick={() => onSelectLead(lead)} 
                className="group hover:bg-white/[0.02] cursor-pointer transition-all"
              >
                <td className="px-6 py-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-black text-xs border border-amber-500/10">{lead.name[0]}</div>
                  <div><p className="font-bold text-white group-hover:text-amber-500 transition-colors">{lead.name}</p><p className="text-[10px] text-gray-500">ID: {lead.id}</p></div>
                </td>
                <td className="px-6 py-5 text-sm text-gray-400 font-medium">{lead.move}</td>
                <td className="px-6 py-5 text-right"><ChevronRight size={18} className="inline text-gray-700 group-hover:text-amber-500 transition-all" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

