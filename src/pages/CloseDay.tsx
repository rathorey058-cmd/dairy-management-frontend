import React, { useEffect, useState } from 'react';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  Lock, CheckCircle, ShieldAlert, Calendar, FileSpreadsheet, LockKeyhole
} from 'lucide-react';

interface ClosingSummary {
  milkQuantity: number;
  avgFat: number;
  avgSnf: number;
  totalSales: number;
  cashSales: number;
  creditSales: number;
  expenses: number;
  farmerPayments: number;
  expectedGalla: number;
  actualGalla: number;
  difference: number;
  expectedProfit: number;
}

interface ClosingRecord {
  isClosed: boolean;
  closing?: {
    summary: ClosingSummary;
    notes?: string;
  };
}

export const CloseDay: React.FC = () => {
  useAuth();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [closingRecord, setClosingRecord] = useState<ClosingRecord | null>(null);
  
  // Expected stats
  const [expectedGalla, setExpectedGalla] = useState(0);
  const [expectedMilkQty, setExpectedMilkQty] = useState(0);
  const [expectedSales, setExpectedSales] = useState(0);
  const [loading, setLoading] = useState(true);

  // Inputs
  const [actualGalla, setActualGalla] = useState('');
  const [notes, setNotes] = useState('');

  // Statuses
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pastClosings, setPastClosings] = useState<any[]>([]);

  const fetchStatus = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      // 1. Fetch closing status of this date
      const closingRes = await API.get(`/reports/status/${date}`);
      setClosingRecord(closingRes.data);

      if (closingRes.data.isClosed) {
        const sum = closingRes.data.closing.summary;
        setActualGalla(String(sum.actualGalla));
        setNotes(closingRes.data.closing.notes || '');
      } else {
        // Fetch current day Galla status for expected cash
        const gallaRes = await API.get(`/galla/status?date=${date}`);
        setExpectedGalla(gallaRes.data.expectedGalla);

        // Fetch milk collections to show count
        const collectionsRes = await API.get(`/milk/collections?date=${date}`);
        const totalQty = collectionsRes.data.reduce((acc: number, curr: any) => acc + curr.quantity, 0);
        setExpectedMilkQty(totalQty);

        // Fetch forecasted sales
        const forecastRes = await API.get(`/galla/forecast?date=${date}`);
        setExpectedSales(forecastRes.data.currentSales);

        setActualGalla(String(gallaRes.data.expectedGalla));
        setNotes('');
      }

      // 2. Fetch past closings
      const closingsListRes = await API.get('/reports/closings');
      setPastClosings(closingsListRes.data || []);
    } catch (err) {
      console.error('Failed to load daily closing statistics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [date]);

  const handleCloseDaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actualGalla) {
      setErrorMsg('Please input actual cash in hand.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      const payload = {
        date,
        actualGalla: parseFloat(actualGalla),
        notes
      };

      await API.post('/reports/close-day', payload);
      setSuccessMsg('Calendar date closed and locked successfully!');
      
      // Reload status
      await fetchStatus();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to close day.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadReport = async () => {
    try {
      setErrorMsg(null);
      const res = await API.get(`/reports/export/daily?date=${date}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Daily_Report_${date}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setErrorMsg('Failed to export daily Excel report.');
      console.error('Failed to export daily report', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500/20 border-t-primary-500 animate-spin" />
      </div>
    );
  }

  const isClosed = closingRecord?.isClosed || false;

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-center px-1">
        <h2 className="text-lg font-black text-white flex items-center gap-2">
          <LockKeyhole className="w-5 h-5 text-indigo-400" />
          <span>Day Closing & Locks</span>
        </h2>
        <span className="text-[10px] bg-indigo-950 text-indigo-400 px-2 py-0.5 rounded-full font-bold border border-indigo-900/50">
          Database Locks
        </span>
      </div>

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

      {/* Date select wrapper */}
      <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-xs font-black text-dark-400 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-indigo-400" />
            Calendar Date
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-1.5 bg-dark-950 border border-dark-850 rounded-xl text-xs font-bold text-white focus:outline-none"
          />
        </div>

        {/* Quick Date Selector Chips */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDate(new Date().toISOString().split('T')[0])}
            className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
              date === new Date().toISOString().split('T')[0]
                ? 'bg-teal-600 text-white'
                : 'bg-dark-950 border border-dark-800 text-dark-400'
            }`}
          >
            Today (आज)
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              setDate(d.toISOString().split('T')[0]);
            }}
            className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
              (() => {
                const d = new Date();
                d.setDate(d.getDate() - 1);
                return date === d.toISOString().split('T')[0];
              })()
                ? 'bg-teal-600 text-white'
                : 'bg-dark-950 border border-dark-800 text-dark-400'
            }`}
          >
            Yesterday (कल)
          </button>
        </div>

        {/* Lock indicator */}
        <div className={`p-4 rounded-2xl border flex items-center gap-3 text-xs font-bold ${
          isClosed 
            ? 'bg-rose-950/40 border-rose-900/50 text-rose-400' 
            : 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400'
        }`}>
          <Lock className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-sm font-black">{isClosed ? 'CLOSED & LOCKED' : 'OPEN FOR TRANSACTIONS'}</p>
            <p className="text-[10px] text-dark-400 font-medium mt-0.5">
              {isClosed 
                ? 'All write actions (Milk collections, POS billing, Farmer payments) are locked.' 
                : 'Transactions can be added or updated.'
              }
            </p>
          </div>
        </div>

        {/* Closing details / summary calculations */}
        {!isClosed ? (
          <div className="grid grid-cols-3 gap-3.5 text-center text-xs">
            <div className="bg-dark-950 p-3.5 rounded-2xl border border-dark-850">
              <span className="text-[10px] text-dark-500 font-extrabold uppercase">Expected Galla</span>
              <p className="text-base font-black text-white mt-1">₹{expectedGalla}</p>
            </div>
            <div className="bg-dark-950 p-3.5 rounded-2xl border border-dark-850">
              <span className="text-[10px] text-dark-500 font-extrabold uppercase">Milk Litres</span>
              <p className="text-base font-black text-blue-400 mt-1">{expectedMilkQty} L</p>
            </div>
            <div className="bg-dark-950 p-3.5 rounded-2xl border border-dark-850">
              <span className="text-[10px] text-dark-500 font-extrabold uppercase">Sales</span>
              <p className="text-base font-black text-emerald-400 mt-1">₹{expectedSales}</p>
            </div>
          </div>
        ) : closingRecord?.closing ? (
          <div className="bg-dark-950 p-4 rounded-2xl border border-dark-850 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-dark-400">Total Milk Procured:</span>
              <span className="font-bold text-white">{closingRecord.closing.summary.milkQuantity} Ltr</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-400">Total Counter Sales:</span>
              <span className="font-bold text-white">₹{closingRecord.closing.summary.totalSales}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-400">Actual Cash Deposited:</span>
              <span className="font-bold text-emerald-400">₹{closingRecord.closing.summary.actualGalla}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-400">Cash discrepancy:</span>
              <span className={`font-bold ${closingRecord.closing.summary.difference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ₹{closingRecord.closing.summary.difference}
              </span>
            </div>
          </div>
        ) : null}

        {/* Action Form */}
        <form onSubmit={handleCloseDaySubmit} className="space-y-4 pt-2">
          {!isClosed && (
            <>
              <div>
                <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                  Actual Cash In Galla (INR)
                </label>
                <input
                  type="number"
                  placeholder={String(expectedGalla)}
                  value={actualGalla}
                  onChange={(e) => setActualGalla(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-dark-950 border border-dark-800 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                  Closing Remarks
                </label>
                <input
                  type="text"
                  placeholder="Closing notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 text-sm font-bold text-white shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span>{isSubmitting ? 'Closing Day...' : 'Close Day & Lock Database'}</span>
              </button>
            </>
          )}

          {/* Excel spreadsheet export */}
          <button
            type="button"
            onClick={downloadReport}
            className="w-full py-3.5 rounded-2xl bg-dark-850 hover:bg-dark-800 border border-dark-800 text-sm font-bold text-white transition-all flex items-center justify-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Download Daily Excel Report ({date})</span>
          </button>
        </form>

      </div>

      {/* Past Closings History Card */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-dark-400 uppercase tracking-wider px-1">
          Historical Day Closings Log
        </h3>
        <div className="space-y-2">
          {pastClosings.length === 0 ? (
            <div className="bg-dark-900 border border-dark-800 rounded-2xl p-5 text-center text-dark-500 text-xs">
              No historical closings recorded yet.
            </div>
          ) : (
            pastClosings.map((c) => (
              <div
                key={c._id}
                className="bg-dark-900 border border-dark-800 rounded-2xl p-4 flex justify-between items-center shadow-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      📅 {new Date(c.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-900/60">
                      Locked
                    </span>
                  </div>
                  <p className="text-[10px] text-dark-400 mt-1">
                    Procured: {c.summary?.milkQuantity || 0} Ltr • Sales: ₹{c.summary?.totalSales || 0}
                  </p>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <span className="text-xs font-black text-white">₹{c.summary?.actualGalla || 0}</span>
                    <p className="text-[9px] text-dark-500">Actual Cash</p>
                  </div>
                  <button
                    onClick={() => {
                      setDate(new Date(c.date).toISOString().split('T')[0]);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-2.5 py-1 bg-dark-800 hover:bg-dark-750 text-teal-400 rounded-lg text-[10px] font-bold border border-dark-700"
                  >
                    Inspect
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};
