import React, { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

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
      label: 'Today (आज)',
      startDate: getTodayStr(),
      endDate: getTodayStr(),
    },
    {
      label: 'Yesterday (कल)',
      startDate: getYesterdayStr(),
      endDate: getYesterdayStr(),
    },
    {
      label: 'Last 7 Days (7 दिन)',
      startDate: getLast7DaysStr(),
      endDate: getTodayStr(),
    },
    {
      label: 'This Month (महीना)',
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
      label: 'Custom Range',
    });
  };

  const handleCustomEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = e.target.value;
    onChange({
      startDate: value.startDate <= newEnd ? value.startDate : newEnd,
      endDate: newEnd,
      label: 'Custom Range',
    });
  };

  const isPresetActive = (p: typeof presets[0]) => {
    return value.startDate === p.startDate && value.endDate === p.endDate;
  };

  return (
    <div className="bg-dark-900 border border-dark-800 rounded-3xl p-3.5 shadow-md space-y-3">
      {/* Top row with Active Date Display & Custom Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-teal-950 border border-teal-800/60 flex items-center justify-center text-teal-400">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-dark-400">
              Selected Date Range
            </span>
            <p className="text-xs font-bold text-white">
              {value.startDate === value.endDate
                ? new Date(value.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                : `${new Date(value.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${new Date(value.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowCustomPicker(!showCustomPicker)}
          className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
            showCustomPicker
              ? 'bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-500/20'
              : 'bg-dark-950 text-dark-300 border-dark-800 hover:border-dark-700'
          }`}
        >
          <span>Custom Date</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCustomPicker ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Preset Pills */}
      {showPresets && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {presets.map((p) => {
            const active = isPresetActive(p) && !showCustomPicker;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => handleSelectPreset(p)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                  active
                    ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
                    : 'bg-dark-950 border border-dark-800 text-dark-400 hover:text-dark-200'
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
        <div className="pt-2 border-t border-dark-800/80 grid grid-cols-2 gap-2 animate-fadeIn">
          <div>
            <label className="block text-[9px] font-bold text-dark-400 uppercase tracking-wider mb-1">
              From Date (शुरुआती तारीख़)
            </label>
            <input
              type="date"
              value={value.startDate}
              onChange={handleCustomStartChange}
              className="w-full px-2.5 py-1.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-dark-400 uppercase tracking-wider mb-1">
              To Date (अंतिम तारीख़)
            </label>
            <input
              type="date"
              value={value.endDate}
              onChange={handleCustomEndChange}
              className="w-full px-2.5 py-1.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>
        </div>
      )}
    </div>
  );
};
