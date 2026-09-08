import React, { useState } from 'react';
import API from '../api';
import { 
  X, Droplets, CheckCircle, AlertTriangle, DollarSign 
} from 'lucide-react';

interface DirectMilkSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const DirectMilkSaleModal: React.FC<DirectMilkSaleModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [shift, setShift] = useState<'Morning' | 'Evening' | 'Full Day'>('Morning');

  // Quantities and Rates
  const [superQty, setSuperQty] = useState('');
  const [superRate, setSuperRate] = useState('68');

  const [regQty, setRegQty] = useState('');
  const [regRate, setRegRate] = useState('60');

  const [cowQty, setCowQty] = useState('');
  const [cowRate, setCowRate] = useState('55');

  const [paymentMode] = useState<'Cash' | 'UPI' | 'Credit'>('Cash');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const superAmt = (Number(superQty) || 0) * (Number(superRate) || 0);
  const regAmt = (Number(regQty) || 0) * (Number(regRate) || 0);
  const cowAmt = (Number(cowQty) || 0) * (Number(cowRate) || 0);

  const totalQty = (Number(superQty) || 0) + (Number(regQty) || 0) + (Number(cowQty) || 0);
  const totalAmount = superAmt + regAmt + cowAmt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalQty <= 0) {
      setErrorMsg('कृपया कम से कम एक दूध प्रकार की मात्रा (Litres) दर्ज करें।');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      const payload = {
        date,
        shift,
        superMilk: {
          quantity: Number(superQty) || 0,
          rate: Number(superRate) || 68
        },
        regularMilk: {
          quantity: Number(regQty) || 0,
          rate: Number(regRate) || 60
        },
        cowMilk: {
          quantity: Number(cowQty) || 0,
          rate: Number(cowRate) || 55
        },
        paymentMode,
        notes
      };

      await API.post('/milk-sales', payload);
      setSuccessMsg(`दूध बिक्री दर्ज की गई! ₹${totalAmount.toLocaleString('en-IN')} गल्ले में जोड़ दिए गए हैं।`);

      setTimeout(() => {
        setSuperQty('');
        setRegQty('');
        setCowQty('');
        setNotes('');
        setSuccessMsg(null);
        if (onSuccess) onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'दूध बिक्री दर्ज करने में समस्या आई।');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="bg-dark-900 border border-dark-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-dark-800 flex justify-between items-center bg-gradient-to-r from-teal-950/40 via-dark-900 to-dark-900">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Droplets className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-1.5">
                Direct Milk Sale Entry
              </h3>
              <p className="text-[11px] text-dark-400 font-medium">
                सीधी दूध बिक्री (थोक / शिफ्ट सेल) & गल्ला मिलान
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-dark-800 text-dark-400 hover:text-white border border-dark-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 pt-0">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-red-950/40 border border-red-900/50 flex gap-2 text-xs text-red-400 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-900/50 flex gap-2 text-xs text-emerald-400 font-medium">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Date & Shift */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                तारीख़ (Sale Date)
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                शिफ्ट (Shift)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'Morning', label: 'Morning (सुबह)' },
                  { key: 'Evening', label: 'Evening (शाम)' }
                ].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setShift(s.key as any)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                      shift === s.key
                        ? 'bg-teal-500 text-dark-950 font-black shadow-md shadow-teal-500/30'
                        : 'bg-dark-950 text-dark-300 border border-dark-800 hover:text-white'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Milk Variants Direct Entries */}
          <div className="space-y-2.5 pt-1">
            
            {/* 1. Super Milk */}
            <div className="p-3 rounded-2xl bg-dark-950 border border-dark-800 space-y-2 hover:border-teal-500/40 transition-colors">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-400" />
                  <span className="text-xs font-bold text-white">Super Milk (गाढ़ा / 6+ FAT)</span>
                </div>
                <span className="text-xs font-black text-teal-400">₹{superAmt.toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-dark-500 uppercase">मात्रा (Litres)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="0 Ltr"
                    value={superQty}
                    onChange={(e) => setSuperQty(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white font-bold focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-dark-500 uppercase">भाव (₹/Litre)</label>
                  <input
                    type="number"
                    step="1"
                    value={superRate}
                    onChange={(e) => setSuperRate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white font-bold focus:outline-none focus:border-teal-500 text-right"
                  />
                </div>
              </div>
            </div>

            {/* 2. Regular Milk */}
            <div className="p-3 rounded-2xl bg-dark-950 border border-dark-800 space-y-2 hover:border-blue-500/40 transition-colors">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-xs font-bold text-white">Regular Milk (सादा / 5-5.4 FAT)</span>
                </div>
                <span className="text-xs font-black text-blue-400">₹{regAmt.toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-dark-500 uppercase">मात्रा (Litres)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="0 Ltr"
                    value={regQty}
                    onChange={(e) => setRegQty(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white font-bold focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-dark-500 uppercase">भाव (₹/Litre)</label>
                  <input
                    type="number"
                    step="1"
                    value={regRate}
                    onChange={(e) => setRegRate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white font-bold focus:outline-none focus:border-blue-500 text-right"
                  />
                </div>
              </div>
            </div>

            {/* 3. Cow Milk */}
            <div className="p-3 rounded-2xl bg-dark-950 border border-dark-800 space-y-2 hover:border-amber-500/40 transition-colors">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-xs font-bold text-white">Cow Milk / Other (गाय का दूध)</span>
                </div>
                <span className="text-xs font-black text-amber-400">₹{cowAmt.toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-dark-500 uppercase">मात्रा (Litres)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="0 Ltr"
                    value={cowQty}
                    onChange={(e) => setCowQty(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-dark-500 uppercase">भाव (₹/Litre)</label>
                  <input
                    type="number"
                    step="1"
                    value={cowRate}
                    onChange={(e) => setCowRate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white font-bold focus:outline-none focus:border-amber-500 text-right"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Payment Mode & Total Highlight */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-teal-950/60 to-dark-950 border border-teal-800/40 flex justify-between items-center shadow-inner">
            <div>
              <span className="text-[10px] font-bold text-dark-400 uppercase tracking-wider block">
                Total Milk: <strong className="text-white">{totalQty} Litres</strong>
              </span>
              <span className="text-[10px] text-teal-400 font-semibold">
                Payment: Cash in Galla (नकद)
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-dark-400 block font-bold">Total Sales Value</span>
              <span className="text-xl font-black text-white">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-dark-800 hover:bg-dark-750 text-xs font-bold text-dark-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || totalQty <= 0}
              className="flex-2 py-3 px-4 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-500 text-xs font-bold text-white shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <DollarSign className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving Entry...' : 'Save & Add to Galla (गल्ले में जोड़ें)'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
