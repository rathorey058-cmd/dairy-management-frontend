import React, { useEffect, useState, useCallback } from 'react';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  Truck, Users, Calendar, CheckCircle2, XCircle, Plus, 
  RotateCcw, Save, Search, Phone, MapPin, 
  Sparkles
} from 'lucide-react';

interface DeliveryItem {
  bandhi?: string;
  bandhiNo: number;
  customerName: string;
  customer?: string;
  milkType: string;
  standardQuantity: number;
  deliveredQuantity: number;
  rate: number;
  amount: number;
  status: 'DELIVERED' | 'SKIPPED' | 'EXTRA';
  notes?: string;
}

interface DeliverySheet {
  _id?: string;
  date: string;
  shift: string;
  deliveries: DeliveryItem[];
  totalMilkDelivered: number;
  totalAmount: number;
  deliveredCount: number;
  skippedCount: number;
  isConfirmed: boolean;
}

interface BandhiMaster {
  _id: string;
  bandhiNo: number;
  customerName: string;
  mobile: string;
  address?: string;
  area?: string;
  milkType: string;
  shift: string;
  dailyQuantity: number;
  rate: number;
  status: 'Active' | 'Paused' | 'Cancelled';
}

export const MilkBandhiPage: React.FC = () => {
  useAuth();
  const todayStr = new Date().toISOString().split('T')[0];

  const [activeTab, setActiveTab] = useState<'delivery' | 'master'>('delivery');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedShift, setSelectedShift] = useState<'Morning' | 'Evening'>('Morning');

  // Delivery Sheet State
  const [sheet, setSheet] = useState<DeliverySheet | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [savingSheet, setSavingSheet] = useState(false);
  const [deliverySearch, setDeliverySearch] = useState('');

  // Bandhi Master List State
  const [bandhis, setBandhis] = useState<BandhiMaster[]>([]);
  const [loadingBandhis, setLoadingBandhis] = useState(false);
  const [masterSearch, setMasterSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Bandhi Form
  const [formData, setFormData] = useState({
    bandhiNo: '',
    customerName: '',
    mobile: '',
    address: '',
    milkType: 'Buffalo',
    shift: 'Morning',
    dailyQuantity: '2.0',
    rate: '65',
  });

  // Load Daily Delivery Sheet
  const loadDeliverySheet = useCallback(async () => {
    try {
      setLoadingSheet(true);
      const res = await API.get(`/bandhi/delivery-sheet?date=${selectedDate}&shift=${selectedShift}`);
      setSheet(res.data);
    } catch (error) {
      console.error('Failed to load delivery sheet', error);
    } finally {
      setLoadingSheet(false);
    }
  }, [selectedDate, selectedShift]);

  // Load Bandhi Master Records
  const loadBandhis = useCallback(async () => {
    try {
      setLoadingBandhis(true);
      const res = await API.get(`/bandhi?search=${masterSearch}`);
      setBandhis(res.data);
    } catch (error) {
      console.error('Failed to load bandhis', error);
    } finally {
      setLoadingBandhis(false);
    }
  }, [masterSearch]);

  useEffect(() => {
    if (activeTab === 'delivery') {
      loadDeliverySheet();
    } else {
      loadBandhis();
    }
  }, [activeTab, loadDeliverySheet, loadBandhis]);

  // Delivery status toggle
  const toggleDeliveryStatus = (index: number) => {
    if (!sheet) return;
    const updated = { ...sheet };
    const item = updated.deliveries[index];

    if (item.status === 'DELIVERED') {
      item.status = 'SKIPPED';
      item.deliveredQuantity = 0;
      item.amount = 0;
    } else {
      item.status = 'DELIVERED';
      item.deliveredQuantity = item.standardQuantity;
      item.amount = Math.round(item.deliveredQuantity * item.rate * 100) / 100;
    }

    recalcSheet(updated);
    setSheet(updated);
  };

  // Update delivered quantity directly
  const handleQuantityChange = (index: number, newQty: number) => {
    if (!sheet) return;
    const updated = { ...sheet };
    const item = updated.deliveries[index];
    const qty = Math.max(0, Math.round(newQty * 10) / 10);

    item.deliveredQuantity = qty;
    if (qty === 0) {
      item.status = 'SKIPPED';
      item.amount = 0;
    } else if (qty > item.standardQuantity) {
      item.status = 'EXTRA';
      item.amount = Math.round(qty * item.rate * 100) / 100;
    } else {
      item.status = 'DELIVERED';
      item.amount = Math.round(qty * item.rate * 100) / 100;
    }

    recalcSheet(updated);
    setSheet(updated);
  };

  // Recalculate summary metrics
  const recalcSheet = (s: DeliverySheet) => {
    let deliveredCount = 0;
    let skippedCount = 0;
    let totalMilk = 0;
    let totalAmt = 0;

    s.deliveries.forEach((d) => {
      if (d.status === 'SKIPPED') {
        skippedCount++;
      } else {
        deliveredCount++;
        totalMilk += d.deliveredQuantity;
        totalAmt += d.amount;
      }
    });

    s.deliveredCount = deliveredCount;
    s.skippedCount = skippedCount;
    s.totalMilkDelivered = Math.round(totalMilk * 100) / 100;
    s.totalAmount = Math.round(totalAmt * 100) / 100;
  };

  // Mark all delivered
  const markAllDelivered = () => {
    if (!sheet) return;
    const updated = { ...sheet };
    updated.deliveries.forEach((d) => {
      d.status = 'DELIVERED';
      d.deliveredQuantity = d.standardQuantity;
      d.amount = Math.round(d.deliveredQuantity * d.rate * 100) / 100;
    });
    recalcSheet(updated);
    setSheet(updated);
  };

  // Save Delivery Sheet
  const handleSaveSheet = async () => {
    if (!sheet) return;
    try {
      setSavingSheet(true);
      const res = await API.post('/bandhi/delivery-sheet', {
        date: selectedDate,
        shift: selectedShift,
        deliveries: sheet.deliveries,
      });
      setSheet(res.data.log);
      alert('✅ दूध बांधी शीट सफलतापूर्वक सेव हो गयी! ग्राहकों के खाते में हिसाब जुड़ गया और कच्चा दूध स्टॉक घट गया।');
    } catch (error: any) {
      alert('त्रुटि: ' + (error.response?.data?.message || error.message));
    } finally {
      setSavingSheet(false);
    }
  };

  // Create new Bandhi master
  const handleCreateBandhi = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await API.post('/bandhi', formData);
      setIsAddModalOpen(false);
      setFormData({
        bandhiNo: '',
        customerName: '',
        mobile: '',
        address: '',
        milkType: 'Buffalo',
        shift: 'Morning',
        dailyQuantity: '2.0',
        rate: '65',
      });
      loadBandhis();
      alert('✅ नयी बांधी सफलतापूर्वक रजिस्टर हो गयी!');
    } catch (error: any) {
      alert('त्रुटि: ' + (error.response?.data?.message || error.message));
    }
  };

  const filteredDeliveries = sheet?.deliveries.filter((d) => {
    if (!deliverySearch) return true;
    const q = deliverySearch.toLowerCase();
    return (
      d.customerName.toLowerCase().includes(q) ||
      String(d.bandhiNo).includes(q) ||
      d.milkType.toLowerCase().includes(q)
    );
  }) || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-1">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary-400" />
            <span>दूध बांधी रजिस्टर (Daily Milk Delivery)</span>
          </h2>
          <p className="text-xs text-dark-400 font-medium">
            घर-घर दूध वितरण, नागा/छुट्टी मैनेजमेंट व दैनिक ग्राहक खाता
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-dark-900 border border-dark-800 p-1 rounded-2xl">
          <button
            onClick={() => setActiveTab('delivery')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'delivery'
                ? 'bg-primary-600 text-white shadow-md'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>दैनिक वितरण शीट</span>
          </button>
          <button
            onClick={() => setActiveTab('master')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'master'
                ? 'bg-primary-600 text-white shadow-md'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>बांधी मास्टर लिस्ट</span>
          </button>
        </div>
      </div>

      {/* Voice Assistant Tip Banner */}
      <div className="bg-gradient-to-r from-primary-950/40 via-dark-900 to-indigo-950/40 border border-primary-500/30 rounded-3xl p-4 shadow-lg flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary-500/20 border border-primary-500/40 flex items-center justify-center text-primary-400 flex-shrink-0">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <span className="text-xs font-extrabold text-primary-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎙️ स्मार्ट AI वॉयस ऑटोमेशन उपलब्ध</span>
            </span>
            <p className="text-xs text-dark-200 mt-0.5">
              बोलें: <span className="text-white font-semibold italic">"बांधी नंबर 1, 2, 6 और 7 की दूध की बांधी आज नहीं गयी बाकी सब की गयी है"</span>
            </p>
          </div>
        </div>
      </div>

      {/* TAB 1: DAILY DELIVERY SHEET */}
      {activeTab === 'delivery' && (
        <div className="space-y-5">
          {/* Controls Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-dark-900 border border-dark-800 p-4 rounded-3xl">
            {/* Date Picker */}
            <div className="flex items-center gap-2 bg-dark-950 border border-dark-800 rounded-2xl px-3 py-2">
              <Calendar className="w-4 h-4 text-dark-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white text-xs font-bold outline-none w-full"
              />
            </div>

            {/* Shift Switcher */}
            <div className="flex bg-dark-950 border border-dark-800 p-1 rounded-2xl">
              <button
                onClick={() => setSelectedShift('Morning')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedShift === 'Morning' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-dark-400'
                }`}
              >
                🌅 सुबह (Morning)
              </button>
              <button
                onClick={() => setSelectedShift('Evening')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedShift === 'Evening' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'text-dark-400'
                }`}
              >
                🌙 शाम (Evening)
              </button>
            </div>

            {/* Search Input */}
            <div className="flex items-center gap-2 bg-dark-950 border border-dark-800 rounded-2xl px-3 py-2">
              <Search className="w-4 h-4 text-dark-400" />
              <input
                type="text"
                placeholder="बांधी नं / ग्राहक खोजें..."
                value={deliverySearch}
                onChange={(e) => setDeliverySearch(e.target.value)}
                className="bg-transparent text-white text-xs outline-none w-full placeholder:text-dark-500"
              />
            </div>
          </div>

          {/* Quick Metrics Bar */}
          {sheet && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-dark-400 uppercase tracking-wider">कुल बांधी</span>
                <span className="text-2xl font-black text-white mt-2">{sheet.deliveries.length} घर</span>
              </div>
              <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">वितरित दूध</span>
                <span className="text-2xl font-black text-emerald-400 mt-2">{sheet.totalMilkDelivered} L</span>
              </div>
              <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">नागा / छुट्टी</span>
                <span className="text-2xl font-black text-rose-400 mt-2">{sheet.skippedCount} बांधी</span>
              </div>
              <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-primary-400 uppercase tracking-wider">कुल राशि (बिल)</span>
                <span className="text-2xl font-black text-primary-400 mt-2">₹{sheet.totalAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          {/* Quick Actions & Delivery List */}
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-dark-800">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary-400" />
                <span className="text-sm font-black text-white">दैनिक दूध वितरण रजिस्टर ({selectedShift === 'Morning' ? 'सुबह' : 'शाम'})</span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={markAllDelivered}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-2xl bg-dark-800 border border-dark-700 text-xs font-bold text-dark-200 hover:text-white transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>सबकी गयी (Reset All)</span>
                </button>
                <button
                  onClick={handleSaveSheet}
                  disabled={savingSheet}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-2xl bg-gradient-to-r from-primary-600 to-emerald-600 text-xs font-black text-white shadow-lg hover:brightness-110 active:scale-95 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingSheet ? 'सेव हो रहा है...' : 'वितरण सेव करें'}</span>
                </button>
              </div>
            </div>

            {loadingSheet ? (
              <div className="py-12 flex justify-center items-center">
                <div className="w-8 h-8 rounded-full border-2 border-primary-500/20 border-t-primary-500 animate-spin" />
              </div>
            ) : filteredDeliveries.length === 0 ? (
              <div className="py-12 text-center text-dark-400 text-xs font-medium">
                इस शिफ्ट के लिए कोई बांधी नहीं मिली। कृपया "बांधी मास्टर लिस्ट" से नयी बांधी जोड़ें।
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredDeliveries.map((d, index) => {
                  const isSkipped = d.status === 'SKIPPED';
                  return (
                    <div
                      key={d.bandhiNo}
                      className={`border rounded-3xl p-4 transition-all flex flex-col justify-between gap-3 ${
                        isSkipped
                          ? 'bg-rose-950/10 border-rose-900/40 opacity-75'
                          : 'bg-dark-950 border-dark-800 hover:border-primary-500/30'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-9 h-9 rounded-2xl flex items-center justify-center font-black text-sm ${
                              isSkipped
                                ? 'bg-rose-900/30 text-rose-400 border border-rose-800/40'
                                : 'bg-primary-950 text-primary-400 border border-primary-800/40'
                            }`}
                          >
                            #{d.bandhiNo}
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-white">{d.customerName}</h4>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-dark-400">
                              <span>{d.milkType === 'Cow' ? '🐄 गाय' : '🐃 भैंस'}</span>
                              <span>•</span>
                              <span>दर: ₹{d.rate}/L</span>
                            </div>
                          </div>
                        </div>

                        {/* Status Toggle Button */}
                        <button
                          onClick={() => toggleDeliveryStatus(index)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-black transition-all ${
                            isSkipped
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          }`}
                        >
                          {isSkipped ? (
                            <>
                              <XCircle className="w-3.5 h-3.5" />
                              <span>नागा (Skipped)</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>वितरित (Delivered)</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Quantity Stepper & Amount */}
                      <div className="flex justify-between items-center bg-dark-900/80 p-2.5 rounded-2xl border border-dark-800/60">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-dark-400 font-bold">दूध मात्रा:</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleQuantityChange(index, d.deliveredQuantity - 0.5)}
                              className="w-7 h-7 rounded-xl bg-dark-800 text-white font-black text-xs flex items-center justify-center active:scale-95"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              step="0.5"
                              value={d.deliveredQuantity}
                              onChange={(e) => handleQuantityChange(index, parseFloat(e.target.value) || 0)}
                              className="w-12 text-center bg-transparent text-white font-black text-xs outline-none"
                            />
                            <button
                              onClick={() => handleQuantityChange(index, d.deliveredQuantity + 0.5)}
                              className="w-7 h-7 rounded-xl bg-dark-800 text-white font-black text-xs flex items-center justify-center active:scale-95"
                            >
                              +
                            </button>
                            <span className="text-[11px] text-dark-400 font-bold ml-1">L</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-dark-400 block font-bold">बिल राशि</span>
                          <span className="text-xs font-black text-white">₹{d.amount}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: BANDHI MASTER LIST */}
      {activeTab === 'master' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 bg-dark-900 border border-dark-800 rounded-2xl px-3 py-2 w-full sm:w-72">
              <Search className="w-4 h-4 text-dark-400" />
              <input
                type="text"
                placeholder="बांधी नं / नाम / मोबाइल खोजें..."
                value={masterSearch}
                onChange={(e) => setMasterSearch(e.target.value)}
                className="bg-transparent text-white text-xs outline-none w-full placeholder:text-dark-500"
              />
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-primary-600 text-white text-xs font-black shadow-lg hover:brightness-110 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>+ नयी बांधी जोड़ें</span>
            </button>
          </div>

          {loadingBandhis ? (
            <div className="py-12 flex justify-center items-center">
              <div className="w-8 h-8 rounded-full border-2 border-primary-500/20 border-t-primary-500 animate-spin" />
            </div>
          ) : bandhis.length === 0 ? (
            <div className="py-12 text-center text-dark-400 text-xs font-medium bg-dark-900 rounded-3xl border border-dark-800">
              कोई बांधी दर्ज नहीं है। ऊपर दिए गए बटन से नयी बांधी जोड़ें।
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {bandhis.map((b) => (
                <div
                  key={b._id}
                  className="bg-dark-900 border border-dark-800 rounded-3xl p-4 shadow-md flex flex-col justify-between space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-2xl bg-primary-950 border border-primary-800/40 text-primary-400 flex items-center justify-center font-black text-sm">
                        #{b.bandhiNo}
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white">{b.customerName}</h4>
                        <p className="text-[11px] text-dark-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          <span>{b.mobile}</span>
                        </p>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                        b.status === 'Active'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                          : 'bg-dark-800 text-dark-400'
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>

                  {b.address && (
                    <p className="text-[11px] text-dark-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-dark-500 flex-shrink-0" />
                      <span className="truncate">{b.address}</span>
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-2 bg-dark-950 p-2.5 rounded-2xl border border-dark-800/60 text-center">
                    <div>
                      <span className="text-[10px] text-dark-400 block font-bold">मात्रा</span>
                      <span className="text-xs font-black text-white">{b.dailyQuantity} L</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-dark-400 block font-bold">भाव</span>
                      <span className="text-xs font-black text-white">₹{b.rate}/L</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-dark-400 block font-bold">शिफ्ट</span>
                      <span className="text-xs font-black text-white">{b.shift}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add New Bandhi Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-dark-800">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary-400" />
                <span>नयी दूध बांधी जोड़ें</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-dark-800 text-dark-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBandhi} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-dark-400 block mb-1">बांधी नंबर (वैकल्पिक)</label>
                  <input
                    type="number"
                    placeholder="ऑटो आवंटित"
                    value={formData.bandhiNo}
                    onChange={(e) => setFormData({ ...formData, bandhiNo: e.target.value })}
                    className="w-full bg-dark-950 border border-dark-800 rounded-2xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-dark-400 block mb-1">दूध प्रकार *</label>
                  <select
                    value={formData.milkType}
                    onChange={(e) => setFormData({ ...formData, milkType: e.target.value })}
                    className="w-full bg-dark-950 border border-dark-800 rounded-2xl px-3 py-2 text-xs text-white outline-none"
                  >
                    <option value="Buffalo">भैंस का दूध (Buffalo)</option>
                    <option value="Cow">गाय का दूध (Cow)</option>
                    <option value="Mixed">मिक्स दूध (Mixed)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-dark-400 block mb-1">ग्राहक का नाम *</label>
                <input
                  type="text"
                  required
                  placeholder="उदा. रमेश शर्मा (वर्मा जी)"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  className="w-full bg-dark-950 border border-dark-800 rounded-2xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-dark-400 block mb-1">मोबाइल नंबर *</label>
                  <input
                    type="tel"
                    required
                    placeholder="98290XXXXX"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full bg-dark-950 border border-dark-800 rounded-2xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-dark-400 block mb-1">शिफ्ट *</label>
                  <select
                    value={formData.shift}
                    onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                    className="w-full bg-dark-950 border border-dark-800 rounded-2xl px-3 py-2 text-xs text-white outline-none"
                  >
                    <option value="Morning">सुबह (Morning)</option>
                    <option value="Evening">शाम (Evening)</option>
                    <option value="Both">सुबह व शाम दोनों (Both)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-dark-400 block mb-1">दैनिक दूध मात्रा (L) *</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={formData.dailyQuantity}
                    onChange={(e) => setFormData({ ...formData, dailyQuantity: e.target.value })}
                    className="w-full bg-dark-950 border border-dark-800 rounded-2xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-dark-400 block mb-1">दूध भाव (₹/L) *</label>
                  <input
                    type="number"
                    required
                    value={formData.rate}
                    onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                    className="w-full bg-dark-950 border border-dark-800 rounded-2xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-dark-400 block mb-1">पता / मकान नं (Address)</label>
                <input
                  type="text"
                  placeholder="उदा. मकान नं 12, मेन रोड"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-dark-950 border border-dark-800 rounded-2xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-primary-600 to-emerald-600 text-white text-xs font-black shadow-lg hover:brightness-110 active:scale-95 transition-all"
                >
                  बांधी सुरक्षित करें (Save Bandhi)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
