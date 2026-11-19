import React, { useEffect, useState, useCallback } from 'react';
import API from '../../api';
import { TriMatchReportModal } from './TriMatchReportModal';
import { X, Users, Receipt, IndianRupee, Wallet, DoorOpen, AlertTriangle, RefreshCw, Mic } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split('T')[0];

/** Short one-screen report: 5 numbers + hourly chart + max 3 alerts. */
export const QuickReportModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [date, setDate] = useState(today());
  const [start, setStart] = useState('00:00');
  const [end, setEnd] = useState('23:59');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showTri, setShowTri] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await API.get('/cameras/reports/daily-summary', {
        params: { date, startTime: start, endTime: end },
      });
      setData(res.data);
    } catch (e: any) {
      setErr(e.response?.data?.message || 'रिपोर्ट लोड नहीं हो सकी।');
    } finally {
      setLoading(false);
    }
  }, [date, start, end]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  const h = data?.headline;
  const unknown = (v: any) => (v === null || v === undefined ? '—' : v);
  const maxCust = Math.max(1, ...(data?.hourly || []).map((x: any) => x.customers));
  const maxSale = Math.max(1, ...(data?.hourly || []).map((x: any) => x.sales));

  const Stat = ({ icon, label, value, tone }: any) => (
    <div className="bg-dark-900 border border-dark-800 rounded-2xl p-3 text-center">
      <div className={`mx-auto mb-1 ${tone}`}>{icon}</div>
      <div className="text-xl font-black text-white">{value}</div>
      <div className="text-[10px] text-dark-400">{label}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-dark-950 border border-dark-700 w-full max-w-xl rounded-3xl shadow-2xl my-auto">
        <div className="p-4 flex items-center justify-between border-b border-dark-800">
          <h2 className="text-base font-black text-white">📊 रिपोर्ट</h2>
          <button onClick={() => setShowTri(true)}
            className="ml-auto mr-2 px-3 py-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
            🔍 हर ग्राहक का वीडियो+ऑडियो+POS मिलान
          </button>
          <button onClick={onClose} className="p-2 rounded-xl bg-dark-800 text-dark-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="bg-dark-900 border border-dark-800 rounded-xl px-2 py-1.5 text-white" />
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
              className="bg-dark-900 border border-dark-800 rounded-xl px-2 py-1.5 text-white" />
            <span className="text-dark-500">से</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
              className="bg-dark-900 border border-dark-800 rounded-xl px-2 py-1.5 text-white" />
            <button onClick={load} disabled={loading}
              className="ml-auto px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> देखें
            </button>
          </div>

          {err && <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{err}</div>}

          {data && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat icon={<Users className="w-5 h-5" />} tone="text-sky-400" label="ग्राहक आए" value={unknown(h.customers)} />
                <Stat icon={<Receipt className="w-5 h-5" />} tone="text-violet-400" label="बिल कटे" value={h.bills} />
                <Stat icon={<IndianRupee className="w-5 h-5" />} tone="text-emerald-400" label="कुल बिक्री" value={`₹${h.sales}`} />
                <Stat icon={<Wallet className="w-5 h-5" />} tone="text-amber-400" label="कैश गल्ला" value={`₹${h.cash}`} />
                <Stat icon={<DoorOpen className="w-5 h-5" />} tone="text-rose-400" label="गल्ला खुला" value={unknown(h.gallaOpenings)} />
                <Stat icon={<Mic className="w-5 h-5" />} tone="text-teal-400" label="AI रिकॉर्डर" value={`${data.recorder.coveragePct}%`} />
              </div>

              {data.alerts.length > 0 && (
                <div className="space-y-2">
                  {data.alerts.map((a: any, i: number) => (
                    <div key={i} className={`flex items-start gap-2 text-xs rounded-xl p-3 border ${
                      a.level === 'red' ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-200'}`}>
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{a.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {data.hourly.length > 0 && (
                <div>
                  <div className="text-[10px] text-dark-400 mb-1">घंटे के हिसाब से — <span className="text-sky-400">ग्राहक</span> / <span className="text-emerald-400">बिक्री</span></div>
                  <div className="flex items-end gap-1 h-24">
                    {data.hourly.map((x: any) => (
                      <div key={x.hour} className="flex-1 flex flex-col items-center justify-end gap-0.5 h-full">
                        <div className="w-full flex items-end gap-px h-full">
                          <div className="flex-1 bg-sky-500/70 rounded-t" style={{ height: `${(x.customers / maxCust) * 100}%` }} />
                          <div className="flex-1 bg-emerald-500/70 rounded-t" style={{ height: `${(x.sales / maxSale) * 100}%` }} />
                        </div>
                        <span className="text-[9px] text-dark-500">{x.hour}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <TriMatchReportModal isOpen={showTri} onClose={() => setShowTri(false)} />
    </div>
  );
};
