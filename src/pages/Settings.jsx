import React from 'react';
import { Save, Bell, Lock, User, Globe } from 'lucide-react';

export default function Settings() {
  return (
    <div className="p-8 bg-gray-900 min-h-screen text-white">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-400">Manage your account preferences and system configurations.</p>
      </header>

      <div className="max-w-4xl space-y-6">
        {/* Profile Section */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-6 border-b border-gray-700 pb-4">
            <User className="text-blue-500" size={24} />
            <h2 className="text-xl font-semibold">Account Profile</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Company Name</label>
              <input type="text" defaultValue="MoveMaster OS" className="w-full bg-gray-900 border border-gray-700 rounded px-4 py-2 outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Support Email</label>
              <input type="email" defaultValue="admin@movemaster.os" className="w-full bg-gray-900 border border-gray-700 rounded px-4 py-2 outline-none focus:border-blue-500" />
            </div>
          </div>
        </div>

        {/* System Settings */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-6 border-b border-gray-700 pb-4">
            <Globe className="text-green-500" size={24} />
            <h2 className="text-xl font-semibold">System Preferences</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Dark Mode</p>
                <p className="text-sm text-gray-500">Enable high-contrast dark interface</p>
              </div>
              <div className="w-12 h-6 bg-blue-600 rounded-full relative">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold transition-colors">
          <Save size={20} /> Save Changes
        </button>
      </div>
    </div>
  );
}
