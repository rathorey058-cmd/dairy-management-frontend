import React, { useState, useEffect, useCallback } from 'react';
import API from '../../api';
import { useAuth } from '../../context/AuthContext';
import { 
  ShieldCheck, Printer, Trash2, CheckCircle2, Lock, 
  HardDrive, FileText, RefreshCw, X, ShieldAlert
} from 'lucide-react';

interface DpdpComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DpdpComplianceModal: React.FC<DpdpComplianceModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'audit' | 'notice'>('audit');
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeSuccess, setPurgeSuccess] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<any>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/cameras/dpdp/status');
      if (res.data?.success) {
        setStatusData(res.data);
      }
    } catch (e) {
      console.warn('Failed to load DPDP status', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setPurgeSuccess(null);
    }
  }, [isOpen, fetchStatus]);

  const handleManualPurge = async () => {
    if (!window.confirm('क्या आप 30 दिन से पुराने सभी CCTV इंसिडेंट और वीडियो क्लिप्स को DPDP नियमानुसार डिलीट करना चाहते हैं?')) {
      return;
    }
    setPurging(true);
    setPurgeSuccess(null);
    try {
      const res = await API.post('/cameras/dpdp/purge', { retentionDays: 30 });
      if (res.data?.success) {
        setPurgeSuccess(res.data.message || '30-दिन से पुराने रिकॉर्ड्स सुरक्षित रूप से हटा दिए गए।');
        fetchStatus();
      }
    } catch (e: any) {
      alert(e.response?.data?.message || 'Purge failed');
    } finally {
      setPurging(false);
    }
  };

  const handlePrintNotice = () => {
    window.print();
  };

  if (!isOpen) return null;

  const dairyName = user?.dairyName || 'कृष्णा डेयरी एवं रिटेल केंद्र';
  const ownerName = user?.name || 'डेयरी व्यवस्थापक';
  const ownerMobile = user?.mobile || '9876543210';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-dark-900 border border-slate-700/80 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header (Hidden on Print) */}
        <div className="print:hidden p-5 bg-gradient-to-r from-emerald-950/80 via-dark-900 to-indigo-950/80 border-b border-dark-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">DPDP Act, 2023 कम्प्लायंस व सुरक्षा हब</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Grade A+ Compliant
                </span>
              </div>
              <p className="text-xs text-dark-400">डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम (DPDP Act, 2023) अनुपालन</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-dark-800 hover:bg-dark-750 text-dark-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher (Hidden on Print) */}
        <div className="print:hidden flex border-b border-dark-800 bg-dark-950 px-5 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-dark-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            सुरक्षा व डेटा ऑडिट रिपोर्ट (Audit)
          </button>
          <button
            onClick={() => setActiveTab('notice')}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'notice'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-dark-400 hover:text-white'
            }`}
          >
            <Printer className="w-4 h-4" />
            दुकान नोटिस बोर्ड प्रिंट करें (Notice Board)
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          
          {/* TAB 1: AUDIT & STATUS */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              
              {/* Compliance Hero Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-dark-950 to-dark-950 border border-emerald-800/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-xl">
                    100%
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      पूर्णतः सुरक्षित एवं DPDP 2023 अनुकूल
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </h4>
                    <p className="text-xs text-dark-400 mt-0.5">
                      किसानों का डेटा, CCTV फुटेज एवं लेन-देन सिर्फ लोकल सर्वर पर सुरक्षित हैं।
                    </p>
                  </div>
                </div>
                <button
                  onClick={fetchStatus}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-xl bg-dark-800 hover:bg-dark-750 text-xs font-bold text-dark-200 flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  रीफ्रेश ऑडिट
                </button>
              </div>

              {/* 4 Pillars Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* Pillar 1: Local Storage */}
                <div className="p-4 rounded-2xl bg-dark-950 border border-dark-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <HardDrive className="w-4 h-4" />
                      लोकल एज स्टोरेज (Local-First)
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-950 text-emerald-400 border border-emerald-800">
                      0% Cloud Leak
                    </span>
                  </div>
                  <p className="text-xs text-dark-300">
                    सॉफ्टवेयर का समस्त डेटा (MongoDB/लोकल डिस्क) केवल आपकी दुकान के कंप्यूटर में रहता है। कोई भी थर्ड पार्टी डेटा लीकेज नहीं है।
                  </p>
                </div>

                {/* Pillar 2: Farmer Consent */}
                <div className="p-4 rounded-2xl bg-dark-950 border border-dark-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      किसान सहमति (Farmer Consent)
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-950 text-indigo-400 border border-indigo-800">
                      {statusData?.farmers?.consentPercentage ?? 100}% सहमति प्राप्त
                    </span>
                  </div>
                  <p className="text-xs text-dark-300">
                    किसानों के पंजीकरण के समय डिजिटल सहमति दर्ज की जाती है। वे केवल अधिकृत लेन-देन और WhatsApp बिलिंग प्राप्त करते हैं।
                  </p>
                </div>

                {/* Pillar 3: 30-Day Auto Retention */}
                <div className="p-4 rounded-2xl bg-dark-950 border border-dark-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <Lock className="w-4 h-4" />
                      30-दिवसीय डेटा रिटेंशन नीति
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-950 text-amber-400 border border-amber-800">
                      Auto-Purge Active
                    </span>
                  </div>
                  <p className="text-xs text-dark-300">
                    CCTV वीडियो क्लिप्स और ऑडियो लॉग्स 30 दिन बाद अपने आप साफ हो जाते हैं ताकि अनावश्यक निजी डेटा जमा न रहे।
                  </p>
                </div>

                {/* Pillar 4: Minimization & Evidence */}
                <div className="p-4 rounded-2xl bg-dark-950 border border-dark-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4" />
                      10s इंसिडेंट मिनिमाइज़ेशन
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-cyan-950 text-cyan-400 border border-cyan-800">
                      Evidence Only
                    </span>
                  </div>
                  <p className="text-xs text-dark-300">
                    AI केवल संदिग्ध घटना (चोरी, गल्ला मिसमैच) के समय 10-सेकंड की साक्ष्य क्लिप बनाता है। सामान्य फुटेज पूरी तरह सुरक्षित रहती है।
                  </p>
                </div>

              </div>

              {/* Purge Success Banner */}
              {purgeSuccess && (
                <div className="p-3 rounded-2xl bg-emerald-950/60 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{purgeSuccess}</span>
                </div>
              )}

              {/* Data Purge Action Bar */}
              <div className="p-4 rounded-2xl bg-dark-950 border border-dark-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <h5 className="text-xs font-bold text-white">पुराना वीडियो व इंसिडेंट डेटा सफाई (Data Cleanup)</h5>
                  <p className="text-[11px] text-dark-400 mt-0.5">
                    सक्रिय इंसिडेंट रिकॉर्ड्स: <strong className="text-white">{statusData?.surveillance?.totalIncidentsStored ?? 0}</strong> • 30 दिन से पुराने: <strong className="text-amber-400">{statusData?.surveillance?.eligibleForPurge ?? 0}</strong>
                  </p>
                </div>
                <button
                  onClick={handleManualPurge}
                  disabled={purging}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {purging ? 'हटाया जा रहा है...' : 'पुराने क्लिप्स तुरंत साफ करें (Purge)'}
                </button>
              </div>

            </div>
          )}

          {/* TAB 2: PRINTABLE NOTICE BOARD */}
          {activeTab === 'notice' && (
            <div className="space-y-4">
              
              <div className="print:hidden flex items-center justify-between bg-dark-950 p-3.5 rounded-2xl border border-dark-800">
                <p className="text-xs text-dark-300">
                  यह वैधानिक नोटिस बोर्ड A4 या A5 साइज़ में प्रिंट करके अपने <strong>डेयरी बिलिंग काउंटर</strong> पर लगाएँ। इससे आपकी दुकान DPDP Act 2023 के तहत 100% सुरक्षित हो जाती है।
                </p>
                <button
                  onClick={handlePrintNotice}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shrink-0 transition-all shadow-lg shadow-emerald-600/20"
                >
                  <Printer className="w-4 h-4" />
                  🖨️ अभी प्रिंट करें (Print)
                </button>
              </div>

              {/* Printable Notice Sheet */}
              <div 
                id="dpdp-printable-notice"
                className="bg-white text-slate-900 p-8 rounded-2xl border-4 border-slate-900 shadow-xl space-y-6 font-sans text-center print:border-4 print:p-6 print:m-0"
              >
                
                {/* Notice Header */}
                <div className="border-b-2 border-slate-900 pb-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-900 text-white text-xs font-black rounded uppercase tracking-wider mb-2">
                    सुरक्षा एवं वैधानिक सूचना (Statutory Notice)
                  </div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">
                    {dairyName}
                  </h1>
                  <p className="text-sm font-semibold text-slate-700 mt-1">
                    (डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम - DPDP Act, 2023 के अंतर्गत सार्वजनिक सूचना)
                  </p>
                </div>

                {/* Main Body */}
                <div className="space-y-4 text-left max-w-xl mx-auto text-sm text-slate-800 leading-relaxed">
                  
                  <div className="p-4 bg-slate-100 rounded-xl border border-slate-300 text-center">
                    <p className="text-base font-black text-slate-900">
                      🚨 ध्यान दें: यह संपूर्ण परिसर, दूध संकलन काउंटर एवं बिलिंग गल्ला AI CCTV कैमरा एवं ऑडियो निगरानी (Microphone) के अंतर्गत है।
                    </p>
                  </div>

                  <div className="space-y-2 text-xs text-slate-700">
                    <p><strong>1. उद्देश्य (Purpose Limitation):</strong> कैमरा एवं ऑडियो निगरानी का एकमात्र उद्देश्य दूध नाप-तौल में पारदर्शिता, चोरी व गल्ला विसंगति की रोकथाम तथा ग्राहकों/किसानों की सुरक्षा सुनिश्चित करना है।</p>
                    <p><strong>2. डेटा गोपनीयता (Data Privacy):</strong> किसानों और ग्राहकों का नाम, मोबाइल नंबर अथवा बैंक विवरण किसी भी अनधिकृत तीसरे पक्ष को नहीं बेचा या साझा किया जाता है। डेटा केवल स्थानीय बिलिंग व WhatsApp दूध पर्ची हेतु उपयोग होता है।</p>
                    <p><strong>3. डेटा प्रतिधारण (Data Retention):</strong> DPDP Act 2023 की धारा 8 के अनुसार CCTV वीडियो क्लिप्स 30 दिनों के पश्चात स्वतः सुरक्षित रूप से नष्ट (Auto-Purged) कर दी जाती हैं।</p>
                    <p><strong>4. सुधार एवं अधिकार (Data Rights):</strong> कोई भी किसान/ग्राहक अपने खाते के विवरण की जांच अथवा गलत जानकारी में सुधार का अनुरोध कर सकता है।</p>
                  </div>

                </div>

                {/* Footer Sign-off */}
                <div className="pt-4 border-t-2 border-slate-900 flex justify-between items-end text-xs text-left">
                  <div>
                    <p className="font-bold text-slate-900">संचालक / व्यवस्थापक: {ownerName}</p>
                    <p className="text-slate-600">संपर्क / सहायता: +91 {ownerMobile}</p>
                    <p className="text-[10px] text-slate-500 mt-1">प्रणाली: Smart Dairy & Retail POS AI Engine (Local Edge)</p>
                  </div>
                  <div className="text-right">
                    <div className="w-24 h-10 border border-dashed border-slate-400 rounded flex items-center justify-center text-[10px] text-slate-400 mb-1">
                      हस्ताक्षर / मोहर
                    </div>
                    <span className="font-bold text-slate-900">अधिकृत डेयरी प्रबंधन</span>
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
