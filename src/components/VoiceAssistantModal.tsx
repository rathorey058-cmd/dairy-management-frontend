import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import {
  Mic,
  MicOff,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  RotateCcw,
  Volume2,
  VolumeX,
  Send,
  Edit3,
  Save,
  HelpCircle,
} from 'lucide-react';

interface VoiceActionResponse {
  actionType:
    | 'MILK_ENTRY'
    | 'PRODUCT_SALE'
    | 'FARMER_ADVANCE'
    | 'EXPENSE'
    | 'NAVIGATE'
    | 'REGISTER_FARMER'
    | 'CREATE_PRODUCT'
    | 'DIRECT_MILK_SALE'
    | 'FARMER_PAYMENT'
    | 'AI_QUERY'
    | 'UNKNOWN';
  previewTitle: string;
  previewDetails: Record<string, string>;
  data?: any;
  path?: string;
  audioResponse: string;
  transcript: string;
  isAIPowered?: boolean;
}

const QUICK_COMMAND_SAMPLES = [
  { label: '🧭 गल्ला स्क्रीन', text: 'गला दिखाओ' },
  { label: '👨‍🌾 नया किसान जोड़ना', text: 'नया किसान जोड़ो रमेश, मोबाइल 9876543210, गांव रामपुर' },
  { label: '🥛 दूध एंट्री (FAT)', text: 'Farmer 1 का 10 लीटर दूध 5.2 FAT' },
  { label: '🛍️ सामान बिक्री', text: '2 किलो पनीर और 1 किलो देसी घी सेल करो' },
  { label: '🥛 सीधी दूध बिक्री', text: 'सुपर दूध 10 लीटर 68 के भाव से सेल किया' },
  { label: '💰 किसान एडवांस', text: 'Farmer 1 को 500 रुपये एडवांस दिया' },
  { label: '💵 किसान भुगतान', text: 'Farmer 1 को 2000 रुपये पेमेंट किया' },
  { label: '⛽ दुकान ख़र्च', text: 'डीजल 300 रुपये ख़र्च लिखो' },
];

