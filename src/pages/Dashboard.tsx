import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api';
import { DateRangeFilter, type DateRange } from '../components/DateRangeFilter';
import { DirectMilkSaleModal } from '../components/DirectMilkSaleModal';
import { FirstTimeSetupWizard } from '../components/onboarding/FirstTimeSetupWizard';
import { Realistic3DMilkTank } from '../components/3d/Realistic3DMilkTank';
import { RealisticProductCards } from '../components/3d/RealisticProductCards';
import { InstantRateCalculator } from '../components/calculator/InstantRateCalculator';
import { sound } from '../utils/soundEngine';
import { 
  Droplets, DollarSign, TrendingUp, Users, 
  Wallet, PlusCircle, AlertTriangle, UtensilsCrossed, Crown,
  SendHorizontal, RefreshCw, Factory, ArrowRight,
  Truck, CreditCard, Sparkles, Calendar, ShieldAlert
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
  const { t, user, tenant, language } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(new Date().toLocaleTimeString(language === 'hi' ? 'hi-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit' }));
  const [isMilkSaleOpen, setIsMilkSaleOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: todayStr,
    endDate: todayStr,
    label: t('today'),
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
    <div className="space-y-6 animate-fade-in">
      
      {/* 🔴 LIVE Mandi & Chilling Plant Running Ticker */}
      <div className="rounded-2xl p-2.5 bg-gradient-to-r from-[#11231E] via-[#121B2F] to-[#1E122A] border-2 border-emerald-500/40 shadow-xl flex items-center gap-3 overflow-hidden">
        <span className="px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black text-[10px] font-black uppercase tracking-wider shrink-0 animate-pulse shadow-md">
          {language === 'hi' ? '🔴 LIVE मंडी भाव' : '🔴 LIVE RATES'}
        </span>
        <div className="overflow-hidden whitespace-nowrap text-xs font-bold text-slate-200">
          <span className="inline-block animate-marquee space-x-4">
            <span>✨ {language === 'hi' ? 'दानेदार देसी घी' : 'Pure Desi Ghee'}: <strong className="text-amber-400">₹680/kg ▲</strong></span>
            <span>•</span>
            <span>🧀 {language === 'hi' ? 'मलाई पनीर' : 'Malai Paneer'}: <strong className="text-amber-300">₹380/kg ▲</strong></span>
            <span>•</span>
            <span>🥛 {language === 'hi' ? 'गाय बेस फैट' : 'Cow Base FAT'}: <strong className="text-cyan-300">₹7.20/FAT</strong></span>
            <span>•</span>
            <span>🐃 {language === 'hi' ? 'भैंस बेस फैट' : 'Buffalo Base FAT'}: <strong className="text-emerald-300">₹7.80/FAT</strong></span>
            <span>•</span>
            <span>❄️ {language === 'hi' ? 'साइलो चिलिंग टैंक' : 'Chilling Silo'}: <strong className="text-cyan-400">3.8°C ({language === 'hi' ? 'सामान्य' : 'Normal'})</strong></span>
            <span>•</span>
            <span>📜 {language === 'hi' ? `10-दिवसीय बिलिंग चक्र: दशक ${Math.ceil(new Date().getDate() / 10)} चालू` : `10-Day Billing: Decade ${Math.ceil(new Date().getDate() / 10)} Active`}</span>
          </span>
        </div>
      </div>

      {/* Unified Dairy Owner & Operator Card (High-Contrast Solid Surface) */}
      <div className="bg-gradient-to-r from-[#131A2B] via-[#162035] to-[#112523] border-2 border-teal-500/50 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-950 border border-teal-500/60 text-teal-300 shadow-sm">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>{language === 'hi' ? 'डेयरी संचालक व मालिक' : 'Owner & Operator'}</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              {tenant?.name || 'Krishna Dairy & Chilling Plant'}
            </h2>
            <p className="text-xs text-slate-300 font-medium">
              {language === 'hi' ? 'मालिक:' : 'Owner:'} <span className="text-white font-black">{tenant?.ownerName || user?.name || 'Rahul Sharma'}</span>
              <span className="mx-2 text-slate-500">•</span>
              {language === 'hi' ? 'स्थान:' : 'Location:'} <span className="text-slate-200">{tenant?.address || 'Main Road, Rampura'}</span>
            </p>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
            <span className="px-3.5 py-1.5 rounded-xl bg-teal-950/90 border border-teal-400/60 text-xs font-black text-teal-200 shadow-md">
              📞 {tenant?.mobile || '9876543210'}
            </span>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-mono">{t('updatedAt')}: {lastRefreshedAt}</span>
              <button
                onClick={() => {
                  sound.playClick();
                  fetchSummary(true);
                }}
                disabled={isRefreshing}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/50 transition-all active:scale-95 shadow-sm"
                title={t('refresh')}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 🚀 3 High-Contrast Smart Action Cards (Vibrant & Sharp) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 10-Day Settlement Card */}
        <div 
          onClick={() => {
            sound.playCashRegister();
            navigate('/payments');
          }}
          className="cursor-pointer p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#1C2542] via-[#161E34] to-[#12182B] border-2 border-indigo-500 hover:border-indigo-400 shadow-2xl hover:shadow-indigo-950/80 flex items-center justify-between transition-all group hover:-translate-y-1"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/30 border-2 border-indigo-400 flex items-center justify-center text-indigo-300 group-hover:scale-110 transition-transform shadow-lg">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] text-indigo-300 font-black uppercase tracking-wider block">
                {language === 'hi' ? 'किसान बिलिंग चक्र' : 'Farmer Settlement Cycle'}
              </span>
              <p className="text-sm sm:text-base font-black text-white group-hover:text-indigo-200">
                {language === 'hi' ? `10-दिवसीय बिलिंग (दशक ${Math.ceil(new Date().getDate() / 10)})` : `10-Day Billing (Decade ${Math.ceil(new Date().getDate() / 10)})`}
              </p>
              <p className="text-xs text-indigo-400 font-bold mt-0.5">
                {language === 'hi' ? 'WhatsApp व थर्मल पर्ची प्रिंट' : 'WhatsApp & Thermal Slips'}
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-indigo-400 group-hover:translate-x-1 transition-transform" />
        </div>

        {/* AI Camera 2-Line Theft Alert Card */}
        <div 
          onClick={() => {
            sound.playClick();
            navigate('/ai-camera');
          }}
          className="cursor-pointer p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#2D1628] via-[#231220] to-[#1A0D18] border-2 border-rose-500 hover:border-rose-400 shadow-2xl hover:shadow-rose-950/80 flex items-center justify-between transition-all group hover:-translate-y-1"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/30 border-2 border-rose-400 flex items-center justify-center text-rose-300 group-hover:scale-110 transition-transform shadow-lg">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] text-rose-300 font-black uppercase tracking-wider block">
                {language === 'hi' ? 'AI कैमरा व गल्ला निगरानी' : 'AI Camera & Theft Audit'}
              </span>
              <p className="text-sm sm:text-base font-black text-white group-hover:text-rose-200">
                {language === 'hi' ? '2-लाइन क्रिस्प चोरी अलर्ट्स' : '2-Line Crisp Theft Alerts'}
              </p>
              <p className="text-xs text-rose-400 font-bold mt-0.5">
                {language === 'hi' ? 'गांधी नोट, चिल्लर व 10s क्लिप' : 'Currency Notes, Coins & 10s Clips'}
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-rose-400 group-hover:translate-x-1 transition-transform" />
        </div>

        {/* Setup Wizard Trigger */}
        <div 
          onClick={() => {
            sound.playClick();
            setIsWizardOpen(true);
          }}
          className="cursor-pointer p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#122A22] via-[#0E201A] to-[#0A1813] border-2 border-emerald-500 hover:border-emerald-400 shadow-2xl hover:shadow-emerald-950/80 flex items-center justify-between transition-all group hover:-translate-y-1"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/30 border-2 border-emerald-400 flex items-center justify-center text-emerald-300 group-hover:scale-110 transition-transform shadow-lg">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] text-emerald-300 font-black uppercase tracking-wider block">
                {language === 'hi' ? 'डेयरी ऑनबोर्डिंग व सेटिंग्स' : 'Dairy Setup & Settings'}
              </span>
              <p className="text-sm sm:text-base font-black text-white group-hover:text-emerald-200">
                {language === 'hi' ? 'भाव, कैमरा व माइक विज़ार्ड' : 'Rates, Camera & Mic Wizard'}
              </p>
              <p className="text-xs text-emerald-400 font-bold mt-0.5">4-Step Google Onboarding</p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-emerald-400 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>

      {/* Gamified Daily Target & Achievement Tracker */}
      <div className="rounded-3xl p-4 sm:p-5 bg-gradient-to-r from-[#141C2D] via-[#121727] to-[#151D2F] border-2 border-cyan-500/40 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 flex-1">
          <div className="flex justify-between items-center text-xs font-black">
            <span className="text-white flex items-center gap-2">
              <span>🎯 आज का दूध संकलन लक्ष्य (Daily Target: 2,500 L)</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                {Math.min(100, Math.round((procuredMilk / 2500) * 100))}% पूरा हुआ
              </span>
            </span>
            <span className="text-cyan-300 font-mono font-black text-sm">
              {procuredMilk} L / 2,500 L
            </span>
          </div>

          <div className="w-full h-3.5 rounded-full bg-slate-900 border border-slate-700 p-0.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-1000 shadow-md relative"
              style={{ width: `${Math.min(100, (procuredMilk / 2500) * 100)}%` }}
            >
              <div className="absolute inset-0 shimmer-chrome" />
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            sound.playClick();
            navigate('/milk');
          }}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shrink-0 shadow-md active:scale-95"
        >
          + दूध संकलन करें
        </button>
      </div>

      {/* Date Range Selector Bar */}
      <div className="bg-[#131A2B] border-2 border-slate-700/80 rounded-2xl p-2 shadow-lg">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* 4-Column KPI Metrics Strip (Bold High-Contrast Solid Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Expected Galla Card */}
        <div className="bg-[#141B2D] border-2 border-slate-700 hover:border-emerald-500/60 rounded-3xl p-4 shadow-xl flex flex-col justify-between min-h-[125px] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {t('expectedGalla')}
            </span>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/50">
              {language === 'hi' ? 'अनुमानित' : 'Estimated'}
            </span>
          </div>
          <div>
            <h3 className="text-2xl sm:text-3xl font-black text-white font-mono mt-1">
              ₹{expectedGalla.toLocaleString('en-IN')}
            </h3>
            <p className="text-[11px] text-slate-400 font-bold mt-0.5">
              {language === 'hi' ? 'दूध मात्रा आधारित गल्ला' : 'Milk Volume Based Cash'}
            </p>
          </div>
        </div>

        {/* Expected Profit Card */}
        <div className="bg-[#141B2D] border-2 border-slate-700 hover:border-emerald-500/60 rounded-3xl p-4 shadow-xl flex flex-col justify-between min-h-[125px] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {t('expectedProfit')}
            </span>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/50">
              {language === 'hi' ? 'शुद्ध मुनाफा' : 'Net Margin'}
            </span>
          </div>
          <div>
            <h3 className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono mt-1">
              ₹{expectedProfit.toLocaleString('en-IN')}
            </h3>
            <p className="text-[11px] text-slate-400 font-bold mt-0.5">
              {language === 'hi' ? 'मार्जिन एस्टीमेट' : 'Profit Estimate'}
            </p>
          </div>
        </div>

        {/* Milk Purchased Card */}
        <div className="bg-[#141B2D] border-2 border-slate-700 hover:border-cyan-500/60 rounded-3xl p-4 shadow-xl flex flex-col justify-between min-h-[125px] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {t('milkPurchased')}
            </span>
            <span className="p-1.5 rounded-xl bg-blue-950 border border-blue-500/50 text-blue-400 shadow-sm">
              <Droplets className="w-4 h-4" />
            </span>
          </div>
          <div>
            <h3 className="text-2xl sm:text-3xl font-black text-cyan-300 font-mono mt-1">
              {procuredMilk.toLocaleString('en-IN')} L
            </h3>
            <p className="text-[11px] text-slate-400 font-bold mt-0.5">
              {language === 'hi' ? 'लागत:' : 'Cost:'} <strong className="text-white">₹{milkCost.toLocaleString('en-IN')}</strong>
            </p>
          </div>
        </div>

        {/* Milk Quality Card */}
        <div className="bg-[#141B2D] border-2 border-slate-700 hover:border-amber-500/60 rounded-3xl p-4 shadow-xl flex flex-col justify-between min-h-[125px] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {language === 'hi' ? 'औसत गुणवत्ता' : 'Average Quality'}
            </span>
            <span className="p-1.5 rounded-xl bg-amber-950 border border-amber-500/50 text-amber-400 shadow-sm">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-xl font-black text-white font-mono">FAT: <strong className="text-amber-400">{avgFat || '-'}%</strong></span>
              <span className="text-xl font-black text-white font-mono">SNF: <strong className="text-cyan-300">{avgSnf || '-'}%</strong></span>
            </div>
            <p className="text-[11px] text-slate-400 font-bold mt-0.5">
              {language === 'hi' ? 'वेटेड एवरेज गणना' : 'Weighted Average Calculation'}
            </p>
          </div>
        </div>
      </div>

      {/* Main 2-Column Responsive Section: Left: 3D Silo & 3D Products | Right: Calculator & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (7 cols): 3D Milk Silo & 3D Products */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* 3D Realistic Industrial Milk Chilling Silo Tank */}
          <Realistic3DMilkTank
            remainingLiters={liveTankStock}
            totalCapacity={5000}
            procuredToday={procuredMilk}
            dispatchedToday={usedInProduction + directSoldMilk}
            onOpenProduction={() => navigate('/production')}
          />

          {/* 3D Realistic Finished Products Inventory */}
          <RealisticProductCards
            stocks={productStocks}
            onNewBatchClick={() => navigate('/production')}
          />

        </div>

        {/* Right Column (5 cols): Instant Rate Calculator, Quick Actions Matrix & System Alerts */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* ⚡ Instant FAT/SNF Rate Calculator (Interactive & Fun) */}
          <InstantRateCalculator
            onGoToEntry={() => {
              navigate('/milk');
            }}
          />

          {/* Quick Actions Matrix */}
          <div className="bg-[#141B2D] border-2 border-slate-700 rounded-3xl p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>त्वरित शॉर्टकट (Quick Access)</span>
              <span className="text-[10px] text-emerald-400 font-bold">1-Click Fast Actions</span>
            </h3>

            <div className="grid grid-cols-3 gap-2.5">
              {quickActions.map((action, idx) => {
                const Icon = action.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      sound.playClick();
                      if (action.action) {
                        action.action();
                      } else if (action.path) {
                        navigate(action.path);
                      }
                    }}
                    className="flex flex-col items-center justify-center bg-[#0F1422] hover:bg-[#1A2338] active:scale-95 border border-slate-700/80 hover:border-slate-500 rounded-2xl p-3 shadow-md transition-all group"
                  >
                    <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${action.color} flex items-center justify-center text-white mb-2 shadow-md group-hover:scale-110 transition-transform`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-200 text-center leading-tight group-hover:text-white">
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Smart Alerts */}
          <div className="bg-[#141B2D] border-2 border-slate-700 rounded-3xl p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-black text-slate-300 uppercase tracking-wider">
              स्मार्ट सिस्टम स्टेटस (Smart Status)
            </h3>
            {milkQty === 0 ? (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-950/40 border-2 border-amber-600/60 text-amber-300">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <p className="text-xs font-black text-white">आज का कोई संकलन दर्ज नहीं है</p>
                  <p className="text-[11px] text-slate-300 font-medium mt-1">
                    सुबह या शाम की शिफ्ट का दूध संकलन दर्ज करें ताकि किसान खाते व लेजर अपडेट हों।
                  </p>
                  <button
                    onClick={() => {
                      sound.playClick();
                      navigate('/milk');
                    }}
                    className="mt-2.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black shadow-md transition-all active:scale-95"
                  >
                    + दूध एंट्री करें
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-950/40 border-2 border-emerald-600/60 text-emerald-300">
                <PlusCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
                <div>
                  <p className="text-xs font-black text-white">दूध संकलन सक्रिय है</p>
                  <p className="text-[11px] text-slate-300 font-medium mt-1">
                    आज कुल <strong>{summary?.overall?.count}</strong> किसानों का दूध सफलतापूर्वक जमा हो चुका है।
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Direct Milk Sale Modal */}
      <DirectMilkSaleModal
        isOpen={isMilkSaleOpen}
        onClose={() => setIsMilkSaleOpen(false)}
        onSuccess={() => fetchSummary(true)}
      />

      {/* Google-style Onboarding & Setup Wizard */}
      <FirstTimeSetupWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onComplete={() => fetchSummary(true)}
      />
    </div>
  );
};
