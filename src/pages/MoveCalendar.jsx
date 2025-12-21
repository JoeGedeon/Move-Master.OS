import React from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

export default function MoveCalendar() {
  // Static days for the UI layout
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Generating a dummy month grid (35 days)
  const days = Array.from({ length: 35 }, (_, i) => i + 1);

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">Move Calendar</h1>
          <p className="text-gray-400">Manage and schedule upcoming moves</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
          <Plus size={20} />
          New Move
        </button>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {/* Calendar Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold">December 2025</h2>
          <div className="flex gap-2">
            <button className="p-2 hover:bg-gray-700 rounded-lg"><ChevronLeft size={20} /></button>
            <button className="p-2 hover:bg-gray-700 rounded-lg"><ChevronRight size={20} /></button>
          </div>
        </div>

        {/* Days of Week */}
        <div className="grid grid-cols-7 bg-gray-750 border-b border-gray-700">
          {daysOfWeek.map(day => (
            <div key={day} className="p-3 text-center text-sm font-medium text-gray-400">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => (
            <div 
              key={i} 
              className="min-h-[120px] p-2 border-r border-b border-gray-700 hover:bg-gray-750 transition-colors"
            >
              <span className={`text-sm ${day > 31 ? 'text-gray-600' : 'text-gray-300'}`}>
                {day > 31 ? day - 31 : day}
              </span>
              
              {/* Example Move Entry */}
              {day === 15 && (
                <div className="mt-2 p-1.5 bg-blue-600/20 border border-blue-600 rounded text-[10px] text-blue-400">
                  Residential: Smith Family
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

