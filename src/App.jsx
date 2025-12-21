import React, { useState } from 'react';
// 1. Icon imports from lucide-react
import { 
  LayoutDashboard, 
  Users, 
  Truck, 
  Mail, 
  Settings as SettingsIcon, 
  Magnet,
  Calendar,
  ClipboardList,
  FileText
} from 'lucide-react';

// 2. Page component imports
import BackOfficeDashboard from './pages/BackOfficeDashboard';
import LeadInbox from './pages/LeadInbox';
import Settings from './pages/Settings';
import LeadMagnet from './pages/LeadMagnet';
import DriverLog from './pages/DriverLog';
import FleetManager from './pages/FleetManager';
import LeadDetail from './pages/LeadDetail';
import MoveCalendar from './pages/MoveCalendar';

export default function App() {
  // 3. State to manage which page is currently displayed
  const [view, setView] = useState('dashboard');

  // 4. Logic to determine which component to render
  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <BackOfficeDashboard />;
      case 'inbox':
        return <LeadInbox />;
      case 'settings':
        return <Settings />;
      case 'magnet':
        return <LeadMagnet />;
      case 'calendar':
        return <MoveCalendar />;
      case 'fleet':
        return <FleetManager />;
      case 'drivers':
        return <DriverLog />;
      default:
        return <BackOfficeDashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-black border-r border-gray-800 flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="font-bold text-white">M</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight">MoveMaster</h1>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <button 
            onClick={() => setView('dashboard')}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${view === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
          >
            <LayoutDashboard size={20} /> Dashboard
          </button>

          <button 
            onClick={() => setView('inbox')}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${view === 'inbox' ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
          >
            <Mail size={20} /> Inbox
          </button>

          <button 
            onClick={() => setView('magnet')}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${view === 'magnet' ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
          >
            <Magnet size={20} /> Lead Magnet
          </button>

          <button 
            onClick={() => setView('calendar')}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${view === 'calendar' ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
          >
            <Calendar size={20} /> Calendar
          </button>

          <div className="pt-4 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider px-3">
            Management
          </div>

          <button 
            onClick={() => setView('fleet')}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${view === 'fleet' ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
          >
            <Truck size={20} /> Fleet
          </button>

          <button 
            onClick={() => setView('drivers')}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${view === 'drivers' ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
          >
            <ClipboardList size={20} /> Driver Logs
          </button>

          <button 
            onClick={() => setView('settings')}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${view === 'settings' ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
          >
            <SettingsIcon size={20} /> Settings
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto bg-gray-900">
        {/* Executes the component rendering based on current state */}
        {renderView()}
      </main>
    </div>
  );
}
