import React from 'react';
import { Package, TrendingUp, AlertCircle } from 'lucide-react';
import { sound } from '../../utils/soundEngine';

interface ProductItem {
  id: string;
  name: string;
  hindiName: string;
  emoji: string;
  stock: number;
  unit: string;
  pricePerUnit?: number;
  glowColor: string;
  bgGradient: string;
}

interface Props {
  stocks: {
    paneer: number;
    ghee: number;
    curd: number;
    cream: number;
    butter?: number;
    khoya?: number;
  };
  onNewBatchClick?: () => void;
}

export const RealisticProductCards: React.FC<Props> = ({ stocks, onNewBatchClick }) => {
  const products: ProductItem[] = [
    {
      id: 'paneer',
      name: 'Paneer',
      hindiName: 'ताज़ा मलाई पनीर',
      emoji: '🧀',
      stock: stocks.paneer || 0,
      unit: 'kg',
      pricePerUnit: 360,
      glowColor: 'border-amber-500/50 hover:border-amber-400',
      bgGradient: 'from-[#261E14] to-[#161B2B]',
    },
    {
      id: 'ghee',
      name: 'Desi Ghee',
      hindiName: 'दानेदार देसी घी',
      emoji: '🧈',
      stock: stocks.ghee || 0,
      unit: 'kg',
      pricePerUnit: 650,
      glowColor: 'border-orange-500/50 hover:border-orange-400',
      bgGradient: 'from-[#2A1D13] to-[#161B2B]',
    },
    {
      id: 'curd',
      name: 'Curd / Lassi',
      hindiName: 'मीठी लस्सी व दही',
      emoji: '🥛',
      stock: stocks.curd || 0,
      unit: 'L',
      pricePerUnit: 70,
      glowColor: 'border-sky-500/50 hover:border-sky-400',
      bgGradient: 'from-[#122234] to-[#161B2B]',
    },
    {
      id: 'cream',
      name: 'Fresh Cream',
      hindiName: 'गाढ़ी मलाई (क्रीम)',
      emoji: '🍨',
      stock: stocks.cream || 0,
      unit: 'kg',
      pricePerUnit: 320,
      glowColor: 'border-emerald-500/50 hover:border-emerald-400',
      bgGradient: 'from-[#122820] to-[#161B2B]',
    },
  ];

  return (
    <div className="rounded-3xl p-5 bg-gradient-to-br from-[#161D2E] via-[#121624] to-[#0D111A] border-2 border-teal-500/30 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-700/60">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-teal-500/20 border border-teal-400/50 flex items-center justify-center text-teal-300 shadow-md">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider">
              तैयार डेयरी उत्पाद स्टॉक (Finished Products)
            </h3>
            <p className="text-[10px] text-slate-400">
              प्लांट से प्रोसेस किया गया वास्तविक इन्वेंटरी स्टॉक
            </p>
          </div>
        </div>

        {onNewBatchClick && (
          <button
            onClick={() => {
              sound.playClick();
              onNewBatchClick();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white text-xs font-black shadow-md transition-all active:scale-95"
          >
            + नया बैच बनाएं
          </button>
        )}
      </div>

      {/* 4 Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {products.map((p) => {
          const isLow = p.stock <= 5;
          return (
            <div
              key={p.id}
              className={`relative rounded-2xl p-4 bg-gradient-to-b ${p.bgGradient} border-2 ${p.glowColor} transition-all duration-300 group hover:-translate-y-1 hover:shadow-2xl flex flex-col justify-between min-h-[150px] shadow-lg`}
            >
              {/* Top Row with 3D Icon & Unit Price */}
              <div className="flex items-start justify-between">
                <span className="text-3xl filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)] group-hover:scale-125 transition-transform duration-200">
                  {p.emoji}
                </span>
                {p.pricePerUnit && (
                  <span className="text-[10px] font-mono font-black text-white px-2 py-0.5 rounded-lg bg-black/60 border border-white/10">
                    ₹{p.pricePerUnit}/{p.unit}
                  </span>
                )}
              </div>

              {/* Title & Quantity */}
              <div className="mt-2.5">
                <h4 className="text-xs font-black text-white truncate">{p.hindiName}</h4>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{p.name}</p>

                <div className="flex items-baseline gap-1 mt-1.5">
                  <span className="text-2xl font-black text-white font-mono">
                    {p.stock.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs font-bold text-slate-400">{p.unit}</span>
                </div>
              </div>

              {/* Status Badge */}
              <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[10px]">
                {isLow ? (
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>कम स्टॉक</span>
                  </span>
                ) : (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>उपलब्ध</span>
                  </span>
                )}
                <span className="text-slate-400 font-mono font-bold">In Stock</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
