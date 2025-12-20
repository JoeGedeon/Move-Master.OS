
import React from 'react';
import { 
  MapPin, Calendar, Truck, CheckCircle2, ArrowLeft, Package, Tv, Lightbulb, Coffee, Bed, Armchair, DollarSign, ClipboardList 
} from 'lucide-react';

export default function LeadDetail({ onBack, lead }) {
  const inventory = [
    { icon: Tv, label: "Television", count: 2 },
    { icon: Bed, label: "King Bed", count: 1 },
    { icon: Armchair, label: "Sectional", count: 1 },
    { icon: Package, label: "Large Boxes", count: 11 },
  ];

  return (
    <div className="h-full bg-[#050505] text-gray-100 font-sans overflow-y-auto">
      <header className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-black/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="flex items-center gap-5">
          <button onClick={onBack} className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-amber-400 transition-all"><ArrowLeft size={18} /></button>
          <div><h1 className="text-xl font-black text-white">{lead?.name || 'Customer'}</h1><p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Ref ID: {lead?.id || 'LD-8821'}</p></div>
        </div>
        <button className="px-6 py-2.5 bg-amber-500 text-black rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 flex items-center gap-2"><CheckCircle2 size={16} /> Convert to Booking</button>
      </header>
      <main className="p-8 space-y-8 animate-in fade-in duration-500">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-bold text-white">
           <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3"><MapPin className="text-amber-500" size={18} /> Pickup: Beverly Hills</div>
           <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3"><MapPin className="text-amber-500" size={18} /> Delivery: New York</div>
           <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3"><Calendar className="text-amber-500" size={18} /> Nov 24, 2023</div>
           <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3"><Truck className="text-amber-500" size={18} /> 26ft Box Truck</div>
        </div>
        <div className="bg-white/[0.01] border border-white/5 rounded-3xl p-8">
          <h3 className="text-xl font-black mb-8 flex items-center gap-2"><ClipboardList size={20} className="text-amber-500" /> Itemized Inventory</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {inventory.map((item, idx) => (
              <div key={idx} className="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col items-center group">
                <item.icon className="text-gray-500 group-hover:text-amber-500 mb-2" size={20} />
                <span className="text-[10px] font-bold text-gray-500 uppercase">{item.label}</span>
                <span className="text-xl font-black text-white">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 rounded-3xl p-10">
          <h3 className="text-xl font-black mb-6 flex items-center gap-2"><DollarSign size={22} className="text-amber-500" /> Financial Snapshot</h3>
          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Estimated Total Quote</p>
          <p className="text-6xl font-black text-white tracking-tighter">{lead?.quote || '$4,060.00'}</p>
        </div>
      </main>
    </div>
  );
}

