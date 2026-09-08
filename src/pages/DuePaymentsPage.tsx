import React, { useEffect, useState, useCallback } from 'react';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  CreditCard, Users, Search, DollarSign, 
  FileText, MessageSquare, Phone, MapPin, 
  Sparkles, Calendar
} from 'lucide-react';

interface DueCustomer {
  _id: string;
  name: string;
  mobile: string;
  address?: string;
  area?: string;
  creditLimit: number;
  outstandingBalance: number;
  bandhiNo: number | null;
  updatedAt: string;
}

interface DueSummary {
  totalMarketDue: number;
  totalDueCustomers: number;
  todayCollectedAmount: number;
}

interface LedgerEntry {
  _id: string;
  date: string;
  description: string;
  type: 'INVOICE' | 'PAYMENT' | 'ADJUSTMENT';
  amount: number;
  balance: number;
}

export const DuePaymentsPage: React.FC = () => {
  useAuth();

  const [customers, setCustomers] = useState<DueCustomer[]>([]);
  const [summary, setSummary] = useState<DueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyDue, setOnlyDue] = useState(true);

  // Payment Collection Modal State
  const [selectedCustomer, setSelectedCustomer] = useState<DueCustomer | null>(null);
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [collectAmount, setCollectAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Bank'>('Cash');
  const [collectNotes, setCollectNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Ledger Statement Modal State
  const [ledgerCustomer, setLedgerCustomer] = useState<DueCustomer | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Load Due Customers
  const loadDueCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get(`/udhari?search=${search}&onlyDue=${onlyDue}`);
      setCustomers(res.data.customers || []);
      setSummary(res.data.summary || null);
    } catch (error) {
      console.error('Failed to load due customers', error);
    } finally {
      setLoading(false);
    }
  }, [search, onlyDue]);

  useEffect(() => {
    loadDueCustomers();
  }, [loadDueCustomers]);

  // Open Payment Collection Modal
  const handleOpenCollect = (cust: DueCustomer) => {
    setSelectedCustomer(cust);
    setCollectAmount(String(cust.outstandingBalance > 0 ? cust.outstandingBalance : ''));
    setCollectNotes('');
    setPaymentMode('Cash');
    setIsCollectModalOpen(true);
  };

  // Submit Payment Collection
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const amt = parseFloat(collectAmount);
    if (!amt || amt <= 0) {
      alert('कृपया वैध भुगतान राशि दर्ज करें।');
      return;
    }

    try {
      setSubmittingPayment(true);
      const res = await API.post('/udhari/collect', {
        customerId: selectedCustomer._id,
        amount: amt,
        paymentMode,
        notes: collectNotes,
      });

      alert(`✅ ${res.data.message}`);
      setIsCollectModalOpen(false);
      loadDueCustomers();
    } catch (error: any) {
      alert('त्रुटि: ' + (error.response?.data?.message || error.message));
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Open Ledger Statement Modal
  const handleOpenLedger = async (cust: DueCustomer) => {
    setLedgerCustomer(cust);
    setIsLedgerModalOpen(true);
    try {
      setLoadingLedger(true);
      const res = await API.get(`/udhari/statement/${cust._id}`);
      setLedgerEntries(res.data.ledgerEntries || []);
    } catch (error) {
      console.error('Failed to load customer statement', error);
    } finally {
      setLoadingLedger(false);
    }
  };

  // WhatsApp Reminder Link
  const handleSendWhatsAppReminder = (cust: DueCustomer) => {
    const cleanMobile = cust.mobile.replace(/\D/g, '');
    const mobileWithCountry = cleanMobile.startsWith('91') ? cleanMobile : `91${cleanMobile}`;
    const text = encodeURIComponent(
      `नमस्ते ${cust.name} जी,\nडेयरी से आपका कुल बकाया ₹${cust.outstandingBalance.toLocaleString('en-IN')} रुपये शेष है। कृपया समय पर भुगतान करने की कृपा करें।\nधन्यवाद!`
    );
    window.open(`https://wa.me/${mobileWithCountry}?text=${text}`, '_blank');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-1">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-amber-400" />
            <span>उधारी व ग्राहक खाता (Due Payments & Ledger)</span>
          </h2>
          <p className="text-xs text-dark-400 font-medium">
            बाजार उधारी, तगादा (WhatsApp Reminder) व गल्ला आवक कलेक्शन
          </p>
        </div>
      </div>

      {/* Voice Assistant Tip */}
      <div className="bg-gradient-to-r from-amber-950/30 via-dark-900 to-emerald-950/30 border border-amber-500/30 rounded-3xl p-4 shadow-lg flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <span className="text-xs font-extrabold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎙️ वॉयस कमांड से उधारी जमा करें</span>
            </span>
            <p className="text-xs text-dark-200 mt-0.5">
              बोलें: <span className="text-white font-semibold italic">"रमेश जी से 1000 रुपये उधारी जमा करो"</span> या <span className="text-white font-semibold italic">"किस-किस की उधारी बाकी है?"</span>
            </p>
          </div>
        </div>
      </div>

      {/* Top Summary Metrics */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl" />
            <span className="text-[11px] font-extrabold text-amber-400 uppercase tracking-wider">
              कुल बाजार बकाया उधारी
            </span>
            <div className="mt-3">
              <h3 className="text-3xl font-black text-white">
                ₹{summary.totalMarketDue.toLocaleString('en-IN')}
              </h3>
              <p className="text-[10px] text-dark-400 font-medium mt-1">मार्केट में कुल बकाया राशि</p>
            </div>
          </div>

          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl" />
            <span className="text-[11px] font-extrabold text-rose-400 uppercase tracking-wider">
              बकायादार ग्राहक संख्या
            </span>
            <div className="mt-3">
              <h3 className="text-3xl font-black text-white">{summary.totalDueCustomers} ग्राहक</h3>
              <p className="text-[10px] text-dark-400 font-medium mt-1">जिन पर उधारी शेष है</p>
            </div>
          </div>

          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl" />
            <span className="text-[11px] font-extrabold text-emerald-400 uppercase tracking-wider">
              आज प्राप्त उधारी (गल्ला आवक)
            </span>
            <div className="mt-3">
              <h3 className="text-3xl font-black text-emerald-400">
                ₹{summary.todayCollectedAmount.toLocaleString('en-IN')}
              </h3>
              <p className="text-[10px] text-dark-400 font-medium mt-1">आज गल्ले में जमा हुई राशि</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-dark-900 border border-dark-800 p-4 rounded-3xl">
        <div className="flex items-center gap-2 bg-dark-950 border border-dark-800 rounded-2xl px-3 py-2 w-full sm:w-80">
          <Search className="w-4 h-4 text-dark-400" />
          <input
            type="text"
            placeholder="नाम, मोबाइल, बांधी नं खोजें..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-white text-xs outline-none w-full placeholder:text-dark-500"
          />
        </div>

        <div className="flex items-center gap-2 bg-dark-950 border border-dark-800 p-1 rounded-2xl">
          <button
            onClick={() => setOnlyDue(true)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              onlyDue
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            केवल बकाया ग्राहक (Due Only)
          </button>
          <button
            onClick={() => setOnlyDue(false)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              !onlyDue
                ? 'bg-primary-600 text-white shadow-md'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            सभी ग्राहक (All)
          </button>
        </div>
      </div>

      {/* Customer Due List */}
      <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-dark-800">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400" />
            <span>ग्राहक उधारी सूची ({customers.length} ग्राहक)</span>
          </h3>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center items-center">
            <div className="w-8 h-8 rounded-full border-2 border-primary-500/20 border-t-primary-500 animate-spin" />
          </div>
        ) : customers.length === 0 ? (
          <div className="py-12 text-center text-dark-400 text-xs font-medium">
            कोई बकाया ग्राहक नहीं मिला।
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {customers.map((c) => (
              <div
                key={c._id}
                className="bg-dark-950 border border-dark-800 rounded-3xl p-4 shadow-md flex flex-col justify-between space-y-3 hover:border-amber-500/30 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-amber-950/40 border border-amber-800/40 text-amber-400 flex items-center justify-center font-black text-sm">
                      {c.bandhiNo ? `#${c.bandhiNo}` : '👤'}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">{c.name}</h4>
                      <p className="text-[11px] text-dark-400 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        <span>{c.mobile}</span>
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-dark-400 block font-bold">बकाया उधारी</span>
                    <span className="text-base font-black text-amber-400">
                      ₹{c.outstandingBalance.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {c.address && (
                  <p className="text-[11px] text-dark-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-dark-500 flex-shrink-0" />
                    <span className="truncate">{c.address}</span>
                  </p>
                )}

                {/* Actions */}
                <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-dark-900">
                  <button
                    onClick={() => handleOpenCollect(c)}
                    className="flex items-center justify-center gap-1 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[11px] font-black shadow-md hover:brightness-110 active:scale-95 transition-all"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>जमा करें</span>
                  </button>

                  <button
                    onClick={() => handleOpenLedger(c)}
                    className="flex items-center justify-center gap-1 py-2 rounded-xl bg-dark-800 border border-dark-700 text-dark-200 hover:text-white text-[11px] font-bold transition-all"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>खाता</span>
                  </button>

                  <button
                    onClick={() => handleSendWhatsAppReminder(c)}
                    className="flex items-center justify-center gap-1 py-2 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 hover:bg-emerald-900/40 text-[11px] font-bold transition-all"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>तगादा</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Collect Due Payment Modal */}
      {isCollectModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-dark-800">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-black text-white">उधारी भुगतान जमा करें</h3>
              </div>
              <button
                onClick={() => setIsCollectModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-dark-800 text-dark-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Customer Header Info */}
            <div className="bg-dark-950 p-4 rounded-2xl border border-dark-800 flex justify-between items-center">
              <div>
                <h4 className="text-sm font-black text-white">{selectedCustomer.name}</h4>
                <p className="text-xs text-dark-400 mt-0.5">{selectedCustomer.mobile}</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-dark-400 font-bold block">वर्तमान कुल उधारी</span>
                <span className="text-sm font-black text-amber-400">
                  ₹{selectedCustomer.outstandingBalance.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmitPayment} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-dark-400 block mb-1">जमा राशि (Amount) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-black text-dark-400">₹</span>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="उदा. 1000"
                    value={collectAmount}
                    onChange={(e) => setCollectAmount(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-800 rounded-2xl pl-7 pr-3 py-2 text-sm font-black text-white outline-none"
                  />
                </div>

                {/* Quick Amount Chips */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[200, 500, 1000, 2000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCollectAmount(String(amt))}
                      className="px-2.5 py-1 rounded-xl bg-dark-800 text-[10px] font-bold text-dark-300 hover:text-white hover:bg-dark-700"
                    >
                      +₹{amt}
                    </button>
                  ))}
                  {selectedCustomer.outstandingBalance > 0 && (
                    <button
                      type="button"
                      onClick={() => setCollectAmount(String(selectedCustomer.outstandingBalance))}
                      className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold"
                    >
                      पूरा चुकता (₹{selectedCustomer.outstandingBalance})
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-dark-400 block mb-1">भुगतान माध्यम *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Cash', 'UPI', 'Bank'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all ${
                        paymentMode === mode
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'bg-dark-950 border border-dark-800 text-dark-400'
                      }`}
                    >
                      {mode === 'Cash' ? '💵 नकद (गल्ला)' : mode === 'UPI' ? '📱 UPI' : '🏦 बैंक'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-dark-400 block mb-1">विवरण / नोट्स</label>
                <input
                  type="text"
                  placeholder="उदा. नकद प्राप्त / Google Pay"
                  value={collectNotes}
                  onChange={(e) => setCollectNotes(e.target.value)}
                  className="w-full bg-dark-950 border border-dark-800 rounded-2xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submittingPayment}
                  className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-black shadow-lg hover:brightness-110 active:scale-95 transition-all"
                >
                  {submittingPayment ? 'जमा हो रहा है...' : 'जमा पुष्टि करें व गल्ला अपडेट करें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Ledger Statement Modal */}
      {isLedgerModalOpen && ledgerCustomer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-6 w-full max-w-2xl shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-dark-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-400" />
                <div>
                  <h3 className="text-base font-black text-white">{ledgerCustomer.name} का खाता</h3>
                  <p className="text-xs text-dark-400">मोबाइल: {ledgerCustomer.mobile}</p>
                </div>
              </div>
              <button
                onClick={() => setIsLedgerModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-dark-800 text-dark-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Current Balance Banner */}
            <div className="bg-dark-950 p-4 rounded-2xl border border-dark-800 flex justify-between items-center">
              <span className="text-xs font-bold text-dark-300">वर्तमान कुल बकाया उधारी:</span>
              <span className="text-lg font-black text-amber-400">
                ₹{ledgerCustomer.outstandingBalance.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Ledger Transactions List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {loadingLedger ? (
                <div className="py-12 flex justify-center items-center">
                  <div className="w-8 h-8 rounded-full border-2 border-primary-500/20 border-t-primary-500 animate-spin" />
                </div>
              ) : ledgerEntries.length === 0 ? (
                <div className="py-12 text-center text-dark-400 text-xs font-medium">
                  कोई लेनदेन इतिहास नहीं मिला।
                </div>
              ) : (
                ledgerEntries.map((item) => (
                  <div
                    key={item._id}
                    className="bg-dark-950 border border-dark-800 rounded-2xl p-3 flex justify-between items-center gap-3"
                  >
                    <div>
                      <span className="text-xs font-bold text-white block">{item.description}</span>
                      <span className="text-[10px] text-dark-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(item.date).toLocaleDateString('hi-IN')}</span>
                      </span>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span
                        className={`text-xs font-black block ${
                          item.amount > 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {item.amount > 0 ? `+ ₹${item.amount}` : `- ₹${Math.abs(item.amount)}`}
                      </span>
                      <span className="text-[10px] text-dark-400">
                        शेष: ₹{item.balance}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
