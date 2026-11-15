import React, { useState, useEffect } from 'react';
import API from '../../api';
import { 
  Building2, User, Phone, MessageSquare, MapPin, 
  Sparkles, ShieldCheck, Video, Mic, CheckCircle2, 
  ChevronRight, ArrowLeft, X, Clock, RefreshCw
} from 'lucide-react';

interface MicrophoneConfig {
  id: string;
  name: string;
  role: 'COUNTER' | 'GALLA' | 'CUSTOM';
  enabled: boolean;
}

interface SetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (updatedSettings: any) => void;
}

export const FirstTimeSetupWizard: React.FC<SetupWizardProps> = ({ isOpen, onClose, onComplete }) => {
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Step 1: Dairy Profile
  const [dairyName, setDairyName] = useState('श्री कृष्णा डेयरी');
  const [ownerName, setOwnerName] = useState('अमित पटेल');
  const [mobile, setMobile] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [sameAsMobile, setSameAsMobile] = useState(true);
  const [address, setAddress] = useState('मुख्य बाजार, बस स्टैंड के पास');
  const [selectedLogoIcon, setSelectedLogoIcon] = useState('🐄');

  // Step 2: Milk Pricing & Settlement Cycle
  const [cowFatRate, setCowFatRate] = useState('7.5');
  const [cowSnfRate, setCowSnfRate] = useState('4.0');
  const [cowSellingPrice, setCowSellingPrice] = useState('60');
  const [buffaloFatRate, setBuffaloFatRate] = useState('9.0');
  const [buffaloSnfRate, setBuffaloSnfRate] = useState('4.5');
  const [buffaloSellingPrice, setBuffaloSellingPrice] = useState('80');
  const [cycleType, setCycleType] = useState<'10_DAY' | 'WEEKLY' | '15_DAY' | 'MONTHLY' | 'CUSTOM'>('10_DAY');
  const [customDays, setCustomDays] = useState('10');

  // Step 3: Hardware & Camera / Multi-Mic Setup
  const [skipCamera, setSkipCamera] = useState(false);
  const [nvrIp, setNvrIp] = useState('192.168.31.129');
  const [cameraRtspUrl, setCameraRtspUrl] = useState('rtsp://admin:admin123@192.168.31.129:554/Streaming/Channels/101');
  const [audioMode, setAudioMode] = useState<'VISION_AUDIO' | 'VISION_ONLY'>('VISION_AUDIO');
  const [microphones, setMicrophones] = useState<MicrophoneConfig[]>([
    { id: 'mic-1', name: 'Mic 1: Counter Mic (काउंटर माइक)', role: 'COUNTER', enabled: true },
    { id: 'mic-2', name: 'Mic 2: Cash Drawer Mic (गल्ला माइक)', role: 'GALLA', enabled: true }
  ]);
  const [customMicName, setCustomMicName] = useState('');

  // Load existing settings if available
  useEffect(() => {
    if (!isOpen) return;
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const res = await API.get('/tenant/settings');
        if (res.data?.success && res.data?.tenant) {
          const t = res.data.tenant;
          if (t.name) setDairyName(t.name);
          if (t.ownerName) setOwnerName(t.ownerName);
          if (t.mobile) setMobile(t.mobile);
          if (t.whatsappNumber) setWhatsappNumber(t.whatsappNumber);
          if (t.address) setAddress(t.address);
          if (t.pricingConfig) {
            setCowFatRate(String(t.pricingConfig.cowBaseRatePerFat || '7.5'));
            setCowSnfRate(String(t.pricingConfig.cowBaseRatePerSnf || '4.0'));
            setCowSellingPrice(String(t.pricingConfig.cowSellingPrice || '60'));
            setBuffaloFatRate(String(t.pricingConfig.buffaloBaseRatePerFat || '9.0'));
            setBuffaloSnfRate(String(t.pricingConfig.buffaloBaseRatePerSnf || '4.5'));
            setBuffaloSellingPrice(String(t.pricingConfig.buffaloSellingPrice || '80'));
          }
          if (t.settlementCycle) {
            setCycleType(t.settlementCycle.cycleType || '10_DAY');
            setCustomDays(String(t.settlementCycle.customDays || '10'));
          }
          if (t.hardwareConfig) {
            setAudioMode(t.hardwareConfig.audioMode || 'VISION_AUDIO');
            if (t.hardwareConfig.nvrIpAddress) setNvrIp(t.hardwareConfig.nvrIpAddress);
            if (t.hardwareConfig.cameraRtspUrl) setCameraRtspUrl(t.hardwareConfig.cameraRtspUrl);
            if (t.hardwareConfig.microphones?.length) setMicrophones(t.hardwareConfig.microphones);
          }
        }
      } catch (e) {
        console.warn('Could not load tenant settings, using smart defaults', e);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [isOpen]);

  const handleAddCustomMic = () => {
    if (!customMicName.trim()) return;
    const newMic = {
      id: `mic-${Date.now()}`,
      name: customMicName.trim(),
      role: 'CUSTOM' as const,
      enabled: true
    };
    setMicrophones([...microphones, newMic]);
    setCustomMicName('');
  };

  const handleToggleMic = (id: string) => {
    setMicrophones(microphones.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
  };

  const handleSaveAndComplete = async () => {
    setSaving(true);
    try {
      const payload = {
        name: dairyName,
        ownerName,
        mobile,
        whatsappNumber: sameAsMobile ? mobile : whatsappNumber,
        address,
        logoUrl: selectedLogoIcon,
        pricingConfig: {
          cowBaseRatePerFat: Number(cowFatRate) || 7.5,
          cowBaseRatePerSnf: Number(cowSnfRate) || 4.0,
          cowSellingPrice: Number(cowSellingPrice) || 60,
          buffaloBaseRatePerFat: Number(buffaloFatRate) || 9.0,
          buffaloBaseRatePerSnf: Number(buffaloSnfRate) || 4.5,
          buffaloSellingPrice: Number(buffaloSellingPrice) || 80
        },
        settlementCycle: {
          cycleType,
          customDays: Number(customDays) || 10
        },
        hardwareConfig: {
          cameraRtspUrl: skipCamera ? '' : cameraRtspUrl,
          nvrIpAddress: skipCamera ? '' : nvrIp,
          audioMode,
          microphones
        },
        isOnboardingCompleted: true
      };

      await API.put('/tenant/settings', payload);
      await API.post('/tenant/onboarding-complete');

      localStorage.setItem('dairy_onboarding_completed', 'true');
      setSaveSuccess(true);
      if (onComplete) onComplete(payload);

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      alert(err.response?.data?.message || 'सेटिंग्स सेव करने में समस्या आई।');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-dark-900 border border-dark-750 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        
        {/* Top Header */}
        <div className="p-5 border-b border-dark-800 bg-gradient-to-r from-dark-950 via-indigo-950/40 to-dark-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xl shadow-inner">
              ✨
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>स्मार्ट डेयरी और रिटेल POS ऑनबोर्डिंग</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold uppercase tracking-wider">
                  Quick Setup
                </span>
              </h2>
              <p className="text-xs text-dark-400">
                10-दिवसीय बिलिंग चक्र, दूध भाव व AI कैमरा/माइक सुरक्षा सेटअप
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-dark-400 hover:text-white hover:bg-dark-800 transition-all"
            title="बंद करें"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Multi-Step Stepper Bar */}
        <div className="px-6 py-3 bg-dark-950/60 border-b border-dark-800/80 flex items-center justify-between">
          {[
            { num: 1, label: 'डेयरी प्रोफाइल' },
            { num: 2, label: 'दूध भाव व 10-दिवसीय चक्र' },
            { num: 3, label: 'कैमरा व मल्टी-माइक' },
            { num: 4, label: 'लॉन्च डैशबोर्ड' }
          ].map((s) => (
            <div 
              key={s.num} 
              onClick={() => s.num < step && setStep(s.num)}
              className={`flex items-center gap-2 cursor-pointer transition-all ${
                step === s.num 
                  ? 'text-indigo-400 font-black' 
                  : step > s.num 
                  ? 'text-emerald-400 font-bold' 
                  : 'text-dark-500 font-medium'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                step === s.num 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' 
                  : step > s.num 
                  ? 'bg-emerald-500 text-dark-950' 
                  : 'bg-dark-800 text-dark-400'
              }`}>
                {step > s.num ? '✓' : s.num}
              </div>
              <span className="text-xs hidden sm:inline">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Step Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
              <p className="text-xs text-dark-300">मौजूदा सेटिंग्स लोड हो रही हैं...</p>
            </div>
          ) : step === 1 ? (
            /* STEP 1: Dairy & Owner Profile */
            <div className="space-y-5 animate-fade-in">
              <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-200 flex items-start gap-2.5">
                <Building2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <p>
                  यहाँ अपनी डेयरी व मालिक की सही जानकारी भरें। यही नाम आपकी बिल पर्चियों, WhatsApp संदेशों और थर्मल प्रिंटर पर छपेगा।
                </p>
              </div>

              {/* Logo / Brand Avatar Selector */}
              <div>
                <label className="text-xs font-bold text-dark-300 block mb-2">ब्रांड लोगो / पहचान चिन्ह:</label>
                <div className="flex items-center gap-3">
                  {['🐄', '🥛', '🧈', '🧀', '👑', '🌾'].map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setSelectedLogoIcon(icon)}
                      className={`w-12 h-12 rounded-2xl text-2xl flex items-center justify-center transition-all ${
                        selectedLogoIcon === icon
                          ? 'bg-indigo-600/30 border-2 border-indigo-500 scale-110 shadow-lg'
                          : 'bg-dark-950 border border-dark-800 hover:border-dark-700'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-dark-300 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>डेयरी का नाम:</span>
                  </label>
                  <input
                    type="text"
                    value={dairyName}
                    onChange={(e) => setDairyName(e.target.value)}
                    placeholder="उदा: श्री कृष्णा डेयरी"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white placeholder-dark-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-dark-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-400" />
                    <span>मालिक का नाम:</span>
                  </label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="उदा: अमित पटेल"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white placeholder-dark-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-dark-300 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-blue-400" />
                    <span>मोबाइल नंबर:</span>
                  </label>
                  <input
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="10 अंकों का मोबाइल नंबर"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white placeholder-dark-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-dark-300 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                      <span>WhatsApp रिपोर्ट नंबर:</span>
                    </label>
                    <label className="text-[10px] text-dark-400 flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sameAsMobile}
                        onChange={(e) => setSameAsMobile(e.target.checked)}
                        className="rounded accent-indigo-500"
                      />
                      <span>वही मोबाइल नंबर</span>
                    </label>
                  </div>
                  <input
                    type="tel"
                    disabled={sameAsMobile}
                    value={sameAsMobile ? mobile : whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="दैनिक रिपोर्ट हेतु WhatsApp नंबर"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white placeholder-dark-500 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-dark-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  <span>दुकान का पूरा पता / गाँव / तहसील:</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="उदा: मुख्य बस स्टैंड के सामने, गाँव रामपुर"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white placeholder-dark-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          ) : step === 2 ? (
            /* STEP 2: Milk Pricing & Farmer Billing Cycle */
            <div className="space-y-5 animate-fade-in">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-200 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p>
                  दूध का खरीद भाव (FAT/SNF बेस रेट) और किसान भुगतान चक्र चुनें। भारत की अधिकांश डेयरियों में **10-दिवसीय चक्र (Decade: 1-10, 11-20, 21-End)** चलता है।
                </p>
              </div>

              {/* Settlement Cycle Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-dark-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>किसान भुगतान व बिलिंग चक्र (Settlement Cycle):</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCycleType('10_DAY')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      cycleType === '10_DAY'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                        : 'bg-dark-950 border-dark-800 text-dark-300 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black">10-दिवसीय चक्र (दशक)</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">अनुशंसित</span>
                    </div>
                    <p className="text-[10px] text-dark-400">1-10, 11-20, 21 से माह अंत</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCycleType('WEEKLY')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      cycleType === 'WEEKLY'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                        : 'bg-dark-950 border-dark-800 text-dark-300 hover:text-white'
                    }`}
                  >
                    <span className="text-xs font-black block mb-1">साप्ताहिक (7 दिन)</span>
                    <p className="text-[10px] text-dark-400">हर हफ्ते सोमवार को बिल</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCycleType('15_DAY')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      cycleType === '15_DAY'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                        : 'bg-dark-950 border-dark-800 text-dark-300 hover:text-white'
                    }`}
                  >
                    <span className="text-xs font-black block mb-1">पाक्षिक (15 दिन)</span>
                    <p className="text-[10px] text-dark-400">1-15 व 16 से माह अंत</p>
                  </button>
                </div>

                {/* 10-day Cycle preview visual pills */}
                {cycleType === '10_DAY' && (
                  <div className="p-3 rounded-xl bg-dark-950 border border-dark-800 flex items-center justify-between gap-2 text-[11px] font-mono text-dark-300">
                    <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">दशक १: 1 से 10 तारीख</span>
                    <span>→</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">दशक २: 11 से 20 तारीख</span>
                    <span>→</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">दशक ३: 21 से माह अंत</span>
                  </div>
                )}
              </div>

              {/* Pricing Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {/* Cow Milk Pricing */}
                <div className="p-4 rounded-2xl bg-dark-950 border border-dark-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🐄</span>
                    <h4 className="text-xs font-black text-white">गाय का दूध (Cow Milk)</h4>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-dark-400 font-bold block mb-1">FAT रेट (₹)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={cowFatRate}
                        onChange={(e) => setCowFatRate(e.target.value)}
                        className="w-full p-2 rounded-xl bg-dark-900 border border-dark-750 text-xs text-white text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-dark-400 font-bold block mb-1">SNF रेट (₹)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={cowSnfRate}
                        onChange={(e) => setCowSnfRate(e.target.value)}
                        className="w-full p-2 rounded-xl bg-dark-900 border border-dark-750 text-xs text-white text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-dark-400 font-bold block mb-1">बिक्री दर (₹/L)</label>
                      <input
                        type="number"
                        value={cowSellingPrice}
                        onChange={(e) => setCowSellingPrice(e.target.value)}
                        className="w-full p-2 rounded-xl bg-dark-900 border border-dark-750 text-xs text-emerald-400 text-center font-bold"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-dark-500 italic">4.0 FAT का खरीद भाव: ₹{(Number(cowFatRate) * 4.0).toFixed(1)}/L</p>
                </div>

                {/* Buffalo Milk Pricing */}
                <div className="p-4 rounded-2xl bg-dark-950 border border-dark-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🐃</span>
                    <h4 className="text-xs font-black text-white">भैंस का दूध (Buffalo Milk)</h4>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-dark-400 font-bold block mb-1">FAT रेट (₹)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={buffaloFatRate}
                        onChange={(e) => setBuffaloFatRate(e.target.value)}
                        className="w-full p-2 rounded-xl bg-dark-900 border border-dark-750 text-xs text-white text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-dark-400 font-bold block mb-1">SNF रेट (₹)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={buffaloSnfRate}
                        onChange={(e) => setBuffaloSnfRate(e.target.value)}
                        className="w-full p-2 rounded-xl bg-dark-900 border border-dark-750 text-xs text-white text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-dark-400 font-bold block mb-1">बिक्री दर (₹/L)</label>
                      <input
                        type="number"
                        value={buffaloSellingPrice}
                        onChange={(e) => setBuffaloSellingPrice(e.target.value)}
                        className="w-full p-2 rounded-xl bg-dark-900 border border-dark-750 text-xs text-emerald-400 text-center font-bold"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-dark-500 italic">6.5 FAT का खरीद भाव: ₹{(Number(buffaloFatRate) * 6.5).toFixed(1)}/L</p>
                </div>
              </div>
            </div>
          ) : step === 3 ? (
            /* STEP 3: Hardware & Camera / Multi-Mic Setup */
            <div className="space-y-5 animate-fade-in">
              <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200 flex items-start gap-2.5">
                <Video className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <p>
                  दुकान के Hikvision DVR और काउंटर/गल्ला माइक्रोफोन जोड़ें। ऑडियो + वीडियो दोनों ऑन रखने पर चोरी और नकदी का 100% सही मिलान होता है।
                </p>
              </div>

              {/* Camera Stream Section */}
              <div className="p-4 rounded-2xl bg-dark-950 border border-dark-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-xs font-black text-white">Hikvision DVR / NVR कैमरा स्ट्रीम</h4>
                  </div>
                  <label className="text-xs text-dark-400 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipCamera}
                      onChange={(e) => setSkipCamera(e.target.checked)}
                      className="rounded accent-indigo-500"
                    />
                    <span>बाद में सेटअप करें (Skip)</span>
                  </label>
                </div>

                {!skipCamera && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[10px] font-bold text-dark-400 block mb-1">DVR लोकल IP पता:</label>
                      <input
                        type="text"
                        value={nvrIp}
                        onChange={(e) => setNvrIp(e.target.value)}
                        placeholder="192.168.31.129"
                        className="w-full px-3 py-2 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-dark-400 block mb-1">RTSP लाइव स्ट्रीम लिंक:</label>
                      <input
                        type="text"
                        value={cameraRtspUrl}
                        onChange={(e) => setCameraRtspUrl(e.target.value)}
                        placeholder="rtsp://admin:pass@ip:554/Streaming/Channels/101"
                        className="w-full px-3 py-2 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-Microphone Selector */}
              <div className="p-4 rounded-2xl bg-dark-950 border border-dark-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-black text-white">मल्टी-माइक ऑडियो ऑडिट (Multi-Mic Setup)</h4>
                  </div>

                  {/* Mode Toggle */}
                  <div className="flex items-center gap-1 bg-dark-900 p-1 rounded-xl border border-dark-800 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setAudioMode('VISION_AUDIO')}
                      className={`px-2 py-1 rounded-lg font-bold transition-all ${
                        audioMode === 'VISION_AUDIO' ? 'bg-indigo-600 text-white' : 'text-dark-400'
                      }`}
                    >
                      Vision + Audio
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudioMode('VISION_ONLY')}
                      className={`px-2 py-1 rounded-lg font-bold transition-all ${
                        audioMode === 'VISION_ONLY' ? 'bg-indigo-600 text-white' : 'text-dark-400'
                      }`}
                    >
                      Pure Vision
                    </button>
                  </div>
                </div>

                {audioMode === 'VISION_AUDIO' && (
                  <div className="space-y-2">
                    {microphones.map((m) => (
                      <div
                        key={m.id}
                        className="p-2.5 rounded-xl bg-dark-900 border border-dark-800 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full ${m.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-dark-600'}`} />
                          <span className="font-bold text-white">{m.name}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-dark-800 text-dark-300 font-mono">
                            {m.role}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleMic(m.id)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all ${
                            m.enabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-dark-800 text-dark-500'
                          }`}
                        >
                          {m.enabled ? 'सक्रिय (Active)' : 'बंद (Muted)'}
                        </button>
                      </div>
                    ))}

                    {/* Add Custom Mic */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={customMicName}
                        onChange={(e) => setCustomMicName(e.target.value)}
                        placeholder="उदा: Mic 3: शेल्फ/गोदाम USB माइक..."
                        className="flex-1 px-3 py-2 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white placeholder-dark-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomMic}
                        className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 transition-all"
                      >
                        + नया माइक जोड़ें
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* STEP 4: Finish & Launch Dashboard */
            <div className="space-y-6 text-center py-4 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-3xl mx-auto shadow-lg shadow-emerald-500/20">
                🎉
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-black text-white">बधाई हो! आपकी डेयरी का सेटअप पूरा हुआ</h3>
                <p className="text-xs text-dark-300 max-w-md mx-auto">
                  आपकी सेटिंग्स सुरक्षित कर ली गई हैं। आप जब चाहें "सेटिंग्स" मेन्यू से इनमें बदलाव कर सकते हैं।
                </p>
              </div>

              {/* Summary Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                <div className="p-3.5 rounded-2xl bg-dark-950 border border-dark-800 space-y-1">
                  <span className="text-[10px] text-dark-400 font-bold uppercase block">डेयरी व मालिक</span>
                  <p className="text-xs font-black text-white truncate">{dairyName}</p>
                  <p className="text-[10px] text-dark-400">{ownerName} • {mobile}</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-dark-950 border border-dark-800 space-y-1">
                  <span className="text-[10px] text-dark-400 font-bold uppercase block">भुगतान व भाव</span>
                  <p className="text-xs font-black text-emerald-400">10-दिवसीय चक्र (Decade)</p>
                  <p className="text-[10px] text-dark-400">गाय FAT: ₹{cowFatRate} | भैंस FAT: ₹{buffaloFatRate}</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-dark-950 border border-dark-800 space-y-1">
                  <span className="text-[10px] text-dark-400 font-bold uppercase block">AI कैमरा व सुरक्षा</span>
                  <p className="text-xs font-black text-indigo-400">
                    {skipCamera ? 'कैमरा बाद में' : 'DVR 192.168.31.129'}
                  </p>
                  <p className="text-[10px] text-dark-400">
                    {audioMode === 'VISION_AUDIO' ? `${microphones.filter(m => m.enabled).length} माइक सक्रिय` : 'Pure Vision'}
                  </p>
                </div>
              </div>

              {saveSuccess && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>सेटिंग्स सफलतापूर्वक लागू हो गईं! डैशबोर्ड खुल रहा है...</span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Bottom Actions Footer */}
        <div className="p-4 border-t border-dark-800 bg-dark-950 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-dark-900 hover:bg-dark-850 text-dark-300 hover:text-white border border-dark-800 text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>पिछला</span>
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/30 active:scale-95"
            >
              <span>आगे बढ़ें</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSaveAndComplete}
              disabled={saving || saveSuccess}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white text-xs font-black flex items-center gap-2 transition-all shadow-xl shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>सेटिंग्स लागू हो रही हैं...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  <span>सेव करें व डैशबोर्ड लॉन्च करें</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
