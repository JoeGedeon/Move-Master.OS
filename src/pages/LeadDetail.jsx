import React from 'react';
import { User, Phone, MapPin, Calendar, Package, DollarSign, ArrowLeft } from 'lucide-react';

export default function LeadDetail() {
  return (
    <div className="p-8 bg-gray-900 min-h-screen text-white">
      {/* Header with Back Button */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-gray-800 rounded-lg text-gray-400">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white">Lead #4521</h1>
            <p className="text-gray-400 text-sm">Created on Dec 20, 2025</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-750">
            Archive
          </button>
          <button className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2">
            <DollarSign size={18} /> Send Quote
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Customer & Move Info */}
        <div className="lg:col-span-2 space-y-8">
          {/* Customer Info Card */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <User size={20} className="text-blue-500" /> Customer Information
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold">Full Name</p>
                <p className="text-lg">Johnathon Smith</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold">Phone Number</p>
                <p className="text-lg">(555) 123-4567</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-500 uppercase font-bold">Email Address</p>
                <p className="text-lg">jsmith.example@email.com</p>
              </div>
            </div>
          </div>

          {/* Move Logistics Card */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <MapPin size={20} className="text-red-500" /> Move Logistics
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-gray-750 rounded text-gray-400 text-xs font-bold w-16 text-center">FROM</div>
                <p className="text-gray-200">123 Maple Avenue, Brooklyn, NY 11201</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-gray-750 rounded text-gray-400 text-xs font-bold w-16 text-center">TO</div>
                <p className="text-gray-200">456 Palm Drive, Miami, FL 33101</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Inventory Summary */}
        <div className="space-y-8">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Package size={20} className="text-purple-500" /> Inventory Preview
            </h2>
            <ul className="space-y-3">
              <li className="flex justify-between text-gray-300 border-b border-gray-700 pb-2">
                <span>Beds (King/Queen)</span>
                <span className="font-bold">2</span>
              </li>
              <li className="flex justify-between text-gray-300 border-b border-gray-700 pb-2">
                <span>Large Sofa</span>
                <span className="font-bold">1</span>
              </li>
              <li className="flex justify-between text-gray-300 border-b border-gray-700 pb-2">
                <span>Dining Table</span>
                <span className="font-bold">1</span>
              </li>
              <li className="flex justify-between text-gray-300">
                <span>Boxes (Large)</span>
                <span className="font-bold">~45</span>
              </li>
            </ul>
          </div>

          {/* Appointment Status */}
          <div className="bg-blue-600/10 border border-blue-600/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="text-blue-500" size={20} />
              <span className="font-semibold text-blue-400">Scheduled Move Date</span>
            </div>
            <p className="text-2xl font-bold">Dec 28, 2025</p>
          </div>
        </div>
      </div>
    </div>
  );
}

