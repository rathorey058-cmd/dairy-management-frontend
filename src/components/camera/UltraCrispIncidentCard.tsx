import React from 'react';
import { 
  Play, Share2, Volume2, Clock
} from 'lucide-react';

export interface UltraCrispIncidentItem {
  id: string;
  timestamp?: string | Date;
  timeCode: string;          // e.g. "14:22:15"
  alertType: string;         // e.g. "🚨 गल्ला चोरी (Cash Mismatch)"
  amountOrItem: string;      // e.g. "₹500 का नोट निकला | बिल: ₹0"
  rootCause: string;         // e.g. "गल्ला खुला पर POS पर कोई सक्रिय बिक्री नहीं"
  confidence: number;        // e.g. 98
  videoClipUrl?: string;     // 10s video replay
  snapshotImage?: string;
  audioVerified?: boolean;
  micChannel?: string;
  status: 'PENDING_REVIEW' | 'FLAGGED_THEFT' | 'CLEARED_SAFE';
}

interface Props {
  incident: UltraCrispIncidentItem;
  onStatusChange?: (id: string, newStatus: 'FLAGGED_THEFT' | 'CLEARED_SAFE') => void;
  onOpenReplay?: (incident: UltraCrispIncidentItem) => void;
}

export const UltraCrispIncidentCard: React.FC<Props> = ({ incident, onStatusChange, onOpenReplay }) => {
  const getBadgeStyle = () => {
    if (incident.alertType.includes('गल्ला') || incident.alertType.includes('Cash Mismatch')) {
      return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
    if (incident.alertType.includes('चिल्लर') || incident.alertType.includes('Delta Coin')) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    }
    if (incident.alertType.includes('जेब') || incident.alertType.includes('Pocket')) {
      return 'bg-red-500/20 text-red-300 border-red-500/40';
    }
    if (incident.alertType.includes('उपभोग') || incident.alertType.includes('Mouth')) {
      return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    }
    if (incident.alertType.includes('सामान') || incident.alertType.includes('Crossing')) {
      return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
    }
    return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
  };

  const handleShareWhatsApp = () => {
    const text = `🚨 *डेयरी सुरक्षा अलर्ट (Incident Report)*
------------------------------------
⏰ *समय:* ${incident.timeCode}
⚠️ *अलर्ट:* ${incident.alertType}
📦 *सामग्री / राशि:* ${incident.amountOrItem}
🔍 *मूल कारण:* ${incident.rootCause}
📊 *विश्वसनीयता:* ${incident.confidence}%
🎙️ *ऑडियो मिलान:* ${incident.audioVerified ? 'हाँ (' + (incident.micChannel || 'Mic') + ')' : 'नहीं'}
------------------------------------
तुरंत डेयरी AI मॉनिटर में चेक करें।`;

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  const isTheft = incident.status === 'FLAGGED_THEFT';
  const isSafe = incident.status === 'CLEARED_SAFE';

  return (
    <div className={`p-3.5 rounded-2xl border transition-all duration-200 group ${
      isTheft
        ? 'bg-rose-950/20 border-rose-500/50 shadow-md shadow-rose-950/40'
        : isSafe
        ? 'bg-emerald-950/15 border-emerald-500/30 opacity-75'
        : 'bg-dark-900 border-dark-800 hover:border-indigo-500/40 shadow-sm'
    }`}>
      {/* 2-LINE ULTRA-CRISP LAYOUT */}
      
      {/* LINE 1: Time | Alert Type & Amount/Item | Confidence | 10s Replay Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Timecode Badge */}
          <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-dark-950 text-white border border-dark-800 flex items-center gap-1 shrink-0">
            <Clock className="w-3 h-3 text-indigo-400" />
            <span>{incident.timeCode}</span>
          </span>

          {/* Alert Type Badge */}
          <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-lg border flex items-center gap-1.5 ${getBadgeStyle()}`}>
            <span>{incident.alertType}</span>
          </span>

          {/* Amount / Item Affected Pill */}
          <span className="text-xs font-bold text-white bg-dark-950 px-2 py-0.5 rounded-md border border-dark-800">
            {incident.amountOrItem}
          </span>

          {/* Confidence Score */}
          <span className="text-[10px] font-mono text-dark-400">
            {incident.confidence}% AI निश्चितता
          </span>

          {/* Audio verified tag */}
          {incident.audioVerified && (
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-0.5 font-bold">
              <Volume2 className="w-2.5 h-2.5" />
              <span>{incident.micChannel || 'ऑडियो सिंक'}</span>
            </span>
          )}
        </div>

        {/* 10s Video Replay Button */}
        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => onOpenReplay && onOpenReplay(incident)}
            className="py-1 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/30 active:scale-95"
            title="10 सेकंड का वीडियो क्लिप देखें"
          >
            <Play className="w-3.5 h-3.5 fill-current text-white" />
            <span>▶️ 10s क्लिप</span>
          </button>

          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="p-1.5 rounded-xl bg-dark-950 hover:bg-dark-800 text-emerald-400 border border-dark-800 transition-all"
            title="WhatsApp पर अलर्ट भेजें"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* LINE 2: Root Cause & Action Buttons */}
      <div className="mt-2.5 pt-2 border-t border-dark-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-dark-300">
          <span className="text-[10px] uppercase font-bold text-dark-400 tracking-wider shrink-0">
            मूल कारण:
          </span>
          <span className="text-white font-medium line-clamp-1">
            {incident.rootCause}
          </span>
        </div>

        {/* Action Decision Pills */}
        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => onStatusChange && onStatusChange(incident.id, 'FLAGGED_THEFT')}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all ${
              isTheft 
                ? 'bg-rose-600 text-white border-rose-500' 
                : 'bg-dark-950 text-rose-400 border-dark-800 hover:border-rose-500/50'
            }`}
          >
            🚨 चोरी दर्ज करें
          </button>

          <button
            type="button"
            onClick={() => onStatusChange && onStatusChange(incident.id, 'CLEARED_SAFE')}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all ${
              isSafe 
                ? 'bg-emerald-600 text-white border-emerald-500' 
                : 'bg-dark-950 text-emerald-400 border-dark-800 hover:border-emerald-500/50'
            }`}
          >
            ✓ सुरक्षित है
          </button>
        </div>
      </div>
    </div>
  );
};
