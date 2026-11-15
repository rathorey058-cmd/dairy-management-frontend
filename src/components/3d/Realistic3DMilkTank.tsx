import React from 'react';
import { Droplets, Activity, Thermometer, ShieldCheck, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { sound } from '../../utils/soundEngine';

interface Realistic3DMilkTankProps {
  remainingLiters: number;
  totalCapacity?: number;
  temperature?: number;
  tankName?: string;
  procuredToday?: number;
  dispatchedToday?: number;
  onOpenProduction?: () => void;
}

export const Realistic3DMilkTank: React.FC<Realistic3DMilkTankProps> = ({
  remainingLiters,
  totalCapacity = 5000,
  temperature = 3.8,
  tankName = "CHILLING SILO #01 (SS-316L)",
  procuredToday = 0,
  dispatchedToday = 0,
  onOpenProduction,
}) => {
  const fillPercentage = Math.min(100, Math.max(5, Math.round((remainingLiters / totalCapacity) * 100)));

  return (
    <div className="rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-[#161D2E] via-[#121624] to-[#0D111A] border-2 border-cyan-500/40 shadow-2xl relative overflow-hidden">
      {/* Dynamic ambient lights */}
      <div className="absolute -top-20 -left-20 w-56 h-56 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-56 h-56 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700/60 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-900/50">
            <Droplets className="w-5 h-5 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono">
                {tankName}
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>3D SCADA LIVE</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              चिलिंग प्लांट टैंक स्टॉक • लाइव लेवल गेज व तापमान
            </p>
          </div>
        </div>

        {/* Telemetry Status Badges */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="px-3 py-1.5 rounded-xl bg-black/60 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-black flex items-center gap-1.5 shadow-inner">
            <Thermometer className="w-4 h-4 text-cyan-400" />
            <span>{temperature.toFixed(1)}°C Chilled</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-black/60 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-black flex items-center gap-1.5 shadow-inner">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>AGITATOR 100%</span>
          </div>
        </div>
      </div>

      {/* Body Section */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mt-5 items-center relative z-10">
        
        {/* LEFT: Futuristic Circular SCADA Fluid Chamber (5 cols) */}
        <div className="md:col-span-5 flex flex-col items-center justify-center">
          <div className="relative w-48 h-48 rounded-full p-2 bg-gradient-to-tr from-slate-700 via-slate-800 to-slate-900 border-4 border-cyan-500/50 shadow-[0_0_40px_rgba(6,182,212,0.25),inset_0_0_20px_rgba(0,0,0,0.8)] flex items-center justify-center overflow-hidden">
            
            {/* Outer Circular Scale Ticks */}
            <div className="absolute inset-1 rounded-full border border-dashed border-cyan-400/40 pointer-events-none" />

            {/* Liquid Milk Fluid Chamber with Wave */}
            <div className="relative w-full h-full rounded-full overflow-hidden bg-slate-950 flex flex-col justify-end">
              
              {/* Animated Creamy Milk Liquid */}
              <div 
                className="w-full bg-gradient-to-t from-white via-slate-100 to-amber-50 relative transition-all duration-1000 shadow-lg"
                style={{ height: `${fillPercentage}%` }}
              >
                {/* Wave Crest */}
                <div className="absolute top-0 left-0 right-0 h-4 -mt-2 overflow-hidden pointer-events-none opacity-90">
                  <div className="w-[200%] h-full animate-milk-wave flex">
                    <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-full fill-white">
                      <path d="M0,0 C150,90 350,-40 500,50 C650,140 900,-20 1200,40 L1200,120 L0,120 Z"></path>
                    </svg>
                    <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-full fill-white">
                      <path d="M0,0 C150,90 350,-40 500,50 C650,140 900,-20 1200,40 L1200,120 L0,120 Z"></path>
                    </svg>
                  </div>
                </div>

                {/* Shimmer on Milk */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent pointer-events-none" />
              </div>

              {/* Glossy Glass Reflection Overlay */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/10 to-white/20 pointer-events-none border border-white/20" />

              {/* Center Reading Hologram */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20">
                <span className="text-3xl font-black text-slate-900 drop-shadow-[0_2px_4px_rgba(255,255,255,0.8)] font-mono">
                  {fillPercentage}%
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-800 bg-white/80 px-2 py-0.5 rounded-full shadow-sm mt-0.5">
                  FILLED
                </span>
              </div>
            </div>

          </div>
          <span className="text-[11px] font-bold text-slate-400 mt-2 font-mono">
            {remainingLiters.toLocaleString('en-IN')} L / {totalCapacity.toLocaleString('en-IN')} L
          </span>
        </div>

        {/* RIGHT: High-Contrast Telemetry, Tank Volume & Flow Metrics (7 cols) */}
        <div className="md:col-span-7 space-y-4">
          
          {/* Main Huge Reading Display */}
          <div className="p-4 rounded-2xl bg-black/70 border border-slate-700/80 shadow-inner">
            <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
              <span>उपलब्ध चिलिंग दूध (Available Chilled Milk)</span>
              <span className="text-cyan-400 font-mono font-bold">CAPACITY: {totalCapacity.toLocaleString('en-IN')} L</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-4xl sm:text-5xl font-black text-white tracking-tight font-mono">
                {remainingLiters.toLocaleString('en-IN')}
              </span>
              <span className="text-lg font-bold text-cyan-400">लीटर (Litres)</span>
            </div>

            {/* Glowing Progress Bar */}
            <div className="w-full h-3.5 rounded-full bg-slate-900 border border-slate-700 mt-3 p-0.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 transition-all duration-1000 shadow-md relative"
                style={{ width: `${fillPercentage}%` }}
              >
                <div className="absolute inset-0 shimmer-chrome" />
              </div>
            </div>

            <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono mt-1.5">
              <span>0 L (खाली)</span>
              <span className="text-emerald-400 font-bold">{fillPercentage}% भरा हुआ</span>
              <span>{totalCapacity.toLocaleString('en-IN')} L (फुल)</span>
            </div>
          </div>

          {/* Quick Flow Inflow/Outflow Pills */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-[#141B2B] border border-blue-500/40 flex items-center gap-3 shadow-md">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/50 flex items-center justify-center text-blue-400 shrink-0">
                <ArrowDownRight className="w-5 h-5" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider block">आज आवक (+)</span>
                <span className="text-base font-black text-white font-mono">+{procuredToday} L</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#141B2B] border border-purple-500/40 flex items-center gap-3 shadow-md">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/50 flex items-center justify-center text-purple-400 shrink-0">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider block">उत्पादन/बिक्री (-)</span>
                <span className="text-base font-black text-purple-300 font-mono">-{dispatchedToday} L</span>
              </div>
            </div>
          </div>

          {/* Action Trigger */}
          {onOpenProduction && (
            <button
              onClick={() => {
                sound.playClick();
                onOpenProduction();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 transition-all active:scale-95"
            >
              <Activity className="w-4 h-4" />
              <span>प्लांट में दूध ट्रांसफर / नया बैच शुरू करें</span>
            </button>
          )}

        </div>

      </div>
    </div>
  );
};
