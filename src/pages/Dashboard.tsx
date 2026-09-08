import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api';
import { DateRangeFilter, type DateRange } from '../components/DateRangeFilter';
import { DirectMilkSaleModal } from '../components/DirectMilkSaleModal';
import { 
  Droplets, DollarSign, TrendingUp, Users, 
  Wallet, PlusCircle, AlertTriangle, UtensilsCrossed, Crown,
  SendHorizontal, RefreshCw, Factory, Package, ArrowRight,
  Truck, CreditCard
} from 'lucide-react';

interface MilkStats {
  totalQuantity: number;
  avgFat: number;
  avgSnf: number;
  totalCost: number;
  count: number;
}

interface InventorySummary {
  procuredMilk: number;
  usedInProduction: number;
  usedInBatches: number;
  usedInConversions: number;
  directSoldMilk: number;
  periodRemainingMilk: number;
  liveTankStock: number;
  productStocks: {
    paneer: number;
    ghee: number;
    curd: number;
    cream: number;
    butter: number;
    khoya: number;
  };
  allProducts: Array<{
    _id: string;
    name: string;
    category: string;
    unit: string;
    stockQty: number;
    sellingPrice: number;
  }>;
}

interface SummaryData {
  overall: MilkStats;
  morning?: MilkStats;
  evening?: MilkStats;
  inventory?: InventorySummary;
}

