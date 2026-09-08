import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import { DateRangeFilter, type DateRange } from '../components/DateRangeFilter';
import { 
  Users, Search, PlusCircle, MapPin, Phone, ArrowLeftRight, Eye 
} from 'lucide-react';

interface FarmerObj {
  _id: string;
  farmerId: string;
  name: string;
  mobile: string;
  village: string;
  address?: string;
  status: 'Active' | 'Inactive';
  openingBalance: number;
  openingAdvance: number;
  fatRate?: number;
}

interface LedgerObj {
  _id: string;
  date: string;
  description: string;
  transactionType: string;
  amount: number;
  balance: number;
}

interface HistoryObj {
  _id: string;
  date: string;
  shift: string;
  milkType: string;
  quantity: number;
  fat: number;
  snf: number;
  rate: number;
  amount: number;
}

export const FarmersList: React.FC = () => {
  const { t } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Lists
  const [farmers, setFarmers] = useState<FarmerObj[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [villageFilter, setVillageFilter] = useState('');

  useEffect(() => {
    const qSearch = searchParams.get('search');
    if (qSearch !== null) {
      setSearchQuery(qSearch);
    }
  }, [searchParams]);

  // Modals & Panels
  const [showAddForm, setShowAddForm] = useState(false);
  const [inspectFarmer, setInspectFarmer] = useState<FarmerObj | null>(null);
  const [inspectMode, setInspectMode] = useState<'ledger' | 'milk' | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerObj[]>([]);
  const [milkEntries, setMilkEntries] = useState<HistoryObj[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form input fields
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [village, setVillage] = useState('');
  const [address, setAddress] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upi, setUpi] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingAdvance, setOpeningAdvance] = useState('');
  const [fatRate, setFatRate] = useState('');
  const [notes, setNotes] = useState('');

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const [inspectDateRange, setInspectDateRange] = useState<DateRange>({
    startDate: todayStr,
    endDate: todayStr,
    label: 'Today (आज)',
  });

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

  useEffect(() => {
    fetchFarmers();
  }, []);

  const loadFarmerDetails = useCallback(async (farmerId: string, mode: 'ledger' | 'milk', range: DateRange) => {
    setDetailLoading(true);
    try {
      if (mode === 'ledger') {
        const res = await API.get(`/farmers/${farmerId}/ledger?startDate=${range.startDate}&endDate=${range.endDate}`);
        setLedgerEntries(res.data);
      } else {
        const res = await API.get(`/farmers/${farmerId}/milk`);
        setMilkEntries(res.data);
      }
    } catch (err) {
      console.error('Failed to load farmer details', err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleOpenInspect = (farmer: FarmerObj, mode: 'ledger' | 'milk') => {
    setInspectFarmer(farmer);
    setInspectMode(mode);
    loadFarmerDetails(farmer._id, mode, inspectDateRange);
  };

  const handleDateRangeChange = (newRange: DateRange) => {
    setInspectDateRange(newRange);
    if (inspectFarmer && inspectMode) {
      loadFarmerDetails(inspectFarmer._id, inspectMode, newRange);
    }
  };

  const handleAddFarmer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !mobile || !village) {
      setFormError('Name, mobile and village are required.');
      return;
    }
    setFormError(null);
    setFormSubmitting(true);
    try {
      const payload = {
        name,
        mobile,
        village,
        address,
        bankAccount,
        ifsc,
        upi,
        openingBalance: openingBalance ? parseFloat(openingBalance) : 0,
        openingAdvance: openingAdvance ? parseFloat(openingAdvance) : 0,
        fatRate: fatRate ? parseFloat(fatRate) : 0,
        notes
      };

      await API.post('/farmers', payload);
      
      // Reset form & list
      setName('');
      setMobile('');
      setVillage('');
      setAddress('');
      setBankAccount('');
      setIfsc('');
      setUpi('');
      setOpeningBalance('');
      setOpeningAdvance('');
      setFatRate('');
      setNotes('');
      setShowAddForm(false);
      
      setLoading(true);
      await fetchFarmers();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to save farmer.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const filteredFarmers = farmers.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          f.farmerId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          f.mobile.includes(searchQuery);
    const matchesVillage = villageFilter === '' || f.village === villageFilter;
    return matchesSearch && matchesVillage;
  });

  const uniqueVillages = Array.from(new Set(farmers.map(f => f.village)));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500/20 border-t-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header section */}
      <div className="flex justify-between items-center px-1">
        <h2 className="text-lg font-black text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-teal-400" />
          <span>Farmers Directory</span>
        </h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-600 hover:brightness-110 active:scale-95 text-xs font-bold text-white shadow-md shadow-teal-500/20 transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{t('addFarmer')}</span>
        </button>
      </div>

      {/* Add Farmer Form Sliding Drawer/Block */}
      {showAddForm && (
        <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg relative animate-slideDown">
          <h3 className="text-sm font-bold text-white mb-3">Register New Milk Supplier</h3>
          {formError && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-900/50 text-xs text-red-400 font-medium mb-3">
              {formError}
            </div>
          )}
          <form onSubmit={handleAddFarmer} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                  Mobile Number *
                </label>
                <input
                  type="text"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                  Village / Area *
                </label>
                <input
                  type="text"
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  placeholder="e.g. Rampura"
                  className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                  Bank Account
                </label>
                <input
                  type="text"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  className="w-full px-2 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                  IFSC
                </label>
                <input
                  type="text"
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value)}
                  className="w-full px-2 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                  UPI ID
                </label>
                <input
                  type="text"
                  value={upi}
                  onChange={(e) => setUpi(e.target.value)}
                  placeholder="name@upi"
                  className="w-full px-2 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                  Opening Bal (INR)
                </label>
                <input
                  type="number"
                  placeholder="payable"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="w-full px-2 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                  Opening Adv (INR)
                </label>
                <input
                  type="number"
                  value={openingAdvance}
                  onChange={(e) => setOpeningAdvance(e.target.value)}
                  className="w-full px-2 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                  FAT Rate (₹/FAT)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 10.0"
                  value={fatRate}
                  onChange={(e) => setFatRate(e.target.value)}
                  className="w-full px-2 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 rounded-xl bg-dark-800 hover:bg-dark-750 text-xs font-bold text-dark-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formSubmitting}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:brightness-110 active:scale-95 text-xs font-bold text-white disabled:opacity-50"
              >
                {formSubmitting ? 'Saving...' : 'Register Farmer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Search name, ID or mobile..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-2xl bg-dark-900 border border-dark-800 text-xs text-white placeholder-dark-600 focus:outline-none focus:border-teal-500"
          />
        </div>
        
        <select
          value={villageFilter}
          onChange={(e) => setVillageFilter(e.target.value)}
          className="px-3 rounded-2xl bg-dark-900 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500"
        >
          <option value="">All Villages</option>
          {uniqueVillages.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      {/* Detail Inspection Drawer overlay */}
      {inspectFarmer && inspectMode && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-end p-2 md:p-4">
          <div className="bg-dark-900 border border-dark-800 w-full max-w-lg rounded-t-3xl md:rounded-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl relative animate-slideUp">
            
            <div className="flex justify-between items-center border-b border-dark-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">{inspectFarmer.name}</h3>
                <p className="text-[10px] text-dark-400 font-medium">
                  [{inspectFarmer.farmerId}] • {inspectFarmer.village}
                </p>
              </div>
              <button
                onClick={() => { setInspectFarmer(null); setInspectMode(null); }}
                className="px-3 py-1.5 bg-dark-800 border border-dark-700 text-xs font-bold text-dark-200 rounded-xl hover:text-white"
              >
                Close
              </button>
            </div>

            {/* Date Filter */}
            <DateRangeFilter value={inspectDateRange} onChange={handleDateRangeChange} />

            {detailLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 rounded-full border-2 border-primary-500/20 border-t-primary-500 animate-spin" />
              </div>
            ) : inspectMode === 'ledger' ? (
              <div className="space-y-3.5">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-dark-400">Account Ledger Transactions</h4>
                  <span className="text-[10px] text-teal-400 font-bold">{ledgerEntries.length} Entries</span>
                </div>
                <div className="space-y-2">
                  {ledgerEntries.length === 0 ? (
                    <p className="text-xs text-dark-500 text-center py-6">No ledger entries booked.</p>
                  ) : (
                    ledgerEntries.map((e) => (
                      <div key={e._id} className="bg-dark-950 p-3 rounded-2xl flex justify-between items-center text-xs border border-dark-800">
                        <div>
                          <p className="font-bold text-white">{e.description}</p>
                          <p className="text-[10px] text-dark-500 font-medium">{new Date(e.date).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${e.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {e.amount >= 0 ? '+' : ''}₹{e.amount.toFixed(2)}
                          </p>
                          <p className="text-[9px] text-dark-500">Balance: ₹{e.balance.toFixed(2)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-dark-400">Milk Supply History</h4>
                <div className="space-y-2">
                  {milkEntries.length === 0 ? (
                    <p className="text-xs text-dark-500 text-center py-6">No supply entries found.</p>
                  ) : (
                    milkEntries.map((e) => (
                      <div key={e._id} className="bg-dark-950 p-3 rounded-2xl flex justify-between items-center text-xs border border-dark-800">
                        <div>
                          <p className="font-bold text-white">
                            {e.quantity} Ltr • {e.milkType} ({e.shift})
                          </p>
                          <p className="text-[10px] text-dark-500 font-medium">{new Date(e.date).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right font-bold text-white">
                          <p>₹{e.amount.toFixed(2)}</p>
                          <p className="text-[9px] text-dark-500 font-medium">FAT: {e.fat}% • SNF: {e.snf}%</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Farmers Grid/List */}
      <div className="space-y-3">
        {filteredFarmers.length === 0 ? (
          <p className="text-xs text-dark-500 text-center py-10 bg-dark-900 rounded-3xl border border-dark-800">
            No farmers matched.
          </p>
        ) : (
          filteredFarmers.map((f) => (
            <div
              key={f._id}
              className="bg-dark-900 border border-dark-800 rounded-3xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{f.name}</h3>
                    <span className={`w-1.5 h-1.5 rounded-full ${f.status === 'Active' ? 'bg-emerald-400 animate-pulse' : 'bg-dark-600'}`} />
                  </div>
                  <div className="flex items-center gap-2.5 text-[10px] text-dark-400 font-medium mt-1">
                    <span className="bg-dark-800 px-2 py-0.5 rounded font-bold">{f.farmerId}</span>
                    <span className="flex items-center gap-0.5">
                      <MapPin className="w-3 h-3 text-dark-500" />
                      {f.village}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Phone className="w-3 h-3 text-dark-500" />
                      {f.mobile}
                    </span>
                  </div>
                </div>
                
                {/* Inspections Toggles */}
                <div className="flex gap-2.5">
                  <button
                    onClick={() => handleOpenInspect(f, 'ledger')}
                    className="p-2 bg-dark-800 rounded-xl text-dark-300 hover:text-white border border-dark-700/50 hover:bg-dark-750 transition-colors"
                    title={t('viewLedger')}
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleOpenInspect(f, 'milk')}
                    className="p-2 bg-dark-800 rounded-xl text-dark-300 hover:text-white border border-dark-700/50 hover:bg-dark-750 transition-colors"
                    title={t('viewMilk')}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Balances Display */}
              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-dark-800/60 text-xs">
                <div className="bg-dark-950 p-2 rounded-xl border border-dark-800/40">
                  <p className="text-[9px] font-extrabold text-dark-500 uppercase tracking-wide">Opening Bal</p>
                  <p className="font-bold text-white mt-0.5">₹{f.openingBalance.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-dark-950 p-2 rounded-xl border border-dark-800/40">
                  <p className="text-[9px] font-extrabold text-dark-500 uppercase tracking-wide">Opening Adv</p>
                  <p className="font-bold text-white mt-0.5">₹{f.openingAdvance.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-dark-950 p-2 rounded-xl border border-dark-800/40">
                  <p className="text-[9px] font-extrabold text-dark-500 uppercase tracking-wide">FAT Rate</p>
                  <p className="font-bold text-teal-400 mt-0.5">{f.fatRate ? `₹${f.fatRate}/FAT` : 'Standard'}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
