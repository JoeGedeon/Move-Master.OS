
import React from 'react';
import { 
  Users, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Search, 
  ChevronRight,
  Filter
} from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, trend }) => (
  <div className="bg-[#111111] border border-white/5 p-6 rounded-2xl group hover:border-blue-500/20 transition-all">
    <div className="flex justify-between items-start mb-4">
      <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400">
        <Icon size={20} />
      </div>
      <span className="text-[10px] font-bold text-emerald-400">{trend}</span>
    </div>
    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">{title}</p>
    <p className="text-2xl font-black text-white mt-1">{value}</p>
  </div>
);

export default function LeadInbox({ onSelectLead }) {
  const leads = [
    { id: 'LD-8821', name: 'James Peterson', move: 'Beverly Hills → NYC', date: 'Nov 24, 2023', quote: '$4,060', status: 'New' },
    { id: 'LD-8820', name: 'Sarah Miller', move: 'Chicago → Austin', date: 'Nov 28, 2023', quote: '$2,850', status: 'Contacted' },
    { id: 'LD-8819', name: 'Robert Chen', move: 'Miami → Seattle', date: 'Dec 02, 2023', quote: '$6,120', status: 'Booked' },
  ];

  return (
    <div className="h-full overflow-y-auto p-8 space-y-8 custom-scrollbar">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Lead Pipeline</h1>
          <p className="text-sm text-gray-500">Managing all incoming moving inquiries.</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 flex items-center gap-2 transition-all">
          <Plus size={16} /> Manual Lead
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Total Leads" value="1,248" icon={Users} trend="+12%" />
        <StatCard title="Pipeline Value" value="$142,500" icon={DollarSign} trend="+8%" />
        <StatCard title="Conv. Rate" value="22.4%" icon={CheckCircle2} trend="+2%" />
        <StatCard title="Active Jobs" value="18" icon={Clock} trend="+4" />
      </div>

      <div className="bg-[#111111] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
           <h3 className="font-bold text-sm uppercase tracking-widest text-gray-400">Recent Leads</h3>
           <div className="flex gap-2">
             <button className="p-2 text-gray-500 hover:text-white"><Filter size={16} /></button>
           </div>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] border-b border-white/5">
              <th className="px-6 py-4">Client Detail</th>
              <th className="px-6 py-4">Route</th>
              <th className="px-6 py-4">Target Date</th>
              <th className="px-6 py-4">Value</th>
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
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-black text-xs border border-blue-500/10">
                    {lead.name[0]}
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">{lead.name}</p>
                    <p className="text-[10px] text-gray-500">ID: {lead.id}</p>
                  </div>
                </td>
                <td className="px-6 py-5 text-sm text-gray-400 font-medium">{lead.move}</td>
                <td className="px-6 py-5 text-xs text-gray-500">{lead.date}</td>
                <td className="px-6 py-5 text-sm font-black text-white">{lead.quote}</td>
                <td className="px-6 py-5 text-right">
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg group-hover:bg-blue-600/20 group-hover:text-blue-400 transition-all">
                    <ChevronRight size={18} className="text-gray-600 group-hover:text-blue-400" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