export const Dashboard: React.FC = () => {
  const { t, user, tenant } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' }));
  const [isMilkSaleOpen, setIsMilkSaleOpen] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: todayStr,
    endDate: todayStr,
    label: 'Today (आज)',
  });

  const fetchSummary = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setIsRefreshing(true);
      else setLoading(true);

      const res = await API.get(`/milk/collections/summary?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`);
      setSummary(res.data);
      setLastRefreshedAt(new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Failed to load dashboard summary', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Listen for Universal Global Refresh Event from DashboardLayout header
  useEffect(() => {
    const handleGlobalRefresh = () => {
      fetchSummary(true);
    };
    window.addEventListener('app:refresh', handleGlobalRefresh);
    return () => {
      window.removeEventListener('app:refresh', handleGlobalRefresh);
    };
  }, [fetchSummary]);

  const quickActions = [
    { label: 'दूध बांधी (Delivery)', icon: Truck, color: 'from-amber-600 to-orange-500', path: '/bandhi' },
    { label: 'उधारी / बकाया (Dues)', icon: CreditCard, color: 'from-rose-600 to-pink-500', path: '/udhari' },
    { label: 'Direct Milk Sale', icon: SendHorizontal, color: 'from-emerald-600 to-teal-500', action: () => setIsMilkSaleOpen(true) },
    { label: t('milkEntry'), icon: Droplets, color: 'from-blue-600 to-sky-500', path: '/milk' },
    { label: 'Production Hub', icon: Factory, color: 'from-indigo-600 to-purple-500', path: '/production' },
    { label: 'Menu & Barcodes', icon: UtensilsCrossed, color: 'from-teal-600 to-emerald-500', path: '/menu' },
    { label: t('farmers'), icon: Users, color: 'from-blue-600 to-indigo-500', path: '/farmers' },
    { label: t('payments'), icon: Wallet, color: 'from-purple-600 to-indigo-500', path: '/payments' },
    { label: t('galla'), icon: DollarSign, color: 'from-emerald-600 to-green-500', path: '/galla' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500/20 border-t-primary-500 animate-spin" />
      </div>
    );
  }

  // Helper values for display
  const milkQty = summary?.overall?.totalQuantity || 0;
  const avgFat = summary?.overall?.avgFat || 0;
  const avgSnf = summary?.overall?.avgSnf || 0;
  const milkCost = summary?.overall?.totalCost || 0;

  // Inventory & Remaining Milk values
  const inv = summary?.inventory;
  const procuredMilk = inv?.procuredMilk ?? milkQty;
  const usedInProduction = inv?.usedInProduction ?? 0;
  const directSoldMilk = inv?.directSoldMilk ?? 0;
  const remainingMilk = inv?.periodRemainingMilk ?? Math.max(0, procuredMilk - usedInProduction - directSoldMilk);
  const liveTankStock = inv?.liveTankStock ?? remainingMilk;
  const productStocks = inv?.productStocks || { paneer: 0, ghee: 0, curd: 0, cream: 0, butter: 0, khoya: 0 };

  // Expected calculations
  const expectedSales = milkQty > 0 ? Math.round(milkQty * 60 * 100) / 100 : 0;
  const expectedGalla = expectedSales;
  const expectedProfit = Math.round((expectedSales - milkCost) * 100) / 100;

  return (
    <div className="space-y-4">
      {/* Unified Dairy Owner & Operator Card */}
      <div className="bg-gradient-to-r from-dark-900 via-dark-900 to-teal-950/40 border border-teal-800/40 rounded-3xl p-4 md:p-5 shadow-lg relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-950 border border-teal-700/50 text-teal-400">
              <Crown className="w-3 h-3 text-amber-400" />
              <span>Dairy Owner & Operator (मालिक / संचालक)</span>
            </span>
            <h2 className="text-lg font-black text-white mt-1.5">{tenant?.name || 'Krishna Dairy & Chilling Plant'}</h2>
            <p className="text-xs text-dark-300 font-medium mt-0.5">
              Owner (मालिक): <span className="text-white font-bold">{tenant?.ownerName || user?.name || 'Rahul Sharma'}</span>
            </p>
          </div>
          <div className="text-right text-[10px] text-dark-400 space-y-0.5">
            <p className="font-semibold text-teal-400">📞 {tenant?.mobile || '9876543210'}</p>
            <p className="text-dark-400">{tenant?.address || 'Main Road, Rampura'}</p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-dark-800/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-dark-300 font-medium">Logged User: <strong className="text-white">{user?.name}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-dark-400">Updated: {lastRefreshedAt}</span>
            <button
              onClick={() => fetchSummary(true)}
              disabled={isRefreshing}
              className="p-1 rounded-md bg-dark-800 hover:bg-dark-700 text-teal-400 transition-all active:scale-95 border border-teal-900/60"
              title="रीफ्रेश करें"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Date Range Selector Bar */}
      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {/* ⭐ KEY FEATURE: Live Remaining Raw Milk & Flow Card ⭐ */}
      <div className="bg-gradient-to-br from-indigo-950/40 via-dark-900 to-dark-900 border-2 border-indigo-500/40 rounded-3xl p-4 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-indigo-400 shadow-md">
              <Droplets className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                <span>बचा हुआ कच्चा दूध (Remaining Milk)</span>
                <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.2 rounded-full font-bold">
                  Live
                </span>
              </h3>
              <p className="text-[10px] text-dark-400 font-medium">
                दूध संकलन - प्रोडक्शन में इस्तेमाल - सीधी बिक्री
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/production')}
            className="flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-950/80 border border-indigo-800/60 px-2.5 py-1 rounded-xl transition-all active:scale-95"
          >
            <span>प्रोडक्शन</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* Big Remaining Value */}
        <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-indigo-900/40">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-indigo-300">
                {remainingMilk.toLocaleString('en-IN')}
              </span>
              <span className="text-sm font-bold text-indigo-300">Litres</span>
            </div>
            <p className="text-[10px] text-indigo-400 font-semibold mt-0.5">
              {dateRange.label} की शेष उपलब्ध मात्रा
            </p>
          </div>

          <div className="text-right bg-dark-950/80 border border-indigo-900/50 px-3 py-1.5 rounded-2xl">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-dark-400 block">
              चिलिंग टैंक स्टॉक (Tank)
            </span>
            <span className="text-sm font-black text-emerald-400">
              {liveTankStock.toLocaleString('en-IN')} L
            </span>
          </div>
        </div>

        {/* Real-time Flow Formula Pills (+ Purchases - Production - Sales) */}
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-indigo-900/30">
          <div className="bg-dark-950/60 border border-blue-900/40 rounded-xl p-2 text-center">
            <span className="text-[9px] font-bold text-blue-400 block uppercase">📥 कुल खरीदा (+)</span>
            <span className="text-xs font-black text-white mt-0.5 block">+{procuredMilk} L</span>
          </div>
          <div className="bg-dark-950/60 border border-purple-900/40 rounded-xl p-2 text-center">
            <span className="text-[9px] font-bold text-purple-400 block uppercase">🏭 प्रोडक्शन (-)</span>
            <span className="text-xs font-black text-purple-300 mt-0.5 block">-{usedInProduction} L</span>
          </div>
          <div className="bg-dark-950/60 border border-teal-900/40 rounded-xl p-2 text-center">
            <span className="text-[9px] font-bold text-teal-400 block uppercase">🥛 सीधी बिक्री (-)</span>
            <span className="text-xs font-black text-teal-300 mt-0.5 block">-{directSoldMilk} L</span>
          </div>
        </div>
      </div>

      {/* ⭐ Finished Products Stock Hub (पनीर, घी, दही, क्रीम स्टॉक) ⭐ */}
      <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-teal-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              तैयार उत्पाद स्टॉक (Finished Products Stock)
            </h3>
          </div>
          <button
            onClick={() => navigate('/production')}
            className="text-[10px] font-bold text-teal-400 hover:text-teal-300 flex items-center gap-1 bg-teal-950/60 border border-teal-900/50 px-2 py-0.5 rounded-lg"
          >
            <span>+ नया प्रोडक्शन करें</span>
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {/* Paneer */}
          <div className="bg-dark-950/80 border border-dark-800 rounded-2xl p-2.5 text-center flex flex-col justify-between">
            <span className="text-lg mb-1">🧀</span>
            <span className="text-[10px] font-bold text-dark-300">पनीर (Paneer)</span>
            <span className="text-xs font-black text-amber-400 mt-1">
              {(productStocks.paneer || 0).toLocaleString('en-IN')} <span className="text-[9px] text-dark-400 font-normal">kg</span>
            </span>
          </div>

          {/* Ghee */}
          <div className="bg-dark-950/80 border border-dark-800 rounded-2xl p-2.5 text-center flex flex-col justify-between">
            <span className="text-lg mb-1">🧈</span>
            <span className="text-[10px] font-bold text-dark-300">देसी घी (Ghee)</span>
            <span className="text-xs font-black text-amber-300 mt-1">
              {(productStocks.ghee || 0).toLocaleString('en-IN')} <span className="text-[9px] text-dark-400 font-normal">kg</span>
            </span>
          </div>

          {/* Curd / Lassi */}
          <div className="bg-dark-950/80 border border-dark-800 rounded-2xl p-2.5 text-center flex flex-col justify-between">
            <span className="text-lg mb-1">🥛</span>
            <span className="text-[10px] font-bold text-dark-300">दही (Curd)</span>
            <span className="text-xs font-black text-sky-400 mt-1">
              {(productStocks.curd || 0).toLocaleString('en-IN')} <span className="text-[9px] text-dark-400 font-normal">L</span>
            </span>
          </div>

          {/* Cream / Malai */}
          <div className="bg-dark-950/80 border border-dark-800 rounded-2xl p-2.5 text-center flex flex-col justify-between">
            <span className="text-lg mb-1">🍨</span>
            <span className="text-[10px] font-bold text-dark-300">मलाई (Cream)</span>
            <span className="text-xs font-black text-emerald-400 mt-1">
              {(productStocks.cream || 0).toLocaleString('en-IN')} <span className="text-[9px] text-dark-400 font-normal">kg</span>
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Expected Galla Card */}
        <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 shadow-md relative overflow-hidden flex flex-col justify-between min-h-[110px]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/5 rounded-full blur-xl" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-dark-400">
              {t('expectedGalla')}
            </span>
            <span className="text-[10px] bg-primary-950 text-primary-400 px-2 py-0.5 rounded-full font-bold border border-primary-900/50">
              Est
            </span>
          </div>
          <div>
            <h3 className="text-xl font-black text-white mt-2">
              ₹{expectedGalla.toLocaleString('en-IN')}
            </h3>
            <p className="text-[10px] text-dark-500 font-medium">Based on milk quantity</p>
          </div>
        </div>

        {/* Expected Profit Card */}
        <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 shadow-md relative overflow-hidden flex flex-col justify-between min-h-[110px]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-dark-400">
              {t('expectedProfit')}
            </span>
            <span className="text-[10px] bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded-full font-bold border border-emerald-900/50">
              Est
            </span>
          </div>
          <div>
            <h3 className="text-xl font-black text-emerald-400 mt-2">
              ₹{expectedProfit.toLocaleString('en-IN')}
            </h3>
            <p className="text-[10px] text-dark-500 font-medium">Margin estimate</p>
          </div>
        </div>

        {/* Milk Purchased Card */}
        <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 shadow-md relative overflow-hidden flex flex-col justify-between min-h-[110px]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-dark-400">
              {t('milkPurchased')}
            </span>
            <span className="p-1 rounded-lg bg-blue-950 border border-blue-900/50 text-blue-400">
              <Droplets className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <h3 className="text-xl font-black text-white mt-2">
              {procuredMilk.toLocaleString('en-IN')} L
            </h3>
            <p className="text-[10px] text-dark-500 font-medium">
              Cost: ₹{milkCost.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Milk Quality Card */}
        <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 shadow-md relative overflow-hidden flex flex-col justify-between min-h-[110px]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-dark-400">
              Milk Quality
            </span>
            <span className="p-1 rounded-lg bg-amber-950 border border-amber-900/50 text-amber-400">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-sm font-black text-white">F: {avgFat || '-'}</span>
              <span className="text-sm font-black text-white">S: {avgSnf || '-'}</span>
            </div>
            <p className="text-[10px] text-dark-500 font-medium">Weighted Average</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-dark-400 uppercase tracking-wider px-1">
          {t('quickActions')}
        </h3>
        <div className="grid grid-cols-4 gap-2.5">
          {quickActions.map((action, idx) => {
            const Icon = action.icon;
            return (
              <button
                key={idx}
                onClick={() => {
                  if (action.action) {
                    action.action();
                  } else if (action.path) {
                    navigate(action.path);
                  }
                }}
                className="flex flex-col items-center justify-center bg-dark-900 hover:bg-dark-850 active:scale-95 border border-dark-800 rounded-2xl p-3 shadow-sm transition-all"
              >
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${action.color} flex items-center justify-center text-white mb-1.5 shadow-md`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold text-dark-200 text-center leading-tight">
                  {action.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Alerts */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-dark-400 uppercase tracking-wider px-1">
          Smart Alerts
        </h3>
        <div className="space-y-2">
          {milkQty === 0 ? (
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-950/20 border border-amber-900/30 text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold">No Milk Collections Today</p>
                <p className="text-[10px] text-dark-400 font-medium mt-0.5">
                  Book morning/evening shift collections to calculate rates and populate ledger sheets.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-900/30 text-emerald-400">
              <PlusCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold">Collections Active</p>
                <p className="text-[10px] text-dark-400 font-medium mt-0.5">
                  Krishna Dairy has successfully received {summary?.overall?.count} farmer collections.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Direct Milk Sale Modal */}
      <DirectMilkSaleModal
        isOpen={isMilkSaleOpen}
        onClose={() => setIsMilkSaleOpen(false)}
        onSuccess={() => fetchSummary(true)}
      />
    </div>
  );
};
