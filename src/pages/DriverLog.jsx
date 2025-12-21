import React from 'react';
import { ClipboardList, User, Clock, MapPin } from 'lucide-react';

export default function DriverLog() {
  const logs = [
    { id: 1, driver: "Robert Wilson", status: "On Duty", shift: "8:00 AM - 4:00 PM", location: "En Route to Queens" },
    { id: 2, driver: "Maria Garcia", status: "Resting", shift: "10:00 AM - 6:00 PM", location: "Main Depot" }
  ];

  return (
    <div className="p-8 bg-gray-900 min-h-screen text-white">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Driver Logs</h1>
        <p className="text-gray-400">Track driver shifts and real-time status.</p>
      </header>

      <div className="grid gap-4">
        {logs.map(log => (
          <div key={log.id} className="bg-gray-800 border border-gray-700 p-5 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center">
                <User className="text-blue-500" size={20} />
              </div>
              <div>
                <h3 className="font-bold">{log.driver}</h3>
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <Clock size={14} /> {log.shift}
                </p>
              </div>
            </div>
            
            <div className="text-right">
              <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded-full border border-green-600 mb-2 inline-block">
                {log.status}
              </span>
              <p className="text-sm text-gray-400 flex items-center gap-1 justify-end">
                <MapPin size={14} /> {log.location}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

