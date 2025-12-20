import React from 'react';
import { 
  MapPin, Calendar, Truck, User, Phone, Mail, CheckCircle2, Clock, 
  ArrowLeft, MoreHorizontal, Package, Home, Tv, Lightbulb, Waves, 
  Coffee, Bed, Armchair, ShieldCheck, FileText, DollarSign, ClipboardList
} from 'lucide-react';

const InfoCard = ({ label, value, icon: Icon }) => (
  <div className="bg-white/[0.03] border border-white/10 p-4 rounded-2xl flex items-start gap-4 hover:border-blue-500/30 transition-all group">
    <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
      <Icon size={18} />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em] mb-1">{label}</p>
      <p className="text-sm font-semibold text-white truncate">{value}</p>
    </div>
  </div>
);

const InventoryItem = ({ icon: Icon, label, count }) => (
  <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center text-center group hover:bg-blue-600/10 hover:border-blue-500/40 transition-all">
    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-blue-400 mb-3 transition-colors border border-white/5 group-hover:border-blue-500/30">
      <Icon size={22} />
    </div>
    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight mb-1 group-hover:text-gray-300 transition-colors">{label}</span>
    <span className="text-2xl font-black text-white">{count}</span>
  </div>
);

export default function LeadDetail({ onBack, lead }) {
  const inventoryItems = [
    { icon: Tv, label: "Television", count: 2 },
    { icon: Bed, label: "King Bed", count: 1 },
    { icon: Armchair, label: "Sectional", count: 1 },
    { icon: Lightbulb, label: "Floor Lamp", count: 4 },
    { icon: Coffee, label: "Dining Table", count: 1 },
    { icon: Waves, label: "Washer/Dryer", count: 2 },
    { icon: Home, label: "Armchairs", count: 2 },
    { icon: Package, label: "Large Boxes", count: 11 },
  ];

  return (
    <div className="h-full bg-[#050505] text-gray-100 font-sans overflow-y-auto custom-scrollbar">
      <header className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-black/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="flex items-center gap-5">
          <button onClick={onBack} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white transition-all hover:bg-white/10">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-black tracking-tight text-white">{lead?.name || 'James Peterson'}</h1>
              <span className="bg-blue-500/10 text-blue-400 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest border border-blue-500/20">
                New Lead
              </span>
            </div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Ref ID: {lead?.id || 'LD-8821'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="px-6 py-2.5 bg-blue-600 rounded-xl text-xs font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2">
            <CheckCircle2 size={16} />
            Convert to Booking
          </button>
          <button className="p-2.5 text-gray-500 hover:text-white transition-colors">
            <MoreHorizontal size={20} />
          </button>
        </div>
      </header>

      <main className="p-8">
        <div className="max-w-[1500px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-8 space-y-8 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoCard label="Pickup Location" value="90210 - Beverly Hills, CA" icon={MapPin} />
              <InfoCard label="Delivery Location" value="10001 - New York, NY" icon={MapPin} />
              <InfoCard label="Target Date" value="Nov 24, 2023" icon={Calendar} />
              <InfoCard label="Estimated Crew" value="26ft Truck + 3 Experts" icon={Truck} />
            </div>

            <div className="bg-white/[0.01] border border-white/5 rounded-3xl p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black tracking-tight">Detailed Inventory</h3>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                  24 Total Items
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {inventoryItems.map((item, idx) => (
                  <InventoryItem key={idx} icon={item.icon} label={item.label} count={item.count} />
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-600/10 to-transparent border border-blue-500/20 rounded-3xl p-8 relative overflow-hidden group">
              <h3 className="text-xl font-black mb-8 flex items-center gap-2">
                <DollarSign size={22} className="text-blue-500" />
                Quote Analysis
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
                <div className="space-y-4">
                  <div className="flex justify-between text-sm"><span className="text-gray-400 font-medium">Base Linehaul (2,790 mi)</span><span className="text-white font-bold">$2,450.00</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-400 font-medium">Volumetric Surcharge</span><span className="text-white font-bold">$1,210.00</span></div>
                  <div className="h-px bg-white/10 my-4" />
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">Estimated Total</p>
                  <p className="text-5xl font-black text-white tracking-tighter">$4,060.00</p>
                </div>
                <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                  <p className="text-[11px] text-gray-500 leading-relaxed italic">
                    Note: Multiplier applied to the volumetric base. Optimized for T-04 fleet routing.
                  </p>
                  <button className="w-full mt-4 py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                    <FileText size={14} /> Generate PDF Quote
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="bg-[#111111] border border-white/5 rounded-3xl p-6">
               <h3 className="font-bold text-white mb-6">Client Profile</h3>
               <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-xl font-black shadow-lg">J</div>
                  <div>
                    <p className="font-bold text-lg text-white">{lead?.name || 'James Peterson'}</p>
                    <p className="text-[10px] text-blue-500 font-black uppercase tracking-widest">Residential</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex justify-between items-center text-sm font-medium">
                    <span><Phone size={14} className="inline mr-2 text-blue-400"/> 555-012-3456</span>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex justify-between items-center text-sm font-medium">
                    <span><Mail size={14} className="inline mr-2 text-blue-400"/> peterson@gmail.com</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#111111] border border-white/5 rounded-3xl p-6">
              <h3 className="font-bold text-white mb-6">Activity History</h3>
              <div className="space-y-8 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/10">
                <div className="relative pl-8"><div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-blue-600 border-4 border-[#111111] z-10" /><p className="text-xs font-bold text-white">Lead Generated</p><p className="text-[10px] text-gray-500 mt-0.5">Nov 20, 2023 • 10:42 AM</p></div>
                <div className="relative pl-8"><div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-gray-800 border-4 border-[#111111] z-10" /><p className="text-xs font-bold text-gray-400">Quote Email Sent</p><p className="text-[10px] text-gray-500 mt-0.5">Nov 20, 2023 • 10:43 AM</p></div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

