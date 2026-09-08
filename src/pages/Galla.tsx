import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import { DateRangeFilter, type DateRange } from '../components/DateRangeFilter';
import { DirectMilkSaleModal } from '../components/DirectMilkSaleModal';
import { 
  Wallet, TrendingUp, ArrowDownRight, ArrowUpRight, HelpCircle,
  Droplets, SendHorizontal
} from 'lucide-react';

interface GallaStatus {
  openingCash: number;
  cashSales: number;
  collections: number;
  farmerPayments: number;
  expenses: number;
  totalCashIn: number;
  totalCashOut: number;
  expectedGalla: number;
  milkSalesBreakdown?: {
    superMilk: { quantity: number; amount: number };
    regularMilk: { quantity: number; amount: number };
    cowMilk: { quantity: number; amount: number };
    totalDirectQty: number;
    totalDirectAmt: number;
  };
}

interface ProfitForecast {
  currentSales: number;
  forecastedExtraSales: number;
  expectedSales: number;
  estimatedCOGS: number;
  totalExpenses: number;
  expectedProfit: number;
}

export const Galla: React.FC = () => {
  useAuth();
  const [searchParams] = useSearchParams();
  
  const paramDate = searchParams.get('date') || searchParams.get('startDate');
  const todayStr = new Date().toISOString().split('T')[0];
  const initialDate = paramDate || todayStr;

  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: initialDate,
    endDate: searchParams.get('endDate') || initialDate,
    label: initialDate === todayStr ? 'Today (आज)' : initialDate,
  });

  useEffect(() => {
    const qDate = searchParams.get('date') || searchParams.get('startDate');
    if (qDate) {
      setDateRange({
        startDate: qDate,
        endDate: searchParams.get('endDate') || qDate,
        label: qDate === todayStr ? 'Today (आज)' : qDate,
      });
    }
  }, [searchParams, todayStr]);

  const [galla, setGalla] = useState<GallaStatus | null>(null);
  const [forecast, setForecast] = useState<ProfitForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMilkSaleOpen, setIsMilkSaleOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [gallaRes, forecastRes] = await Promise.all([
        API.get(`/galla/status?date=${dateRange.startDate}`),
        API.get(`/galla/forecast?date=${dateRange.startDate}`)
      ]);
      setGalla(gallaRes.data);
      setForecast(forecastRes.data);
    } catch (err) {
      console.error('Failed to load Galla status details', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500/20 border-t-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-center px-1">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-400" />
            <span>Galla & Cash Management</span>
          </h2>
          <p className="text-[11px] text-dark-400 font-medium">Daily Cash Flow & Milk Sales Audit</p>
        </div>
        <button
          onClick={() => setIsMilkSaleOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
        >
          <SendHorizontal className="w-3.5 h-3.5" />
          <span>+ Direct Milk Sale</span>
        </button>
      </div>

      {/* Date Filter */}
      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {/* Cash Flow Balance Card */}
      {galla && (
        <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between min-h-[140px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />
          <div className="flex justify-between items-center">
            <span className="text-xs font-extrabold uppercase tracking-wider text-dark-400">
              Expected Cash Galla (In Hand)
            </span>
            <span className="p-1 rounded-lg bg-emerald-950 border border-emerald-900/50 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div>
            <h3 className="text-3xl font-black text-white mt-4">
              ₹{galla.expectedGalla.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[10px] text-dark-400 font-medium mt-1">
              Opening Cash today: ₹{galla.openingCash}
            </p>
          </div>
        </div>
      )}

      {/* Direct Milk Sales Breakdown Card (If recorded today) */}
      {galla?.milkSalesBreakdown && (
        <div className="bg-gradient-to-r from-teal-950/30 via-dark-900 to-dark-900 border border-teal-800/40 rounded-3xl p-4 shadow-md space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-teal-400" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                Direct Milk Sales Breakdown (सीधी दूध बिक्री)
              </span>
            </div>
            <button
              onClick={() => setIsMilkSaleOpen(true)}
              className="text-[11px] text-teal-400 hover:text-teal-300 font-bold underline"
            >
              + Add Entry
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            {/* Super Milk */}
            <div className="bg-dark-950/80 border border-dark-800 rounded-2xl p-2.5 text-center">
              <span className="text-[10px] font-bold text-teal-400 block">Super Milk (6+ FAT)</span>
              <p className="text-sm font-black text-white mt-1">
                {galla.milkSalesBreakdown.superMilk.quantity} L
              </p>
              <span className="text-[10px] font-semibold text-dark-400 block mt-0.5">
                ₹{galla.milkSalesBreakdown.superMilk.amount.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Regular Milk */}
            <div className="bg-dark-950/80 border border-dark-800 rounded-2xl p-2.5 text-center">
              <span className="text-[10px] font-bold text-blue-400 block">Regular (5-5.4 FAT)</span>
              <p className="text-sm font-black text-white mt-1">
                {galla.milkSalesBreakdown.regularMilk.quantity} L
              </p>
              <span className="text-[10px] font-semibold text-dark-400 block mt-0.5">
                ₹{galla.milkSalesBreakdown.regularMilk.amount.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Cow Milk */}
            <div className="bg-dark-950/80 border border-dark-800 rounded-2xl p-2.5 text-center">
              <span className="text-[10px] font-bold text-amber-400 block">Cow Milk / Other</span>
              <p className="text-sm font-black text-white mt-1">
                {galla.milkSalesBreakdown.cowMilk.quantity} L
              </p>
              <span className="text-[10px] font-semibold text-dark-400 block mt-0.5">
                ₹{galla.milkSalesBreakdown.cowMilk.amount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Galla cash in / out details */}
      {galla && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 space-y-3 relative shadow-md">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <ArrowDownRight className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-wider">Total Cash In</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-dark-500">Cash Sales:</span>
                <span className="font-bold text-white">₹{galla.cashSales}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-500">Collections:</span>
                <span className="font-bold text-white">₹{galla.collections}</span>
              </div>
            </div>
          </div>

          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 space-y-3 relative shadow-md">
            <div className="flex items-center gap-1.5 text-rose-400">
              <ArrowUpRight className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-wider">Total Cash Out</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-dark-500">Salaries/Expenses:</span>
                <span className="font-bold text-white">₹{galla.expenses}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-500">Farmer payments:</span>
                <span className="font-bold text-white">₹{galla.farmerPayments}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Intelligent Profit forecasting predictions */}
      {forecast && (
        <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-3 relative">
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
          
          <h3 className="text-xs font-black uppercase tracking-wider text-dark-400 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-emerald-400" />
            Expected Profit Forecast
          </h3>

          <div className="text-xs space-y-2 pt-2">
            <div className="flex justify-between">
              <span className="text-dark-500">Expected sales (shift averages + booked):</span>
              <span className="font-bold text-white">₹{forecast.expectedSales}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-500">Estimated cost of goods sold:</span>
              <span className="font-bold text-white">-₹{forecast.estimatedCOGS}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-500">Total daily expenses:</span>
              <span className="font-bold text-white">-₹{forecast.totalExpenses}</span>
            </div>
            <div className="flex justify-between border-t border-dark-850 pt-2 font-black text-sm text-emerald-400">
              <span>Expected Daily Net Profit:</span>
              <span>₹{forecast.expectedProfit}</span>
            </div>
          </div>
        </div>
      )}

      {/* Direct Milk Sale Modal */}
      <DirectMilkSaleModal
        isOpen={isMilkSaleOpen}
        onClose={() => setIsMilkSaleOpen(false)}
        onSuccess={loadData}
      />

    </div>
  );
};

