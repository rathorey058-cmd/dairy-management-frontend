import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import {
  Sparkles,
  Mic,
  MicOff,
  Send,
  X,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Save,
  Trash2,
  User,
  Loader2,
  Minimize2,
  Maximize2,
  Flame,
  Radio,
  MessageCircle,
  Smartphone,
  Check,
  Navigation,
  Plus,
  History,
  Clock,
  ChevronRight
} from 'lucide-react';

interface VoiceActionResponse {
  actionType:
    | 'MILK_ENTRY'
    | 'DELETE_MILK_ENTRY'
    | 'PRODUCT_SALE'
    | 'FARMER_ADVANCE'
    | 'EXPENSE'
    | 'NAVIGATE'
    | 'REGISTER_FARMER'
    | 'CREATE_PRODUCT'
    | 'DIRECT_MILK_SALE'
    | 'FARMER_PAYMENT'
    | 'MILK_BANDHI_UPDATE'
    | 'COLLECT_DUE_PAYMENT'
    | 'DUE_PAYMENTS_QUERY'
    | 'REGISTER_BANDHI'
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

interface ChatMessage {
  id: string;
  sender: 'user' | 'gemini';
  text: string;
  timestamp: string | Date;
  isVoice?: boolean;
  action?: VoiceActionResponse;
  executionState?: 'pending' | 'executing' | 'success' | 'error';
  executionResult?: any;
  errorMessage?: string;
  editedData?: any;
  isEditing?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

const STORAGE_KEY = 'dairy_gemini_sessions_v2';

const GEMINI_PROMPT_SUGGESTIONS = [
  { label: '🚚 बांधी 1, 2, 6, 7 नागा बाकी सबकी गयी', text: 'बांधी नंबर 1, 2, 6 और 7 की दूध की बांधी आज नहीं गयी बाकी सब की गयी है' },
  { label: '💰 रमेश जी से 1000 उधारी जमा', text: 'रमेश जी से 1000 रुपये उधारी जमा करो' },
  { label: '📋 किस-किस की उधारी बाकी है?', text: 'किस किस की उधारी बाकी है मुझे बताओ' },
  { label: '📊 आज का कुल दूध बताओ', text: 'आज टोटल कितना दूध आया बताओ मुझे' },
  { label: '💰 कल का गल्ला हिसाब', text: 'कल का गल्ला बताओ क्या हिसाब बैठा' },
  { label: '🥛 50L दूध 5.4 फैट', text: 'Umrao Singh ji ka 50 litre doodh 5.4 fat' },
  { label: '🗑️ उमराव सिंह एंट्री डिलीट', text: 'Umrao Singh ji ki entry delete kar do jo unka doodh aaya tha aaj' },
  { label: '👨‍🌾 नया किसान जोड़ो', text: 'नया किसान जोड़ो उमराव सिंह, मोबाइल 9876543210, गांव रामपुर' },
  { label: '🧀 2 किलो पनीर सेल', text: '2 किलो पनीर 400 के भाव से सेल किया' },
  { label: '💰 किसान 1 को 500 एडवांस', text: 'Farmer 1 को 500 रुपये एडवांस दिया' },
  { label: '🥛 10L सुपर दूध सेल', text: 'सुपर दूध 10 लीटर 65 के भाव से सेल किया' },
  { label: '⛽ 250 रु डीजल खर्च', text: 'डीजल 250 रुपये खर्च लिखो' },
  { label: '🧭 गल्ला स्क्रीन खोलो', text: 'गला दिखाओ' },
];

const EXECUTABLE_ACTION_TYPES = [
  'MILK_ENTRY',
  'DELETE_MILK_ENTRY',
  'PRODUCT_SALE',
  'DIRECT_MILK_SALE',
  'FARMER_ADVANCE',
  'FARMER_PAYMENT',
  'EXPENSE',
  'REGISTER_FARMER',
  'MILK_BANDHI_UPDATE',
  'COLLECT_DUE_PAYMENT',
];

const createDefaultSession = (): ChatSession => ({
  id: `session_${Date.now()}`,
  title: 'नई बातचीत (New Chat)',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: [
    {
      id: 'welcome-msg',
      sender: 'gemini',
      text: 'नमस्ते! मैं आपका Google Gemini AI डेयरी सहायक हूँ।\nआप बोलकर या लिखकर दूध एंट्री, एंट्री डिलीट, बिक्री, गल्ला हिसाब, नया किसान या कोई भी सवाल पूछ सकते हैं।',
      timestamp: new Date(),
    },
  ],
});

export const GeminiChatBoard: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'assistant' | 'whatsapp'>('assistant');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Multi-Session State loaded from LocalStorage
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [createDefaultSession()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return sessions[0]?.id || `session_${Date.now()}`;
  });

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || createDefaultSession();
  const messages = activeSession.messages;

