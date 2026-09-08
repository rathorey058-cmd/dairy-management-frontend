import React, { useState } from 'react';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  Bot, MessageSquare, Send, Sparkles, AlertCircle, CheckCircle, 
  MessageCircle, Smartphone, FileText
} from 'lucide-react';

interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
}

export const Assistant: React.FC = () => {
  useAuth();

  // Active tab
  const [tab, setTab] = useState<'chat' | 'whatsapp'>('chat');

  // AI Assistant Chat state
  const [chatLog, setChatLog] = useState<ChatMessage[]>([
    { sender: 'ai', text: 'Namaste! I am your Dairy Smart AI Business Assistant. How can I help you manage your dairy operations today?' }
  ]);
  const [query, setQuery] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // WhatsApp Simulator state
  const [whatsappMsg, setWhatsappMsg] = useState('Need 2 kg Paneer and 10 ltr Milk');
  const [senderMobile, setSenderMobile] = useState('9988776655');
  const [simResult, setSimResult] = useState<any | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  // Statuses
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAskAssistant = async (textToSend?: string) => {
    const text = (textToSend || query).trim();
    if (!text) return;

    // Append user query to chat log
    setChatLog(prev => [...prev, { sender: 'user', text }]);
    setQuery('');
    setChatLoading(true);

    try {
      const res = await API.post('/ai/query', { query: text });
      setChatLog(prev => [...prev, { sender: 'ai', text: res.data.reply }]);
    } catch (err) {
      console.error('AI query error', err);
      setChatLog(prev => [...prev, { sender: 'ai', text: 'Pardon me, I encountered a connection issue. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSimulateWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsappMsg) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setSimResult(null);
    setSimLoading(true);

    try {
      const payload = {
        message: whatsappMsg,
        senderMobile
      };

      const res = await API.post('/ai/whatsapp-webhook', payload);
      setSuccessMsg('WhatsApp order registered successfully!');
      setSimResult(res.data.order);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to parse WhatsApp message.');
    } finally {
      setSimLoading(false);
    }
  };

  const queryChips = [
    { label: 'Check Cash Galla', query: 'Show expected cash galla today' },
    { label: 'Today\'s Milk Pool', query: 'What is today\'s milk collection summary?' },
    { label: 'Weekly Paneer Yield', query: 'How much paneer was produced this week?' },
    { label: 'Farmer Settlements', query: 'What is the farmer settlement status?' }
  ];

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-center px-1">
        <h2 className="text-lg font-black text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <span>AI Assistant & WhatsApp</span>
        </h2>
        <span className="text-[10px] bg-indigo-950 text-indigo-400 px-2 py-0.5 rounded-full font-bold border border-indigo-900/50">
          AI Agent NLP
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
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-1.5 bg-dark-950 p-1.5 rounded-2xl border border-dark-800">
        <button
          onClick={() => setTab('chat')}
          className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            tab === 'chat' ? 'bg-indigo-600 text-white shadow-md' : 'text-dark-400 hover:text-dark-200'
          }`}
        >
          <Bot className="w-4 h-4" />
          AI Business Chat
        </button>
        <button
          onClick={() => setTab('whatsapp')}
          className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            tab === 'whatsapp' ? 'bg-indigo-600 text-white shadow-md' : 'text-dark-400 hover:text-dark-200'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp Parser
        </button>
      </div>

      {/* 1. Chat Assistant UI */}
      {tab === 'chat' && (
        <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-4 flex flex-col min-h-[420px] justify-between relative overflow-hidden">
          
          {/* Chat bubbles container */}
          <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1 flex-1">
            {chatLog.map((chat, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 max-w-[85%] ${
                  chat.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs ${
                  chat.sender === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-indigo-950 border border-indigo-900/50 text-indigo-400'
                }`}>
                  {chat.sender === 'user' ? 'U' : <Bot className="w-4 h-4" />}
                </div>
                <div className={`p-3 rounded-2xl text-xs leading-normal font-medium ${
                  chat.sender === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-dark-950 border border-dark-850 text-dark-100 rounded-tl-none'
                }`}>
                  {chat.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2.5 mr-auto max-w-[85%]">
                <div className="w-7 h-7 rounded-lg bg-indigo-950 border border-indigo-900/50 flex items-center justify-center">
                  <div className="w-3.5 h-3.5 rounded-full border border-indigo-500/20 border-t-indigo-400 animate-spin" />
                </div>
                <div className="p-3 bg-dark-950 border border-dark-850 text-dark-400 rounded-2xl rounded-tl-none text-xs">
                  Thinking...
                </div>
              </div>
            )}
          </div>

          {/* Quick query chips */}
          <div className="pt-2 border-t border-dark-800/60">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {queryChips.map((chip, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => handleAskAssistant(chip.query)}
                  className="px-3 py-1.5 bg-dark-950 hover:bg-dark-850 border border-dark-850 rounded-full text-[10px] font-bold text-dark-300 hover:text-white shrink-0 transition-all active:scale-95"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Query Form input */}
            <form
              onSubmit={(e) => { e.preventDefault(); handleAskAssistant(); }}
              className="flex gap-2 mt-2"
            >
              <input
                type="text"
                placeholder="Ask me anything about your business..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 px-4 py-3 rounded-2xl bg-dark-950 border border-dark-800 text-xs text-white placeholder-dark-600 focus:outline-none focus:border-indigo-500 shadow-inner"
              />
              <button
                type="submit"
                disabled={chatLoading || !query.trim()}
                className="p-3.5 rounded-2xl bg-indigo-600 text-white hover:brightness-110 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40"
              >
                <Send className="w-4.5 h-4.5" />
              </button>
            </form>
          </div>

        </div>
      )}

      {/* 2. WhatsApp Order Simulator */}
      {tab === 'whatsapp' && (
        <div className="space-y-4">
          
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Smartphone className="w-4.5 h-4.5 text-indigo-400" />
              Simulate WhatsApp Order Text
            </h3>
            <form onSubmit={handleSimulateWhatsApp} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                    Sender Mobile Number
                  </label>
                  <input
                    type="text"
                    value={senderMobile}
                    onChange={(e) => setSenderMobile(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                    Order Input Format Help
                  </label>
                  <span className="text-[9px] text-dark-500 leading-tight block mt-1">
                    Try using: "Need 2 kg paneer and 10 ltr milk"
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                  WhatsApp Message Text
                </label>
                <textarea
                  value={whatsappMsg}
                  onChange={(e) => setWhatsappMsg(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 rounded-2xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none focus:border-indigo-500 shadow-inner"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={simLoading || !whatsappMsg}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-500 text-sm font-bold text-white shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <MessageSquare className="w-4 h-4" />
                <span>{simLoading ? 'Simulating Webhook parsing...' : 'Simulate WhatsApp Webhook'}</span>
              </button>
            </form>
          </div>

          {/* Parsed WhatsApp Invoice Card */}
          {simResult && (
            <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-4 divide-y divide-dark-800/60">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black uppercase tracking-wider text-dark-400 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  Parsed WhatsApp Order Draft
                </h3>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-950 border border-amber-900/50 text-amber-400 animate-pulse font-extrabold uppercase">
                  Pending Approval
                </span>
              </div>

              <div className="pt-4 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-dark-500">Customer Name:</span>
                  <span className="font-bold text-white">{simResult.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-500">Order Source:</span>
                  <span className="font-bold text-indigo-400">WhatsApp AI</span>
                </div>
              </div>

              <div className="pt-4 text-xs space-y-2">
                {simResult.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-dark-300">
                    <span>{item.quantity} units Billed</span>
                    <span className="font-bold text-white">₹{item.amount}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-dark-850 pt-2 font-black text-sm">
                  <span className="text-indigo-400">Estimated Total:</span>
                  <span className="text-white">₹{simResult.totalAmount}</span>
                </div>
              </div>

              <div className="pt-3 text-[10px] text-center text-dark-500 font-medium">
                Verify this order under the recent orders logs.
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
};
