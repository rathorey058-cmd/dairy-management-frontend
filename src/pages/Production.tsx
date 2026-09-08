import React, { useEffect, useState, useCallback } from 'react';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  Factory, ArrowRight, RefreshCw, CheckCircle2, 
  AlertCircle, History, Edit3, X, Save, TrendingUp, Sparkles,
  Droplets, Flame, Milk, Coffee, ChefHat
} from 'lucide-react';

interface LiveStockData {
  milk: { currentStock: number; procuredToday: number; directSoldToday: number; processedToday: number; unit: string };
  cream: { currentStock: number; unit: string };
  ghee: { currentStock: number; unit: string };
  paneer: { currentStock: number; unit: string };
  curd: { currentStock: number; unit: string };
  butter: { currentStock: number; unit: string };
  khoya: { currentStock: number; unit: string };
}

interface ConversionLog {
  _id: string;
  conversionType: string;
  date: string;
  inputMaterial: string;
  inputQuantity: number;
  inputUnit: string;
  outputProduct: string;
  outputQuantity: number;
  outputUnit: string;
  yieldPercent: number;
  byProduct?: { name: string; quantity: number; unit: string };
  notes?: string;
  operator?: { name: string };
}

const PRESET_CONVERSIONS = [
  {
    id: 'CREAM_TO_GHEE',
    label: 'Cream ➔ Ghee (क्रीम से घी)',
    inputName: 'Cream / Malai (क्रीम/मलाई)',
    inputUnit: 'KG',
    outputName: 'Desi Ghee (देसी घी)',
    outputUnit: 'KG',
    defaultYieldRatio: 0.8, // ~80%
    icon: Flame,
    color: 'amber'
  },
  {
    id: 'MILK_TO_PANEER',
    label: 'Milk ➔ Paneer (दूध से पनीर)',
    inputName: 'Raw Milk (कच्चा दूध)',
    inputUnit: 'Litre',
    outputName: 'Fresh Paneer (पनीर)',
    outputUnit: 'KG',
    defaultYieldRatio: 0.2, // ~20%
    icon: ChefHat,
    color: 'teal'
  },
  {
    id: 'MILK_TO_LASSI',
    label: 'Milk ➔ Lassi (दूध से लस्सी/छाछ)',
    inputName: 'Raw Milk (कच्चा दूध)',
    inputUnit: 'Litre',
    outputName: 'Lassi / Buttermilk (लस्सी)',
    outputUnit: 'Litre',
    defaultYieldRatio: 0.95, // ~95%
    icon: Droplets,
    color: 'blue'
  },
  {
    id: 'MILK_TO_CURD',
    label: 'Milk ➔ Dahi (दूध से दही)',
    inputName: 'Raw Milk (कच्चा दूध)',
    inputUnit: 'Litre',
    outputName: 'Curd / Dahi (दही)',
    outputUnit: 'KG',
    defaultYieldRatio: 0.98,
    icon: Milk,
    color: 'emerald'
  },
  {
    id: 'MILK_TO_CREAM',
    label: 'Milk ➔ Cream (दूध से मलाई निकालना)',
    inputName: 'Raw Milk (कच्चा दूध)',
    inputUnit: 'Litre',
    outputName: 'Cream / Malai (मलाई)',
    outputUnit: 'KG',
    defaultYieldRatio: 0.12,
    icon: Coffee,
    color: 'purple'
  },
  {
    id: 'MILK_TO_KHOYA',
    label: 'Milk ➔ Khoya/Mawa (दूध से मावा)',
    inputName: 'Raw Milk (कच्चा दूध)',
    inputUnit: 'Litre',
    outputName: 'Khoya / Mawa (मावा)',
    outputUnit: 'KG',
    defaultYieldRatio: 0.22,
    icon: Sparkles,
    color: 'rose'
  }
];

