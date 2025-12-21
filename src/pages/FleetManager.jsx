import React from 'react';
import { Truck, AlertTriangle, CheckCircle, Tool } from 'lucide-react';

export default function FleetManager() {
  const trucks = [
    { id: 'T-101', name: '26ft Box Truck', status: 'Available', mileage: '45,000', lastService: '2025-11-15' },
    { id: 'T-102', name: '16ft Box Truck', status: 'In Service', mileage: '32,000', lastService: '2025-12-01' },
    { id: 'T-105', name: 'Packing Van', status: 'Maintenance', mileage: '88,000', lastService: '2025-10-20' },
  ];

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Available': return 'bg-green-600/20 text-green-400 border-green-600';
      case 'In Service': return 'bg-blue-600/20 text-blue-400 border-blue-600';
      case 'Maintenance': return 'bg-red-600/20 text-red-400 border-red-600';
      default: return 'bg-gray-600/20 text-gray-400 border-gray-600';
    }
  };

  return (
    <div className="p-8 bg-gray-900 min-h-screen text-white">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Fleet Manager</h1>
          <p className="text-gray-400">Track vehicle status and maintenance schedules</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
          <Truck size={20} /> Add Vehicle
        </button>
      </header>

      <div className="grid gap-6">
        {trucks.map((truck) => (
          <div key={truck.id} className="bg-gray-800 border border-gray-700 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center">
                <Truck className="text-blue-400" size={28} />
              </div>
              <div>
                <h3 className="text-lg font-bold">{truck.name}</h3>
                <p className="text-sm text-gray-500">ID: {truck.id} • Last Service: {truck.lastService}</p>
              </div>
            </div>

            <div className="flex gap-8">
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase">Mileage</p>
                <p className="font-semibold">{truck.mileage} mi</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase">Condition</p>
                <p className="font-semibold text-green-400">Good</p>
              </div>
            </div>

            <div className={`px-4 py-1.5 rounded-full border text-sm font-medium ${getStatusStyle(truck.status)}`}>
              {truck.status}
            </div>
            
            <button className="text-gray-400 hover:text-white p-2">
              <Tool size={20} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
