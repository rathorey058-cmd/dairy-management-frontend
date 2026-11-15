import React, { useState, useRef, useEffect } from 'react';
import API from '../../api';
import { 
  UploadCloud, FileVideo, Mic, Sparkles, CheckCircle2, 
  AlertTriangle, Users, UserCheck, RotateCcw, 
  ShieldCheck, ArrowRight
} from 'lucide-react';
import { ShopAiReportDetailModal } from './ShopAiReportDetailModal';
import type { ShopAiReportItem } from './ShopAiReportDetailModal';

interface Props {
  onReportCreated?: () => void;
}

export const ShopAiVideoUpload: React.FC<Props> = ({ onReportCreated }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'video' | 'audio'>('video');
  const [reportTitle, setReportTitle] = useState('');
  
  // Custom context prompt default matches the user's specific scenario!
  const [contextPrompt, setContextPrompt] = useState(
    'देखो यह जो लड़का खड़ा है काउंटर पे अभी यह shop servant है इसका नाम आकाश है। पता करो कुल कितने कस्टमर आए, किसने क्या-क्या बोला और क्या सामान लिया, आकाश ने क्या किया, और कोई लापरवाही या चोरी तो नहीं हुई।'
  );

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedReport, setGeneratedReport] = useState<ShopAiReportItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active Timer for large video AI processing
  useEffect(() => {
    let timer: any = null;
    if (isAnalyzing) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isAnalyzing]);

  // Quick Context Presets
  const contextPresets = [
    {
      title: '🧑‍💼 नौकर (आकाश) व काउंटर निगरानी',
      prompt: 'देखो काउंटर पर जो लड़का खड़ा है वो दुकान का नौकर आकाश है। ध्यान से देखो उसने ग्राहकों से कैसे बात की, कितनी देर काउंटर अकेला छोड़ा, क्या कोई गल्ला लापरवाही हुई और उसकी पूरी एक्टिविटी रिपोर्ट दो।'
    },
    {
      title: '👥 ग्राहक गिनती व आवाज़ ट्रांसक्रिप्ट',
      prompt: 'इस वीडियो/ऑडियो में आए कुल ग्राहकों की गिनती करो। उन्होंने हिंदी में क्या-क्या बोला, क्या सामान (दूध, घी, पनीर) मांगा और किसने क्या भुगतान किया, इसका लिखित संवाद विवरण दो।'
    },
    {
      title: '💰 गल्ला सुरक्षा व संदिग्ध गतिविधि',
      prompt: 'दुकान के गल्ले (Cash Box) और काउंटर पर पूरा ध्यान दो। देखो पैसे सही से रखे गए या नहीं, कोई संदिग्ध हलचल या बिना बिलिंग के सामान तो नहीं दिया गया।'
    },
    {
      title: '🥛 दूध व किराना डिलीवरी ऑडिट',
      prompt: 'मिल्क कैन और किराना सामान के आने-जाने की जांच करो। क्या वजन सही नापा गया और क्या नौकर ने सभी ग्राहकों को समय पर सामान दिया।'
    }
  ];

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 45MB max for direct base64 transfer
    if (file.size > 45 * 1024 * 1024) {
      setErrorMsg('फ़ाइल का आकार 45MB से अधिक है। कृपया 45MB से छोटा वीडियो या ऑडियो क्लिप चुनें।');
      return;
    }

    setSelectedFile(file);
    setErrorMsg(null);
    setGeneratedReport(null);

    const isAudio = file.type.startsWith('audio/') || file.name.endsWith('.mp3') || file.name.endsWith('.wav');
    setMediaType(isAudio ? 'audio' : 'video');

    const previewUrl = URL.createObjectURL(file);
    setMediaPreviewUrl(previewUrl);

    if (!reportTitle) {
      setReportTitle(`CCTV क्लिप: ${file.name.substring(0, 24)}`);
    }
  };

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Run Analysis
  const handleStartAnalysis = async () => {
    if (!selectedFile && !contextPrompt.trim()) {
      setErrorMsg('कृपया कोई वीडियो/ऑडियो फ़ाइल चुनें या AI को निर्देश दें।');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);
    setGeneratedReport(null);
    setAnalysisStep(1);

    try {
      let base64Media = '';
      if (selectedFile) {
        setAnalysisStep(1); // Ingestion
        base64Media = await fileToBase64(selectedFile);
      }

      setAnalysisStep(2); // Multimodal Speech & Vision
      await new Promise((r) => setTimeout(r, 600));

      setAnalysisStep(3); // Gemini 1.5 Flash Multimodal Reasoning
      
      const payload = {
        mediaBase64: base64Media,
        mimeType: selectedFile?.type || (mediaType === 'audio' ? 'audio/webm' : 'video/mp4'),
        mediaType,
        userContextPrompt: contextPrompt,
        title: reportTitle || 'CCTV शॉप इंटेलिजेंस रिपोर्ट',
        cameraName: 'CCTV Footage Upload',
      };

      // 5-minute timeout for heavy video multimodal processing
      const res = await API.post('/cameras/shop-ai/upload-analyze', payload, {
        timeout: 300000
      });

      setAnalysisStep(4); // Finalizing
      await new Promise((r) => setTimeout(r, 400));

      if (res.data?.report) {
        setGeneratedReport(res.data.report);
        if (onReportCreated) onReportCreated();
      }
    } catch (err: any) {
      console.error('Video Analysis Error:', err);
      setErrorMsg(
        err.response?.data?.message || err.message || 'AI वीडियो विश्लेषण में त्रुटि आई। कृपया पुनः प्रयास करें।'
      );
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep(0);
    }
  };

  // Reset
  const handleReset = () => {
    setSelectedFile(null);
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaPreviewUrl(null);
    setGeneratedReport(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Description Box */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-indigo-950/40 via-dark-900 to-indigo-950/40 border border-indigo-900/40 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>CCTV / वीडियो अपलोड & AI शॉप मैनेजमेंट</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
              वीडियो अपलोड करें और AI से दुकान की पूरी कुंडली जानें
            </h2>
            <p className="text-xs md:text-sm text-dark-300 max-w-2xl">
              CCTV फुटेज या मोबाइल वीडियो डालें, AI को नौकर व दुकान का संदर्भ दें—AI ग्राहकों की गिनती करेगा, आवाज़ सुनकर बातचीत लिखेगा और लापरवाही बताएगा।
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3.5 py-2 rounded-2xl bg-dark-900/90 border border-dark-800 text-right">
              <p className="text-[10px] text-dark-400 font-bold uppercase">सपोर्टेड फॉर्मेट्स</p>
              <p className="text-xs font-mono font-bold text-indigo-400">MP4, WebM, MKV, MP3, WAV</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Upload & Context Config */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Media File Upload Zone (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-3xl bg-dark-900 border border-dark-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <FileVideo className="w-4 h-4 text-indigo-400" />
                <span>1. CCTV वीडियो या ऑडियो क्लिप चुनें</span>
              </h3>
              {selectedFile && (
                <button
                  onClick={handleReset}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-semibold"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>हटाएं</span>
                </button>
              )}
            </div>

            {/* Hidden Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/*,audio/*,.mp4,.webm,.mov,.mkv,.avi,.mp3,.wav"
              className="hidden"
            />

            {/* Drag & Drop Area */}
            {!selectedFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer border-2 border-dashed border-dark-700 hover:border-indigo-500/60 rounded-3xl p-8 text-center transition-all bg-dark-950/40 hover:bg-indigo-950/20 group"
              >
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <p className="text-sm font-bold text-white mb-1">
                  वीडियो फ़ाइल यहाँ ड्रैग करें या क्लिक करके चुनें
                </p>
                <p className="text-xs text-dark-400 max-w-xs mx-auto">
                  CCTV रिकॉर्डिंग, काउंटर की मोबाइल वीडियो या वॉयस रिकॉर्डिंग (अधिकतम 45MB)
                </p>
                <button
                  type="button"
                  className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30"
                >
                  फ़ाइल ब्राउज़ करें
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Media Preview */}
                <div className="relative rounded-2xl overflow-hidden bg-black border border-dark-800 aspect-video flex items-center justify-center">
                  {mediaType === 'video' && mediaPreviewUrl ? (
                    <video
                      src={mediaPreviewUrl}
                      controls
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="p-6 text-center space-y-2">
                      <div className="w-14 h-14 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center mx-auto">
                        <Mic className="w-7 h-7" />
                      </div>
                      <p className="text-xs text-white font-bold">{selectedFile.name}</p>
                      {mediaPreviewUrl && <audio src={mediaPreviewUrl} controls className="w-full mt-2" />}
                    </div>
                  )}
                </div>

                {/* File Info Card */}
                <div className="p-3 rounded-xl bg-dark-950 border border-dark-800 flex items-center justify-between text-xs">
                  <div className="truncate max-w-[200px]">
                    <p className="text-white font-bold truncate">{selectedFile.name}</p>
                    <p className="text-[10px] text-dark-400">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {mediaType.toUpperCase()}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                    तैयार
                  </span>
                </div>
              </div>
            )}

            {/* Title Input */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-dark-300">रिपोर्ट का नाम (वैकल्पिक):</label>
              <input
                type="text"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="उदा: 17 अक्टूबर शाम 5 बजे काउंटर व आकाश रिपोर्ट"
                className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white placeholder-dark-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Right Column: AI Context & Instructions (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-3xl bg-dark-900 border border-dark-800 shadow-xl space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>2. AI को वीडियो के बारे में बताएं (Context / निर्देश)</span>
                </h3>
                <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">
                  AI Context Awareness
                </span>
              </div>
              <p className="text-xs text-dark-400 mt-1">
                यहाँ बताएं कि काउंटर पर कौन खड़ा है, नौकर का नाम क्या है और AI को किन-किन बातों पर सबसे ज़्यादा नज़र रखनी है।
              </p>
            </div>

            {/* Quick Context Presets Chips */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-dark-400 font-bold uppercase">त्वरित सुझाव (1-Click Presets):</span>
              <div className="flex flex-wrap gap-1.5">
                {contextPresets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setContextPrompt(preset.prompt)}
                    className="text-left px-2.5 py-1.5 rounded-xl bg-dark-950 hover:bg-indigo-950/40 border border-dark-800 hover:border-indigo-500/40 text-xs text-dark-200 hover:text-white transition-all"
                  >
                    {preset.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Context Textarea */}
            <div className="space-y-1">
              <textarea
                rows={4}
                value={contextPrompt}
                onChange={(e) => setContextPrompt(e.target.value)}
                placeholder="उदा: देखो यह जो लड़का काउंटर पर खड़ा है यह नौकर आकाश है। कुल कितने कस्टमर आए, किसने क्या-क्या बोला, आकाश ने क्या किया और क्या गल्ले में पैसे सही रखे..."
                className="w-full p-3.5 rounded-2xl bg-dark-950 border border-dark-800 text-xs text-white placeholder-dark-500 focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
              />
            </div>

            {/* AI Capabilities Checklist */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div className="p-2 rounded-xl bg-dark-950/80 border border-dark-800/80 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-[11px] text-dark-300 font-medium">ग्राहक गिनती</span>
              </div>
              <div className="p-2 rounded-xl bg-dark-950/80 border border-dark-800/80 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-[11px] text-dark-300 font-medium">नौकर मुस्तैदी</span>
              </div>
              <div className="p-2 rounded-xl bg-dark-950/80 border border-dark-800/80 flex items-center gap-2">
                <Mic className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-[11px] text-dark-300 font-medium">हिंदी संवाद</span>
              </div>
              <div className="p-2 rounded-xl bg-dark-950/80 border border-dark-800/80 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-[11px] text-dark-300 font-medium">गल्ला सुरक्षा</span>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-shake">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleStartAnalysis}
                disabled={isAnalyzing}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-500 text-white font-extrabold text-sm transition-all shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>AI विश्लेषण जारी है ({elapsedSeconds}s)... कृपया प्रतीक्षा करें</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>AI से दुकान का विश्लेषण शुरू करें (Run Full AI Audit)</span>
                  </>
                )}
              </button>
            </div>

            {/* Active Analysis Progress Bar */}
            {isAnalyzing && (
              <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-900/40 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-indigo-300">
                    {analysisStep === 1 && `चरण 1/4: वीडियो व ऑडियो स्ट्रीम प्रोसेस हो रहा है... (${elapsedSeconds}s)`}
                    {analysisStep === 2 && `चरण 2/4: आवाज़ व हिंदी बातचीत पहचान जारी है... (${elapsedSeconds}s)`}
                    {analysisStep === 3 && `चरण 3/4: Google Gemini AI वीडियो, नौकर (आकाश) व ग्राहकों का विश्लेषण कर रहा है... (${elapsedSeconds}s)`}
                    {analysisStep === 4 && `चरण 4/4: लिखित रिपोर्ट व AI सलाह संकलित हो रही है... (${elapsedSeconds}s)`}
                  </span>
                  <span className="font-mono text-indigo-400 font-bold">{analysisStep * 25}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-dark-950 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500 rounded-full"
                    style={{ width: `${analysisStep * 25}%` }}
                  />
                </div>
                <p className="text-[11px] text-indigo-300/80 bg-indigo-900/30 px-3 py-1.5 rounded-xl border border-indigo-500/20">
                  ⏱️ <strong>नोट:</strong> बड़े वीडियो (10MB-45MB) की सभी फ्रेम व ऑडियो को बारीकी से समझने में 1-2 मिनट लग सकते हैं। कृपया ब्राउज़र टैब खुला रखें।
                </p>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Generated Report Showcase Card */}
      {generatedReport && (
        <div className="p-6 rounded-3xl bg-gradient-to-r from-dark-900 via-dark-900/95 to-indigo-950/50 border-2 border-indigo-500/40 shadow-2xl space-y-5 animate-slide-up">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-dark-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  विश्लेषण सफलतापूर्वक पूर्ण
                </span>
                <h3 className="text-lg font-black text-white">{generatedReport.title}</h3>
              </div>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
            >
              <span>पूरी रिपोर्ट व लिखित विवरण देखें</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Metrics from generated report */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-2xl bg-dark-950 border border-dark-800">
              <p className="text-[10px] text-dark-400 font-bold uppercase">पहचाने गए ग्राहक</p>
              <p className="text-xl font-black text-white mt-0.5">{generatedReport.customerCount.total} जन</p>
              <p className="text-[10px] text-dark-400 mt-0.5">
                पुरुष: {generatedReport.customerCount.men} | महिला: {generatedReport.customerCount.women}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-dark-950 border border-dark-800">
              <p className="text-[10px] text-dark-400 font-bold uppercase">स्टाफ (आकाश) परफॉर्मेंस</p>
              <p className="text-xl font-black text-emerald-400 mt-0.5">
                {generatedReport.staffPerformance.activeScore}%
              </p>
              <p className="text-[10px] text-emerald-400/80 mt-0.5">
                {generatedReport.staffPerformance.attendanceStatus}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-dark-950 border border-dark-800">
              <p className="text-[10px] text-dark-400 font-bold uppercase">आवाज़ व बातचीत</p>
              <p className="text-xl font-black text-blue-400 mt-0.5">
                {generatedReport.voiceAnalysis.transcripts?.length || 0} संवाद
              </p>
              <p className="text-[10px] text-dark-400 mt-0.5 truncate">
                {generatedReport.voiceAnalysis.languageDetected}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-dark-950 border border-dark-800">
              <p className="text-[10px] text-dark-400 font-bold uppercase">AI चेतावनियाँ / अलर्ट्स</p>
              <p className={`text-xl font-black mt-0.5 ${generatedReport.aiBrainInsights.concernsOrAlerts.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {generatedReport.aiBrainInsights.concernsOrAlerts.length}
              </p>
              <p className="text-[10px] text-dark-400 mt-0.5">
                {generatedReport.aiBrainInsights.concernsOrAlerts.length > 0 ? 'ध्यान देने योग्य बातें हैं' : 'सब सुरक्षित'}
              </p>
            </div>
          </div>

          {/* Quick Summary Quote */}
          <div className="p-4 rounded-2xl bg-dark-950/80 border border-dark-800">
            <p className="text-xs text-dark-400 font-bold uppercase mb-1">AI की त्वरित समरी:</p>
            <p className="text-sm text-dark-200 leading-relaxed font-medium">
              {generatedReport.rawSummary}
            </p>
          </div>
        </div>
      )}

      {/* Full Report Modal */}
      {isModalOpen && generatedReport && (
        <ShopAiReportDetailModal
          report={generatedReport}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
};
