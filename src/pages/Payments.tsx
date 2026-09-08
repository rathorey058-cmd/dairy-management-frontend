import React, { useEffect, useState } from 'react';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  Wallet, ArrowDownCircle, ArrowUpCircle, CheckCircle, 
  ShieldAlert, FileText, Printer, Share2
} from 'lucide-react';

interface FarmerObj {
  _id: string;
  farmerId: string;
  name: string;
  mobile: string;
  village: string;
  openingBalance: number;
  openingAdvance: number;
}

interface FarmerDetails {
  ledgerBalance: number;
  outstandingAdvance: number;
}

export const Payments: React.FC = () => {
  useAuth();
  
  // Lists
  const [farmers, setFarmers] = useState<FarmerObj[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Farmer details
  const [selectedFarmerId, setSelectedFarmerId] = useState('');
  const [farmerDetails, setFarmerDetails] = useState<FarmerDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Tab mode
  const [mode, setMode] = useState<'advance' | 'payment' | 'settlement'>('payment');

  // Input states
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Bank'>('Cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Statuses
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Receipt modal state
  const [receiptData, setReceiptData] = useState<any | null>(null);

  useEffect(() => {
    const fetchFarmers = async () => {
      try {
        const res = await API.get('/farmers');
        setFarmers(res.data);
      } catch (err) {
        console.error('Failed to load farmers', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFarmers();
  }, []);

  const handleFarmerChange = async (farmerId: string) => {
    setSelectedFarmerId(farmerId);
    setSuccessMsg(null);
    setErrorMsg(null);
    setReceiptData(null);
    if (!farmerId) {
      setFarmerDetails(null);
      return;
    }

    setDetailsLoading(true);
    try {
      // Retrieve ledger to find latest balance
      const ledgerRes = await API.get(`/farmers/${farmerId}/ledger`);
      const ledger = ledgerRes.data;
      const ledgerBalance = ledger.length > 0 ? ledger[ledger.length - 1].balance : 0;

      // In a production app, we retrieve outstanding advances. Let's make a mock calculation or API call.
      // We retrieve history of advances

      // Filter for outstanding advance calculation
      // For this prototype, we compute active advances sum directly
      // In production, we'd fetch outstanding advances, let's query ledger advances vs settled
      const advances = ledger.filter((l: any) => l.transactionType === 'ADVANCE_GIVEN');
      const adjustments = ledger.filter((l: any) => l.transactionType === 'ADJUSTMENT');
      
      const totalAdv = advances.reduce((acc: number, curr: any) => acc + Math.abs(curr.amount), 0);
      const totalAdj = adjustments.reduce((acc: number, curr: any) => acc + Math.abs(curr.amount), 0);
      const outstandingAdvance = Math.max(0, totalAdv - totalAdj);

      setFarmerDetails({
        ledgerBalance,
        outstandingAdvance
      });

      // If in settlement mode, prefill amountPaid with suggested net payable
      if (mode === 'settlement') {
        const net = Math.max(0, ledgerBalance - outstandingAdvance);
        setAmount(String(net));
      }
    } catch (err) {
      console.error('Failed to load farmer financial metrics', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFarmerId || !amount) {
      setErrorMsg('Please select a farmer and enter amount.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      let endpoint = '';
      const payload: any = {
        farmerId: selectedFarmerId,
        paymentMode,
        referenceNumber,
        notes
      };

      if (mode === 'advance') {
        endpoint = '/payments/advance';
        payload.amount = parseFloat(amount);
      } else if (mode === 'payment') {
        endpoint = '/payments/pay';
        payload.amount = parseFloat(amount);
      } else {
        endpoint = '/payments/settle';
        payload.amountPaid = parseFloat(amount);
      }

      const res = await API.post(endpoint, payload);

      if (mode === 'settlement') {
        // Fetch receipt data
        const receiptRes = await API.get(`/payments/settlement/${res.data._id}`);
        setReceiptData(receiptRes.data);
        setSuccessMsg('Account settlement processed successfully!');
      } else {
        setSuccessMsg(`${mode === 'advance' ? 'Advance' : 'Payment'} saved successfully!`);
      }

      // Reset input fields
      setAmount('');
      setReferenceNumber('');
      setNotes('');
      
      // Reload farmer metrics
      await handleFarmerChange(selectedFarmerId);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Transaction booking failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredFarmers = farmers.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.farmerId.toLowerCase().includes(searchQuery.toLowerCase())
  );



  // Settlement suggested net payable math
  const ledgerBalance = farmerDetails?.ledgerBalance || 0;
  const outstandingAdvance = farmerDetails?.outstandingAdvance || 0;
  const suggestedNetPayable = Math.max(0, ledgerBalance - outstandingAdvance);

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
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />
        
        <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-purple-400" />
          <span>Farmers Bookkeeping & Payments</span>
        </h2>

        {successMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-900/50 flex gap-2.5 text-xs text-emerald-400 font-medium mb-4">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-900/50 flex gap-2.5 text-xs text-red-400 font-medium mb-4">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Tab mode switches */}
        <div className="grid grid-cols-3 gap-2 bg-dark-950 p-1.5 rounded-2xl border border-dark-800 mb-4">
          <button
            onClick={() => { setMode('payment'); setReceiptData(null); setSuccessMsg(null); }}
            className={`py-2 rounded-xl text-xs font-bold transition-all ${
              mode === 'payment' ? 'bg-purple-600 text-white shadow-md' : 'text-dark-400'
            }`}
          >
            Make Payment
          </button>
          <button
            onClick={() => { setMode('advance'); setReceiptData(null); setSuccessMsg(null); }}
            className={`py-2 rounded-xl text-xs font-bold transition-all ${
              mode === 'advance' ? 'bg-purple-600 text-white shadow-md' : 'text-dark-400'
            }`}
          >
            Give Advance
          </button>
          <button
            onClick={() => { setMode('settlement'); setReceiptData(null); setSuccessMsg(null); }}
            className={`py-2 rounded-xl text-xs font-bold transition-all ${
              mode === 'settlement' ? 'bg-purple-600 text-white shadow-md' : 'text-dark-400'
            }`}
          >
            Settle Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Farmer suggestion */}
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
                className="w-full px-4 py-2.5 rounded-xl bg-dark-950/60 border border-dark-800 text-sm placeholder-dark-600 focus:outline-none focus:border-purple-500 text-white"
              />
              <select
                value={selectedFarmerId}
                onChange={(e) => handleFarmerChange(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-dark-950 border border-dark-800 text-sm text-white focus:outline-none focus:border-purple-500"
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

          {/* Farmer metrics displaying balance and outstanding advances */}
          {selectedFarmerId && (
            <div className="bg-dark-950/60 border border-dark-850 rounded-2xl p-4 space-y-3 relative shadow-inner">
              {detailsLoading ? (
                <div className="flex items-center justify-center py-2">
                  <div className="w-5 h-5 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-dark-500 font-bold uppercase tracking-wider">Current Milk Balance</span>
                    <p className="text-sm font-black text-white mt-0.5">₹{ledgerBalance.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-dark-500 font-bold uppercase tracking-wider">Outstanding Advance</span>
                    <p className="text-sm font-black text-rose-400 mt-0.5">₹{outstandingAdvance.toLocaleString('en-IN')}</p>
                  </div>
                  {mode === 'settlement' && (
                    <div className="col-span-2 pt-2.5 border-t border-dark-800 flex justify-between items-center">
                      <span className="font-extrabold text-primary-400">Suggested Net Payable:</span>
                      <span className="text-base font-black text-white">₹{suggestedNetPayable.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Amount and Payment Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                Amount (INR)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder={mode === 'settlement' ? String(suggestedNetPayable) : 'Amount'}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-3 rounded-xl bg-dark-950 border border-dark-800 text-sm text-white focus:outline-none focus:border-purple-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as any)}
                className="w-full px-3 py-3 rounded-xl bg-dark-950 border border-dark-800 text-sm text-white focus:outline-none"
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI / NetBanking</option>
                <option value="Bank">Direct Bank Transfer</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                Reference Number (opt)
              </label>
              <input
                type="text"
                placeholder="TXN ID / Cash slip no."
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                Notes
              </label>
              <input
                type="text"
                placeholder="Remarks..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !selectedFarmerId}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-500 text-sm font-bold text-white shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {mode === 'advance' ? (
              <ArrowUpCircle className="w-4 h-4" />
            ) : mode === 'payment' ? (
              <ArrowDownCircle className="w-4 h-4" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            <span>
              {isSubmitting 
                ? 'Processing...' 
                : mode === 'advance' 
                  ? 'Disburse Advance' 
                  : mode === 'payment' 
                    ? 'Record Payment' 
                    : 'Process Account Settlement'
              }
            </span>
          </button>
        </form>
      </div>

      {/* Printable Settlement Receipt Box */}
      {receiptData && (
        <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg relative divide-y divide-dark-800/60 space-y-4">
          
          {/* Header */}
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black uppercase tracking-wider text-dark-400 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-purple-400" />
              Settlement Receipt
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="p-1.5 rounded-lg bg-dark-850 border border-dark-800 text-dark-300 hover:text-white"
                title="Print"
              >
                <Printer className="w-3.5 h-3.5" />
              </button>
              <button
                className="p-1.5 rounded-lg bg-dark-850 border border-dark-800 text-dark-300 hover:text-white"
                title="Share"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Details */}
          <div className="pt-4 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-dark-500 font-medium">Farmer ID:</span>
              <span className="font-bold text-white">[{receiptData.farmer?.farmerId}]</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-500 font-medium">Farmer Name:</span>
              <span className="font-bold text-white">{receiptData.farmer?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-500 font-medium">Village:</span>
              <span className="font-bold text-white">{receiptData.farmer?.village}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-500 font-medium">Date:</span>
              <span className="font-bold text-white">{new Date(receiptData.date).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Math breakdown */}
          <div className="pt-4 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-dark-400 font-medium">Gross Milk supplied value:</span>
              <span className="font-extrabold text-white">₹{receiptData.milkValue.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-rose-400 font-medium">Less: Outstanding Advance Adjusted:</span>
              <span className="font-extrabold text-rose-400">-₹{receiptData.advanceAdjusted.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between border-t border-dark-850 pt-2 font-black text-sm">
              <span className="text-primary-400">Net Payable Amount:</span>
              <span className="text-white">₹{receiptData.netPayable.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between pt-1 font-black text-sm">
              <span className="text-emerald-400">Net Amount Paid:</span>
              <span className="text-emerald-400">₹{receiptData.amountPaid.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="pt-3 text-[10px] text-center text-dark-500 font-medium">
            Krishna Dairy, Jaipur • Automated Transaction Stamp
          </div>

        </div>
      )}

    </div>
  );
};
