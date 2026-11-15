import React, { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  label: string;
}

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  showPresets?: boolean;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  value,
  onChange,
  showPresets = true,
}) => {
  const { t, language } = useAuth();
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const getTodayStr = () => new Date().toISOString().split('T')[0];

  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };

  const getLast7DaysStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  };

  const getMonthStartStr = () => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  };

  const presets = [
    {
      id: 'today',
      label: t('today'),
      startDate: getTodayStr(),
      endDate: getTodayStr(),
    },
    {
      id: 'yesterday',
      label: t('yesterday'),
      startDate: getYesterdayStr(),
      endDate: getYesterdayStr(),
    },
    {
      id: 'last7Days',
      label: t('last7Days'),
      startDate: getLast7DaysStr(),
      endDate: getTodayStr(),
    },
    {
      id: 'thisMonth',
      label: t('thisMonth'),
      startDate: getMonthStartStr(),
      endDate: getTodayStr(),
    },
  ];

  const handleSelectPreset = (p: typeof presets[0]) => {
    setShowCustomPicker(false);
    onChange({
      startDate: p.startDate,
      endDate: p.endDate,
      label: p.label,
    });
  };

  const handleCustomStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = e.target.value;
    onChange({
      startDate: newStart,
      endDate: value.endDate >= newStart ? value.endDate : newStart,
      label: t('customDate'),
    });
  };

  const handleCustomEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = e.target.value;
    onChange({
      startDate: value.startDate <= newEnd ? value.startDate : newEnd,
      endDate: newEnd,
      label: t('customDate'),
    });
  };

  const isPresetActive = (p: typeof presets[0]) => {
    return value.startDate === p.startDate && value.endDate === p.endDate;
  };

  return (
    <div className="bg-[#111827] border-2 border-slate-700/80 rounded-2xl p-3.5 shadow-xl space-y-3">
      {/* Top row with Active Date Display & Custom Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-500/50 flex items-center justify-center text-teal-400 shadow-sm">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {language === 'hi' ? 'चयनित अवधि' : 'Selected Date'}
            </span>
            <p className="text-xs sm:text-sm font-black text-white font-mono mt-0.5">
              {value.startDate === value.endDate
                ? new Date(value.startDate).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                : `${new Date(value.startDate).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })} — ${new Date(value.endDate).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowCustomPicker(!showCustomPicker)}
          className={`px-3 py-1.5 rounded-xl border-2 text-xs font-black transition-all flex items-center gap-1.5 shadow-sm ${
            showCustomPicker
              ? 'bg-teal-600 text-white border-teal-400 shadow-teal-500/30'
              : 'bg-slate-800 text-slate-200 border-slate-700 hover:border-slate-500 hover:text-white'
          }`}
        >
          <span>{t('customDate')}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCustomPicker ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Preset Pills */}
      {showPresets && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {presets.map((p) => {
            const active = isPresetActive(p) && !showCustomPicker;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all shadow-sm ${
                  active
                    ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 font-black shadow-teal-500/30'
                    : 'bg-slate-800/90 border border-slate-700 text-slate-200 hover:text-white hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Custom Date Range Picker inputs */}
      {showCustomPicker && (
        <div className="pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              {language === 'hi' ? 'प्रारंभ तिथि (From Date)' : 'From Date'}
            </label>
            <input
              type="date"
              value={value.startDate}
              onChange={handleCustomStartChange}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border-2 border-slate-700 text-xs text-white focus:outline-none focus:border-teal-400 font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              {language === 'hi' ? 'अंतिम तिथि (To Date)' : 'To Date'}
            </label>
            <input
              type="date"
              value={value.endDate}
              onChange={handleCustomEndChange}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border-2 border-slate-700 text-xs text-white focus:outline-none focus:border-teal-400 font-mono"
            />
          </div>
        </div>
      )}
    </div>
  );
};
