import React, { useState } from 'react';
import { Calculator, ArrowRight } from 'lucide-react';
import { sound } from '../../utils/soundEngine';

interface Props {
  onGoToEntry?: (fat: number, snf: number, milkType: string, qty: number) => void;
}

export const InstantRateCalculator: React.FC<Props> = ({ onGoToEntry }) => {
  const [milkType, setMilkType] = useState<'COW' | 'BUFFALO'>('BUFFALO');
  const [fat, setFat] = useState<number>(6.5);
  const [snf, setSnf] = useState<number>(9.0);
  const [quantity, setQuantity] = useState<number>(10);

  // Standard Formula: Rate = (FAT * BaseRate) + (SNF * SnfRate)
  // Cow base: ~₹7.20 / FAT, Buffalo: ~₹7.80 / FAT
  const baseFatRate = milkType === 'BUFFALO' ? 7.8 : 7.2;
  const calculatedRate = Math.round((fat * baseFatRate + snf * 1.5) * 10) / 10;
  const totalAmount = Math.round(calculatedRate * quantity * 10) / 10;

  const handleFatQuick = (val: number) => {
    sound.playClick();
    setFat(val);
  };

  const handleTypeChange = (type: 'COW' | 'BUFFALO') => {
    sound.playClick();
    setMilkType(type);
    if (type === 'COW') {
      setFat(4.0);
      setSnf(8.5);
    } else {
      setFat(6.5);
      setSnf(9.0);
    }
  };

  return (
    <div className="rounded-3xl p-5 bg-gradient-to-br from-[#151C2C] via-[#121724] to-[#0E131E] border border-cyan-500/30 shadow-2xl relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-md">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>त्वरित भाव कैलकुलेटर (Live Rate Tester)</span>
              <span className="px-2 py-0.2 rounded-full text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold">
                PRO
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">
              तुरंत FAT/SNF डालकर रेट व कुल हिसाब जांचें
            </p>
          </div>
        </div>

        {/* Milk Type Toggle */}
        <div className="flex items-center gap-1 p-1 bg-black/60 rounded-2xl border border-white/10">
          <button
            onClick={() => handleTypeChange('BUFFALO')}
            className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${
              milkType === 'BUFFALO'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🐃 भैंस (Buffalo)
          </button>
          <button
            onClick={() => handleTypeChange('COW')}
            className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${
              milkType === 'COW'
                ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🐄 गाय (Cow)
          </button>
        </div>
      </div>

      {/* Inputs & Quick FAT Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 mt-4 relative z-10 items-center">
        
        {/* Controls Column (7 cols) */}
        <div className="sm:col-span-7 space-y-3">
          
          {/* FAT Slider & Presets */}
          <div>
            <div className="flex justify-between items-center text-xs font-bold text-slate-300 mb-1">
              <span>फैट (FAT %):</span>
              <span className="text-sm font-black text-amber-400 font-mono">{fat.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="3.0"
              max="11.0"
              step="0.1"
              value={fat}
              onChange={(e) => setFat(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 mt-1.5">
              {[3.8, 4.5, 6.2, 7.0, 8.5].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleFatQuick(val)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all border ${
                    fat === val
                      ? 'bg-amber-400 text-black border-amber-300 shadow-sm'
                      : 'bg-black/40 text-slate-400 border-white/5 hover:text-white'
                  }`}
                >
                  {val}%
                </button>
              ))}
            </div>
          </div>

          {/* SNF Slider */}
          <div>
            <div className="flex justify-between items-center text-xs font-bold text-slate-300 mb-1">
              <span>एस.एन.एफ (SNF %):</span>
              <span className="text-sm font-black text-cyan-400 font-mono">{snf.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="7.5"
              max="10.5"
              step="0.1"
              value={snf}
              onChange={(e) => setSnf(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>

          {/* Quantity Input */}
          <div>
            <div className="flex justify-between items-center text-xs font-bold text-slate-300 mb-1">
              <span>मात्रा (Quantity Ltr):</span>
              <span className="text-sm font-black text-white font-mono">{quantity} L</span>
            </div>
            <div className="flex items-center gap-1.5">
              {[5, 10, 15, 20, 50].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { sound.playClick(); setQuantity(q); }}
                  className={`flex-1 py-1 rounded-xl text-xs font-mono font-bold transition-all border ${
                    quantity === q
                      ? 'bg-cyan-500 text-black border-cyan-400 font-black shadow-sm'
                      : 'bg-black/40 text-slate-400 border-white/5 hover:text-white'
                  }`}
                >
                  {q}L
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Big Output Column (5 cols) */}
        <div className="sm:col-span-5 p-4 rounded-2xl bg-black/60 border border-cyan-500/40 shadow-inner text-center flex flex-col justify-between min-h-[170px]">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              प्रति लीटर भाव (Rate/Ltr)
            </span>
            <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 font-mono mt-1">
              ₹{calculatedRate.toFixed(2)}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {milkType === 'BUFFALO' ? 'भैंस रेट' : 'गाय रेट'}
            </p>
          </div>

          <div className="py-2 my-1 border-t border-b border-white/10">
            <span className="text-[10px] text-slate-400 font-bold block">
              कुल भुगतान ({quantity} L):
            </span>
            <span className="text-xl font-black text-emerald-400 font-mono">
              ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {onGoToEntry && (
            <button
              type="button"
              onClick={() => {
                sound.playCashRegister();
                onGoToEntry(fat, snf, milkType, quantity);
              }}
              className="w-full py-1.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-1 shadow-md transition-all active:scale-95"
            >
              <span>+ सीधे संकलन में भरें</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
