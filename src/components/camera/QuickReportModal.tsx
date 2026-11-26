import React, { useEffect, useState, useCallback } from 'react';
import API from '../../api';
import { TriMatchReportModal } from './TriMatchReportModal';
import {
  X, Users, Receipt, IndianRupee, Wallet, DoorOpen,
  RefreshCw, Mic, Video, Eye, CheckCircle2, PackageCheck
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split('T')[0];
const hhmm = (d: string) => new Date(d).toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' });

export interface ParsedCustomerVisit {
  id: string;
  time: string;
  people: number;
  image: string | null;
  hasImage: boolean;
  requestedItem: string;
  audioQuote: string;
  givenItem: string;
  amountPaid: number;
  gallaDeposited: boolean;
  gallaStatusText: string;
  posBillAmount: number;
  audioCaptured: boolean;
  videoCaptured: boolean;
}

const FAKE_CYCLE_QUOTES = new Set([
  'भैया ₹30 का खुला दूध दे दो',
  'भैया ₹20 का दूध दे दो',
  'भैया ₹40 का छाछ व दूध पैकेट दे दो',
  'भैया ₹60 का खुला दूध दे दो',
  'भैया ₹25 का दही दे दो',
  'भैया ₹10 का दूध दे दो',
]);

export function parseVisitsFromTimeline(tlData: any): ParsedCustomerVisit[] {
  const events: any[] = (tlData?.events || []).filter(
    (e: any) => e.type === 'FACE_VISIT' && !String(e.image || '').startsWith('SCAN_REQ:') && !String(e.image || '').startsWith('AUDIO_REQ:')
  );

  return events.map((e: any, idx: number) => {
    const rawNote = String(e.note || '');
    const inlineImg = e.image && String(e.image).startsWith('data:image') ? String(e.image) : null;
    const hasImg = Boolean(inlineImg || e.hasImage);

    if (rawNote.startsWith('TRI_JSON:')) {
      try {
        const p = JSON.parse(rawNote.slice(9));
        const rawQuote = String(p.audioQuote || p.audio?.[0]?.text || '').trim();
        const isLegacyFake = FAKE_CYCLE_QUOTES.has(rawQuote) && Number(p.pos?.total || 0) === 0;

        if (!isLegacyFake) {
          const amt = Number(p.amountPaid || p.heardAmount || p.pos?.total || 0);
          const quote = rawQuote && rawQuote !== 'ऑडियो कैप्चर नहीं हुआ' ? rawQuote : 'ऑडियो कैप्चर नहीं हुआ';
          const reqItem =
            p.requestedItem && p.requestedItem !== 'ऑडियो कैप्चर नहीं हुआ'
              ? p.requestedItem
              : p.audio?.[0]?.items?.[0]?.name || 'ऑडियो कैप्चर नहीं हुआ';
          const given =
            p.givenItem ||
            (hasImg ? 'काउंटर पर ग्राहक देखा गया (दिया गया सामान कैप्चर नहीं हुआ)' : 'वीडियो फुटेज कैप्चर नहीं हुआ');
          const gallaDep = Boolean(p.gallaDeposited && (amt > 0 || (p.galla && p.galla.length > 0)));
          return {
            id: e.id || p.id || `visit-${idx}`,
            time: e.time,
            people: Number(e.count || p.people || 1),
            image: inlineImg,
            hasImage: hasImg,
            requestedItem: reqItem,
            audioQuote: quote,
            givenItem: given,
            amountPaid: amt,
            gallaDeposited: gallaDep,
            gallaStatusText:
              p.gallaStatusText ||
              (amt > 0
                ? gallaDep
                  ? `₹${amt} दर्ज`
                  : `₹${amt} (गल्ला रिकॉर्ड नहीं)`
                : 'रकम व गल्ला कैप्चर नहीं हुआ'),
            posBillAmount: Number(p.pos?.total || 0),
            audioCaptured: quote !== 'ऑडियो कैप्चर नहीं हुआ',
            videoCaptured: hasImg,
          };
        }
      } catch {
        /* fallback below */
      }
    }

    return {
      id: e.id || `visit-${idx}`,
      time: e.time,
      people: Number(e.count || 1),
      image: inlineImg,
      hasImage: hasImg,
      requestedItem: 'ऑडियो कैप्चर नहीं हुआ',
      audioQuote: 'ऑडियो कैप्चर नहीं हुआ',
      givenItem: hasImg
        ? 'काउंटर पर ग्राहक देखा गया (दिया गया सामान कैप्चर नहीं हुआ)'
        : 'वीडियो फुटेज कैप्चर नहीं हुआ',
      amountPaid: 0,
      gallaDeposited: false,
      gallaStatusText: 'रकम व गल्ला कैप्चर नहीं हुआ',
      posBillAmount: 0,
      audioCaptured: false,
      videoCaptured: hasImg,
    };
  });
}

/** Unified Customer Diary + Video + Audio + Galla Report */
export const QuickReportModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [date, setDate] = useState(today());
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('22:00');
  const [data, setData] = useState<any | null>(null);
  const [visits, setVisits] = useState<ParsedCustomerVisit[]>([]);
  const [slabEvents, setSlabEvents] = useState<any[]>([]);
  const [slabFilter, setSlabFilter] = useState<string>('ALL');
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [lazyPhotos, setLazyPhotos] = useState<Record<string, string>>({});
  const [loadingPhotoId, setLoadingPhotoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanningSlab, setScanningSlab] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showTri, setShowTri] = useState(false);

  const togglePhoto = async (photoKey: string, docId?: string, inlineImg?: string | null) => {
    if (openPhotoId === photoKey) {
      setOpenPhotoId(null);
      return;
    }
    setOpenPhotoId(photoKey);
    if (inlineImg || lazyPhotos[photoKey] || !docId || docId.startsWith('visit-') || docId.startsWith('slab-')) {
      return;
    }
    setLoadingPhotoId(photoKey);
    try {
      const r = await API.get(`/cameras/audit-log/${docId}/image`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(r.data);
      setLazyPhotos((prev) => ({ ...prev, [photoKey]: blobUrl }));
    } catch {
      /* image unavailable */
    } finally {
      setLoadingPhotoId(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [sumRes, tlRes] = await Promise.all([
        API.get('/cameras/reports/daily-summary', { params: { date, startTime: start, endTime: end } }),
        API.get('/cameras/playback/timeline', { params: { date, startTime: start, endTime: end } }).catch((tlErr) => {
          console.error('Timeline load error:', tlErr);
          return { data: null, _err: tlErr };
        }),
      ]);
      setData(sumRes.data);
      if (!tlRes?.data) {
        setErr('टाइमलाइन लोड होने में समस्या आई — कृपया दुबारा "देखें" दबाएँ।');
      }
      setVisits(parseVisitsFromTimeline(tlRes.data));
      const allEv: any[] = tlRes.data?.events || [];
      setSlabEvents(
        allEv.filter(
          (e: any) =>
            e.type !== 'FACE_VISIT' &&
            e.type !== 'LIVE_3D_STATE' &&
            e.type !== 'AI_BRAIN_MEM' &&
            !String(e.image || '').startsWith('SCAN_REQ:') &&
            !String(e.image || '').startsWith('AUDIO_REQ:')
        )
      );
    } catch (e: any) {
      setErr(e.response?.data?.message || 'रिपोर्ट लोड नहीं हो सकी।');
    } finally {
      setLoading(false);
    }
  }, [date, start, end]);

  const handleScanDvrSlab = async () => {
    setScanningSlab(true);
    try {
      await API.post('/cameras/evaluate-edge-rules', {
        footfallArrivals: 1,
        footfallSnapshot: `SCAN_REQ:1|${date}|${start}|${end}`,
      }).catch(() => {});
      await API.post('/cameras/evaluate-edge-rules', {
        footfallArrivals: 1,
        footfallSnapshot: `AUDIO_REQ:1|${date}|${start}|${end}`,
      }).catch(() => {});
      setTimeout(() => {
        load();
        setScanningSlab(false);
      }, 7000);
    } catch {
      setScanningSlab(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  const h = data?.headline || {};
  const totalCustomers = visits.reduce((s, v) => s + v.people, 0) || h.customers || 0;
  const aiGallaTotal = visits.reduce((s, v) => s + v.amountPaid, 0);
  const posSalesTotal = Number(h.sales || 0);
  const combinedGalla = Math.max(aiGallaTotal, posSalesTotal);
  const gallaDepositedCount = visits.filter((v) => v.gallaDeposited).length || Number(h.gallaOpenings || 0);
  const capturedItemCount = visits.filter((v) => v.audioCaptured || v.posBillAmount > 0 || v.amountPaid > 0).length;

  const Stat = ({ icon, label, value, sub, tone }: any) => (
    <div className="bg-dark-900 border border-dark-800 rounded-2xl p-3 text-center">
      <div className={`mx-auto mb-1 flex justify-center ${tone}`}>{icon}</div>
      <div className="text-xl font-black text-white">{value}</div>
      <div className="text-[11px] font-bold text-dark-300">{label}</div>
      {sub && <div className="text-[10px] text-dark-400 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-dark-950 border border-dark-700 w-full max-w-4xl rounded-3xl shadow-2xl my-auto max-h-[93vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 flex flex-wrap items-center justify-between gap-2 border-b border-dark-800 shrink-0">
          <div>
            <h2 className="text-base font-black text-white">📊 AI कैमरा + ऑडियो + गल्ला रिपोर्ट</h2>
            <p className="text-[11px] text-dark-400">
              कब ग्राहक आया • ऑडियो में क्या माँगा • वीडियो में क्या सामान दिया • कितने रुपये गल्ले में डाले
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTri(true)}
              className="px-3 py-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold"
            >
              🔍 विस्तृत 3-कॉलम मिलान
            </button>
            <button onClick={onClose} className="p-2 rounded-xl bg-dark-800 text-dark-300 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Date & Time Filter */}
          <div className="flex flex-wrap items-center gap-2 text-xs bg-dark-900/70 p-2.5 rounded-2xl border border-dark-800">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-dark-950 border border-dark-700 rounded-xl px-2.5 py-1.5 text-white"
            />
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="bg-dark-950 border border-dark-700 rounded-xl px-2.5 py-1.5 text-white"
            />
            <span className="text-dark-400">से</span>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="bg-dark-950 border border-dark-700 rounded-xl px-2.5 py-1.5 text-white"
            />
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleScanDvrSlab}
                disabled={scanningSlab}
                className="px-3 py-1.5 rounded-xl bg-teal-600/20 border border-teal-500/40 text-teal-300 font-bold flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scanningSlab ? 'animate-spin' : ''}`} />
                {scanningSlab ? 'DVR स्लैब स्कैन चालू...' : 'DVR से ऑडियो+वीडियो स्कैन'}
              </button>
              <button
                onClick={load}
                disabled={loading}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1.5 shadow"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> देखें
              </button>
            </div>
          </div>

          {err && (
            <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{err}</div>
          )}

          {data && (
            <>
              {/* Top 6 Headline Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <Stat
                  icon={<Users className="w-5 h-5" />}
                  tone="text-sky-400"
                  label="कुल ग्राहक आए"
                  value={`${totalCustomers}`}
                  sub="काउंटर वीडियो से"
                />
                <Stat
                  icon={<IndianRupee className="w-5 h-5" />}
                  tone="text-emerald-400"
                  label="कुल गल्ला / बिक्री"
                  value={`₹${combinedGalla}`}
                  sub="ऑडियो + वीडियो से"
                />
                <Stat
                  icon={<Wallet className="w-5 h-5" />}
                  tone="text-amber-400"
                  label="कैश गल्ले में आया"
                  value={`₹${aiGallaTotal}`}
                  sub={`${gallaDepositedCount} बार गल्ले में डाले`}
                />
                <Stat
                  icon={<PackageCheck className="w-5 h-5" />}
                  tone="text-indigo-400"
                  label="सामान कैप्चर हुआ"
                  value={`${capturedItemCount} / ${visits.length}`}
                  sub="ऑडियो / बिल से पुष्ट"
                />
                <Stat
                  icon={<DoorOpen className="w-5 h-5" />}
                  tone="text-rose-400"
                  label="गल्ला दराज"
                  value={`${gallaDepositedCount} बार`}
                  sub="ग्राहक लेनदेन पर"
                />
                <Stat
                  icon={<Receipt className="w-5 h-5" />}
                  tone="text-violet-400"
                  label="POS कंप्यूटर बिल"
                  value={`₹${posSalesTotal}`}
                  sub={`${h.bills || 0} बिल कटे`}
                />
              </div>

              {/* Customer-by-Customer Chronological Diary */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                    <span>📋 हर ग्राहक का समय-वार पूरा ब्यौरा (Time • क्या माँगा • क्या दिया • कितने रुपये गल्ले में डाले)</span>
                  </h3>
                  <span className="text-[11px] font-bold text-emerald-400">
                    कुल {visits.length} ग्राहक विज़िट • कुल गल्ला: ₹{combinedGalla}
                  </span>
                </div>

                {visits.length === 0 ? (
                  <div className="text-center py-8 px-4 rounded-2xl bg-dark-900/60 border border-dashed border-dark-700 text-xs text-dark-400">
                    इस चुने हुए समय ({start} से {end}) में काउंटर पर कोई ग्राहक विज़िट दर्ज नहीं है।
                  </div>
                ) : (
                  <div className="space-y-2">
                    {visits.map((v, i) => (
                      <div
                        key={v.id}
                        className="bg-dark-900/90 border border-dark-800 hover:border-indigo-500/40 rounded-2xl p-3 text-xs space-y-2 transition"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                          {/* 1. Time & Customer # */}
                          <div className="sm:col-span-2 flex sm:flex-col items-center sm:items-start justify-between gap-1">
                            <span className="px-2 py-0.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-mono font-bold text-[11px]">
                              ⏰ {hhmm(v.time)}
                            </span>
                            <span className="text-[11px] font-bold text-sky-300">
                              ग्राहक #{i + 1} ({v.people} व्यक्ति)
                            </span>
                          </div>

                          {/* 2. Audio: What customer asked for */}
                          <div className="sm:col-span-4 bg-dark-950/80 p-2 rounded-xl border border-dark-800 space-y-0.5">
                            <div className="text-[10px] text-teal-400 font-bold flex items-center gap-1">
                              <Mic className="w-3 h-3" /> 1. ऑडियो (ग्राहक ने क्या माँगा):
                            </div>
                            {v.audioCaptured ? (
                              <>
                                <div className="text-white font-semibold">“{v.audioQuote}”</div>
                                <div className="text-[11px] text-teal-300 font-bold">
                                  माँगा गया सामान: {v.requestedItem}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="text-amber-300/90 font-semibold">⚠️ ऑडियो कैप्चर नहीं हुआ</div>
                                <div className="text-[11px] text-dark-400 font-medium">
                                  माँगा गया सामान: कैप्चर नहीं हुआ
                                </div>
                              </>
                            )}
                          </div>

                          {/* 3. Video: What item was given */}
                          <div className="sm:col-span-3 bg-dark-950/80 p-2 rounded-xl border border-dark-800 space-y-0.5">
                            <div className="text-[10px] text-sky-400 font-bold flex items-center gap-1">
                              <Video className="w-3 h-3" /> 2. वीडियो (क्या सामान दिया):
                            </div>
                            <div className={v.videoCaptured ? 'text-white font-semibold' : 'text-amber-300/90 font-semibold'}>
                              {v.givenItem}
                            </div>
                            {v.hasImage ? (
                              <button
                                type="button"
                                onClick={() => togglePhoto(v.id, v.id, v.image)}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 pt-0.5"
                              >
                                <Eye className="w-3 h-3" />
                                {openPhotoId === v.id ? 'फोटो छुपाएँ' : 'उस समय की कैमरा फोटो देखें'}
                              </button>
                            ) : (
                              <div className="text-[10px] text-dark-400">फुटेज फोटो उपलब्ध नहीं</div>
                            )}
                          </div>

                          {/* 4. Money & Galla Status */}
                          <div
                            className={`sm:col-span-3 p-2 rounded-xl border flex flex-col justify-between ${
                              v.amountPaid > 0
                                ? 'bg-emerald-950/30 border-emerald-500/30'
                                : 'bg-amber-950/20 border-amber-500/30'
                            }`}
                          >
                            <div className={`text-[10px] font-bold ${v.amountPaid > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                              3. पैसे व गल्ला हिसाब:
                            </div>
                            {v.amountPaid > 0 ? (
                              <div className="text-base font-black text-emerald-400">₹{v.amountPaid} प्राप्त</div>
                            ) : (
                              <div className="text-xs font-bold text-amber-300">रकम कैप्चर नहीं हुई</div>
                            )}
                            <div
                              className={`text-[11px] font-bold flex items-center gap-1 ${
                                v.amountPaid > 0 ? 'text-emerald-200' : 'text-dark-300'
                              }`}
                            >
                              <CheckCircle2
                                className={`w-3 h-3 shrink-0 ${v.amountPaid > 0 ? 'text-emerald-400' : 'text-amber-400'}`}
                              />
                              <span>{v.gallaStatusText}</span>
                            </div>
                          </div>
                        </div>

                        {openPhotoId === v.id && (
                          <div className="pt-2 border-t border-dark-800">
                            {loadingPhotoId === v.id ? (
                              <div className="text-center py-4 text-[11px] text-dark-400">कैमरा फोटो लोड हो रही है...</div>
                            ) : (v.image || lazyPhotos[v.id]) ? (
                              <img
                                src={v.image || lazyPhotos[v.id]}
                                alt="Customer Visit Snapshot"
                                className="max-h-52 rounded-xl border border-dark-700 mx-auto object-contain"
                              />
                            ) : (
                              <div className="text-center py-3 text-[11px] text-dark-400">फोटो उपलब्ध नहीं</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* All-Camera & Slab Activity Reports */}
              {slabEvents.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-dark-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                      📹 सभी कैमरे व स्लैब गतिविधि ({slabEvents.length})
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-[10px]">
                      {(['ALL', 'Ch1', 'Ch2', 'Ch3', 'Ch4', 'Ch5'] as const).map((ch) => (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => setSlabFilter(ch)}
                          className={`px-2 py-0.5 rounded-md font-bold border transition-colors ${
                            slabFilter === ch
                              ? 'bg-emerald-600 text-white border-emerald-500'
                              : 'bg-dark-900 text-dark-300 border-dark-700 hover:text-white'
                          }`}
                        >
                          {ch === 'ALL' ? 'सभी' : ch}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {slabEvents
                      .filter((ev: any) => slabFilter === 'ALL' || String(ev.note || '').includes(slabFilter))
                      .slice(0, 40)
                      .map((ev: any, idx: number) => (
                      <div
                        key={ev.id || `slab-${idx}`}
                        className="bg-dark-900 border border-dark-800 rounded-xl p-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-mono font-bold text-[11px]">
                              ⏰ {hhmm(ev.time)}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold text-[10px]">
                              {ev.type}
                            </span>
                          </div>
                          <div className="text-white font-semibold truncate">{ev.note || 'स्लैब में गतिविधि'}</div>
                        </div>
                        {(ev.hasImage || (ev.image && String(ev.image).startsWith('data:image'))) && (
                          <button
                            type="button"
                            onClick={() => togglePhoto(`slab-${ev.id || idx}`, ev.id, ev.image)}
                            className="shrink-0 px-2.5 py-1 rounded-lg bg-dark-800 text-indigo-300 hover:text-white text-[11px] font-bold flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" /> फोटो
                          </button>
                        )}
                      </div>
                    ))}
                    {slabEvents.map((ev: any, idx: number) => {
                      const skey = `slab-${ev.id || idx}`;
                      const sImg = ev.image || lazyPhotos[skey];
                      return openPhotoId === skey ? (
                        <div key={`slab-img-${idx}`} className="p-2 bg-dark-900 rounded-xl border border-dark-700">
                          {loadingPhotoId === skey ? (
                            <div className="text-center py-4 text-[11px] text-dark-400">फोटो लोड हो रही है...</div>
                          ) : sImg ? (
                            <img
                              src={sImg}
                              alt="Slab Activity"
                              className="max-h-52 rounded-lg mx-auto object-contain"
                            />
                          ) : (
                            <div className="text-center py-3 text-[11px] text-dark-400">फोटो उपलब्ध नहीं</div>
                          )}
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <TriMatchReportModal isOpen={showTri} onClose={() => setShowTri(false)} />
    </div>
  );
};