export const VoiceAssistantModal: React.FC = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [manualText, setManualText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedAction, setParsedAction] = useState<VoiceActionResponse | null>(null);
  const [editedData, setEditedData] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [executionResult, setExecutionResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Speech Recognition Reference
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const [isTTSActive, setIsTTSActive] = useState(true);

  // Speak audio feedback using browser SpeechSynthesis
  const speakText = useCallback(
    (text: string) => {
      if (!isTTSActive || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'hi-IN';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn('TTS not available:', e);
      }
    },
    [isTTSActive]
  );

  // Parse spoken transcript with Backend AI
  const handleProcessTranscript = useCallback(
    async (spokenText: string) => {
      const textToProcess = spokenText.trim();
      if (!textToProcess) return;
      setIsProcessing(true);
      setErrorMessage(null);
      setIsEditing(false);

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e){}
      }
      setIsListening(false);

      try {
        const res = await API.post('/voice/parse-command', { transcript: textToProcess });
        const action: VoiceActionResponse = res.data;
        setParsedAction(action);
        setEditedData(JSON.parse(JSON.stringify(action.data || {})));

        // Handle Direct Navigation
        if (action.actionType === 'NAVIGATE' && action.path) {
          let targetPath = action.path;
          if (targetPath.startsWith('/milk-collection')) {
            targetPath = targetPath.replace('/milk-collection', '/milk');
          } else if (targetPath.startsWith('/close-day')) {
            targetPath = targetPath.replace('/close-day', '/closeday');
          }

          speakText(action.audioResponse);
          setTimeout(() => {
            navigate(targetPath);
            setIsOpen(false);
            setParsedAction(null);
            setEditedData(null);
            setIsEditing(false);
            setTranscript('');
            setManualText('');
          }, 800);
          return;
        }

        speakText(action.audioResponse);
      } catch (err: any) {
        setErrorMessage(err.response?.data?.message || 'आवाज़ को प्रोसेस करने में त्रुटि हुई। कृपया दोबारा बोलें।');
      } finally {
        setIsProcessing(false);
      }
    },
    [navigate, speakText]
  );

  // Initialize SpeechRecognition with continuous=true (no auto cutoff on pauses)
  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage('आपके ब्राउज़र में Speech Recognition उपलब्ध नहीं है। कृपया Chrome का उपयोग करें।');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'hi-IN';

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
      setInterimText('');
      setErrorMessage(null);
      setParsedAction(null);
      setEditedData(null);
      setIsEditing(false);
      setExecutionResult(null);
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (interim) setInterimText(interim);
      if (final) {
        setTranscript((prev) => (prev ? `${prev} ${final}` : final).trim());
        setInterimText('');
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'no-speech') {
        setErrorMessage('कोई आवाज़ नहीं सुनाई दी। कृपया दोबारा माइक दबाकर बोलें।');
      } else if (event.error === 'not-allowed') {
        setErrorMessage('कृपया माइक्रोफ़ोन (Mic) की अनुमति (Permission) दें।');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return recognition;
  }, []);

  // Execute Action explicitly on User Save Click
  const handleExecuteAction = useCallback(async () => {
    if (!parsedAction || parsedAction.actionType === 'UNKNOWN') return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const payloadData = editedData || parsedAction.data;
      const res = await API.post('/voice/execute-command', {
        actionType: parsedAction.actionType,
        data: payloadData,
      });

      setExecutionResult(res.data);
      if (res.data.audioFeedback) {
        speakText(res.data.audioFeedback);
      }

      // Close modal after 2.5s on success
      setTimeout(() => {
        setIsOpen(false);
        setParsedAction(null);
        setEditedData(null);
        setIsEditing(false);
        setExecutionResult(null);
        setTranscript('');
        setManualText('');
      }, 2500);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'कमांड दर्ज करने में त्रुटि हुई।');
    } finally {
      setIsProcessing(false);
    }
  }, [parsedAction, editedData, speakText]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      recognitionRef.current = initSpeechRecognition();
    }

    if (isListening) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.stop();
      setIsListening(false);
      const text = `${transcript} ${interimText}`.trim();
      if (text) {
        handleProcessTranscript(text);
      }
    } else {
      setIsOpen(true);
      setParsedAction(null);
      setEditedData(null);
      setIsEditing(false);
      setExecutionResult(null);
      setTranscript('');
      setInterimText('');
      setErrorMessage(null);
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.warn('Recognition start retry:', e);
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    setTranscript(manualText.trim());
    handleProcessTranscript(manualText.trim());
  };

  // Helper for updating editable fields
  const handleDataChange = (field: string, value: any) => {
    setEditedData((prev: any) => {
      const updated = { ...prev, [field]: value };

      // Live recalculate for Milk Entry
      if (parsedAction?.actionType === 'MILK_ENTRY') {
        const qty = parseFloat(field === 'quantity' ? value : updated.quantity) || 0;
        const rt = parseFloat(field === 'rate' ? value : updated.rate) || 0;
        updated.totalAmount = Math.round(qty * rt * 100) / 100;
      }
      // Live recalculate for Direct Milk Sale
      if (parsedAction?.actionType === 'DIRECT_MILK_SALE') {
        const qty = parseFloat(field === 'totalQuantity' ? value : updated.totalQuantity) || 0;
        const rt = parseFloat(field === 'rate' ? value : updated.rate) || 0;
        updated.totalAmount = Math.round(qty * rt * 100) / 100;
      }

      return updated;
    });
  };

  return (
    <>
      {/* 1. Global Floating Mic Button (Pulsing Glow) */}
      <div className="fixed bottom-20 left-4 z-40 flex items-center gap-2">
        <button
          onClick={toggleListening}
          className={`p-3.5 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center border ${
            isListening
              ? 'bg-red-600 text-white border-red-400 animate-pulse ring-4 ring-red-500/40'
              : 'bg-gradient-to-tr from-teal-600 via-emerald-500 to-teal-400 text-dark-950 font-black border-teal-300 shadow-teal-500/30 hover:scale-105'
          }`}
          title="बोलकर एंट्री या किसान रजिस्टर करें (Voice Command)"
        >
          {isListening ? (
            <MicOff className="w-5 h-5 text-white" />
          ) : (
            <Mic className="w-5 h-5 text-dark-950 stroke-[2.5]" />
          )}
        </button>

        {isListening && (
          <div className="px-3 py-1.5 rounded-full bg-dark-900/90 border border-red-500/60 text-[11px] font-extrabold text-red-400 backdrop-blur-md shadow-lg animate-bounce flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span>सुन रहे हैं... बोलिए!</span>
          </div>
        )}
      </div>

      {/* 2. Smart Confirmation Pop-up / HUD Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="bg-dark-900 border border-dark-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-dark-800 flex justify-between items-center bg-gradient-to-r from-teal-950/50 via-dark-900 to-dark-900 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                    Smart Voice Assistant
                  </h3>
                  <p className="text-[10px] text-dark-400 font-medium">
                    बोलकर दूध एंट्री, नया किसान, बिक्री या हिसाब दर्ज करें
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsTTSActive(!isTTSActive)}
                  className="p-1.5 rounded-xl bg-dark-800 text-dark-400 hover:text-white border border-dark-700"
                  title={isTTSActive ? 'Audio Feedback On' : 'Audio Feedback Off'}
                >
                  {isTTSActive ? <Volume2 className="w-4 h-4 text-teal-400" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    if (isListening) recognitionRef.current?.stop();
                  }}
                  className="p-1.5 rounded-xl bg-dark-800 text-dark-400 hover:text-white border border-dark-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 space-y-3.5 pt-0 overflow-y-auto flex-1">
              {/* Listening Visualizer */}
              {isListening && (
                <div className="py-5 flex flex-col items-center justify-center space-y-3 bg-dark-950 rounded-2xl border border-teal-900/40 p-4">
                  <div className="w-14 h-14 rounded-full bg-teal-500/10 border-2 border-teal-500/40 flex items-center justify-center text-teal-400 animate-pulse ring-8 ring-teal-500/10">
                    <Mic className="w-7 h-7" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-white">सुन रहे हैं... आप आराम से बोलिए</p>
                    <p className="text-[10px] text-teal-400 mt-0.5">
                      उदा. "उमराव सिंह जी का 50L दूध 5.4 फैट" या "गला दिखाओ"
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleListening}
                    className="mt-2 px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-red-600/30 active:scale-95 transition-all"
                  >
                    <MicOff className="w-4 h-4" />
                    <span>बोलना समाप्त हुआ • प्रोसेस करें (Send Command)</span>
                  </button>
                </div>
              )}

              {/* Spoken Text Box */}
              {(transcript || interimText) && (
                <div className="p-3 rounded-2xl bg-dark-950 border border-dark-800 text-xs space-y-2">
                  <span className="text-[10px] font-bold text-dark-400 uppercase tracking-wider block">
                    आपने बोला (Live Transcript):
                  </span>
                  <p className="text-white font-medium italic">
                    "{transcript || interimText}"
                  </p>
                  {isListening && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={toggleListening}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-[11px] flex items-center gap-1.5 active:scale-95"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>भेजें</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Text Input Fallback */}
              {!isListening && !parsedAction && (
                <form onSubmit={handleManualSubmit} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="बोलें या यहाँ कमांड टाइप करें..."
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-teal-500"
                  />
                  <button
                    type="submit"
                    disabled={!manualText.trim()}
                    className="px-3 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Go</span>
                  </button>
                </form>
              )}

              {/* Quick Sample Commands Chips */}
              {!parsedAction && !executionResult && !isListening && (
                <div>
                  <span className="text-[10px] font-bold text-dark-400 uppercase tracking-wider block mb-1.5">
                    सपोर्टेड कमांड्स (क्लिक करके टेस्ट करें):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {QUICK_COMMAND_SAMPLES.map((sample, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setTranscript(sample.text);
                          handleProcessTranscript(sample.text);
                        }}
                        className="p-2 rounded-xl bg-dark-950 border border-dark-800 hover:border-teal-500/50 text-left text-[11px] transition-all flex flex-col group"
                      >
                        <span className="font-bold text-teal-400">{sample.label}</span>
                        <span className="text-dark-400 group-hover:text-dark-200 text-[10px] truncate mt-0.5">
                          "{sample.text}"
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3 rounded-2xl bg-red-950/40 border border-red-900/50 flex gap-2 text-xs text-red-400 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Loading Indicator */}
              {isProcessing && (
                <div className="py-4 flex items-center justify-center gap-2 text-xs font-bold text-teal-400">
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>कमांड प्रोसेस हो रही है...</span>
                </div>
              )}

              {/* Success Result */}
              {executionResult && (
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <h4 className="text-sm font-black text-white">{executionResult.message}</h4>
                  <p className="text-xs text-emerald-300">{executionResult.audioFeedback}</p>
                </div>
              )}

              {/* UNKNOWN COMMAND CARD */}
              {parsedAction && parsedAction.actionType === 'UNKNOWN' && (
                <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-800/50 text-center space-y-2.5">
                  <HelpCircle className="w-7 h-7 text-amber-400 mx-auto" />
                  <h4 className="text-xs font-black text-white">{parsedAction.previewTitle}</h4>
                  <p className="text-[11px] text-amber-200/90">{parsedAction.audioResponse}</p>
                  <button
                    type="button"
                    onClick={toggleListening}
                    className="mt-2 px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold hover:bg-amber-500/30 flex items-center gap-1.5 mx-auto"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>दोबारा बोलें</span>
                  </button>
                </div>
              )}

              {/* Smart Parsed Action Confirmation & Editable Card */}
              {parsedAction && parsedAction.actionType !== 'UNKNOWN' && !executionResult && editedData && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-teal-950/60 to-dark-950 border border-teal-500/40 space-y-3 shadow-lg">
                    {/* Card Title & Edit Toggle */}
                    <div className="flex justify-between items-center border-b border-teal-900/60 pb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                        <span className="text-xs font-black text-teal-300">{parsedAction.previewTitle}</span>
                        {parsedAction.isAIPowered && (
                          <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-500/20 to-teal-500/20 text-teal-300 border border-teal-500/40 text-[9px] font-extrabold flex items-center gap-1 shadow-sm">
                            <Sparkles className="w-2.5 h-2.5 text-amber-300 animate-pulse" />
                            <span>AI Powered</span>
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsEditing(!isEditing)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1 shrink-0 ${
                          isEditing
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-dark-800 text-teal-400 border-dark-700 hover:bg-dark-750'
                        }`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{isEditing ? 'प्रिव्यू देखें (Done)' : 'बदलाव करें (Edit)'}</span>
                      </button>
                    </div>

                    {/* VIEW MODE: Clean Summary Badges */}
                    {!isEditing && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {parsedAction.actionType === 'MILK_ENTRY' && (
                          <>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">किसान (Farmer)</span>
                              <span className="text-xs text-white font-extrabold">{editedData.farmerName || parsedAction.previewDetails['Farmer (किसान)']}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">मात्रा (Quantity)</span>
                              <span className="text-xs text-white font-extrabold">{editedData.quantity} Litres</span>
                            </div>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">फैट / SNF</span>
                              <span className="text-xs text-teal-300 font-extrabold">{editedData.fat}% FAT | {editedData.snf}% SNF</span>
                            </div>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">शिफ्ट / प्रकार</span>
                              <span className="text-xs text-white font-extrabold">{editedData.shift} | {editedData.milkType}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">भाव (Rate)</span>
                              <span className="text-xs text-amber-300 font-extrabold">₹{Number(editedData.rate).toFixed(2)}/L</span>
                            </div>
                            <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-800/60">
                              <span className="text-[10px] text-emerald-400 font-bold block">कुल रकम (Total)</span>
                              <span className="text-xs text-emerald-300 font-black">₹{Number(editedData.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </>
                        )}

                        {parsedAction.actionType === 'REGISTER_FARMER' && (
                          <>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">किसान का नाम</span>
                              <span className="text-xs text-white font-extrabold">{editedData.name}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">किसान कोड (ID)</span>
                              <span className="text-xs text-teal-300 font-extrabold">{editedData.farmerId}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">मोबाइल नंबर</span>
                              <span className="text-xs text-white font-extrabold">{editedData.mobile}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">गांव (Village)</span>
                              <span className="text-xs text-white font-extrabold">{editedData.village}</span>
                            </div>
                          </>
                        )}

                        {parsedAction.actionType === 'CREATE_PRODUCT' && (
                          <>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">सामान का नाम</span>
                              <span className="text-xs text-white font-extrabold">{editedData.name}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">श्रेणी (Category)</span>
                              <span className="text-xs text-white font-extrabold">{editedData.category}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-800/60">
                              <span className="text-[10px] text-emerald-400 font-bold block">सेलिंग रेट (Price)</span>
                              <span className="text-xs text-emerald-300 font-black">₹{editedData.sellingPrice} / {editedData.unit}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">इकाई (Unit)</span>
                              <span className="text-xs text-white font-extrabold">{editedData.unit}</span>
                            </div>
                          </>
                        )}

                        {parsedAction.actionType === 'DIRECT_MILK_SALE' && (
                          <>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">दूध बिक्री मात्रा</span>
                              <span className="text-xs text-white font-extrabold">{editedData.totalQuantity} Litres</span>
                            </div>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">भाव (Rate)</span>
                              <span className="text-xs text-amber-300 font-extrabold">₹{editedData.rate || 60}/L</span>
                            </div>
                            <div className="col-span-2 p-2 rounded-xl bg-emerald-950/40 border border-emerald-800/60">
                              <span className="text-[10px] text-emerald-400 font-bold block">गल्ले में जमा रकम (Total Cash)</span>
                              <span className="text-xs text-emerald-300 font-black">₹{Number(editedData.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </>
                        )}

                        {['FARMER_PAYMENT', 'FARMER_ADVANCE', 'EXPENSE'].includes(parsedAction.actionType) && (
                          <>
                            <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">विवरण / नाम</span>
                              <span className="text-xs text-white font-extrabold">{editedData.farmerName || editedData.category || editedData.notes || 'विवरण'}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-800/60">
                              <span className="text-[10px] text-emerald-400 font-bold block">राशि (Amount)</span>
                              <span className="text-xs text-emerald-300 font-black">₹{editedData.amount}</span>
                            </div>
                          </>
                        )}

                        {parsedAction.actionType === 'PRODUCT_SALE' &&
                          Object.entries(parsedAction.previewDetails).map(([key, val]) => (
                            <div key={key} className="p-2 rounded-xl bg-dark-900/70 border border-dark-800">
                              <span className="text-[10px] text-dark-400 font-bold block">{key}</span>
                              <span className="text-xs text-white font-extrabold">{val}</span>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* EDIT MODE: Interactive Inputs */}
                    {isEditing && (
                      <div className="space-y-2.5 pt-1">
                        {parsedAction.actionType === 'MILK_ENTRY' && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">मात्रा (Litre)</label>
                              <input
                                type="number"
                                step="0.1"
                                value={editedData.quantity ?? ''}
                                onChange={(e) => handleDataChange('quantity', parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-white text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">फैट (FAT %)</label>
                              <input
                                type="number"
                                step="0.1"
                                value={editedData.fat ?? ''}
                                onChange={(e) => handleDataChange('fat', parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-teal-300 text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">SNF (%)</label>
                              <input
                                type="number"
                                step="0.1"
                                value={editedData.snf ?? ''}
                                onChange={(e) => handleDataChange('snf', parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-white text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">भाव (Rate/L)</label>
                              <input
                                type="number"
                                step="0.5"
                                value={editedData.rate ?? ''}
                                onChange={(e) => handleDataChange('rate', parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-amber-300 text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">शिफ्ट (Shift)</label>
                              <select
                                value={editedData.shift || 'Morning'}
                                onChange={(e) => handleDataChange('shift', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-white text-xs font-bold focus:border-teal-500"
                              >
                                <option value="Morning">Morning (सुबह)</option>
                                <option value="Evening">Evening (शाम)</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">प्रकार (Milk Type)</label>
                              <select
                                value={editedData.milkType || 'Buffalo'}
                                onChange={(e) => handleDataChange('milkType', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-white text-xs font-bold focus:border-teal-500"
                              >
                                <option value="Buffalo">Buffalo (भैंस)</option>
                                <option value="Cow">Cow (गाय)</option>
                                <option value="Mixed">Mixed (मिक्स)</option>
                              </select>
                            </div>
                            <div className="col-span-2">
                              <label className="text-[10px] font-bold text-emerald-400 block mb-1">कुल रकम (Total Amount ₹)</label>
                              <input
                                type="number"
                                step="1"
                                value={editedData.totalAmount ?? ''}
                                onChange={(e) => handleDataChange('totalAmount', parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs font-black focus:border-emerald-500"
                              />
                            </div>
                          </div>
                        )}

                        {parsedAction.actionType === 'REGISTER_FARMER' && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="col-span-2">
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">किसान का नाम (Name)</label>
                              <input
                                type="text"
                                value={editedData.name ?? ''}
                                onChange={(e) => handleDataChange('name', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-white text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">किसान कोड (ID)</label>
                              <input
                                type="text"
                                value={editedData.farmerId ?? ''}
                                onChange={(e) => handleDataChange('farmerId', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-teal-300 text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">मोबाइल नंबर</label>
                              <input
                                type="text"
                                value={editedData.mobile ?? ''}
                                onChange={(e) => handleDataChange('mobile', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-white text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">गांव (Village)</label>
                              <input
                                type="text"
                                value={editedData.village ?? ''}
                                onChange={(e) => handleDataChange('village', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-white text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                          </div>
                        )}

                        {parsedAction.actionType === 'CREATE_PRODUCT' && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="col-span-2">
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">सामान का नाम</label>
                              <input
                                type="text"
                                value={editedData.name ?? ''}
                                onChange={(e) => handleDataChange('name', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-white text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">सेलिंग रेट (₹)</label>
                              <input
                                type="number"
                                value={editedData.sellingPrice ?? ''}
                                onChange={(e) => handleDataChange('sellingPrice', parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-emerald-400 text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">इकाई (Unit)</label>
                              <input
                                type="text"
                                value={editedData.unit ?? ''}
                                onChange={(e) => handleDataChange('unit', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-white text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                          </div>
                        )}

                        {parsedAction.actionType === 'DIRECT_MILK_SALE' && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">मात्रा (Litre)</label>
                              <input
                                type="number"
                                step="0.5"
                                value={editedData.totalQuantity ?? ''}
                                onChange={(e) => handleDataChange('totalQuantity', parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-white text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">भाव (Rate/L)</label>
                              <input
                                type="number"
                                step="1"
                                value={editedData.rate ?? 60}
                                onChange={(e) => handleDataChange('rate', parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-amber-300 text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="text-[10px] font-bold text-emerald-400 block mb-1">कुल राशि (Total Amount ₹)</label>
                              <input
                                type="number"
                                value={editedData.totalAmount ?? ''}
                                onChange={(e) => handleDataChange('totalAmount', parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs font-black focus:border-emerald-500"
                              />
                            </div>
                          </div>
                        )}

                        {['FARMER_PAYMENT', 'FARMER_ADVANCE', 'EXPENSE'].includes(parsedAction.actionType) && (
                          <div className="space-y-2 text-xs">
                            <div>
                              <label className="text-[10px] font-bold text-dark-400 block mb-1">विवरण / नोट</label>
                              <input
                                type="text"
                                value={editedData.notes || editedData.category || ''}
                                onChange={(e) => handleDataChange('notes', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-white text-xs font-bold focus:border-teal-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-emerald-400 block mb-1">राशि (Amount ₹)</label>
                              <input
                                type="number"
                                value={editedData.amount ?? ''}
                                onChange={(e) => handleDataChange('amount', parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-dark-900 border border-dark-700 text-emerald-300 text-xs font-black focus:border-emerald-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons: 100% In User Control */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleExecuteAction}
                      disabled={isProcessing}
                      className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-500 text-white font-black text-xs shadow-lg shadow-teal-600/25 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-4 h-4" />
                      <span>सुरक्षित करें (Save Entry)</span>
                    </button>

                    <button
                      type="button"
                      onClick={toggleListening}
                      className="p-3 rounded-2xl bg-dark-800 border border-dark-700 text-xs font-bold text-dark-300 hover:text-white flex items-center gap-1"
                      title="Try Speaking Again"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span className="hidden sm:inline">दोबारा बोलें</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setParsedAction(null);
                        setEditedData(null);
                        setIsEditing(false);
                      }}
                      className="p-3 rounded-2xl bg-dark-800 border border-dark-700 text-xs font-bold text-red-400 hover:text-red-300"
                      title="Cancel / Reset"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
