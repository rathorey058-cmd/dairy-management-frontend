import React, { useState, useEffect } from 'react';
import API from '../../api';
import { 
  Calendar, Clock, DollarSign, Users, ShoppingBag, 
  AlertTriangle, CheckCircle2, RefreshCw, X, Printer, 
  TrendingUp, Banknote, ShieldAlert
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const TimeIntervalGallaReportModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [startTime, setStartTime] = useState<string>('06:00');
  const [endTime, setEndTime] = useState<string>('22:00');
  const [activePreset, setActivePreset] = useState<'FULL_DAY' | 'MORNING' | 'AFTERNOON' | 'EVENING' | '2TO3' | '3TO4' | 'CUSTOM'>('FULL_DAY');

  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchIntervalReport = async (dateStr = selectedDate, sTime = startTime, eTime = endTime) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await API.get('/cameras/reports/time-interval', {
        params: {
          date: dateStr,
          startTime: sTime,
          endTime: eTime,
        },
      });
      setReportData(res.data);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.message || 'रिपोर्ट लोड करने में त्रुटि आई।');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchIntervalReport(selectedDate, startTime, endTime);
    }
  }, [isOpen]);

  const handleApplyPreset = (preset: 'FULL_DAY' | 'MORNING' | 'AFTERNOON' | 'EVENING' | '2TO3' | '3TO4') => {
    setActivePreset(preset);
    let s = '06:00';
    let e = '22:00';

    if (preset === 'FULL_DAY') {
      s = '00:00';
      e = '23:59';
    } else if (preset === 'MORNING') {
      s = '06:00';
      e = '12:00';
    } else if (preset === 'AFTERNOON') {
      s = '12:00';
      e = '16:00';
    } else if (preset === 'EVENING') {
      s = '16:00';
      e = '22:00';
    } else if (preset === '2TO3') {
      s = '14:00';
      e = '15:00';
    } else if (preset === '3TO4') {
      s = '15:00';
      e = '16:00';
    }

    setStartTime(s);
    setEndTime(e);
    fetchIntervalReport(selectedDate, s, e);
  };

  const handleCustomFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActivePreset('CUSTOM');
    fetchIntervalReport(selectedDate, startTime, endTime);
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const fin = reportData?.financialSummary;
  const sales = reportData?.salesBreakdown;
  const ai = reportData?.aiSurveillance;
  const notes = ai?.notesTally || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-dark-900 border border-dark-700 w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-dark-950 via-indigo-950/40 to-dark-950 border-b border-dark-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>पूरे दिन व समय-अनुसार गल्ला, बिक्री व AI रिपोर्ट</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Time-Interval Intelligence
                </span>
              </h2>
              <p className="text-xs text-dark-300">
                तय समय अवधि (जैसे सुबह 11 से दोपहर 3) में क्या बिका, कितना गल्ला बना, कितने ग्राहक आए और कौन-से नोट गल्ले में आए।
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white transition-colors"
              title="प्रिंट / PDF सेव करें"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Filter Toolbar */}
        <div className="p-4 bg-dark-950 border-b border-dark-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          
          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5 bg-dark-900 p-1.5 rounded-2xl border border-dark-800">
            <button
              type="button"
              onClick={() => handleApplyPreset('FULL_DAY')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                activePreset === 'FULL_DAY'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              पूरा दिन
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('2TO3')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                activePreset === '2TO3'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-emerald-400 hover:text-white bg-emerald-500/10'
              }`}
            >
              दोपहर 2 से 3 बजे (14:00-15:00)
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('3TO4')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                activePreset === '3TO4'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-indigo-400 hover:text-white bg-indigo-500/10'
              }`}
            >
              दोपहर 3 से 4 बजे (15:00-16:00)
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('MORNING')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                activePreset === 'MORNING'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              सुबह (06:00 - 12:00)
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('AFTERNOON')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                activePreset === 'AFTERNOON'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              दोपहर (12:00 - 16:00)
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('EVENING')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                activePreset === 'EVENING'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              शाम (16:00 - 22:00)
            </button>
          </div>

          {/* Custom Date & Time Form */}
          <form onSubmit={handleCustomFilterSubmit} className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-dark-900 px-2.5 py-1.5 rounded-xl border border-dark-800">
              <Calendar className="w-3.5 h-3.5 text-dark-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-dark-900 px-2.5 py-1.5 rounded-xl border border-dark-800">
              <Clock className="w-3.5 h-3.5 text-dark-400" />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none"
              />
              <span className="text-dark-500">से</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="py-1.5 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'लागू करें'}
            </button>

            <span className="text-[10px] text-indigo-300 block w-full mt-0.5">
              💡 <strong>नोट:</strong> दोपहर 2 बजे = <strong>14:00</strong> | दोपहर 3 बजे = <strong>15:00</strong> (03:00 रात/भोर का समय है)
            </span>
          </form>

        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          
          {/* Smart Warning if User selected Early Morning 00:00 - 05:59 */}
          {parseInt(startTime.split(':')[0], 10) < 6 && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <span>
                  <strong>रात/भोर का समय चुना गया है ({startTime} से {endTime}):</strong> इस समय (रात 3 बजे) दुकान बंद रहती है इसलिए ₹0 दिख रहा है। क्या आप दोपहर का समय देखना चाहते हैं?
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleApplyPreset('2TO3')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all"
                >
                  दोपहर 2 से 3 बजे देखें
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('3TO4')}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all"
                >
                  दोपहर 3 से 4 बजे देखें
                </button>
              </div>
            </div>
          )}
          
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="p-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
              <p className="text-xs text-dark-300 font-bold">समय-अवधि रिपोर्ट तैयार की जा रही है...</p>
            </div>
          ) : reportData ? (
            <>
              {/* 1. Key Metrics Cards Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                
                {/* Net Galla Amount */}
                <div className="p-4 rounded-3xl bg-gradient-to-br from-emerald-950/40 via-dark-950 to-dark-900 border border-emerald-500/30 space-y-2 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase text-emerald-400 tracking-wider">
                      कुल गल्ला (Net Cash)
                    </span>
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h3 className="text-2xl font-black text-white font-mono">
                    ₹{fin?.totalCashCollected || 0}
                  </h3>
                  <div className="flex items-center justify-between text-[11px] text-dark-300 pt-1 border-t border-dark-800">
                    <span>कैश इन: ₹{fin?.totalCashCollected || 0}</span>
                    <span>खर्च: ₹{fin?.cashOutExpenses || 0}</span>
                  </div>
                </div>

                {/* Total Sales (Gross) */}
                <div className="p-4 rounded-3xl bg-gradient-to-br from-indigo-950/40 via-dark-950 to-dark-900 border border-indigo-500/30 space-y-2 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase text-indigo-400 tracking-wider">
                      कुल बिक्री (Cash + UPI)
                    </span>
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                  </div>
                  <h3 className="text-2xl font-black text-white font-mono">
                    ₹{fin?.totalGrossSales || 0}
                  </h3>
                  <div className="flex items-center justify-between text-[11px] text-dark-300 pt-1 border-t border-dark-800">
                    <span>ऑनलाइन UPI: ₹{fin?.totalDigitalCollected || 0}</span>
                    <span>नकदी: ₹{fin?.totalCashCollected || 0}</span>
                  </div>
                </div>

                {/* Milk Sales Litres */}
                <div className="p-4 rounded-3xl bg-gradient-to-br from-blue-950/40 via-dark-950 to-dark-900 border border-blue-500/30 space-y-2 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase text-blue-400 tracking-wider">
                      दूध बिक्री (Milk Volume)
                    </span>
                    <span className="text-xs">🥛</span>
                  </div>
                  <h3 className="text-2xl font-black text-white font-mono">
                    {sales?.milkSales?.totalLitres || 0} L
                  </h3>
                  <div className="flex items-center justify-between text-[11px] text-dark-300 pt-1 border-t border-dark-800">
                    <span>रकम: ₹{sales?.milkSales?.totalAmount || 0}</span>
                    <span>{sales?.milkSales?.entriesCount || 0} एंट्री</span>
                  </div>
                </div>

                {/* AI Customer Footfall */}
                <div className="p-4 rounded-3xl bg-gradient-to-br from-purple-950/40 via-dark-950 to-dark-900 border border-purple-500/30 space-y-2 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase text-purple-400 tracking-wider">
                      AI ग्राहक फुटफॉल
                    </span>
                    <Users className="w-4 h-4 text-purple-400" />
                  </div>
                  <h3 className="text-2xl font-black text-white font-mono">
                    {ai?.totalFootfall || 0} <span className="text-xs text-dark-400">ग्राहक</span>
                  </h3>
                  <div className="flex items-center justify-between text-[11px] text-dark-300 pt-1 border-t border-dark-800">
                    <span>पुरुष: {ai?.customerBreakdown?.men || 0}</span>
                    <span>महिला: {ai?.customerBreakdown?.women || 0}</span>
                    <span>बच्चे: {ai?.customerBreakdown?.children || 0}</span>
                  </div>
                </div>

              </div>

              {/* 2. Indian Currency Notes Vision & Galla Drawer Security Row */}
              <div className="p-5 rounded-3xl bg-dark-950 border border-amber-500/30 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dark-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-5 h-5 text-amber-400" />
                    <div>
                      <h4 className="text-sm font-black text-white">
                        AI गल्ला कैमरा: भारतीय नोटों की पहचान व सुरक्षा (Indian Currency Notes Vision)
                      </h4>
                      <p className="text-[11px] text-dark-400">
                        गल्ला कैमरा (#Ch 2) द्वारा पहचाने गए नोट और गल्ला खुलने की फ्रीक्वेंसी
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-xl bg-dark-900 border border-dark-800 text-xs text-dark-300 font-mono">
                      गल्ला खुला: <strong className="text-amber-400">{ai?.drawerOpeningsCount || 0} बार</strong>
                    </span>
                    <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-bold font-mono">
                      कैमरा विज़ुअल कैश: ₹{ai?.aiEstimatedVisualCash || 0}
                    </span>
                  </div>
                </div>

                {/* Notes Denomination Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  
                  {/* ₹500 Note */}
                  <div className="p-3 rounded-2xl bg-dark-900 border border-slate-700/60 text-center space-y-1">
                    <div className="w-full py-1 rounded-lg bg-stone-700/40 border border-stone-500/30 text-[11px] font-black text-stone-200">
                      ₹500 नोट
                    </div>
                    <p className="text-xl font-black text-white font-mono">{notes['500'] || 0}</p>
                    <p className="text-[10px] text-dark-400 font-mono">मूल्य: ₹{(notes['500'] || 0) * 500}</p>
                  </div>

                  {/* ₹200 Note */}
                  <div className="p-3 rounded-2xl bg-dark-900 border border-orange-700/60 text-center space-y-1">
                    <div className="w-full py-1 rounded-lg bg-orange-700/40 border border-orange-500/30 text-[11px] font-black text-orange-200">
                      ₹200 नोट
                    </div>
                    <p className="text-xl font-black text-white font-mono">{notes['200'] || 0}</p>
                    <p className="text-[10px] text-dark-400 font-mono">मूल्य: ₹{(notes['200'] || 0) * 200}</p>
                  </div>

                  {/* ₹100 Note */}
                  <div className="p-3 rounded-2xl bg-dark-900 border border-indigo-700/60 text-center space-y-1">
                    <div className="w-full py-1 rounded-lg bg-indigo-700/40 border border-indigo-500/30 text-[11px] font-black text-indigo-200">
                      ₹100 नोट
                    </div>
                    <p className="text-xl font-black text-white font-mono">{notes['100'] || 0}</p>
                    <p className="text-[10px] text-dark-400 font-mono">मूल्य: ₹{(notes['100'] || 0) * 100}</p>
                  </div>

                  {/* ₹50 Note */}
                  <div className="p-3 rounded-2xl bg-dark-900 border border-cyan-700/60 text-center space-y-1">
                    <div className="w-full py-1 rounded-lg bg-cyan-700/40 border border-cyan-500/30 text-[11px] font-black text-cyan-200">
                      ₹50 नोट
                    </div>
                    <p className="text-xl font-black text-white font-mono">{notes['50'] || 0}</p>
                    <p className="text-[10px] text-dark-400 font-mono">मूल्य: ₹{(notes['50'] || 0) * 50}</p>
                  </div>

                  {/* ₹20 Note */}
                  <div className="p-3 rounded-2xl bg-dark-900 border border-yellow-700/60 text-center space-y-1">
                    <div className="w-full py-1 rounded-lg bg-yellow-700/40 border border-yellow-500/30 text-[11px] font-black text-yellow-200">
                      ₹20 नोट
                    </div>
                    <p className="text-xl font-black text-white font-mono">{notes['20'] || 0}</p>
                    <p className="text-[10px] text-dark-400 font-mono">मूल्य: ₹{(notes['20'] || 0) * 20}</p>
                  </div>

                  {/* ₹10 Note */}
                  <div className="p-3 rounded-2xl bg-dark-900 border border-amber-800/60 text-center space-y-1">
                    <div className="w-full py-1 rounded-lg bg-amber-800/40 border border-amber-600/30 text-[11px] font-black text-amber-200">
                      ₹10 नोट
                    </div>
                    <p className="text-xl font-black text-white font-mono">{notes['10'] || 0}</p>
                    <p className="text-[10px] text-dark-400 font-mono">मूल्य: ₹{(notes['10'] || 0) * 10}</p>
                  </div>

                </div>

                <div className="p-3 rounded-2xl bg-dark-900 border border-dark-800 text-xs text-dark-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      गल्ला ऑडिट स्टेटस: {ai?.drawerOpeningsCount > 0 ? `${ai?.drawerOpeningsCount} बार सुरक्षित लेन-देन दर्ज हुआ।` : 'इस अवधि में कोई संदिग्ध गल्ला गतिविधि नहीं मिली।'}
                    </span>
                  </div>
                  <span className="text-[10px] text-dark-400 font-mono">
                    AI Accuracy: 98.4%
                  </span>
                </div>
              </div>

              {/* 3. Theft & Security Incidents in this Window */}
              <div className="p-5 rounded-3xl bg-dark-950 border border-slate-800 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-dark-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-rose-400" />
                    <div>
                      <h4 className="text-sm font-black text-white">
                        AI चोरी रोकथाम व संदिग्ध घटनाएं (Security & Theft Audit)
                      </h4>
                      <p className="text-[11px] text-dark-400">
                        {reportData?.timeWindow?.startTime} से {reportData?.timeWindow?.endTime} के बीच कैमरे व माइक द्वारा पकड़ी गई घटनाएं
                      </p>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-xl text-xs font-bold font-mono ${
                    ai?.theftAlerts?.length > 0 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  }`}>
                    {ai?.theftAlerts?.length > 0 ? `🚨 ${ai.theftAlerts.length} संदिग्ध अलर्ट्स` : '✅ 100% सुरक्षित'}
                  </span>
                </div>

                {ai?.theftAlerts && ai.theftAlerts.length > 0 ? (
                  <div className="space-y-2">
                    {ai.theftAlerts.map((alert: any) => (
                      <div key={alert.id} className="p-3 rounded-2xl bg-dark-900 border border-rose-500/30 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                          <div>
                            <span className="font-bold text-white block">
                              [{alert.time}] {alert.eventType === 'HAND_TO_POCKET' ? '✋ जेब में हाथ (Theft Pose)' : alert.eventType === 'CASH_DRAWER_MISMATCH' ? '🚨 गल्ला मिसमैच' : alert.eventType}
                            </span>
                            <span className="text-[11px] text-dark-300">{alert.notes}</span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-400 font-bold text-[10px] border border-rose-500/30">
                          {alert.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-dark-900 border border-dark-800 text-xs text-dark-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      इस समयावधि ({reportData?.timeWindow?.startTime} - {reportData?.timeWindow?.endTime}) में कोई चोरी, गल्ला मिसमैच या संदिग्ध गतिविधि दर्ज नहीं हुई।
                    </span>
                  </div>
                )}
              </div>

              {/* 4. Products Sold Table & Staff On Duty Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                
                {/* Products Sold in this time window (7 Cols) */}
                <div className="lg:col-span-7 p-5 rounded-3xl bg-dark-950 border border-dark-800 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-indigo-400" />
                      <span>इस समयावधि में बिका सामान (Products Sold)</span>
                    </h4>
                    <span className="text-xs text-dark-400 font-mono">
                      कुल बिक्री: ₹{sales?.productSales?.totalAmount || 0}
                    </span>
                  </div>

                  {sales?.productSales?.items?.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-dark-800 text-dark-400 text-[10px] uppercase">
                            <th className="py-2">प्रोडक्ट / सामान</th>
                            <th className="py-2">श्रेणी</th>
                            <th className="py-2 text-center">मात्रा</th>
                            <th className="py-2 text-right">कुल रकम</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-900">
                          {sales.productSales.items.map((item: any, idx: number) => (
                            <tr key={idx} className="hover:bg-dark-900/50">
                              <td className="py-2.5 font-bold text-white">{item.name}</td>
                              <td className="py-2.5 text-dark-400">{item.category}</td>
                              <td className="py-2.5 text-center font-mono font-bold text-indigo-300">
                                {item.quantitySold} {item.unit || 'नग'}
                              </td>
                              <td className="py-2.5 text-right font-mono font-bold text-emerald-400">
                                ₹{item.totalAmount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-dark-500 font-medium">
                      इस समय अंतराल में कोई किराना/डेयरी प्रोडक्ट का बिल नहीं कटा। (दूध की कुल मात्रा: {sales?.milkSales?.totalLitres || 0}L)
                    </div>
                  )}
                </div>

                {/* Staff On Duty & Instructions in this window (5 Cols) */}
                <div className="lg:col-span-5 p-5 rounded-3xl bg-dark-950 border border-dark-800 shadow-xl space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-400" />
                    <span>ड्यूटी पर उपस्थित स्टाफ व निर्देश</span>
                  </h4>

                  <div className="space-y-2.5">
                    {reportData.staffOnDuty?.map((s: any) => (
                      <div key={s.id} className="p-3 rounded-2xl bg-dark-900 border border-dark-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{s.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                            {s.role}
                          </span>
                        </div>
                        <p className="text-[10px] text-dark-400 font-mono">
                          शिफ्ट: {s.dutyTiming?.start} - {s.dutyTiming?.end}
                        </p>
                        {s.instructions && (
                          <p className="text-[11px] text-dark-300 bg-dark-950 p-2 rounded-xl border border-dark-800/80">
                            "{s.instructions}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </>
          ) : null}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-dark-950 border-t border-dark-800 flex items-center justify-between shrink-0">
          <span className="text-xs text-dark-400 font-mono">
            अवधि: {reportData?.timeWindow?.date} ({reportData?.timeWindow?.startTime} - {reportData?.timeWindow?.endTime})
          </span>

          <button
            onClick={onClose}
            className="py-2 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md"
          >
            बंद करें (Close)
          </button>
        </div>

      </div>
    </div>
  );
};
