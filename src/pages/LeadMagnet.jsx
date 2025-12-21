import React, { useState } from 'react';
import { Package, ArrowRight } from 'lucide-react';
export default function LeadMagnet() {
  const [q, setQ] = useState(0);
  return (
    <div className="p-10 max-w-2xl mx-auto space-y-10 text-center">
      <h2 className="text-5xl font-black italic uppercase italic">Lead <span className="text-amber-500">Magnet</span></h2>
      <div className="bg-white/5 p-12 rounded-[50px] border border-white/10 space-y-8">
        <Package size={64} className="mx-auto text-amber-500" />
        <div className="space-y-2">
          <p className="text-gray-400 font-bold italic uppercase tracking-widest">How many boxes are you moving?</p>
          <input type="number" className="bg-transparent border-b-2 border-amber-500 text-6xl font-black text-center w-full outline-none" value={q} onChange={(e)=>setQ(e.target.value)} />
        </div>
        <button className="w-full bg-amber-500 text-black py-5 rounded-2xl font-black uppercase text-xl shadow-xl shadow-amber-500/20">Get My Quote <ArrowRight className="inline" /></button>
      </div>
    </div>
  );
}
