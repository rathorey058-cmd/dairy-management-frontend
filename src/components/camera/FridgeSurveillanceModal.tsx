import React, { useState, useEffect } from 'react';
import API from '../../api';
import { 
  Store, AlertTriangle, Clock, 
  Plus, X, ShieldAlert, Moon, Sun, 
  Package, Sparkles, RefreshCw
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const FridgeSurveillanceModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [fridgeItems, setFridgeItems] = useState<any[]>([]);
  const [accessLogs, setAccessLogs] = useState<any[]>([]);
  const [nightAlertsCount, setNightAlertsCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New item form
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [blockCode, setBlockCode] = useState('F1');
  const [shelfName, setShelfName] = useState('डीप फ्रीजर - मुख्य रैक');
  const [productName, setProductName] = useState('पनीर 200g');
  const [category, setCategory] = useState('Paneer');
  const [currentStock, setCurrentStock] = useState(15);
  const [capacity, setCapacity] = useState(30);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);

  const fetchFridgeData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await API.get('/cameras/fridge/status');
      setFridgeItems(res.data?.items || []);
      setAccessLogs(res.data?.recentAccessLogs || []);
      setNightAlertsCount(res.data?.nightAlertsCount || 0);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'फ्रिज डेटा लोड करने में त्रुटि आई।');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFridgeData();
    }
  }, [isOpen]);

  const handleSaveFridgeItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await API.post('/cameras/shelf-blocks', {
        blockCode,
        shelfName,
        productName,
        category,
        currentStock,
        capacity,
        lowStockThreshold,
        storageType: 'FRIDGE_FREEZER',
      });
      setIsAddingItem(false);
      fetchFridgeData();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'फ्रिज आइटम सेव करने में त्रुटि।');
    }
  };

  const handleTriggerFridgeAudit = async () => {
    try {
      setLoading(true);
      await API.post('/cameras/fridge/audit', {
        action: 'DOOR_OPEN',
        itemsAffected: ['पनीर 200g (1 नग)', 'फ्लेवर्ड मिल्क (1 बोतल)'],
        personName: 'स्टाफ आकाश',
        notes: 'AI विज़न ने दरवाजा खुलने और सामान निकाले जाने की पहचान की।',
      });
      fetchFridgeData();
    } catch (err: any) {
      setErrorMsg('ऑडिट दर्ज करने में त्रुटि आई।');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-dark-900 border border-dark-700 w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-dark-950 via-cyan-950/40 to-dark-950 border-b border-dark-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>फ्रिज व डीप-फ्रीजर AI निगरानी व रात्रि सुरक्षा हब</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  Cold Storage Surveillance
                </span>
              </h2>
              <p className="text-xs text-dark-300">
                फ्रिज में रखा सामान, स्टॉक की मात्रा और रात में किसी स्टाफ द्वारा सामान लेने या पीने पर तुरंत अलर्ट।
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerFridgeAudit}
              disabled={loading}
              className="py-1.5 px-3 rounded-xl bg-cyan-600/20 border border-cyan-500/40 hover:bg-cyan-600/30 text-cyan-300 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{loading ? 'ऑडिट जारी...' : 'फ्रिज AI टेस्ट ऑडिट'}</span>
            </button>
            <button
              onClick={fetchFridgeData}
              disabled={loading}
              title="रीफ्रेश करें"
              className="p-2 rounded-xl bg-dark-800 text-dark-300 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Night Security Alert Banner */}
        {nightAlertsCount > 0 && (
          <div className="p-3.5 bg-rose-950/40 border-b border-rose-500/30 px-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                  <span>🚨 {nightAlertsCount} रात्रि अनधिकृत फ्रिज एक्टिविटी पाई गईं!</span>
                </h4>
                <p className="text-[11px] text-rose-200">
                  दुकान बंद होने के बाद रात 10:00 PM से सुबह 06:00 AM के बीच फ्रिज खोला गया था।
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-rose-600/30 text-rose-300 text-[10px] font-bold border border-rose-500/40">
              HIGH ALERT
            </span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Top Section: Fridge Items Stock Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-cyan-400" />
                <span>फ्रिज / फ्रीजर में रखे सामान की वर्तमान स्थिति ({fridgeItems.length})</span>
              </h3>

              {!isAddingItem && (
                <button
                  type="button"
                  onClick={() => setIsAddingItem(true)}
                  className="py-1.5 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-all active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>नया फ्रिज आइटम जोड़ें</span>
                </button>
              )}
            </div>

            {/* Add Item Form */}
            {isAddingItem && (
              <form onSubmit={handleSaveFridgeItem} className="p-4 rounded-2xl bg-dark-950 border border-cyan-500/40 shadow-lg space-y-3 animate-fade-in">
                <div className="flex items-center justify-between border-b border-dark-800 pb-2">
                  <span className="text-xs font-bold text-white">फ्रिज में नया सामान रजिस्टर करें</span>
                  <button type="button" onClick={() => setIsAddingItem(false)} className="text-xs text-dark-400 hover:text-white">रद्द करें</button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-dark-400 uppercase">ब्लॉक कोड</label>
                    <input
                      type="text"
                      value={blockCode}
                      onChange={(e) => setBlockCode(e.target.value)}
                      placeholder="उदा: F1"
                      className="w-full mt-1 p-2 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-dark-400 uppercase">रैक / ट्रे का नाम</label>
                    <input
                      type="text"
                      value={shelfName}
                      onChange={(e) => setShelfName(e.target.value)}
                      placeholder="उदा: ऊपर की ट्रे"
                      className="w-full mt-1 p-2 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-dark-400 uppercase">प्रोडक्ट नाम</label>
                    <input
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="उदा: पनीर 200g"
                      className="w-full mt-1 p-2 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-dark-400 uppercase">वर्तमान स्टॉक (नग)</label>
                    <input
                      type="number"
                      value={currentStock}
                      onChange={(e) => setCurrentStock(parseInt(e.target.value, 10))}
                      className="w-full mt-1 p-2 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-dark-400 uppercase">श्रेणी</label>
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="उदा: Paneer"
                      className="w-full mt-1 p-2 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-dark-400 uppercase">क्षमता (Capacity)</label>
                    <input
                      type="number"
                      value={capacity}
                      onChange={(e) => setCapacity(parseInt(e.target.value, 10))}
                      className="w-full mt-1 p-2 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-dark-400 uppercase">कम स्टॉक अलर्ट स्तर</label>
                    <input
                      type="number"
                      value={lowStockThreshold}
                      onChange={(e) => setLowStockThreshold(parseInt(e.target.value, 10))}
                      className="w-full mt-1 p-2 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-dark-800">
                  <button type="button" onClick={() => setIsAddingItem(false)} className="py-1.5 px-3 rounded-xl bg-dark-900 text-xs text-dark-300">रद्द करें</button>
                  <button type="submit" className="py-1.5 px-4 rounded-xl bg-cyan-600 text-white text-xs font-bold">सेव करें</button>
                </div>
              </form>
            )}

            {/* Items Cards */}
            {fridgeItems.length === 0 ? (
              <div className="p-6 rounded-2xl bg-dark-950 border border-dark-800 text-center text-xs text-dark-400">
                फ्रिज में अभी कोई सामान दर्ज नहीं है। ऊपर दिए गए "नया फ्रिज आइटम जोड़ें" बटन से पनीर, दही, या दूध के पैकेट जोड़ें।
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {fridgeItems.map((item) => (
                  <div key={item._id} className="p-3.5 rounded-2xl bg-dark-950 border border-dark-800 hover:border-cyan-500/40 transition-all space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 font-mono font-bold">
                        {item.blockCode}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${item.status === 'EMPTY' ? 'bg-rose-400' : item.status === 'LOW_STOCK' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-white truncate">{item.productName}</h4>
                      <p className="text-[10px] text-dark-400">{item.shelfName}</p>
                    </div>

                    <div className="flex items-baseline justify-between pt-1 border-t border-dark-900">
                      <span className="text-lg font-black text-white font-mono">{item.currentStock}</span>
                      <span className="text-[10px] text-dark-400">/ क्षमता {item.capacity}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Section: Access Log & Night Events Timeline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>फ्रिज खुलने व सामान निकासी का टाइमलाइन लॉग</span>
              </h3>
              <span className="text-xs text-dark-400 font-mono">हालिया 20 घटनाएं</span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {accessLogs.length === 0 ? (
                <div className="p-4 rounded-xl bg-dark-950 border border-dark-800 text-xs text-dark-500 text-center">
                  अभी तक कोई फ्रिज ओपनिंग घटना दर्ज नहीं हुई।
                </div>
              ) : (
                accessLogs.map((log) => {
                  const isNight = log.fridgeDetails?.isNightAlert;
                  return (
                    <div
                      key={log._id}
                      className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-3 transition-all ${
                        isNight
                          ? 'bg-rose-950/20 border-rose-500/40 text-rose-200'
                          : 'bg-dark-950 border-dark-800 text-dark-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isNight ? 'bg-rose-500/20 text-rose-400' : 'bg-dark-900 text-cyan-400'
                        }`}>
                          {isNight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">
                              {log.personName || 'स्टाफ'}
                            </span>
                            {isNight && (
                              <span className="text-[9px] px-2 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                                🚨 रात्रि चोरी/अनधिकृत अलर्ट
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-dark-300 mt-0.5">
                            {log.notes || 'दरवाजा खोला गया'}
                          </p>
                          {log.fridgeDetails?.itemsAffected?.length > 0 && (
                            <p className="text-[10px] text-cyan-300 mt-0.5 font-mono">
                              सामान: {log.fridgeDetails.itemsAffected.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-mono text-dark-400 block">
                          {new Date(log.timestamp).toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-[9px] font-mono text-dark-500 block">
                          {new Date(log.timestamp).toLocaleDateString('hi-IN')}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-dark-950 border-t border-dark-800 flex items-center justify-between shrink-0">
          <p className="text-xs text-dark-400">
            💡 रात 10:00 PM से सुबह 06:00 AM के बीच फ्रिज खुलने पर AI अपने-आप ओनर को अलर्ट करता है।
          </p>
          <button
            onClick={onClose}
            className="py-2 px-6 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-md"
          >
            बंद करें
          </button>
        </div>

      </div>
    </div>
  );
};
