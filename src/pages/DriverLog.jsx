import React, { useState, useRef } from 'react';
import { Camera, Truck, X, ArrowRight, FileText, CheckCircle2 } from 'lucide-react';

export default function DriverLog({ onBack }) {
  const [photos, setPhotos] = useState([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const startCamera = async () => {
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { console.error("Camera denied", err); }
  };

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      setPhotos([canvas.toDataURL('image/png'), ...photos]);
      stopCamera();
    }
  };

  const stopCamera = () => {
    videoRef.current?.srcObject?.getTracks().forEach(track => track.stop());
    setIsCameraOpen(false);
  };

  return (
    <div className="h-full bg-[#050505] text-white flex flex-col font-sans overflow-hidden">
      <header className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-black font-bold"><Truck size={20} /></div>
          <div><h1 className="text-xl font-black uppercase tracking-tight">Driver Command</h1><p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">Peterson #LD-8821</p></div>
        </div>
        <button onClick={onBack} className="text-sm font-bold text-gray-400 hover:text-amber-500 transition-colors">Exit</button>
      </header>
      <main className="flex-1 overflow-y-auto p-8 space-y-8 animate-in fade-in duration-500">
        <div className="space-y-4">
          <h3 className="text-lg font-black flex items-center gap-2"><Camera size={20} className="text-amber-500" /> Site Inspection</h3>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
            <button onClick={startCamera} className="aspect-square bg-amber-500/5 border-2 border-dashed border-amber-500/30 rounded-3xl flex flex-col items-center justify-center text-amber-500 hover:bg-amber-500/10 transition-all">
              <Camera size={32} className="mb-2" /><span className="text-[10px] font-black uppercase">Capture</span>
            </button>
            {photos.map((p, i) => (
              <div key={i} className="relative aspect-square rounded-3xl overflow-hidden border border-white/10"><img src={p} className="w-full h-full object-cover" alt="Capture" /></div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
          <div className="bg-[#111111] border border-white/5 rounded-3xl p-6 space-y-4"><h3 className="font-bold flex items-center gap-2"><FileText size={18} className="text-amber-500" /> Digital BOL</h3><div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-sm font-medium">Bill of Lading #4421 - <span className="text-emerald-400 font-black">READY</span></div></div>
          <div className="bg-[#111111] border border-white/5 rounded-3xl p-6 space-y-4"><h3 className="font-bold flex items-center gap-2"><CheckCircle2 size={18} className="text-amber-500" /> Signature</h3><div className="h-32 bg-black border border-white/10 rounded-2xl flex items-center justify-center text-[10px] font-bold text-gray-700 uppercase tracking-widest">Sign Area</div></div>
        </div>
        <button className="w-full py-4 bg-amber-500 text-black font-black rounded-2xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-3 active:scale-[0.98] transition-transform">Complete Dispatch <ArrowRight size={20} /></button>
      </main>
      {isCameraOpen && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col">
          <div className="p-6 flex justify-between items-center bg-black/50 backdrop-blur-md"><h2 className="text-sm font-black uppercase text-amber-500 tracking-widest">Camera</h2><button onClick={stopCamera} className="p-2.5 bg-white/10 rounded-xl text-white hover:bg-white/20"><X size={20}/></button></div>
          <div className="flex-1 relative flex items-center justify-center bg-[#050505]"><video ref={videoRef} autoPlay playsInline className="max-h-full rounded-2xl shadow-2xl" /><canvas ref={canvasRef} className="hidden" /></div>
          <div className="p-10 flex flex-col items-center bg-black/80"><button onClick={takePhoto} className="w-20 h-20 rounded-full bg-white border-8 border-white/20 active:scale-90 transition-transform shadow-2xl" /></div>
        </div>
      )}
    </div>
  );
}