export const Production: React.FC = () => {
  useAuth();

  // Active view tab
  const [activeTab, setActiveTab] = useState<'convert' | 'history' | 'stock'>('convert');

  // Live stock
  const [liveStock, setLiveStock] = useState<LiveStockData | null>(null);
  const [conversions, setConversions] = useState<ConversionLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Conversion Form State
  const [selectedPresetId, setSelectedPresetId] = useState('CREAM_TO_GHEE');
  const [inputQty, setInputQty] = useState('');
  const [outputQty, setOutputQty] = useState('');
  const [conversionDate, setConversionDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [byProductName, setByProductName] = useState('');
  const [byProductQty, setByProductQty] = useState('');

  // Stock Adjust Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustCategory, setAdjustCategory] = useState('Ghee');
  const [adjustQty, setAdjustQty] = useState('');

  // Status
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedPreset = PRESET_CONVERSIONS.find(p => p.id === selectedPresetId) || PRESET_CONVERSIONS[0];

  const fetchLiveStockAndHistory = useCallback(async () => {
    try {
      const [stockRes, logsRes] = await Promise.all([
        API.get('/production/live-stock'),
        API.get('/production/conversions')
      ]);
      setLiveStock(stockRes.data);
      setConversions(logsRes.data || []);
    } catch (err) {
      console.error('Failed to load production data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveStockAndHistory();
  }, [fetchLiveStockAndHistory]);

  // Auto calculate expected output when input quantity changes
  const handleInputChange = (val: string) => {
    setInputQty(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      const estimatedOut = Math.round(num * selectedPreset.defaultYieldRatio * 10) / 10;
      setOutputQty(String(estimatedOut));
    } else {
      setOutputQty('');
    }
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = PRESET_CONVERSIONS.find(p => p.id === presetId);
    if (preset && inputQty) {
      const num = parseFloat(inputQty);
      if (!isNaN(num) && num > 0) {
        setOutputQty(String(Math.round(num * preset.defaultYieldRatio * 10) / 10));
      }
    }
  };

  const handleSaveConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const inNum = parseFloat(inputQty);
    const outNum = parseFloat(outputQty);

    if (isNaN(inNum) || inNum <= 0) {
      setErrorMsg('कृपया इनपुट माल की सही मात्रा (Input Qty) दर्ज करें।');
      return;
    }
    if (isNaN(outNum) || outNum <= 0) {
      setErrorMsg('कृपया तैयार माल की सही मात्रा (Output Qty) दर्ज करें।');
      return;
    }

    setSubmitting(true);
    try {
      await API.post('/production/convert', {
        conversionType: selectedPreset.id,
        date: conversionDate,
        inputMaterial: selectedPreset.inputName,
        inputQuantity: inNum,
        inputUnit: selectedPreset.inputUnit,
        outputProduct: selectedPreset.outputName,
        outputQuantity: outNum,
        outputUnit: selectedPreset.outputUnit,
        byProduct: byProductName && byProductQty ? {
          name: byProductName,
          quantity: parseFloat(byProductQty) || 0,
          unit: 'Litre'
        } : undefined,
        notes: notes.trim()
      });

      setSuccessMsg(`सफलतापूर्वक दर्ज किया: ${inNum} ${selectedPreset.inputUnit} से ${outNum} ${selectedPreset.outputUnit} ${selectedPreset.outputName} बना!`);
      setInputQty('');
      setOutputQty('');
      setNotes('');
      setByProductName('');
      setByProductQty('');
      await fetchLiveStockAndHistory();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'कन्वर्शन सेव करने में त्रुटि हुई।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenAdjust = (category: string, currentVal: number) => {
    setAdjustCategory(category);
    setAdjustQty(String(currentVal));
    setAdjustModalOpen(true);
  };

  const handleSaveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await API.post('/production/adjust-stock', {
        category: adjustCategory,
        newStock: parseFloat(adjustQty) || 0
      });
      setAdjustModalOpen(false);
      await fetchLiveStockAndHistory();
    } catch (err: any) {
      alert(err.response?.data?.message || 'स्टॉक अपडेट करने में त्रुटि हुई।');
    } finally {
      setSubmitting(false);
    }
  };

  const currentYield = (parseFloat(inputQty) > 0 && parseFloat(outputQty) > 0)
    ? Math.round((parseFloat(outputQty) / parseFloat(inputQty)) * 1000) / 10
    : 0;

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Factory className="w-6 h-6 text-teal-400" />
            <span>Production & Live Stock Hub</span>
          </h2>
          <p className="text-xs text-dark-400 font-medium mt-0.5">
            कच्चा दूध, मलाई, देसी घी, पनीर और लस्सी का सटीक लाइव स्टॉक व प्रोसेसिंग
          </p>
        </div>

        <button
          onClick={() => { setLoading(true); fetchLiveStockAndHistory(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-dark-900 border border-dark-800 text-xs font-bold text-dark-300 hover:text-white transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-400' : ''}`} />
          <span>रिफ्रेश करें</span>
        </button>
      </div>

      {/* 1. Live Stock Inventory Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* Raw Milk */}
        <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-950/40 via-dark-900 to-dark-900 border border-blue-900/40 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">कच्चा दूध (Milk)</span>
            <Droplets className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-black text-white font-mono">
            {liveStock?.milk.currentStock ?? 0} <span className="text-xs font-bold text-dark-400">L</span>
          </div>
          <div className="text-[9px] text-dark-400 mt-1 flex justify-between">
            <span>आया: +{liveStock?.milk.procuredToday ?? 0}L</span>
            <span>बिका: -{liveStock?.milk.directSoldToday ?? 0}L</span>
          </div>
        </div>

        {/* Cream / Malai */}
        <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-950/40 via-dark-900 to-dark-900 border border-purple-900/40 relative overflow-hidden">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">मलाई (Cream)</span>
            <button 
              onClick={() => handleOpenAdjust('Cream', liveStock?.cream.currentStock ?? 0)}
              className="p-1 rounded bg-dark-800 text-dark-400 hover:text-purple-300"
              title="Adjust Cream Stock"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xl font-black text-white font-mono">
            {liveStock?.cream.currentStock ?? 0} <span className="text-xs font-bold text-dark-400">KG</span>
          </div>
          <p className="text-[9px] text-purple-400/80 mt-1 font-medium">घी बनाने के लिए स्टॉक</p>
        </div>

        {/* Desi Ghee */}
        <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-950/40 via-dark-900 to-dark-900 border border-amber-900/40 relative overflow-hidden">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">देसी घी (Ghee)</span>
            <button 
              onClick={() => handleOpenAdjust('Ghee', liveStock?.ghee.currentStock ?? 0)}
              className="p-1 rounded bg-dark-800 text-dark-400 hover:text-amber-300"
              title="Adjust Ghee Stock"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xl font-black text-white font-mono">
            {liveStock?.ghee.currentStock ?? 0} <span className="text-xs font-bold text-dark-400">KG</span>
          </div>
          <p className="text-[9px] text-amber-400/80 mt-1 font-medium">तैयार देसी घी</p>
        </div>

        {/* Paneer */}
        <div className="p-3 rounded-2xl bg-gradient-to-br from-teal-950/40 via-dark-900 to-dark-900 border border-teal-900/40 relative overflow-hidden">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">पनीर (Paneer)</span>
            <button 
              onClick={() => handleOpenAdjust('Paneer', liveStock?.paneer.currentStock ?? 0)}
              className="p-1 rounded bg-dark-800 text-dark-400 hover:text-teal-300"
              title="Adjust Paneer Stock"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xl font-black text-white font-mono">
            {liveStock?.paneer.currentStock ?? 0} <span className="text-xs font-bold text-dark-400">KG</span>
          </div>
          <p className="text-[9px] text-teal-400/80 mt-1 font-medium">ताजा पनीर स्टॉक</p>
        </div>

        {/* Curd / Lassi */}
        <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-dark-900 to-dark-900 border border-emerald-900/40 relative overflow-hidden">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">दही / लस्सी</span>
            <button 
              onClick={() => handleOpenAdjust('Curd', liveStock?.curd.currentStock ?? 0)}
              className="p-1 rounded bg-dark-800 text-dark-400 hover:text-emerald-300"
              title="Adjust Curd Stock"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xl font-black text-white font-mono">
            {liveStock?.curd.currentStock ?? 0} <span className="text-xs font-bold text-dark-400">L/KG</span>
          </div>
          <p className="text-[9px] text-emerald-400/80 mt-1 font-medium">दही व छाछ स्टॉक</p>
        </div>

        {/* Khoya / Mawa */}
        <div className="p-3 rounded-2xl bg-gradient-to-br from-rose-950/40 via-dark-900 to-dark-900 border border-rose-900/40 relative overflow-hidden">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">खोया (Mawa)</span>
            <button 
              onClick={() => handleOpenAdjust('Khoya', liveStock?.khoya.currentStock ?? 0)}
              className="p-1 rounded bg-dark-800 text-dark-400 hover:text-rose-300"
              title="Adjust Khoya Stock"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xl font-black text-white font-mono">
            {liveStock?.khoya.currentStock ?? 0} <span className="text-xs font-bold text-dark-400">KG</span>
          </div>
          <p className="text-[9px] text-rose-400/80 mt-1 font-medium">मावा व खोया स्टॉक</p>
        </div>
      </div>

      {/* 2. Navigation Tabs (Pill Buttons) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-dark-800/80 pb-2">
        <button
          onClick={() => setActiveTab('convert')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'convert'
              ? 'bg-teal-500 text-dark-950 font-black shadow-md shadow-teal-500/30'
              : 'bg-dark-900 border border-dark-800 text-dark-300 hover:text-white'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>माल कन्वर्शन एंट्री (New Processing)</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'history'
              ? 'bg-teal-500 text-dark-950 font-black shadow-md shadow-teal-500/30'
              : 'bg-dark-900 border border-dark-800 text-dark-300 hover:text-white'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>कन्वर्शन इतिहास ({conversions.length})</span>
        </button>
      </div>

      {/* 3. Conversion Panel Tab */}
      {activeTab === 'convert' && (
        <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 sm:p-6 space-y-5 shadow-xl">
          <div>
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <span>कच्चे माल से तैयार माल बनाएं (Conversion & Yield Entry)</span>
            </h3>
            <p className="text-xs text-dark-400 mt-0.5">
              चुनें कि आपने किस कच्चे माल (दूध या क्रीम) से कितना तैयार माल (घी, पनीर या लस्सी) बनाया
            </p>
          </div>

          {/* Preset Buttons Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PRESET_CONVERSIONS.map((preset) => {
              const Icon = preset.icon;
              const isSelected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'bg-teal-950/60 border-teal-500 shadow-md shadow-teal-500/10 ring-1 ring-teal-500/50'
                      : 'bg-dark-950 border-dark-800 text-dark-300 hover:border-dark-700 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-teal-400' : 'text-dark-400'}`} />
                    {isSelected && <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />}
                  </div>
                  <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-dark-200'}`}>
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Alerts */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-900/50 flex gap-2 text-xs text-red-400 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-900/50 flex gap-2 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Conversion Form */}
          <form onSubmit={handleSaveConversion} className="space-y-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Date */}
              <div>
                <label className="block text-[11px] font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                  तारीख़ (Date)
                </label>
                <input
                  type="date"
                  value={conversionDate}
                  onChange={(e) => setConversionDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500 font-mono"
                  required
                />
              </div>

              {/* Input Material Quantity */}
              <div>
                <label className="block text-[11px] font-bold text-teal-400 uppercase tracking-wider mb-1.5">
                  {selectedPreset.inputName} खर्च हुआ ({selectedPreset.inputUnit}) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder={`उदा. 50 ${selectedPreset.inputUnit}`}
                  value={inputQty}
                  onChange={(e) => handleInputChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950 border border-teal-900/60 text-sm font-bold text-white focus:outline-none focus:border-teal-500 font-mono"
                  required
                />
              </div>

              {/* Output Finished Product Quantity */}
              <div>
                <label className="block text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-1.5">
                  {selectedPreset.outputName} तैयार हुआ ({selectedPreset.outputUnit}) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder={`उदा. 40 ${selectedPreset.outputUnit}`}
                  value={outputQty}
                  onChange={(e) => setOutputQty(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950 border border-amber-900/60 text-sm font-bold text-white focus:outline-none focus:border-amber-500 font-mono"
                  required
                />
              </div>
            </div>

            {/* Real-Time Conversion & Yield Badge */}
            {parseFloat(inputQty) > 0 && parseFloat(outputQty) > 0 && (
              <div className="p-3.5 rounded-2xl bg-teal-950/40 border border-teal-800/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-teal-300 font-bold">
                  <span>{inputQty} {selectedPreset.inputUnit} {selectedPreset.inputName}</span>
                  <ArrowRight className="w-4 h-4 text-teal-400" />
                  <span className="text-white font-extrabold">{outputQty} {selectedPreset.outputUnit} {selectedPreset.outputName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-dark-400 font-medium">रिकवरी (Yield):</span>
                  <span className="px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-300 font-black border border-teal-500/40 font-mono">
                    {currentYield}%
                  </span>
                </div>
              </div>
            )}

            {/* Optional By-Product (e.g. Skimmed milk or whey) & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                  बाय-प्रोडक्ट (उदा. मट्ठा / Skimmed Milk - यदि कोई हो)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="उदा. छाछ / मट्ठा"
                    value={byProductName}
                    onChange={(e) => setByProductName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                  />
                  <input
                    type="number"
                    step="0.1"
                    placeholder="मात्रा (Ltr)"
                    value={byProductQty}
                    onChange={(e) => setByProductQty(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                  रिमार्क्स / नोट्स (Remarks)
                </label>
                <input
                  type="text"
                  placeholder="उदा. सुबह की मलाई से घी बनाया..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-500 text-white font-extrabold text-sm shadow-lg shadow-teal-600/20 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? 'प्रोसेसिंग दर्ज हो रही है...' : 'कन्वर्शन सेव करें व स्टॉक अपडेट करें'}</span>
            </button>
          </form>
        </div>
      )}

      {/* 4. Conversion History Tab */}
      {activeTab === 'history' && (
        <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 sm:p-6 space-y-4 shadow-xl">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-teal-400" />
              <span>कन्वर्शन इतिहास व यील्ड रिकॉर्ड्स (Processing History)</span>
            </h3>
            <span className="text-xs font-bold text-dark-400">कुल रिकॉर्ड्स: {conversions.length}</span>
          </div>

          {conversions.length === 0 ? (
            <div className="text-center py-10 text-dark-400 text-xs font-medium bg-dark-950 rounded-2xl border border-dark-800/60 p-6">
              अभी कोई कन्वर्शन रिकॉर्ड नहीं है। नए कन्वर्शन टैब से घी, पनीर या लस्सी बनाने की एंट्री करें।
            </div>
          ) : (
            <div className="space-y-2.5">
              {conversions.map((log) => (
                <div 
                  key={log._id}
                  className="p-3.5 rounded-2xl bg-dark-950 border border-dark-800 hover:border-dark-700 transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-white">{log.inputMaterial}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
                      <span className="text-xs font-black text-amber-400">{log.outputProduct}</span>
                      <span className="px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 text-[10px] font-bold border border-teal-800/60 font-mono">
                        {log.yieldPercent}% Yield
                      </span>
                    </div>
                    <p className="text-[11px] text-dark-400">
                      इनपुट: <strong className="text-dark-200">{log.inputQuantity} {log.inputUnit}</strong> ➔ आउटपुट: <strong className="text-dark-200">{log.outputQuantity} {log.outputUnit}</strong>
                      {log.notes ? ` • ${log.notes}` : ''}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-dark-300 font-mono">
                      {new Date(log.date).toLocaleDateString('hi-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    {log.operator?.name && (
                      <p className="text-[10px] text-dark-500 font-medium">By: {log.operator.name}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stock Adjust Modal */}
      {adjustModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-dark-800 pb-3">
              <h3 className="text-sm font-extrabold text-white">
                {adjustCategory} स्टॉक अपडेट करें
              </h3>
              <button onClick={() => setAdjustModalOpen(false)} className="text-dark-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjust} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-dark-400 mb-1">
                  नया कुल स्टॉक ({adjustCategory === 'Curd' || adjustCategory === 'Milk' ? 'Litre' : 'KG'})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-sm font-bold text-white focus:outline-none focus:border-teal-500 font-mono"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-dark-800 text-xs font-bold text-dark-300 hover:text-white"
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 text-xs font-black text-white hover:bg-teal-500"
                >
                  {submitting ? 'अपडेट हो रहा है...' : 'स्टॉक सेव करें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
