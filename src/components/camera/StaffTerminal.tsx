import React, { useState } from 'react';
import API from '../../api';
import { 
  Milk, ShoppingCart, Scan, Plus, Minus, User, X
} from 'lucide-react';

interface Props {
  onExitStaffMode?: () => void;
}

export const StaffTerminal: React.FC<Props> = ({ onExitStaffMode }) => {
  const [activeTab, setActiveTab] = useState<'MILK' | 'SALE' | 'MY_ENTRIES'>('MILK');

  // Staff State
  const [staffName] = useState('स्टाफ आकाश');
  const [tokenInput, setTokenInput] = useState('');
  const [selectedFarmer, setSelectedFarmer] = useState<any | null>(null);

  // Milk Entry Fields
  const [milkShift, setMilkShift] = useState<'Morning' | 'Evening'>('Morning');
  const [milkType, setMilkType] = useState<'Cow' | 'Buffalo' | 'Mixed'>('Cow');
  const [weight, setWeight] = useState('');
  const [fat, setFat] = useState('');
  const [snf, setSnf] = useState('');
  const [milkRate, setMilkRate] = useState('45');
  const [savingMilk, setSavingMilk] = useState(false);
  const [milkSuccessMsg, setMilkSuccessMsg] = useState<string | null>(null);

  // Product Sale Fields
  const [cart, setCart] = useState<Array<{ name: string; price: number; qty: number; unit: string }>>([
    { name: 'ताजा फुल क्रीम दूध (1L)', price: 66, qty: 0, unit: 'Ltr' },
    { name: 'ताजा पनीर (250g)', price: 100, qty: 0, unit: 'Pack' },
    { name: 'ताजा पनीर (500g)', price: 195, qty: 0, unit: 'Pack' },
    { name: 'देसी घी (1 Ltr)', price: 650, qty: 0, unit: 'Jar' },
    { name: 'मलाई दही (500g)', price: 45, qty: 0, unit: 'Pouch' },
    { name: 'मसाला छाछ / बटरमिल्क', price: 15, qty: 0, unit: 'Pouch' },
    { name: 'सफेद मक्खन (250g)', price: 140, qty: 0, unit: 'Pack' },
  ]);
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI'>('Cash');
  const [savingSale, setSavingSale] = useState(false);
  const [saleSuccessMsg, setSaleSuccessMsg] = useState<string | null>(null);

  // My entries history today
  const [todayEntries, setTodayEntries] = useState<any[]>([]);

  // Search Farmer Token
  const handleTokenSearch = async (val?: string) => {
    const q = (val || tokenInput).trim();
    if (!q) return;
    try {
      const res = await API.get(`/cameras/resolve-token?token=${encodeURIComponent(q)}`);
      setSelectedFarmer(res.data);
      setTokenInput('');
    } catch (e: any) {
      alert(`किसान या टोकन "${q}" नहीं मिला।`);
      setSelectedFarmer(null);
    }
  };

  // Submit Milk Entry
  const handleSaveMilkEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const numWeight = parseFloat(weight);
    const numFat = parseFloat(fat || '0');
    const numSnf = parseFloat(snf || '0');
    const numRate = parseFloat(milkRate || '40');

    if (!numWeight || numWeight <= 0) {
      alert('कृपया सही वजन (Litre) दर्ज करें।');
      return;
    }

    setSavingMilk(true);
    setMilkSuccessMsg(null);

    try {
      const payload = {
        farmerId: selectedFarmer?._id || undefined,
        farmerCode: selectedFarmer?.farmerId || 'CASH-COUNTER',
        farmerName: selectedFarmer?.name || 'काउंटर आवक (नकद)',
        milkType,
        shift: milkShift,
        quantity: numWeight,
        fat: numFat,
        snf: numSnf,
        rate: numRate,
        totalAmount: Math.round(numWeight * numRate),
        recordedByStaff: staffName,
      };

      await API.post('/milk/entry', payload).catch(() => {
        // fallback to direct collection
        return API.post('/milk/collections', payload);
      });

      setMilkSuccessMsg(`✅ ${numWeight}L दूध सफलता से दर्ज हुआ! (कुल: ₹${Math.round(numWeight * numRate)})`);
      
      // Add to today feed
      setTodayEntries((prev) => [
        {
          time: new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' }),
          type: 'MILK',
          desc: `${selectedFarmer?.name || 'काउंटर'}: ${numWeight}L (${milkType}) - FAT: ${numFat}%`,
          amount: Math.round(numWeight * numRate),
        },
        ...prev,
      ]);

      // Reset
      setWeight('');
      setFat('');
      setSnf('');
      setSelectedFarmer(null);
    } catch (err: any) {
      alert(err.response?.data?.message || 'दूध एंट्री सेव करने में त्रुटि आई।');
    } finally {
      setSavingMilk(false);
    }
  };

  // Adjust Cart
  const updateQty = (idx: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const newQty = Math.max(0, next[idx].qty + delta);
      next[idx] = { ...next[idx], qty: newQty };
      return next;
    });
  };

  const totalSaleAmount = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.qty, 0);

  // Submit Sale Entry
  const handleSaveSaleEntry = async () => {
    if (totalSaleAmount <= 0) {
      alert('कृपया कम से कम 1 सामान चुनें।');
      return;
    }

    setSavingSale(true);
    setSaleSuccessMsg(null);

    try {
      const itemsPurchased = cart.filter(i => i.qty > 0).map(i => ({
        productName: i.name,
        quantity: i.qty,
        rate: i.price,
        amount: i.qty * i.price,
      }));

      const payload = {
        items: itemsPurchased,
        totalAmount: totalSaleAmount,
        paymentMode,
        recordedByStaff: staffName,
        customerName: 'काउंटर ग्राहक (Counter Walk-in)',
      };

      await API.post('/orders', payload).catch(() => {
        return API.post('/sales/counter-sale', payload);
      });

      setSaleSuccessMsg(`✅ ₹${totalSaleAmount} की बिक्री दर्ज हुई! (${paymentMode})`);

      setTodayEntries((prev) => [
        {
          time: new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' }),
          type: 'SALE',
          desc: itemsPurchased.map(i => `${i.productName} x ${i.quantity}`).join(', '),
          amount: totalSaleAmount,
          mode: paymentMode,
        },
        ...prev,
      ]);

      // Reset cart
      setCart((prev) => prev.map(i => ({ ...i, qty: 0 })));
    } catch (err: any) {
      alert('बिक्री सेव करने में त्रुटि आई।');
    } finally {
      setSavingSale(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 text-white flex flex-col font-sans pb-10">
      
      {/* Top Header Bar for Staff */}
      <header className="p-4 bg-gradient-to-r from-dark-900 via-indigo-950/60 to-dark-900 border-b border-dark-800 flex items-center justify-between sticky top-0 z-40 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center font-black text-indigo-300">
            🥛
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-base font-black text-white">
                श्री कृष्णा डेयरी • स्टाफ टर्मिनल
              </h1>
              <span className="px-2 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                Entry Only
              </span>
            </div>
            <p className="text-[11px] text-dark-400 flex items-center gap-1">
              <User className="w-3 h-3 text-dark-500" />
              <span>लॉगिन: <strong>{staffName}</strong> • डेटा सीधे मालिक डैशबोर्ड में जा रहा है</span>
            </p>
          </div>
        </div>

        {onExitStaffMode && (
          <button
            onClick={onExitStaffMode}
            className="py-1.5 px-3 rounded-xl bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white text-xs font-bold border border-dark-700 transition-colors"
          >
            मालिक मोड (Owner View)
          </button>
        )}
      </header>

      {/* Main Tab Switcher */}
      <div className="p-3 bg-dark-900 border-b border-dark-800 flex items-center justify-center gap-2">
        <button
          onClick={() => setActiveTab('MILK')}
          className={`flex-1 max-w-xs py-2.5 px-4 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-md ${
            activeTab === 'MILK'
              ? 'bg-blue-600 text-white shadow-blue-600/30'
              : 'bg-dark-950 text-dark-400 hover:text-white border border-dark-800'
          }`}
        >
          <Milk className="w-4 h-4" />
          <span>1. दूध आवक (Milk Entry)</span>
        </button>

        <button
          onClick={() => setActiveTab('SALE')}
          className={`flex-1 max-w-xs py-2.5 px-4 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-md ${
            activeTab === 'SALE'
              ? 'bg-emerald-600 text-white shadow-emerald-600/30'
              : 'bg-dark-950 text-dark-400 hover:text-white border border-dark-800'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>2. काउंटर बिक्री (Product Sale)</span>
        </button>

        <button
          onClick={() => setActiveTab('MY_ENTRIES')}
          className={`py-2.5 px-4 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
            activeTab === 'MY_ENTRIES'
              ? 'bg-purple-600 text-white shadow-purple-600/30'
              : 'bg-dark-950 text-dark-400 hover:text-white border border-dark-800'
          }`}
        >
          <span>मेरी एंट्री ({todayEntries.length})</span>
        </button>
      </div>

      {/* Content Container */}
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full space-y-4">
        
        {/* ========================================================== */}
        {/* TAB 1: MILK INWARD ENTRY                                   */}
        {/* ========================================================== */}
        {activeTab === 'MILK' && (
          <div className="space-y-4 animate-fade-in">
            
            {milkSuccessMsg && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between">
                <span className="font-bold">{milkSuccessMsg}</span>
                <button onClick={() => setMilkSuccessMsg(null)} className="text-emerald-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Fast Farmer Search / Token Card */}
            <div className="p-4 rounded-3xl bg-dark-900 border border-dark-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-dark-300 flex items-center gap-1.5">
                  <Scan className="w-4 h-4 text-blue-400" />
                  <span>किसान टोकन या कोड डालें:</span>
                </label>
                {selectedFarmer && (
                  <span className="text-xs text-emerald-400 font-bold">
                    किसान: {selectedFarmer.name} (ID: {selectedFarmer.farmerId})
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTokenSearch()}
                  placeholder="टोकन स्कैन करें या किसान नंबर/कोड लिखें..."
                  className="flex-1 p-3 rounded-2xl bg-dark-950 border border-dark-700 text-white placeholder-dark-500 text-sm font-semibold focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => handleTokenSearch()}
                  className="py-3 px-5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-md active:scale-95"
                >
                  सर्च
                </button>
              </div>
            </div>

            {/* Milk Form */}
            <form onSubmit={handleSaveMilkEntry} className="p-5 rounded-3xl bg-dark-900 border border-dark-800 shadow-xl space-y-4">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-dark-400 uppercase">शिफ्ट</label>
                  <select
                    value={milkShift}
                    onChange={(e: any) => setMilkShift(e.target.value)}
                    className="w-full mt-1 p-3 rounded-2xl bg-dark-950 border border-dark-700 text-white font-bold text-xs focus:outline-none"
                  >
                    <option value="Morning">सुबह (Morning)</option>
                    <option value="Evening">शाम (Evening)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-dark-400 uppercase">दूध का प्रकार</label>
                  <select
                    value={milkType}
                    onChange={(e: any) => setMilkType(e.target.value)}
                    className="w-full mt-1 p-3 rounded-2xl bg-dark-950 border border-dark-700 text-white font-bold text-xs focus:outline-none"
                  >
                    <option value="Cow">गाय (Cow)</option>
                    <option value="Buffalo">भैंस (Buffalo)</option>
                    <option value="Mixed">मिक्स (Mixed)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-bold text-dark-300">मात्रा (Litre) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full mt-1 p-3 rounded-2xl bg-dark-950 border border-dark-700 text-white font-mono font-black text-lg focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-dark-300">FAT (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    placeholder="0.0"
                    className="w-full mt-1 p-3 rounded-2xl bg-dark-950 border border-dark-700 text-white font-mono font-black text-lg focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-dark-300">SNF</label>
                  <input
                    type="number"
                    step="0.01"
                    value={snf}
                    onChange={(e) => setSnf(e.target.value)}
                    placeholder="0.00"
                    className="w-full mt-1 p-3 rounded-2xl bg-dark-950 border border-dark-700 text-white font-mono font-black text-lg focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-dark-300">भाव (₹/L)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={milkRate}
                    onChange={(e) => setMilkRate(e.target.value)}
                    placeholder="45"
                    className="w-full mt-1 p-3 rounded-2xl bg-dark-950 border border-dark-700 text-white font-mono font-black text-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Calculated Total Banner */}
              {parseFloat(weight) > 0 && (
                <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-500/40 flex items-center justify-between">
                  <span className="text-xs text-blue-200">कुल भुगतान रकम:</span>
                  <span className="text-xl font-black text-white font-mono">
                    ₹{Math.round(parseFloat(weight || '0') * parseFloat(milkRate || '0'))}
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={savingMilk}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm shadow-xl shadow-blue-600/30 transition-all active:scale-95 disabled:opacity-50"
              >
                {savingMilk ? 'दर्ज हो रहा है...' : '✅ दूध जमा करें (Save Entry)'}
              </button>
            </form>

          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 2: COUNTER PRODUCT SALE                                */}
        {/* ========================================================== */}
        {activeTab === 'SALE' && (
          <div className="space-y-4 animate-fade-in">
            
            {saleSuccessMsg && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between">
                <span className="font-bold">{saleSuccessMsg}</span>
                <button onClick={() => setSaleSuccessMsg(null)} className="text-emerald-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Product Quick Tiles Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {cart.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-3xl border transition-all flex flex-col justify-between space-y-3 ${
                    item.qty > 0
                      ? 'bg-emerald-950/20 border-emerald-500/50 shadow-lg'
                      : 'bg-dark-900 border-dark-800'
                  }`}
                >
                  <div>
                    <h4 className="text-sm font-bold text-white">{item.name}</h4>
                    <p className="text-xs font-mono font-bold text-emerald-400 mt-0.5">₹{item.price} / {item.unit}</p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-dark-800">
                    <span className="text-xs text-dark-400 font-bold">मात्रा:</span>
                    
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQty(idx, -1)}
                        disabled={item.qty === 0}
                        className="w-8 h-8 rounded-xl bg-dark-800 hover:bg-dark-700 text-white flex items-center justify-center font-bold disabled:opacity-30"
                      >
                        <Minus className="w-4 h-4" />
                      </button>

                      <span className="w-8 text-center font-mono font-black text-base text-white">
                        {item.qty}
                      </span>

                      <button
                        type="button"
                        onClick={() => updateQty(idx, 1)}
                        className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center font-bold shadow-md"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Billing Drawer */}
            <div className="p-5 rounded-3xl bg-dark-900 border border-dark-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">भुगतान का माध्यम (Payment Mode)</h4>
                  <p className="text-[11px] text-dark-400">कुल सामान: {totalItemsCount} नग</p>
                </div>

                <div className="flex items-center gap-2 bg-dark-950 p-1.5 rounded-2xl border border-dark-800">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('Cash')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      paymentMode === 'Cash'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-dark-400 hover:text-white'
                    }`}
                  >
                    💵 नकद (Cash)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('UPI')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      paymentMode === 'UPI'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-dark-400 hover:text-white'
                    }`}
                  >
                    📱 ऑनलाइन (UPI)
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-dark-950 border border-dark-800">
                <span className="text-sm font-bold text-dark-300">कुल बिल रकम:</span>
                <span className="text-3xl font-black text-emerald-400 font-mono">
                  ₹{totalSaleAmount}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSaveSaleEntry}
                disabled={savingSale || totalSaleAmount <= 0}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-xl shadow-emerald-600/30 transition-all active:scale-95 disabled:opacity-50"
              >
                {savingSale ? 'सेव हो रहा है...' : '💰 बिक्री दर्ज करें (Record Sale)'}
              </button>
            </div>

          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 3: MY TODAY FEED                                       */}
        {/* ========================================================== */}
        {activeTab === 'MY_ENTRIES' && (
          <div className="p-5 rounded-3xl bg-dark-900 border border-dark-800 shadow-xl space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>आज मेरे द्वारा दर्ज की गई एंट्रीज ({todayEntries.length})</span>
            </h3>

            {todayEntries.length === 0 ? (
              <p className="text-xs text-dark-500 py-8 text-center">
                आज अभी तक आपके द्वारा कोई एंट्री दर्ज नहीं की गई है।
              </p>
            ) : (
              <div className="space-y-2.5">
                {todayEntries.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-dark-950 border border-dark-800 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                          item.type === 'MILK' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {item.type === 'MILK' ? 'दूध आवक' : 'बिक्री'}
                        </span>
                        <span className="font-mono text-dark-400 text-[10px]">{item.time}</span>
                      </div>
                      <p className="font-bold text-white text-xs">{item.desc}</p>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-emerald-400 font-mono">₹{item.amount}</span>
                      {item.mode && <span className="text-[10px] text-dark-400 block">{item.mode}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

    </div>
  );
};
