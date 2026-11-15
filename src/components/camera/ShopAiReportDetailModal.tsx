import React, { useState } from 'react';
import { 
  X, Users, UserCheck, Mic, Sparkles, AlertTriangle, 
  CheckCircle2, Share2, Printer, Trash2, 
  Clock, ShieldAlert, ShoppingBag, Lightbulb, Video
} from 'lucide-react';

export interface ShopAiReportItem {
  _id: string;
  title: string;
  sourceType: 'VIDEO_UPLOAD' | 'LIVE_STREAM_AUDIT' | 'AUDIO_RECORDING' | 'SNAPSHOT_AUDIT';
  mediaType: 'video' | 'audio' | 'image';
  mediaThumbnail?: string;
  mediaDuration?: string;
  userContextPrompt?: string;
  cameraName?: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  customerCount: {
    total: number;
    men: number;
    women: number;
    children: number;
    notes: string;
  };
  staffPerformance: {
    staffIdentified: string[];
    attendanceStatus: string;
    activeScore: number;
    behaviorNotes: string;
    unattendedLapses: string[];
  };
  voiceAnalysis: {
    languageDetected: string;
    audioSummary: string;
    transcripts: Array<{
      speaker: string;
      timeCode?: string;
      text: string;
      intent?: string;
    }>;
  };
  businessTransactions: {
    estimatedTransactionsCount: number;
    itemsDiscussedOrSold: string[];
    cashCounterObservations: string;
  };
  aiBrainInsights: {
    positives: string[];
    concernsOrAlerts: string[];
    actionableSuggestions: string[];
    anomalyDetected: boolean;
  };
  writtenFullReport: string;
  rawSummary: string;
  createdAt: string;
}

