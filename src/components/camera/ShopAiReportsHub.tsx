import React, { useState, useEffect, useCallback } from 'react';
import API from '../../api';
import { useAuth } from '../../context/AuthContext';
import { 
  FileText, Search, RefreshCw, Users, 
  AlertTriangle, Video, Clock, Trash2, ArrowRight, Eye, Calendar, ShieldCheck, Sparkles
} from 'lucide-react';
import { ShopAiReportDetailModal } from './ShopAiReportDetailModal';
import type { ShopAiReportItem } from './ShopAiReportDetailModal';
import { DpdpComplianceModal } from '../common/DpdpComplianceModal';

export const ShopAiReportsHub: React.FC = () => {
  const { t, language } = useAuth();
  const [reports, setReports] = useState<ShopAiReportItem[]>([]);
  const [showDpdpModal, setShowDpdpModal] = useState(false);
  const [generatingDailyReport, setGeneratingDailyReport] = useState(false);
  const [metrics, setMetrics] = useState({
    totalReportsCount: 0,
    todayReportsCount: 0,
    totalFootfallToday: 0,
    totalAlertsToday: 0,
  });
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'VIDEO_UPLOAD' | 'LIVE_STREAM_AUDIT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState<ShopAiReportItem | null>(null);

  // Date Filtering State
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };
  const [datePreset, setDatePreset] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'CUSTOM'>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());

  // Fetch Reports
  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterType !== 'ALL') params.sourceType = filterType;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (datePreset === 'TODAY') params.date = getTodayStr();
      else if (datePreset === 'YESTERDAY') params.date = getYesterdayStr();
      else if (datePreset === 'CUSTOM' && selectedDate) params.date = selectedDate;

      const res = await API.get('/cameras/shop-ai/reports', { params });
      if (res.data?.success) {
        setReports(res.data.reports || []);
        if (res.data.metrics) setMetrics(res.data.metrics);
      }
    } catch (err) {
      console.error('Failed to load shop AI reports', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, searchQuery, datePreset, selectedDate]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Handle Delete Report
  const handleDeleteReport = async (id: string) => {
    try {
      await API.delete(`/cameras/shop-ai/reports/${id}`);
      setReports((prev) => prev.filter((r) => r._id !== id));
      if (selectedReport?._id === id) setSelectedReport(null);
    } catch (err) {
      console.error('Failed to delete report', err);
      alert('रिपोर्ट हटाने में समस्या आई।');
    }
  };

  // Generate Daily AI Report for any date (Yesterday/Today/Custom)
  const handleGenerateDailyReport = async (targetDate?: string) => {
    const d = targetDate || (datePreset === 'YESTERDAY' ? getYesterdayStr() : selectedDate);
    setGeneratingDailyReport(true);
    try {
      const res = await API.post('/cameras/shop-ai/generate-daily-report', { date: d });
      if (res.data?.success && res.data.report) {
        setReports((prev) => [res.data.report, ...prev]);
        setSelectedReport(res.data.report);
      }
    } catch (e: any) {
      alert(e.response?.data?.message || 'रिपोर्ट जनरेट करने में त्रुटि आई।');
    } finally {
      setGeneratingDailyReport(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-dark-900 via-indigo-950/40 to-dark-900 border border-indigo-900/40 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t('aiReportsTitle')}</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
              {language === 'hi' ? 'दुकान की सभी AI रिपोर्ट्स और ग्राहक विश्लेषण' : 'Comprehensive AI Intelligence & Footfall Reports'}
            </h2>
            <p className="text-xs md:text-sm text-dark-300 max-w-2xl">
              {language === 'hi' 
                ? 'CCTV वीडियो अपलोड्स, लाइव कैमरा निरीक्षण और ऑडियो बातचीत की लिखित व विस्तृत रिपोर्ट्स यहाँ सुरक्षित रहती हैं।'
                : 'Audited reports from CCTV video, live streams, and counter microphones are archived securely.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <button
              onClick={() => handleGenerateDailyReport(getYesterdayStr())}
              disabled={generatingDailyReport}
              className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border border-indigo-400/40 text-xs font-black text-white flex items-center gap-1.5 transition-all shadow-lg shadow-indigo-600/20 active:scale-95 disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 text-amber-300 ${generatingDailyReport ? 'animate-spin' : ''}`} />
              <span>{generatingDailyReport ? t('generatingReport') : t('generateYesterdayReport')}</span>
            </button>
            <button
              onClick={() => setShowDpdpModal(true)}
              className="px-3.5 py-2 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 text-xs font-bold text-emerald-300 hover:text-white flex items-center gap-1.5 transition-all shadow-md active:scale-95"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('dpdpBadge')}</span>
            </button>
            <button
              onClick={fetchReports}
              disabled={loading}
              className="px-4 py-2 rounded-2xl bg-dark-900/90 border border-dark-800 text-xs font-bold text-dark-200 hover:text-white flex items-center gap-2 transition-all shadow-md active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
              <span>{t('refresh')}</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="p-3.5 rounded-2xl bg-dark-950/80 border border-dark-800 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-dark-400 font-bold uppercase">
                {language === 'hi' ? 'आज के कुल ग्राहक' : "Today's Footfall"}
              </p>
              <p className="text-xl font-black text-white mt-0.5">{metrics.totalFootfallToday} {language === 'hi' ? 'जन' : 'Visitors'}</p>
            </div>
            <Users className="w-6 h-6 text-indigo-400" />
          </div>

          <div className="p-3.5 rounded-2xl bg-dark-950/80 border border-dark-800 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-dark-400 font-bold uppercase">
                {language === 'hi' ? 'आज की रिपोर्ट्स' : "Today's Reports"}
              </p>
              <p className="text-xl font-black text-emerald-400 mt-0.5">{metrics.todayReportsCount}</p>
            </div>
            <Calendar className="w-6 h-6 text-emerald-400" />
          </div>

          <div className="p-3.5 rounded-2xl bg-dark-950/80 border border-dark-800 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-dark-400 font-bold uppercase">
                {language === 'hi' ? 'सक्रिय AI चेतावनियाँ' : 'Active AI Alerts'}
              </p>
              <p className={`text-xl font-black mt-0.5 ${metrics.totalAlertsToday > 0 ? 'text-amber-400' : 'text-dark-400'}`}>
                {metrics.totalAlertsToday}
              </p>
            </div>
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>

          <div className="p-3.5 rounded-2xl bg-dark-950/80 border border-dark-800 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-dark-400 font-bold uppercase">
                {language === 'hi' ? 'कुल आर्काइव रिपोर्ट्स' : 'Archived Reports'}
              </p>
              <p className="text-xl font-black text-blue-400 mt-0.5">{metrics.totalReportsCount}</p>
            </div>
            <FileText className="w-6 h-6 text-blue-400" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-dark-900 border border-dark-800 flex flex-col xl:flex-row items-center justify-between gap-3">
        {/* Source Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-dark-950 p-1.5 rounded-xl border border-dark-800 w-full xl:w-auto">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'ALL'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            {language === 'hi' ? 'सभी' : 'All'} ({reports.length})
          </button>
          <button
            onClick={() => setFilterType('VIDEO_UPLOAD')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'VIDEO_UPLOAD'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            {language === 'hi' ? '📤 वीडियो अपलोड' : '📤 Video Upload'}
          </button>
          <button
            onClick={() => setFilterType('LIVE_STREAM_AUDIT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'LIVE_STREAM_AUDIT'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            {language === 'hi' ? '🎥 लाइव निरीक्षण' : '🎥 Live Audit'}
          </button>
        </div>

        {/* 📅 Date Filter Selector Bar */}
        <div className="flex flex-wrap items-center gap-1.5 bg-dark-950 p-1.5 rounded-xl border border-dark-800 w-full xl:w-auto">
          <button
            type="button"
            onClick={() => {
              setDatePreset('TODAY');
              setSelectedDate(getTodayStr());
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              datePreset === 'TODAY'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            {t('today')}
          </button>
          <button
            type="button"
            onClick={() => {
              setDatePreset('YESTERDAY');
              setSelectedDate(getYesterdayStr());
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              datePreset === 'YESTERDAY'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            {t('yesterday')}
          </button>
          <button
            type="button"
            onClick={() => setDatePreset('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              datePreset === 'ALL'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            {t('allDays')}
          </button>
          <div className="flex items-center gap-1 pl-1 border-l border-dark-800">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setDatePreset('CUSTOM');
              }}
              className="px-2 py-1 rounded-lg bg-dark-900 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full xl:w-64">
          <Search className="w-4 h-4 text-dark-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'hi' ? 'स्टाफ, ग्राहक, कीवर्ड खोजें...' : 'Search staff, keywords...'}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white placeholder-dark-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="p-12 text-center rounded-3xl bg-dark-900 border border-dark-800 space-y-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-dark-400">{t('loading')}</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-dark-900 border border-dark-800 space-y-4">
          <FileText className="w-12 h-12 text-indigo-400 mx-auto" />
          <div>
            <h3 className="text-base font-bold text-white">
              {language === 'hi' ? 'इस अवधि के लिए कोई AI रिपोर्ट नहीं है' : 'No AI Reports Found For This Date'}
            </h3>
            <p className="text-xs text-dark-400 max-w-md mx-auto mt-1">
              {language === 'hi'
                ? 'आप एक क्लिक में कल के सभी CCTV इंसिडेंट्स, फुटेज और गल्ला लेन-देन का विश्लेषण कर नई AI रिपोर्ट तैयार कर सकते हैं।'
                : 'You can instantly synthesize a complete AI daily intelligence audit from camera incidents and sales logs.'}
            </p>
          </div>
          <button
            onClick={() => handleGenerateDailyReport(datePreset === 'YESTERDAY' ? getYesterdayStr() : selectedDate)}
            disabled={generatingDailyReport}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-black flex items-center gap-2 mx-auto shadow-xl shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 text-amber-300 ${generatingDailyReport ? 'animate-spin' : ''}`} />
            <span>
              {generatingDailyReport 
                ? t('generatingReport')
                : (datePreset === 'YESTERDAY' ? t('generateYesterdayReport') : t('generateDailyReport'))}
            </span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => {
            const alertsCount = report.aiBrainInsights?.concernsOrAlerts?.length || 0;
            return (
              <div
                key={report._id}
                onClick={() => setSelectedReport(report)}
                className="cursor-pointer group p-5 rounded-3xl bg-dark-900 hover:bg-dark-900/90 border border-dark-800 hover:border-indigo-500/50 transition-all shadow-xl hover:shadow-2xl flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Top Tags */}
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                      {report.sourceType === 'VIDEO_UPLOAD' ? <Video className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{report.sourceType === 'VIDEO_UPLOAD' ? 'वीडियो अपलोड' : 'लाइव ऑडिट'}</span>
                    </span>

                    <span className="text-[10px] font-mono text-dark-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(report.createdAt).toLocaleString('hi-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Title & Context Snippet */}
                  <div>
                    <h3 className="text-sm font-black text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                      {report.title}
                    </h3>
                    {report.userContextPrompt && (
                      <p className="text-[11px] text-dark-400 italic line-clamp-1 mt-0.5">
                        संदर्भ: "{report.userContextPrompt}"
                      </p>
                    )}
                  </div>

                  {/* Key Stats Pill Row */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-dark-950 border border-dark-800/80">
                      <span className="text-[9px] text-dark-400 font-bold uppercase block">ग्राहक</span>
                      <span className="text-sm font-black text-white">{report.customerCount.total}</span>
                    </div>

                    <div className="p-2 rounded-xl bg-dark-950 border border-dark-800/80">
                      <span className="text-[9px] text-dark-400 font-bold uppercase block">स्टाफ स्कोर</span>
                      <span className="text-sm font-black text-emerald-400">{report.staffPerformance.activeScore}%</span>
                    </div>

                    <div className="p-2 rounded-xl bg-dark-950 border border-dark-800/80">
                      <span className="text-[9px] text-dark-400 font-bold uppercase block">अलर्ट्स</span>
                      <span className={`text-sm font-black ${alertsCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {alertsCount}
                      </span>
                    </div>
                  </div>

                  {/* Summary preview */}
                  <p className="text-xs text-dark-300 line-clamp-2 leading-relaxed">
                    {report.rawSummary}
                  </p>
                </div>

                {/* Card Footer */}
                <div className="pt-3 border-t border-dark-800/80 flex items-center justify-between text-xs">
                  <span className="text-indigo-400 group-hover:text-indigo-300 font-bold flex items-center gap-1 text-[11px]">
                    <span>पूरी रिपोर्ट देखें</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('क्या आप इस रिपोर्ट को हटाना चाहते हैं?')) {
                        handleDeleteReport(report._id);
                      }
                    }}
                    className="p-1.5 rounded-lg text-dark-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    title="रिपोर्ट हटाएं"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Report Detail Modal */}
      {selectedReport && (
        <ShopAiReportDetailModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onDelete={handleDeleteReport}
        />
      )}

      {/* DPDP Compliance & Shop Notice Modal */}
      <DpdpComplianceModal
        isOpen={showDpdpModal}
        onClose={() => setShowDpdpModal(false)}
      />
    </div>
  );
};
