 import React from 'react';
import { Mail, Search, Filter, MoreVertical, Phone, MapPin } from 'lucide-react';

export default function LeadInbox() {
  const leads = [
    {
      id: 1,
      name: "Sarah Jenkins",
      type: "Residential Move",
      date: "2025-12-24",
      status: "New",
      email: "sarah.j@example.com",
      location: "Brooklyn, NY"
    },
    {
      id: 2,
      name: "TechCorp Office",
      type: "Commercial Move",
      date: "2026-01-05",
      status: "Quoted",
      email: "admin@techcorp.com",
      location: "Manhattan, NY"
    },
    {
      id: 3,
      name: "Michael Ross",
      type: "Storage-In",
      date: "2025-12-28",
      status: "Contacted",
      email: "m.ross@example.com",
      location: "Queens, NY"
    }
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'New': return 'bg-blue-600/20 text-blue-400 border-blue-600';
      case 'Quoted': return 'bg-green-600/20 text-green-400 border-green-600';
      case 'Contacted': return 'bg-yellow-600/20 text-yellow-400 border-yellow-600';
      default: return 'bg-gray-600/20 text-gray-400 border-gray-600';
    }
  };

  return (
    <div className="p-8 bg-gray-900 min-h-screen text-white">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Lead Inbox</h1>
        <p className="text-gray-400">Manage incoming move inquiries and follow-ups.</p>
      </header>

      {/* Action Bar */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input 
            type="text" 
            placeholder="Search leads..." 
            className="w-full bg-gray-800 border border-gray-700 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button className="flex items-center gap-2 bg-gray-800 border border-gray-700 px-4 py-2 rounded-lg hover:bg-gray-750 transition-colors">
          <Filter size={18} /> Filter
        </button>
      </div>

      {/* Leads Table/List */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-750 border-b border-gray-700">
              <tr>
                <th className="p-4 text-xs font-semibold uppercase text-gray-400">Client</th>
                <th className="p-4 text-xs font-semibold uppercase text-gray-400">Move Type</th>
                <th className="p-4 text-xs font-semibold uppercase text-gray-400">Move Date</th>
                <th className="p-4 text-xs font-semibold uppercase text-gray-400">Status</th>
                <th className="p-4 text-xs font-semibold uppercase text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-750 transition-colors group">
                  <td className="p-4">
                    <div className="font-medium text-white">{lead.name}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin size={12} /> {lead.location}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-gray-300">{lead.type}</td>
                  <td className="p-4 text-sm text-gray-300">{lead.date}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full border text-xs font-medium ${getStatusColor(lead.status)}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors">
                        <Phone size={16} />
                      </button>
                      <button className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors">
                        <Mail size={16} />
                      </button>
                      <button className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
