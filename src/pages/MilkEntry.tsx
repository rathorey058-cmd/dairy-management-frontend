import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import { DateRangeFilter, type DateRange } from '../components/DateRangeFilter';
import { DirectMilkSaleModal } from '../components/DirectMilkSaleModal';
import { Droplets, Shield, HelpCircle, Save, CheckCircle2, SendHorizontal } from 'lucide-react';

interface FarmerObj {
  _id: string;
  farmerId: string;
  name: string;
  mobile: string;
  village: string;
  fatRate?: number;
}

interface RateRule {
  fat: number;
  snf?: number;
  rate: number;
}

interface RateChart {
  _id: string;
  pricingType: 'FAT_ONLY' | 'FAT_SNF' | 'FLAT' | 'MAWA_YIELD';
  cowRules: RateRule[];
  buffaloRules: RateRule[];
  mixedRules: RateRule[];
}

export const MilkEntry: React.FC = () => {
  useAuth();
  const [searchParams] = useSearchParams();
  
  // Data lists
  const [farmers, setFarmers] = useState<FarmerObj[]>([]);
  const [rateChart, setRateChart] = useState<RateChart | null>(null);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMilkSaleOpen, setIsMilkSaleOpen] = useState(false);

  const qDate = searchParams.get('date') || searchParams.get('startDate');
  const todayStr = new Date().toISOString().split('T')[0];
  const initialDate = qDate || todayStr;

  const [historyDateRange, setHistoryDateRange] = useState<DateRange>({
    startDate: initialDate,
    endDate: searchParams.get('endDate') || initialDate,
    label: initialDate === todayStr ? 'Today (आज)' : initialDate,
  });

  useEffect(() => {
    const paramDate = searchParams.get('date') || searchParams.get('startDate');
    if (paramDate) {
      setHistoryDateRange({
        startDate: paramDate,
        endDate: searchParams.get('endDate') || paramDate,
        label: paramDate === todayStr ? 'Today (आज)' : paramDate,
      });
      setDate(paramDate);
    }
    const paramFarmer = searchParams.get('farmerId');
    if (paramFarmer) {
      setSelectedFarmerId(paramFarmer);
    }
  }, [searchParams, todayStr]);

  // Form states
  const [selectedFarmerId, setSelectedFarmerId] = useState('');
  const [date, setDate] = useState(todayStr);
  const [shift, setShift] = useState<'Morning' | 'Evening'>('Morning');
  const [milkType, setMilkType] = useState<'Cow' | 'Buffalo' | 'Mixed'>('Cow');
  const [quantity, setQuantity] = useState('');
  const [fat, setFat] = useState('');
  const [snf, setSnf] = useState('');
  const [clr, setClr] = useState('');
  const [mawaYield, setMawaYield] = useState('');
  const [mawaRatePerKg, setMawaRatePerKg] = useState('300');
  const [notes, setNotes] = useState('');

  // Status states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadCollections = useCallback(async () => {
    try {
      const res = await API.get(`/milk/collections?startDate=${historyDateRange.startDate}&endDate=${historyDateRange.endDate}`);
      setRecentEntries(res.data || []);
    } catch (e) {
      console.error('Failed to load collections history', e);
    }
  }, [historyDateRange]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [farmersRes, rateChartsRes] = await Promise.all([
          API.get('/farmers'),
          API.get('/milk/rate-charts'),
        ]);
        setFarmers(farmersRes.data);
        if (rateChartsRes.data.length > 0) {
          setRateChart(rateChartsRes.data[0]); // Active rate chart
        }
      } catch (err) {
        console.error('Failed to load milk entry dependencies', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Client rate calculator logic
  const getEstimatedRate = (): number => {
    const selectedFarmer = farmers.find(f => f._id === selectedFarmerId);
    if (selectedFarmer && selectedFarmer.fatRate && selectedFarmer.fatRate > 0) {
      const fatVal = parseFloat(fat) || 0;
      return Math.round((fatVal * selectedFarmer.fatRate) * 100) / 100;
    }

    if (!rateChart) return 0;

    if (rateChart.pricingType === 'MAWA_YIELD') {
      const yieldVal = parseFloat(mawaYield) || 0;
      const mawaPrice = parseFloat(mawaRatePerKg) || 300;
      return Math.round(((yieldVal / 100) * mawaPrice) * 100) / 100;
    }

    if (!fat) return 0;
    const fatVal = parseFloat(fat);


    if (rateChart.pricingType === 'FLAT') {
      return rateChart.cowRules[0]?.rate || 0;
    }

    let rules: RateRule[] = [];
    if (milkType === 'Cow') rules = rateChart.cowRules;
    else if (milkType === 'Buffalo') rules = rateChart.buffaloRules;
    else rules = rateChart.mixedRules;

    if (!rules || rules.length === 0) return 0;

    if (rateChart.pricingType === 'FAT_ONLY') {
      const exactMatch = rules.find(r => Math.abs(r.fat - fatVal) < 0.01);
      if (exactMatch) return exactMatch.rate;

      const sorted = [...rules].sort((a, b) => a.fat - b.fat);
      if (fatVal <= sorted[0].fat) return sorted[0].rate;
      if (fatVal >= sorted[sorted.length - 1].fat) {
        const last = sorted[sorted.length - 1];
        const prev = sorted[sorted.length - 2];
        if (prev) {
          const fatDiff = last.fat - prev.fat;
          const rateDiff = last.rate - prev.rate;
          const scale = rateDiff / fatDiff;
          return Math.round((last.rate + (fatVal - last.fat) * scale) * 10) / 10;
        }
        return last.rate;
      }

      for (let i = 0; i < sorted.length - 1; i++) {
        if (fatVal >= sorted[i].fat && fatVal <= sorted[i + 1].fat) {
          const x0 = sorted[i].fat;
          const y0 = sorted[i].rate;
          const x1 = sorted[i + 1].fat;
          const y1 = sorted[i + 1].rate;
          return Math.round((y0 + (fatVal - x0) * (y1 - y0) / (x1 - x0)) * 10) / 10;
        }
      }
    }
    return rules[0]?.rate || 0;
  };

  const estimatedRate = getEstimatedRate();
  const estimatedAmount = estimatedRate * (parseFloat(quantity) || 0);

  const filteredFarmers = farmers.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.farmerId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pricingMode = rateChart?.pricingType || 'FAT_SNF';

    if (pricingMode === 'MAWA_YIELD') {
      if (!selectedFarmerId || !quantity || !mawaYield) {
        setErrorMsg('Please enter all required fields.');
        return;
      }
    } else if (pricingMode === 'FAT_ONLY') {
      if (!selectedFarmerId || !quantity || !fat) {
        setErrorMsg('Please enter all required fields.');
        return;
      }
    } else if (pricingMode === 'FLAT') {
      if (!selectedFarmerId || !quantity) {
        setErrorMsg('Please enter all required fields.');
        return;
      }
    } else {
      if (!selectedFarmerId || !quantity || !fat || !snf) {
        setErrorMsg('Please enter all required fields.');
        return;
      }
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);
    try {
      const payload: any = {
        farmerId: selectedFarmerId,
        date,
        shift,
        milkType,
        quantity: parseFloat(quantity),
        notes
      };

      if (pricingMode === 'MAWA_YIELD') {
        payload.mawaYield = parseFloat(mawaYield);
        payload.mawaRatePerKg = parseFloat(mawaRatePerKg);
      } else if (pricingMode === 'FAT_ONLY') {
        payload.fat = parseFloat(fat);
        payload.snf = 0;
      } else if (pricingMode === 'FLAT') {
        payload.fat = 0;
        payload.snf = 0;
      } else {
        payload.fat = parseFloat(fat);
        payload.snf = parseFloat(snf);
        if (clr) payload.clr = parseFloat(clr);
      }

      const res = await API.post('/milk/collections', payload);
      setSuccessMsg('Milk entry saved successfully!');
      
      // Update recent entries
      setRecentEntries([res.data, ...recentEntries].slice(0, 5));
      
      // Reset form variables
      setQuantity('');
      setFat('');
      setSnf('');
      setClr('');
      setMawaYield('');
      setNotes('');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to save entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500/20 border-t-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg relative">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary-500/40 to-transparent" />
        
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Droplets className="w-5 h-5 text-primary-400" />
            <span>New Milk Collection Entry</span>
          </h2>
          <button
            type="button"
            onClick={() => setIsMilkSaleOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-500 text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
          >
            <SendHorizontal className="w-3.5 h-3.5" />
            <span>+ Direct Milk Sale (सीधी बिक्री)</span>
          </button>
        </div>

        {successMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-900/50 flex gap-2.5 text-xs text-emerald-400 font-medium mb-4">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-900/50 flex gap-2.5 text-xs text-red-400 font-medium mb-4">
            <Shield className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Farmer Selection */}
          <div>
            <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
              Select Farmer
            </label>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Search farmer name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-dark-950/60 border border-dark-800 text-sm placeholder-dark-600 focus:outline-none focus:border-primary-500 text-white"
              />
              <select
                value={selectedFarmerId}
                onChange={(e) => setSelectedFarmerId(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-dark-950 border border-dark-800 text-sm text-white focus:outline-none focus:border-primary-500"
                required
              >
                <option value="">-- Choose Farmer --</option>
                {filteredFarmers.map((f) => (
                  <option key={f._id} value={f._id}>
                    [{f.farmerId}] {f.name} ({f.village})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Picker */}
          <div>
            <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
              Date (तारीख़)
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full sm:w-64 px-3.5 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          {/* Shift & Milk Type Pill Buttons */}
          <div className="space-y-3.5 pt-1">
            {/* Shift Pills */}
            <div>
              <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-2">
                Shift (शिफ्ट)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: 'Morning', label: 'Morning (सुबह)' },
                  { key: 'Evening', label: 'Evening (शाम)' }
                ].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setShift(s.key as any)}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                      shift === s.key
                        ? 'bg-teal-500 text-dark-950 font-black shadow-md shadow-teal-500/30'
                        : 'bg-dark-950 border border-dark-800 text-dark-300 hover:text-white hover:border-dark-700'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Milk Type Pills */}
            <div>
              <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-2">
                Milk Type (दूध का प्रकार)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: 'Buffalo', label: 'Buffalo (भैंस)' },
                  { key: 'Cow', label: 'Cow (गाय)' },
                  { key: 'Mixed', label: 'Mixed (मिक्स)' }
                ].map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMilkType(m.key as any)}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                      milkType === m.key
                        ? 'bg-teal-500 text-dark-950 font-black shadow-md shadow-teal-500/30'
                        : 'bg-dark-950 border border-dark-800 text-dark-300 hover:text-white hover:border-dark-700'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Qty, FAT, SNF, CLR / Mawa Yield Grid depending on pricing mode */}
          <div className="grid grid-cols-4 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                Qty (L)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="10.5"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-3 rounded-xl bg-dark-950 border border-dark-800 text-sm text-white focus:outline-none focus:border-primary-500"
                required
              />
            </div>

            {rateChart?.pricingType === 'MAWA_YIELD' && (
              <>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                    Mawa Yield (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="18.0"
                    value={mawaYield}
                    onChange={(e) => setMawaYield(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl bg-dark-950 border border-dark-800 text-sm text-white focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                    Mawa ₹/KG
                  </label>
                  <input
                    type="number"
                    placeholder="300"
                    value={mawaRatePerKg}
                    onChange={(e) => setMawaRatePerKg(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl bg-dark-950 border border-dark-800 text-sm text-white focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>
              </>
            )}

            {rateChart?.pricingType === 'FAT_ONLY' && (
              <div className="col-span-3">
                <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                  FAT (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="4.0"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl bg-dark-950 border border-dark-800 text-sm text-white focus:outline-none focus:border-primary-500"
                  required
                />
              </div>
            )}

            {rateChart?.pricingType === 'FAT_SNF' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                    FAT (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="4.0"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl bg-dark-950 border border-dark-800 text-sm text-white focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                    SNF (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="8.5"
                    value={snf}
                    onChange={(e) => setSnf(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl bg-dark-950 border border-dark-800 text-sm text-white focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                    CLR (opt)
                  </label>
                  <input
                    type="number"
                    placeholder="28"
                    value={clr}
                    onChange={(e) => setClr(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl bg-dark-950 border border-dark-800 text-sm text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
              </>
            )}
          </div>

          {/* Dynamic Rate Calculator Display */}
          {((rateChart?.pricingType === 'MAWA_YIELD' ? mawaYield : fat) || rateChart?.pricingType === 'FLAT') && (
            <div className="p-4 rounded-2xl bg-primary-950/40 border border-primary-900/50 flex justify-between items-center text-sm font-bold text-primary-400 shadow-inner">
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4" />
                Estimated Rate:
              </span>
              <div className="text-right">
                <span className="text-lg text-white">₹{estimatedRate.toFixed(2)}/L</span>
                {quantity && (
                  <p className="text-[10px] text-dark-400 font-medium -mt-0.5">
                    Total Amount: ₹{estimatedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
              Notes
            </label>
            <input
              type="text"
              placeholder="Any additional remarks..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary-600 to-emerald-500 text-sm font-bold text-white shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Saving Entry...' : 'Save Milk Entry'}</span>
          </button>
        </form>
      </div>

      {/* Milk Collections History & Date Range Filter */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-xs font-bold text-dark-400 uppercase tracking-wider">
            Milk Collections History
          </h3>
          <span className="text-[10px] font-bold text-teal-400 bg-teal-950 px-2 py-0.5 rounded-full border border-teal-800/60">
            {recentEntries.length} Records
          </span>
        </div>

        <DateRangeFilter value={historyDateRange} onChange={setHistoryDateRange} />

        <div className="space-y-2">
          {recentEntries.length === 0 ? (
            <p className="text-xs text-dark-500 text-center py-4 bg-dark-900 rounded-2xl border border-dark-800">
              No entries logged yet.
            </p>
          ) : (
            recentEntries.map((entry) => (
              <div
                key={entry._id}
                className="bg-dark-900 border border-dark-800 rounded-2xl p-3.5 flex justify-between items-center shadow-sm"
              >
                <div>
                  <h4 className="text-xs font-bold text-white">
                    {entry.farmer?.name || 'Farmer'} [{entry.farmer?.farmerId || ''}]
                  </h4>
                  <p className="text-[10px] text-dark-400 mt-0.5">
                    {entry.milkType} Milk • {entry.quantity} Ltr • {
                      entry.mawaYield !== undefined 
                        ? `Mawa: ${entry.mawaYield}%` 
                        : `FAT: ${entry.fat}%`
                    }
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-white">₹{entry.amount.toFixed(2)}</span>
                  <p className="text-[9px] text-dark-500 font-medium">₹{entry.rate}/L</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Direct Milk Sale Modal */}
      <DirectMilkSaleModal
        isOpen={isMilkSaleOpen}
        onClose={() => setIsMilkSaleOpen(false)}
      />
    </div>
  );
};