interface Props {
  report: ShopAiReportItem | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

export const ShopAiReportDetailModal: React.FC<Props> = ({ report, onClose, onDelete }) => {
  const [activeTab, setActiveTab] = useState<'written' | 'customers' | 'staff' | 'voice' | 'business' | 'brain'>('written');

  if (!report) return null;

  // WhatsApp Share Formatter
  const handleShareWhatsApp = () => {
    const text = `📊 *${report.title}*
📅 तारीख: ${new Date(report.createdAt).toLocaleDateString('hi-IN')}
👥 कुल ग्राहक: ${report.customerCount.total} (पुरुष: ${report.customerCount.men}, महिला: ${report.customerCount.women})
🧑‍💼 स्टाफ स्थिति: ${report.staffPerformance.attendanceStatus} (स्कोर: ${report.staffPerformance.activeScore}%)
🎙️ बातचीत सार: ${report.voiceAnalysis.audioSummary || 'सामान्य बातचीत'}
⚠️ AI अलर्ट्स: ${report.aiBrainInsights.concernsOrAlerts.length > 0 ? report.aiBrainInsights.concernsOrAlerts.join('; ') : 'सब ठीक है'}
💡 AI सुझाव: ${report.aiBrainInsights.actionableSuggestions.join('; ')}

_Dairy Smart AI Camera Hub_`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-4xl bg-dark-900 border border-dark-700/80 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-800 bg-gradient-to-r from-dark-900 via-indigo-950/40 to-dark-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              {report.sourceType === 'VIDEO_UPLOAD' ? <Video className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {report.sourceType === 'VIDEO_UPLOAD' ? 'CCTV / वीडियो अपलोड' : 'लाइव AI निरीक्षण'}
                </span>
                <span className="text-xs text-dark-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(report.createdAt).toLocaleString('hi-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight mt-0.5">
                {report.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShareWhatsApp}
              title="व्हाट्सएप पर शेयर करें"
              className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={handlePrint}
              title="रिपोर्ट प्रिंट करें"
              className="p-2 rounded-xl bg-dark-800 hover:bg-dark-700 text-dark-200 border border-dark-700 transition-all"
            >
              <Printer className="w-4 h-4" />
            </button>
            {onDelete && (
              <button
                onClick={() => {
                  if (window.confirm('क्या आप इस रिपोर्ट को हटाना चाहते हैं?')) {
                    onDelete(report._id);
                    onClose();
                  }
                }}
                title="रिपोर्ट हटाएं"
                className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-white transition-all ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-dark-950/60 border-b border-dark-800 text-xs">
          <div className="p-2.5 rounded-xl bg-dark-900/90 border border-dark-800 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-dark-400 font-bold uppercase">कुल ग्राहक (Footfall)</p>
              <p className="text-base font-black text-white">{report.customerCount.total} जन</p>
            </div>
            <Users className="w-5 h-5 text-indigo-400" />
          </div>

          <div className="p-2.5 rounded-xl bg-dark-900/90 border border-dark-800 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-dark-400 font-bold uppercase">स्टाफ स्कोर</p>
              <p className="text-base font-black text-emerald-400">{report.staffPerformance.activeScore}%</p>
            </div>
            <UserCheck className="w-5 h-5 text-emerald-400" />
          </div>

          <div className="p-2.5 rounded-xl bg-dark-900/90 border border-dark-800 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-dark-400 font-bold uppercase">ऑडियो संवाद</p>
              <p className="text-base font-black text-blue-400">{report.voiceAnalysis.transcripts?.length || 0} लाइनें</p>
            </div>
            <Mic className="w-5 h-5 text-blue-400" />
          </div>

          <div className="p-2.5 rounded-xl bg-dark-900/90 border border-dark-800 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-dark-400 font-bold uppercase">AI अलर्ट्स</p>
              <p className={`text-base font-black ${report.aiBrainInsights.concernsOrAlerts.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {report.aiBrainInsights.concernsOrAlerts.length} चेतावनियाँ
              </p>
            </div>
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
        </div>

        {/* User Context Banner if provided */}
        {report.userContextPrompt && (
          <div className="px-5 py-2.5 bg-indigo-950/30 border-b border-indigo-900/30 flex items-center gap-2 text-xs text-indigo-200">
            <span className="font-bold text-indigo-400 uppercase text-[10px] whitespace-nowrap">दुकानदार का संदर्भ:</span>
            <span className="truncate italic">"{report.userContextPrompt}"</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 border-b border-dark-800 bg-dark-950/40 overflow-x-auto no-scrollbar">
          {[
            { id: 'written', label: '📋 लिखित रिपोर्ट', icon: Sparkles },
            { id: 'customers', label: '👥 ग्राहक विश्लेषण', icon: Users },
            { id: 'staff', label: '🧑‍💼 नौकर / स्टाफ', icon: UserCheck },
            { id: 'voice', label: '🎙️ आवाज़ व बातचीत', icon: Mic },
            { id: 'business', label: '💰 गल्ला व बिक्री', icon: ShoppingBag },
            { id: 'brain', label: '💡 AI का दिमाग', icon: Lightbulb },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-white bg-indigo-500/10'
                    : 'border-transparent text-dark-400 hover:text-dark-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          
          {/* TAB 1: WRITTEN FULL REPORT (लिखित रूप में) */}
          {activeTab === 'written' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-dark-950/70 border border-dark-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>दुकान सारांश (Executive Summary)</span>
                </h4>
                <p className="text-sm text-dark-200 leading-relaxed font-medium">
                  {report.rawSummary}
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-dark-950/90 border border-dark-800 font-sans text-dark-200 space-y-3 leading-relaxed text-sm whitespace-pre-wrap">
                {report.writtenFullReport}
              </div>
            </div>
          )}

          {/* TAB 2: CUSTOMER FOOTFALL */}
          {activeTab === 'customers' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-dark-950/80 border border-dark-800 text-center">
                  <p className="text-xs text-dark-400 font-bold uppercase">पुरुष ग्राहक</p>
                  <p className="text-2xl font-black text-blue-400 mt-1">{report.customerCount.men}</p>
                </div>
                <div className="p-4 rounded-2xl bg-dark-950/80 border border-dark-800 text-center">
                  <p className="text-xs text-dark-400 font-bold uppercase">महिला ग्राहक</p>
                  <p className="text-2xl font-black text-rose-400 mt-1">{report.customerCount.women}</p>
                </div>
                <div className="p-4 rounded-2xl bg-dark-950/80 border border-dark-800 text-center">
                  <p className="text-xs text-dark-400 font-bold uppercase">बच्चे</p>
                  <p className="text-2xl font-black text-amber-400 mt-1">{report.customerCount.children}</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-dark-950/80 border border-dark-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-dark-400 mb-1.5">ग्राहकों का आगमन व नोट्स</h4>
                <p className="text-sm text-dark-200">{report.customerCount.notes || 'कोई विशेष भीड़ या देरी नहीं देखी गई।'}</p>
              </div>
            </div>
          )}

          {/* TAB 3: STAFF & SERVANT (AKASH) */}
          {activeTab === 'staff' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-dark-950/80 border border-dark-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-dark-400 font-bold uppercase">पहचाने गए स्टाफ:</span>
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 font-black text-sm">
                      {report.staffPerformance.staffIdentified.join(', ') || 'आकाश (दुकान नौकर)'}
                    </span>
                  </div>
                  <p className="text-xs text-dark-400 mt-1">
                    वर्तमान स्थिति: <span className="text-emerald-400 font-bold">{report.staffPerformance.attendanceStatus}</span>
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-dark-400 uppercase font-bold">एक्टिविटी स्कोर</span>
                  <div className="text-2xl font-black text-emerald-400">{report.staffPerformance.activeScore}%</div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-dark-950/80 border border-dark-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-dark-400 mb-1.5">कामकाज व व्यवहार पर AI की टिप्पणी</h4>
                <p className="text-sm text-dark-200 leading-relaxed">{report.staffPerformance.behaviorNotes}</p>
              </div>

              {report.staffPerformance.unattendedLapses && report.staffPerformance.unattendedLapses.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>काउंटर खाली छोड़ने या लापरवाही के क्षण</span>
                  </h4>
                  <ul className="list-disc list-inside text-xs text-amber-200 space-y-1">
                    {report.staffPerformance.unattendedLapses.map((lapse, idx) => (
                      <li key={idx}>{lapse}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: VOICE & CONVERSATIONS */}
          {activeTab === 'voice' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-dark-950/80 border border-dark-800">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5" />
                    <span>पहचानी गई भाषा व ऑडियो सार</span>
                  </h4>
                  <span className="text-xs text-dark-400 font-mono">{report.voiceAnalysis.languageDetected}</span>
                </div>
                <p className="text-sm text-dark-200">{report.voiceAnalysis.audioSummary}</p>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-dark-400">क्रमबद्ध बातचीत (Dialogue Transcripts)</h4>
                {report.voiceAnalysis.transcripts && report.voiceAnalysis.transcripts.length > 0 ? (
                  report.voiceAnalysis.transcripts.map((t, idx) => (
                    <div key={idx} className="p-3.5 rounded-xl bg-dark-950/90 border border-dark-800 flex items-start gap-3">
                      <div className="px-2 py-0.5 rounded-md bg-dark-800 font-mono text-[10px] text-dark-300 whitespace-nowrap mt-0.5">
                        {t.timeCode || `00:${String(idx * 8 + 5).padStart(2, '0')}`}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-indigo-300">{t.speaker}</span>
                          {t.intent && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {t.intent}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-dark-100 font-medium">"{t.text}"</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-dark-400 italic">ऑडियो में कोई स्पष्ट बातचीत दर्ज नहीं हुई।</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: BUSINESS & GALLA (CASH COUNTER) */}
          {activeTab === 'business' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-dark-950/80 border border-dark-800 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>बिक्री व लेन-देन का अनुमान</span>
                </h4>
                <p className="text-xs text-dark-300">
                  अनुमानित लेन-देन संख्या: <span className="text-white font-bold">{report.businessTransactions.estimatedTransactionsCount}</span>
                </p>
                
                <div className="mt-2">
                  <span className="text-xs text-dark-400 block mb-1.5">चर्चा में आए या बिके हुए उत्पाद:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {report.businessTransactions.itemsDiscussedOrSold.map((item, idx) => (
                      <span key={idx} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs font-semibold">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-dark-950/80 border border-dark-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>गल्ला व कैश हैंडलिंग निरीक्षण</span>
                </h4>
                <p className="text-sm text-dark-200 leading-relaxed">
                  {report.businessTransactions.cashCounterObservations}
                </p>
              </div>
            </div>
          )}

          {/* TAB 6: AI BRAIN INSIGHTS (AI का दिमाग) */}
          {activeTab === 'brain' && (
            <div className="space-y-4">
              {/* Positives */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>सकारात्मक बातें (Positive Highlights)</span>
                </h4>
                <ul className="list-disc list-inside text-xs text-emerald-200 space-y-1.5">
                  {report.aiBrainInsights.positives.map((p, idx) => (
                    <li key={idx}>{p}</li>
                  ))}
                </ul>
              </div>

              {/* Concerns & Alerts */}
              {report.aiBrainInsights.concernsOrAlerts.length > 0 && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>लापरवाही या सुरक्षा चेतावनियाँ (Alerts)</span>
                  </h4>
                  <ul className="list-disc list-inside text-xs text-rose-200 space-y-1.5">
                    {report.aiBrainInsights.concernsOrAlerts.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Practical Suggestions */}
              <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <Lightbulb className="w-4 h-4" />
                  <span>दुकान बढ़ाने व नुकसान रोकने के सुझाव (AI Actionable Advice)</span>
                </h4>
                <ul className="list-disc list-inside text-xs text-indigo-200 space-y-1.5">
                  {report.aiBrainInsights.actionableSuggestions.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-dark-800 bg-dark-950 flex items-center justify-between">
          <p className="text-xs text-dark-400">
            AI मॉडल: <span className="text-white font-mono">Google Gemini 1.5 Flash Multimodal</span>
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-lg shadow-indigo-600/30"
          >
            बंद करें
          </button>
        </div>

      </div>
    </div>
  );
};
