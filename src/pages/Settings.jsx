import React, { useState } from 'react';
import { ArrowRightLeft, TrendingUp, Sliders } from 'lucide-react';
export default function Settings() {
  const [est, setEst] = useState(450);
  const [act, setAct] = useState(485);
  const variance = act - est;
  const impact = est > 0 ? ((variance / est) * 100).toFixed(1) : 0;
  return (
    <div className="p-10 space-y-12 animate-in fade-in duration-700">
      <div className="flex items-center gap-4"><div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-500/20"><Sliders size={24} /></div><h1 className="text-2xl font-black italic uppercase">Audit Configuration</h1></div>
      <div className="max-w-4xl space-y-8">
        <div className="grid grid-cols-2 gap-6 bg-white/[0.02] p-8 rounded-[40px] border border-white/5">
          <div className="space-y-2"><label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sale Estimate (ft³)</label><input type="number" className="w-full bg-black border border-white/10 rounded-2xl py-5 px-6 text-xl font-black text-white" value={est} onChange={(e)=>setEst(Number(e.target.value))} /></div>
          <div className="space-y-2"><label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Actual Onsite (ft³)</label><input type="number" className="w-full bg-black border border-white/10 rounded-2xl py-5 px-6 text-xl font-black text-white" value={act} onChange={(e)=>setAct(Number(e.target.value))} /></div>
        </div>
        <div className="bg-amber-500 text-black rounded-[40px] p-10 flex items-center justify-between shadow-xl shadow-amber-500/20">
          <div className="flex items-center gap-6"><ArrowRightLeft size={32} /><div><p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Volume Variance</p><p className="text-4xl font-black">{variance > 0 ? `+${variance}` : variance} ft³</p></div></div>
          <div className="text-right"><p className="text-[10px] font-black uppercase tracking-widest opacity-60">Impact</p><p className="text-3xl font-black">{impact}%</p></div>
        </div>
      </div>
    </div>
  );
}