  // Persist sessions to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.warn('Failed to save chat sessions to localStorage', e);
    }
  }, [sessions]);

  const [inputQuery, setInputQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTTSActive, setIsTTSActive] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  // WhatsApp Simulator State
  const [whatsappMsg, setWhatsappMsg] = useState('Need 2 kg Paneer and 10 ltr Milk');
  const [senderMobile, setSenderMobile] = useState('9988776655');
  const [simResult, setSimResult] = useState<any | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [whatsappSuccess, setWhatsappSuccess] = useState<string | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);

  // References
  const recognitionRef = useRef<any>(null);
  const isHoldModeRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom smoothly
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen && activeTab === 'assistant' && !isHistoryOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, activeTab, isHistoryOpen]);

  // Audio TTS helper
  const speakAudio = useCallback(
    (text: string) => {
      if (!isTTSActive || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'hi-IN';
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('TTS playback error:', err);
      }
    },
    [isTTSActive]
  );

  // Helper to update current session messages
  const updateCurrentSessionMessages = useCallback((updater: (prevMsgs: ChatMessage[]) => ChatMessage[], sessionTitle?: string) => {
    setSessions((prevSessions) =>
      prevSessions.map((session) => {
        if (session.id === activeSessionId) {
          const newMessages = updater(session.messages);
          return {
            ...session,
            title: sessionTitle || session.title,
            updatedAt: Date.now(),
            messages: newMessages,
          };
        }
        return session;
      })
    );
  }, [activeSessionId]);

  // Create New Chat Session
  const handleCreateNewChat = () => {
    const newSession = createDefaultSession();
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setIsHistoryOpen(false);
    setInputQuery('');
    setInterimTranscript('');
  };

  // Switch Chat Session
  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setIsHistoryOpen(false);
  };

  // Delete Chat Session
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessionId);
      if (filtered.length === 0) {
        const fresh = createDefaultSession();
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSessionId === sessionId) {
        setActiveSessionId(filtered[0].id);
      }
      return filtered;
    });
  };

  // Clear All Chat History
  const handleClearAllHistory = () => {
    if (window.confirm('क्या आप सभी पुरानी चैट डिलीट करना चाहते हैं?')) {
      const fresh = createDefaultSession();
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
      setIsHistoryOpen(false);
    }
  };

  // Send query or transcript to backend Gemini processor
  const handleSendPrompt = useCallback(
    async (textToSend: string, wasVoice: boolean = false) => {
      const query = textToSend.trim();
      if (!query || isProcessing) return;

      // Stop speech recognition if still active
      if (recognitionRef.current && isListening) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
        setIsListening(false);
      }

      const userMsgId = `user-${Date.now()}`;
      const newMsg: ChatMessage = {
        id: userMsgId,
        sender: 'user',
        text: query,
        timestamp: new Date(),
        isVoice: wasVoice,
      };

      // Auto-derive title for new sessions from first user prompt
      const isFirstUserMsg = messages.filter((m) => m.sender === 'user').length === 0;
      const sessionTitle = isFirstUserMsg ? (query.length > 28 ? query.substring(0, 28) + '...' : query) : undefined;

      updateCurrentSessionMessages((prev) => [...prev, newMsg], sessionTitle);
      setInputQuery('');
      setInterimTranscript('');
      setIsProcessing(true);

      try {
        const res = await API.post('/voice/parse-command', { transcript: query });
        const action: VoiceActionResponse = res.data;

        // Path normalization
        let targetPath = action.path;
        if (targetPath) {
          if (targetPath.startsWith('/milk-collection')) {
            targetPath = targetPath.replace('/milk-collection', '/milk');
          } else if (targetPath.startsWith('/close-day')) {
            targetPath = targetPath.replace('/close-day', '/closeday');
          }
          action.path = targetPath;
        }

        // Handle direct navigation command (e.g. "गल्ला स्क्रीन खोलो", "दूध पेज दिखाओ")
        if (action.actionType === 'NAVIGATE' && targetPath) {
          const geminiMsg: ChatMessage = {
            id: `gemini-${Date.now()}`,
            sender: 'gemini',
            text: action.audioResponse || `स्क्रीन खोली जा रही है: ${targetPath}`,
            timestamp: new Date(),
            action,
          };
          updateCurrentSessionMessages((prev) => [...prev, geminiMsg]);
          speakAudio(geminiMsg.text);

          // Immediately navigate and close modal overlay so full page is visible
          navigate(targetPath);
          onClose();
          return;
        }

        const isExecutable = EXECUTABLE_ACTION_TYPES.includes(action.actionType);

        const geminiMsg: ChatMessage = {
          id: `gemini-${Date.now()}`,
          sender: 'gemini',
          text: action.audioResponse || 'कमांड प्रोसेस हो गई है।',
          timestamp: new Date(),
          action,
          executionState: isExecutable ? 'pending' : undefined,
          editedData: isExecutable && action.data ? JSON.parse(JSON.stringify(action.data)) : undefined,
          isEditing: false,
        };

        updateCurrentSessionMessages((prev) => [...prev, geminiMsg]);
        speakAudio(action.audioResponse);
      } catch (err: any) {
        const errorText =
          err.response?.data?.message || 'क्षमा करें, AI कमांड को समझ नहीं पाया। कृपया दोबारा प्रयास करें।';
        const errorMsg: ChatMessage = {
          id: `gemini-${Date.now()}`,
          sender: 'gemini',
          text: errorText,
          timestamp: new Date(),
          errorMessage: errorText,
        };
        updateCurrentSessionMessages((prev) => [...prev, errorMsg]);
        speakAudio(errorText);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, isListening, messages, updateCurrentSessionMessages, navigate, onClose, speakAudio]
  );

  // Initialize Speech Recognition with continuous=true (NO 1-SECOND CUTOFF)
  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('आपके ब्राउज़र में Speech Recognition उपलब्ध नहीं है। कृपया Google Chrome का उपयोग करें।');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true; // DO NOT AUTO STOP ON 1 SECOND SILENCE
    recognition.interimResults = true;
    recognition.lang = 'hi-IN';

    recognition.onstart = () => {
      setIsListening(true);
      setInterimTranscript('');
    };

    recognition.onresult = (event: any) => {
      let finalTexts: string[] = [];
      let currentInterim = '';

      for (let i = 0; i < event.results.length; i++) {
        const item = event.results[i];
        const text = (item[0]?.transcript || '').trim();
        if (!text) continue;

        if (item.isFinal) {
          if (finalTexts.length > 0) {
            const lastIndex = finalTexts.length - 1;
            const lastText = finalTexts[lastIndex];

            // If current text extends or contains last text (Android Chrome cumulative results), replace it
            if (
              text.toLowerCase().startsWith(lastText.toLowerCase()) ||
              (text.length > lastText.length && text.toLowerCase().includes(lastText.toLowerCase()))
            ) {
              finalTexts[lastIndex] = text;
            } else if (!lastText.toLowerCase().includes(text.toLowerCase())) {
              finalTexts.push(text);
            }
          } else {
            finalTexts.push(text);
          }
        } else {
          currentInterim = text;
        }
      }

      const cleanFinal = finalTexts.join(' ').trim();
      if (currentInterim && cleanFinal.toLowerCase().includes(currentInterim.toLowerCase())) {
        currentInterim = '';
      }

      setInputQuery(cleanFinal);
      setInterimTranscript(currentInterim);
    };

    recognition.onerror = (event: any) => {
      console.warn('SpeechRecognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return recognition;
  }, []);

  // Toggle listening via click
  const handleToggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);

      const combinedText = inputQuery.trim() || interimTranscript.trim();
      if (combinedText) {
        handleSendPrompt(combinedText, true);
      }
    } else {
      if (!recognitionRef.current) {
        recognitionRef.current = initSpeechRecognition();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.warn('Recognition start retry:', e);
        }
      }
    }
  };

  // Hold to talk support
  const handlePointerDownMic = () => {
    isHoldModeRef.current = true;
    if (!isListening) {
      if (!recognitionRef.current) {
        recognitionRef.current = initSpeechRecognition();
      }
      try {
        recognitionRef.current?.start();
      } catch (e) {}
    }
  };

  const handlePointerUpMic = () => {
    if (isHoldModeRef.current && isListening) {
      isHoldModeRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);

      setTimeout(() => {
        const combinedText = inputQuery.trim() || interimTranscript.trim();
        if (combinedText) {
          handleSendPrompt(combinedText, true);
        }
      }, 200);
    }
  };

  // Execute Action via /voice/execute-command
  const handleExecuteAction = async (messageId: string) => {
    const targetMsg = messages.find((m) => m.id === messageId);
    if (!targetMsg || !targetMsg.action) return;

    updateCurrentSessionMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, executionState: 'executing' } : m))
    );

    try {
      const payloadData = targetMsg.editedData || targetMsg.action.data;
      const res = await API.post('/voice/execute-command', {
        actionType: targetMsg.action.actionType,
        data: payloadData,
      });

      const audioFeedback =
        res.data.audioFeedback || `${targetMsg.action.previewTitle} सफलतापूर्वक दर्ज हो गया है।`;

      updateCurrentSessionMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                executionState: 'success',
                executionResult: res.data,
                text: `✅ ${audioFeedback}`,
              }
            : m
        )
      );

      speakAudio(audioFeedback);
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'डेटा सेव करने में त्रुटि हुई। कृपया पुनः प्रयास करें।';
      updateCurrentSessionMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                executionState: 'error',
                errorMessage: errMsg,
              }
            : m
        )
      );
      speakAudio(errMsg);
    }
  };

  // Inline editing helper
  const handleUpdateEditedField = (messageId: string, field: string, value: any) => {
    updateCurrentSessionMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const currentData = { ...(m.editedData || m.action?.data || {}) };
        currentData[field] = value;

        // Recalculate totalAmount for Milk Entry
        if (m.action?.actionType === 'MILK_ENTRY') {
          const qty = parseFloat(field === 'quantity' ? value : currentData.quantity) || 0;
          const rt = parseFloat(field === 'rate' ? value : currentData.rate) || 0;
          currentData.totalAmount = Math.round(qty * rt * 100) / 100;
        }

        // Recalculate totalAmount for Product Sale
        if (m.action?.actionType === 'PRODUCT_SALE' || m.action?.actionType === 'DIRECT_MILK_SALE') {
          const qty =
            parseFloat(field === 'quantity' || field === 'totalQuantity' ? value : currentData.quantity || currentData.totalQuantity) || 0;
          const rt = parseFloat(field === 'rate' ? value : currentData.rate) || 0;
          currentData.totalAmount = Math.round(qty * rt * 100) / 100;
        }

        return { ...m, editedData: currentData };
      })
    );
  };

  const toggleEditMode = (messageId: string) => {
    updateCurrentSessionMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, isEditing: !m.isEditing } : m))
    );
  };

  // WhatsApp Webhook Simulator
  const handleSimulateWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsappMsg.trim()) return;

    setWhatsappError(null);
    setWhatsappSuccess(null);
    setSimResult(null);
    setSimLoading(true);

    try {
      const res = await API.post('/ai/whatsapp-webhook', {
        message: whatsappMsg,
        senderMobile,
      });
      setWhatsappSuccess('WhatsApp ऑर्डर सफलतापूर्वक दर्ज हो गया!');
      setSimResult(res.data.order);
      speakAudio('WhatsApp ऑर्डर सफलतापूर्वक दर्ज हो गया है।');
    } catch (err: any) {
      setWhatsappError(err.response?.data?.message || 'WhatsApp संदेश प्रोसेस करने में त्रुटि हुई।');
    } finally {
      setSimLoading(false);
    }
  };

  // Group chat sessions by date category (Today, Yesterday, Previous 7 days, Older)
  const groupSessionsByDate = () => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayMidnight = todayMidnight - 24 * 60 * 60 * 1000;
    const weekAgoMidnight = todayMidnight - 7 * 24 * 60 * 60 * 1000;

    const today: ChatSession[] = [];
    const yesterday: ChatSession[] = [];
    const lastWeek: ChatSession[] = [];
    const older: ChatSession[] = [];

    sessions.forEach((s) => {
      const t = s.updatedAt || s.createdAt;
      if (t >= todayMidnight) today.push(s);
      else if (t >= yesterdayMidnight) yesterday.push(s);
      else if (t >= weekAgoMidnight) lastWeek.push(s);
      else older.push(s);
    });

    return [
      { label: '📌 आज (Today)', items: today },
      { label: '🕒 कल (Yesterday)', items: yesterday },
      { label: '📅 पिछले 7 दिन (Last 7 Days)', items: lastWeek },
      { label: '🗄️ पुराने (Older)', items: older },
    ].filter((g) => g.items.length > 0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity duration-300">
      {/* Slide-out Gemini Side Chat Board */}
      <div
        className={`w-full ${
          isExpanded ? 'max-w-3xl' : 'max-w-lg md:max-w-xl'
        } h-full bg-dark-950 border-l border-dark-800 flex flex-col shadow-2xl transition-all duration-300 relative text-dark-50`}
      >
        {/* Top Header */}
        <div className="p-3 border-b border-dark-800/80 bg-gradient-to-r from-dark-900 via-dark-900 to-indigo-950/40 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-2">
            {/* History Panel Toggle Button */}
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className={`p-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                isHistoryOpen
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                  : 'bg-dark-800 hover:bg-dark-750 text-dark-200 hover:text-white border-dark-700'
              }`}
              title="चैट इतिहास देखें (Chat History)"
            >
              <History className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline text-[11px]">इतिहास</span>
            </button>

            {/* New Chat Button */}
            <button
              onClick={handleCreateNewChat}
              className="p-2 px-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-xs font-bold transition-all active:scale-95 shadow-md shadow-indigo-600/20 flex items-center gap-1"
              title="नई चैट शुरू करें (New Chat)"
            >
              <Plus className="w-4 h-4" />
              <span className="text-[11px] font-bold">New Chat</span>
            </button>

            <div className="hidden min-[420px]:flex flex-col ml-1">
              <span className="text-xs font-black text-white flex items-center gap-1 truncate max-w-[150px]">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">{activeSession.title}</span>
              </span>
              <span className="text-[9px] text-dark-400">Gemini 3.5 AI</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* TTS Toggle */}
            <button
              onClick={() => setIsTTSActive(!isTTSActive)}
              className={`p-2 rounded-lg border text-xs transition-colors ${
                isTTSActive
                  ? 'bg-indigo-950/60 border-indigo-800/80 text-indigo-300'
                  : 'bg-dark-900 border-dark-800 text-dark-400'
              }`}
              title={isTTSActive ? 'Audio Voice On' : 'Audio Voice Muted'}
            >
              {isTTSActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Expand / Minimize */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white hidden sm:block"
              title={isExpanded ? 'Collapse Side Board' : 'Expand Side Board'}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-red-400"
              title="Close Gemini Assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Toggle: Gemini Assistant vs WhatsApp Simulator */}
        <div className="px-3 pt-2 pb-1 bg-dark-900/80 border-b border-dark-800 flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setActiveTab('assistant');
              setIsHistoryOpen(false);
            }}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'assistant'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-dark-400 hover:text-dark-200 bg-dark-950'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI वॉइस & चैट बोर्ड</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('whatsapp');
              setIsHistoryOpen(false);
            }}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'whatsapp'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-dark-400 hover:text-dark-200 bg-dark-950'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WhatsApp ऑटोमेशन</span>
          </button>
        </div>

        {/* History Slide-Out Drawer View */}
        {isHistoryOpen ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-dark-950">
            <div className="flex items-center justify-between pb-2 border-b border-dark-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">चैट इतिहास (Chat History)</h3>
              </div>
              <button
                onClick={handleClearAllHistory}
                className="text-[11px] text-red-400 hover:text-red-300 font-bold px-2 py-1 rounded bg-red-950/40 border border-red-900/50"
              >
                सभी डिलीट करें
              </button>
            </div>

            <div className="space-y-4">
              {groupSessionsByDate().map((group, gIdx) => (
                <div key={gIdx} className="space-y-1.5">
                  <span className="text-[11px] font-bold text-dark-400 px-1 block">
                    {group.label}
                  </span>
                  <div className="space-y-1">
                    {group.items.map((session) => {
                      const isActive = session.id === activeSessionId;
                      return (
                        <div
                          key={session.id}
                          onClick={() => handleSelectSession(session.id)}
                          className={`w-full p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between group ${
                            isActive
                              ? 'bg-gradient-to-r from-indigo-950/80 to-dark-900 border-indigo-500/50 text-white shadow-lg'
                              : 'bg-dark-900/70 hover:bg-dark-900 border-dark-800 text-dark-200 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate flex-1 pr-2">
                            <Sparkles
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-indigo-400' : 'text-dark-500 group-hover:text-dark-300'
                              }`}
                            />
                            <div className="truncate">
                              <span className="text-xs font-bold block truncate">
                                {session.title}
                              </span>
                              <span className="text-[10px] text-dark-400 block">
                                {new Date(session.updatedAt || session.createdAt).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}{' '}
                                • {session.messages.length} संदेश
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e) => handleDeleteSession(session.id, e)}
                              className="p-1.5 rounded-lg text-dark-500 hover:text-red-400 hover:bg-dark-800 transition-colors"
                              title="Delete Chat"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <ChevronRight className="w-4 h-4 text-dark-500" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'assistant' ? (
          <>
            {/* Quick Suggestion Chips */}
            <div className="px-3 py-2 bg-dark-900/60 border-b border-dark-800/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              <span className="text-[10px] font-bold text-dark-400 flex items-center gap-1 shrink-0">
                <Flame className="w-3 h-3 text-amber-400" /> सुझाव:
              </span>
              {GEMINI_PROMPT_SUGGESTIONS.map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendPrompt(chip.text, false)}
                  className="px-2.5 py-1 rounded-full bg-dark-800 hover:bg-dark-750 text-dark-200 hover:text-white text-[11px] font-medium whitespace-nowrap border border-dark-700/60 transition-all active:scale-95 shrink-0"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Chat Feed */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-dark-950 via-dark-950 to-dark-900"
            >
              {messages.map((msg) => {
                const isGemini = msg.sender === 'gemini';

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isGemini ? 'justify-start' : 'justify-end'} items-start animate-fadeIn`}
                  >
                    {/* Gemini Avatar */}
                    {isGemini && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-500/20 mt-1">
                        <Sparkles className="w-4 h-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-[88%] rounded-2xl p-3.5 space-y-2.5 ${
                        isGemini
                          ? 'bg-dark-900/95 border border-dark-800 text-dark-100 shadow-xl'
                          : 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-medium shadow-lg shadow-teal-900/30'
                      }`}
                    >
                      {/* Top message metadata */}
                      <div className="flex items-center justify-between gap-3 text-[10px] opacity-75 border-b border-white/10 pb-1">
                        <span className="font-bold flex items-center gap-1">
                          {isGemini ? 'Gemini AI' : 'You'}
                          {!isGemini && msg.isVoice && (
                            <span className="px-1.5 py-0.2 rounded bg-white/20 text-[9px]">
                              🎙️ Voice
                            </span>
                          )}
                        </span>
                        <span>
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {/* Message Body Text */}
                      <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
                        {msg.text}
                      </p>

                      {/* Navigation Link Badge (Closes modal overlay & opens full page) */}
                      {msg.action?.path && (
                        <div className="mt-2 pt-2 border-t border-white/10">
                          <button
                            onClick={() => {
                              navigate(msg.action!.path!);
                              onClose(); // Close modal drawer so full screen page is visible
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600/30 via-indigo-600/30 to-purple-600/30 hover:from-blue-600/60 hover:to-purple-600/60 border border-indigo-500/40 text-indigo-200 text-xs font-bold transition-all shadow-sm active:scale-95"
                          >
                            <Navigation className="w-3.5 h-3.5 text-indigo-400" />
                            <span>👉 पूरी स्क्रीन खोलें ({msg.action.path})</span>
                          </button>
                        </div>
                      )}

                      {/* Audio Replay for Gemini Response */}
                      {isGemini && msg.text && (
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => speakAudio(msg.text)}
                            className="text-[10px] text-dark-400 hover:text-indigo-400 flex items-center gap-1 transition-colors"
                            title="Replay Voice"
                          >
                            <Volume2 className="w-3 h-3" />
                            <span>सुनाएं</span>
                          </button>
                        </div>
                      )}

                      {/* Interactive Action Card if recognized */}
                      {isGemini && msg.action && msg.action.actionType !== 'UNKNOWN' && msg.action.actionType !== 'NAVIGATE' && (
                        <div
                          className={`mt-2 rounded-xl p-3 space-y-3 border ${
                            msg.action.actionType === 'DELETE_MILK_ENTRY'
                              ? 'bg-red-950/40 border-red-800/60'
                              : msg.action.actionType === 'AI_QUERY'
                              ? 'bg-indigo-950/30 border-indigo-800/40'
                              : 'bg-dark-950/80 border-dark-750'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-bold flex items-center gap-1.5 ${
                                msg.action.actionType === 'DELETE_MILK_ENTRY'
                                  ? 'text-red-400'
                                  : msg.action.actionType === 'AI_QUERY'
                                  ? 'text-indigo-400'
                                  : 'text-teal-400'
                              }`}
                            >
                              {msg.action.actionType === 'DELETE_MILK_ENTRY' ? (
                                <Trash2 className="w-4 h-4 text-red-400" />
                              ) : msg.action.actionType === 'AI_QUERY' ? (
                                <Sparkles className="w-4 h-4 text-indigo-400" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                              )}
                              {msg.action.previewTitle}
                            </span>

                            {msg.executionState === 'pending' && ['MILK_ENTRY', 'PRODUCT_SALE'].includes(msg.action.actionType) && (
                              <button
                                onClick={() => toggleEditMode(msg.id)}
                                className="text-[11px] text-dark-300 hover:text-white flex items-center gap-1 px-2 py-0.5 rounded bg-dark-800 border border-dark-700"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>{msg.isEditing ? 'Done' : 'Edit'}</span>
                              </button>
                            )}
                          </div>

                          {/* Details Grid or Editable Inputs */}
                          {!msg.isEditing ? (
                            <div className="grid grid-cols-2 gap-2 text-xs bg-dark-900/60 p-2.5 rounded-lg border border-dark-800">
                              {Object.entries(msg.action.previewDetails || {}).map(([key, val]) => (
                                <div key={key} className="space-y-0.5">
                                  <span className="text-[10px] text-dark-400 block">{key}</span>
                                  <span className="font-bold text-white block">{val}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-2 bg-dark-900/80 p-2.5 rounded-lg border border-dark-800">
                              {/* Editable fields for Milk Entry */}
                              {msg.action.actionType === 'MILK_ENTRY' && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-dark-400">Quantity (L)</label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={msg.editedData?.quantity || ''}
                                      onChange={(e) =>
                                        handleUpdateEditedField(msg.id, 'quantity', e.target.value)
                                      }
                                      className="w-full bg-dark-950 border border-dark-700 rounded px-2 py-1 text-xs text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-dark-400">FAT (%)</label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={msg.editedData?.fat || ''}
                                      onChange={(e) =>
                                        handleUpdateEditedField(msg.id, 'fat', e.target.value)
                                      }
                                      className="w-full bg-dark-950 border border-dark-700 rounded px-2 py-1 text-xs text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-dark-400">Rate (₹/L)</label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={msg.editedData?.rate || ''}
                                      onChange={(e) =>
                                        handleUpdateEditedField(msg.id, 'rate', e.target.value)
                                      }
                                      className="w-full bg-dark-950 border border-dark-700 rounded px-2 py-1 text-xs text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-dark-400">Total (₹)</label>
                                    <input
                                      type="number"
                                      value={msg.editedData?.totalAmount || ''}
                                      readOnly
                                      className="w-full bg-dark-900 border border-dark-800 rounded px-2 py-1 text-xs text-teal-400 font-bold"
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Editable fields for Product Sale */}
                              {msg.action.actionType === 'PRODUCT_SALE' && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-dark-400">Quantity</label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={msg.editedData?.quantity || ''}
                                      onChange={(e) =>
                                        handleUpdateEditedField(msg.id, 'quantity', e.target.value)
                                      }
                                      className="w-full bg-dark-950 border border-dark-700 rounded px-2 py-1 text-xs text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-dark-400">Rate (₹)</label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={msg.editedData?.rate || ''}
                                      onChange={(e) =>
                                        handleUpdateEditedField(msg.id, 'rate', e.target.value)
                                      }
                                      className="w-full bg-dark-950 border border-dark-700 rounded px-2 py-1 text-xs text-white"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* DELETE Action Button */}
                          {msg.action.actionType === 'DELETE_MILK_ENTRY' && msg.executionState === 'pending' && (
                            <button
                              onClick={() => handleExecuteAction(msg.id)}
                              disabled={!msg.action.data?.collectionId && !msg.action.data?.farmerId}
                              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-red-600/30 active:scale-[0.98] transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>🗑️ दूध एंट्री डिलीट करें (Confirm Delete Entry)</span>
                            </button>
                          )}

                          {/* Standard Action Execution Button */}
                          {msg.action.actionType !== 'DELETE_MILK_ENTRY' && msg.executionState === 'pending' && (
                            <button
                              onClick={() => handleExecuteAction(msg.id)}
                              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-dark-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-teal-500/20 active:scale-[0.98] transition-all"
                            >
                              <Save className="w-4 h-4" />
                              <span>स्वीकारें और सुरक्षित सेव करें (Confirm & Save)</span>
                            </button>
                          )}

                          {msg.executionState === 'executing' && (
                            <div className="w-full py-2 rounded-xl bg-dark-800 text-teal-400 font-bold text-xs flex items-center justify-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>प्रोसेस किया जा रहा है...</span>
                            </div>
                          )}

                          {msg.executionState === 'success' && (
                            <div className="w-full py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-bold text-xs flex items-center justify-center gap-2">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>सफलतापूर्वक प्रोसेस हो गया (Completed)</span>
                            </div>
                          )}

                          {msg.executionState === 'error' && (
                            <div className="w-full py-2 rounded-xl bg-red-950/60 border border-red-500/40 text-red-400 font-bold text-xs flex items-center justify-center gap-2">
                              <AlertCircle className="w-4 h-4" />
                              <span>{msg.errorMessage || 'प्रोसेस करने में त्रुटि हुई।'}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* User Avatar */}
                    {!isGemini && (
                      <div className="w-8 h-8 rounded-xl bg-dark-800 border border-dark-700 flex items-center justify-center text-dark-300 shrink-0 mt-1">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Real-time speech transcript banner inside feed */}
              {isListening && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-indigo-950/50 border border-indigo-500/40 text-indigo-200 animate-pulse">
                  <Radio className="w-4 h-4 text-indigo-400 animate-spin" />
                  <div className="text-xs">
                    <span className="font-bold text-white">सुन रहे हैं... </span>
                    <span>{interimTranscript || inputQuery || 'कृपया अपनी बात कहें...'}</span>
                  </div>
                </div>
              )}

              {/* Loading Indicator */}
              {isProcessing && (
                <div className="flex gap-2 items-center text-dark-400 text-xs py-2 px-3 bg-dark-900/60 rounded-xl w-fit">
                  <Sparkles className="w-4 h-4 text-indigo-400 animate-spin" />
                  <span>Google Gemini विचार कर रहा है...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Live Mic Status Notice */}
            {isListening && (
              <div className="px-4 py-1.5 bg-red-950/70 border-t border-red-500/30 text-red-300 text-[11px] font-bold flex items-center justify-between shrink-0">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  <span>🔴 रिकॉर्डिंग जारी है (रोकने के लिए दोबारा माइक दबाएं)</span>
                </span>
                <button
                  onClick={handleToggleListening}
                  className="px-2 py-0.5 rounded bg-red-500 text-white font-bold text-[10px] hover:bg-red-400"
                >
                  समाप्त करें और भेजें
                </button>
              </div>
            )}

            {/* Bottom Input Area */}
            <div className="p-3 bg-dark-900 border-t border-dark-800 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendPrompt(inputQuery, false);
                }}
                className="flex items-center gap-2"
              >
                {/* Dual Control Mic Button (Click-to-Toggle OR Hold-to-Talk) */}
                <button
                  type="button"
                  onClick={handleToggleListening}
                  onPointerDown={handlePointerDownMic}
                  onPointerUp={handlePointerUpMic}
                  className={`p-3 rounded-2xl transition-all active:scale-95 flex items-center justify-center shrink-0 border ${
                    isListening
                      ? 'bg-red-600 text-white border-red-400 animate-pulse ring-4 ring-red-500/30 shadow-lg shadow-red-600/40'
                      : 'bg-dark-800 hover:bg-dark-750 text-indigo-400 hover:text-white border-dark-700'
                  }`}
                  title={
                    isListening
                      ? 'रोकने के लिए क्लिक करें'
                      : 'बोलने के लिए एक बार क्लिक करें (या दबाकर रखें)'
                  }
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                {/* Query Input Box */}
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    placeholder={
                      isListening ? 'बोलिए, सुन रहे हैं...' : 'Gemini से कुछ भी पूछें या कमांड दें...'
                    }
                    className="w-full bg-dark-950 border border-dark-750 focus:border-indigo-500 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  />
                </div>

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!inputQuery.trim() || isProcessing}
                  className="p-3 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition-all active:scale-95 shrink-0 shadow-lg shadow-indigo-600/30"
                  title="Send to Gemini"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </>
        ) : (
          /* WhatsApp Simulator Panel */
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-dark-950 to-dark-900">
            <div className="bg-dark-900/90 border border-dark-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Smartphone className="w-5 h-5" />
                <h3 className="text-sm font-bold text-white">WhatsApp Webhook Simulator</h3>
              </div>
              <p className="text-xs text-dark-400">
                ग्राहक द्वारा WhatsApp पर भेजा गया ऑर्डर मैसेज यहाँ टेस्ट करें। AI इसे स्वतः प्रोसेस करके आर्डर बुक कर लेगा।
              </p>

              <form onSubmit={handleSimulateWhatsApp} className="space-y-3 pt-2">
                <div>
                  <label className="text-[11px] text-dark-400 font-bold block mb-1">
                    ग्राहक का मोबाइल नंबर (Sender Mobile)
                  </label>
                  <input
                    type="text"
                    value={senderMobile}
                    onChange={(e) => setSenderMobile(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-750 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-dark-400 font-bold block mb-1">
                    WhatsApp संदेश (Message Text)
                  </label>
                  <textarea
                    rows={3}
                    value={whatsappMsg}
                    onChange={(e) => setWhatsappMsg(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-750 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                {whatsappSuccess && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    <span>{whatsappSuccess}</span>
                  </div>
                )}

                {whatsappError && (
                  <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-400 text-xs font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    <span>{whatsappError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={simLoading || !whatsappMsg.trim()}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
                >
                  {simLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>WhatsApp ऑर्डर प्रोसेस करें</span>
                </button>
              </form>

              {simResult && (
                <div className="mt-4 p-4 rounded-2xl bg-gradient-to-b from-dark-950 to-dark-900 border border-emerald-500/40 text-xs space-y-3 shadow-lg">
                  <div className="flex items-center justify-between pb-2 border-b border-dark-800">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>WhatsApp आर्डर बुक हो गया</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 border border-amber-800/60 text-amber-400">
                      {simResult.status || 'Pending'}
                    </span>
                  </div>

                  <div className="space-y-1 text-dark-300">
                    <div className="flex justify-between">
                      <span className="text-dark-400">ग्राहक का नाम:</span>
                      <span className="text-white font-bold">{simResult.customerName || 'WhatsApp Customer'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-400">ऑर्डर आईडी:</span>
                      <span className="text-dark-200 font-mono text-[10px]">{simResult._id?.slice(-8) || simResult.id}</span>
                    </div>
                  </div>

                  {/* Items breakdown list */}
                  {simResult.items && simResult.items.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-dark-800">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-dark-400 block">
                        आइटम विवरण (Items):
                      </span>
                      {simResult.items.map((it: any, idx: number) => {
                        const prodName = it.product?.name || it.productName || `Product ${idx + 1}`;
                        const unit = it.product?.unit || it.unit || '';
                        return (
                          <div key={idx} className="flex justify-between items-center bg-dark-950 px-2.5 py-1.5 rounded-xl border border-dark-800">
                            <div>
                              <span className="text-white font-semibold">{prodName}</span>
                              <span className="text-dark-400 text-[10px] block">
                                {it.quantity} {unit} @ ₹{it.rate}
                              </span>
                            </div>
                            <span className="text-emerald-400 font-bold">₹{it.amount}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex justify-between items-baseline pt-2 border-t border-dark-800">
                    <span className="text-dark-300 font-bold">कुल देय राशि (Total Amount):</span>
                    <span className="text-base font-black text-emerald-400">₹{simResult.totalAmount}</span>
                  </div>

                  <button
                    onClick={() => {
                      onClose();
                      navigate('/orders');
                    }}
                    className="w-full py-2 rounded-xl bg-dark-800 hover:bg-dark-750 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-dark-700 transition-all active:scale-95 shadow-sm"
                  >
                    <span>👉 आर्डर लिस्ट में देखें (/orders)</span>
                    <ChevronRight className="w-4 h-4 text-emerald-400" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
