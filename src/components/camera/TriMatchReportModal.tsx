import React, { useEffect, useState, useCallback } from 'react';
import API from '../../api';
import { X, RefreshCw, Video, Mic, Receipt, DoorOpen, CheckCircle2, Eye, Radio } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split('T')[0];

const VERDICT: Record<string, { label: string; cls: string; bad: boolean }> = {
  MATCH:         { label: '✅ तीनों का पक्का मेल',   cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300', bad: false },
  POS_ONLY:      { label: '🧾 बिल कटा (ऑडियो शांत)', cls: 'bg-sky-500/10 border-sky-500/30 text-sky-300',             bad: false },
  AMOUNT_DIFF:   { label: '⚠️ ऑडियो व बिल रकम अलग',  cls: 'bg-amber-500/10 border-amber-500/30 text-amber-300',       bad: true },
  AUDIO_NO_BILL: { label: '🚨 ऑडियो में सौदा, बिल नहीं', cls: 'bg-rose-500/10 border-rose-500/30 text-rose-300',       bad: true },
  GALLA_NO_BILL: { label: '🚨 गल्ला खुला, बिल नहीं',  cls: 'bg-rose-500/10 border-rose-500/30 text-rose-300',          bad: true },
  NO_PURCHASE:   { label: '👀 ग्राहक आया (खरीद नहीं)', cls: 'bg-dark-800 border-dark-700 text-dark-300',               bad: false },
};

const hhmm = (d: string) => new Date(d).toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const VisitPhoto: React.FC<{ id?: string; inlineImg?: string | null }> = ({ id, inlineImg }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [tried, setTried] = useState(false);

  const load = async () => {
    if (inlineImg) {
      setOpen(!open);
      return;
    }
    if (!id) return;
    setTried(true);
    try {
      const r = await API.get(`/cameras/audit-log/${id}/image`, { responseType: 'blob' });
      setUrl(URL.createObjectURL(r.data));
      setOpen(true);
    } catch { /* no image */ }
  };

  const activeImg = inlineImg || url;
  return (
    <div className="space-y-1">
      <button onClick={load} className="text-[10px] text-indigo-300 hover:text-indigo-200 flex items-center gap-1">
        <Eye className="w-3 h-3" /> {open && activeImg ? 'फोटो छुपाएँ' : tried && !activeImg ? 'फोटो नहीं है' : 'कैमरा फोटो देखें'}
      </button>
      {open && activeImg && (
        <img src={activeImg} alt="visit" className="w-full max-h-36 object-cover rounded-lg border border-dark-700" />
      )}
    </div>
  );
};

const FAKE_CYCLE_QUOTES = new Set([
  'भैया ₹30 का खुला दूध दे दो',
  'भैया ₹20 का दूध दे दो',
  'भैया ₹40 का छाछ व दूध पैकेट दे दो',
  'भैया ₹60 का खुला दूध दे दो',
  'भैया ₹25 का दही दे दो',
  'भैया ₹10 का दूध दे दो',
]);

function buildTriMatchFromTimeline(tlData: any, tiData: any, date: string, startTime: string, endTime: string) {
  const events: any[] = (tlData?.events || []).filter((e: any) => !String(e.image || '').startsWith('SCAN_REQ:') && !String(e.image || '').startsWith('AUDIO_REQ:'));
  const faceEvents = events.filter((e: any) => e.type === 'FACE_VISIT');
  const gallaEvents = events.filter((e: any) => e.type === 'GALLA_ALERT' || e.type === 'CASH_DRAWER_MISMATCH');
  const micEvents = events.filter((e: any) => e.type === 'MULTI_MIC_ALERT');

  const visits = faceEvents.map((e: any, idx: number) => {
    const rawNote: string = e.note || '';
    if (rawNote.startsWith('TRI_JSON:')) {
      try {
        const parsed = JSON.parse(rawNote.slice('TRI_JSON:'.length));
        const rawQuote = String(parsed.audioQuote || parsed.audio?.[0]?.text || '').trim();
        const isLegacyFake = FAKE_CYCLE_QUOTES.has(rawQuote) && Number(parsed.pos?.total || 0) === 0;
        const cleanAudio = isLegacyFake
          ? []
          : (parsed.audio || []).filter((a: any) => a?.text && a.text !== 'ऑडियो कैप्चर नहीं हुआ' && !FAKE_CYCLE_QUOTES.has(String(a.text).trim()));
        const cleanGalla = isLegacyFake ? [] : (parsed.galla || []);
        const cleanHeard = isLegacyFake ? null : (parsed.heardAmount || null);
        const cleanVerdict = isLegacyFake ? 'NO_PURCHASE' : (parsed.verdict || 'NO_PURCHASE');
        const cleanNote = isLegacyFake
          ? 'ग्राहक काउंटर पर आया (ऑडियो व बिल कैप्चर नहीं हुआ)।'
          : (parsed.note || 'ग्राहक काउंटर पर आया।');
        return {
          id: parsed.id || `v-${idx}`,
          time: e.time,
          people: e.count || parsed.people || 1,
          image: e.image || null,
          video: { arrived: true, people: e.count || parsed.people || 1 },
          audio: cleanAudio,
          pos: parsed.pos || { bills: [], total: 0 },
          galla: cleanGalla,
          heardAmount: cleanHeard,
          verdict: cleanVerdict,
          note: cleanNote,
        };
      } catch { /* fallback below */ }
    }

    const vt = new Date(e.time).getTime();
    const attachedGalla = gallaEvents
      .filter((g: any) => {
        const gt = new Date(g.time).getTime();
        return gt >= vt - 20000 && gt <= vt + 150000;
      })
      .map((g: any) => ({ at: g.time, billed: g.type === 'GALLA_ALERT' }));

    const attachedAudio = micEvents
      .filter((m: any) => {
        const mt = new Date(m.time).getTime();
        return mt >= vt - 20000 && mt <= vt + 150000;
      })
      .map((m: any) => {
        const n: string = m.note || '';
        if (n.startsWith('AUDIO_STT|')) {
          try {
            return JSON.parse(n.slice('AUDIO_STT|'.length));
          } catch { /* ignore */ }
        }
        return { at: m.time, text: n, amounts: [], items: [] };
      });

    const heard: number[] = attachedAudio.flatMap((a: any) => a.amounts || []);
    const heardAmt = heard.length ? heard[heard.length - 1] : 0;
    const hasAudio = heard.length > 0 || attachedAudio.some((a: any) => (a.items || []).length > 0 || a.text);
    const gallaOpen = attachedGalla.length > 0;

    let verdict = 'NO_PURCHASE';
    let note = 'ग्राहक काउंटर पर आया (कोई खरीद/बिल दर्ज नहीं)।';
    if (hasAudio) {
      verdict = 'AUDIO_NO_BILL';
      note = heardAmt ? `ग्राहक ने ₹${heardAmt} की बात की, पर कोई POS बिल नहीं कटा।` : 'ऑडियो में बातचीत रिकॉर्ड हुई, पर कोई POS बिल नहीं कटा।';
    } else if (gallaOpen) {
      verdict = 'GALLA_NO_BILL';
      note = 'गल्ला खुला, पर कोई POS बिल नहीं कटा।';
    }

    return {
      id: `v-${idx}`,
      time: e.time,
      people: e.count || 1,
      image: e.image || null,
      video: { arrived: true, people: e.count || 1 },
      audio: attachedAudio,
      pos: { bills: [], total: 0 },
      galla: attachedGalla,
      heardAmount: heardAmt || null,
      verdict,
      note,
    };
  });

  const count = (vd: string) => visits.filter((v: any) => v.verdict === vd).length;
  const customers = visits.reduce((s: number, v: any) => s + (v.people || 1), 0);
  const posTotalFromTi = tiData?.financialSummary?.totalGrossSales || 0;
  const posBillsFromTi = (tiData?.salesBreakdown?.milkSales?.entriesCount || 0) + (tiData?.salesBreakdown?.productSales?.totalOrdersCount || 0);
  const posTotalFromVisits = visits.reduce((s: number, v: any) => s + (v.pos?.total || 0), 0);
  const audioTotal = visits.reduce((s: number, v: any) => s + (v.heardAmount || 0), 0);

  return {
    success: true,
    window: { date, startTime, endTime },
    summary: {
      customers,
      visits: visits.length,
      posBills: Math.max(posBillsFromTi, visits.reduce((s: number, v: any) => s + (v.pos?.bills?.length || 0), 0)),
      posTotal: Math.max(posTotalFromTi, posTotalFromVisits),
      audioHeardTotal: audioTotal,
      audioClips: visits.reduce((s: number, v: any) => s + (v.audio?.length || 0), 0),
      matched: count('MATCH'),
      posOnly: count('POS_ONLY'),
      amountDiff: count('AMOUNT_DIFF'),
      audioNoBill: count('AUDIO_NO_BILL'),
      gallaNoBill: count('GALLA_NO_BILL'),
      noPurchase: count('NO_PURCHASE'),
      orphanBills: 0,
      orphanAudio: 0,
    },
    visits,
    orphanBills: [],
    orphanAudio: [],
  };
}

/** Visit-by-visit Video + Audio + POS reconciliation for the whole shop day. */
export const TriMatchReportModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [date, setDate] = useState(today());
  const [start, setStart] = useState('06:00');
  const [end, setEnd] = useState('22:00');
  const [onlyBad, setOnlyBad] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanningAudio, setScanningAudio] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      try {
        const r = await API.get('/cameras/reports/tri-match', { params: { date, startTime: start, endTime: end } });
        setData(r.data);
        return;
      } catch (innerErr: any) {
        if (innerErr.response?.status !== 404) throw innerErr;
      }
      // Fallback to already-deployed timeline + time-interval endpoints
      const [tlRes, tiRes] = await Promise.all([
        API.get('/cameras/playback/timeline', { params: { date, startTime: start, endTime: end } }),
        API.get('/cameras/reports/time-interval', { params: { date, startTime: start, endTime: end } }).catch(() => ({ data: null })),
      ]);
      setData(buildTriMatchFromTimeline(tlRes.data, tiRes.data, date, start, end));
    } catch (e: any) {
      setErr(e.response?.data?.message || 'रिपोर्ट लोड नहीं हो सकी।');
    } finally {
      setLoading(false);
    }
  }, [date, start, end]);

  const handleScanDvrVideoAndAudio = async () => {
    setScanningAudio(true);
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
        setScanningAudio(false);
      }, 8000);
    } catch {
      setScanningAudio(false);
    }
  };

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);
  if (!isOpen) return null;

  const s = data?.summary;
  const rows = (data?.visits || []).filter((v: any) => !onlyBad || VERDICT[v.verdict]?.bad);

  const Box = ({ label, value, tone }: any) => (
    <div className="bg-dark-900 border border-dark-800 rounded-xl p-2 text-center">
      <div className={`text-lg font-black ${tone}`}>{value}</div>
      <div className="text-[10px] text-dark-400">{label}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-dark-950 border border-dark-700 w-full max-w-5xl rounded-3xl shadow-2xl my-2">
        <div className="p-4 flex items-center justify-between border-b border-dark-800">
          <div>
            <h2 className="text-base font-black text-white">🔍 हर ग्राहक का वीडियो + ऑडियो + POS मिलान (Tri-Match)</h2>
            <p className="text-[11px] text-dark-400">हर विज़िट अलग-अलग: कैमरे ने क्या देखा, माइक ने क्या सुना, बिल में क्या कटा, और तीनों का मिलान।</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-dark-800 text-dark-300 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-dark-900 border border-dark-800 rounded-xl px-2 py-1.5 text-white" />
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="bg-dark-900 border border-dark-800 rounded-xl px-2 py-1.5 text-white" />
            <span className="text-dark-500">से</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="bg-dark-900 border border-dark-800 rounded-xl px-2 py-1.5 text-white" />
            <label className="flex items-center gap-1.5 text-dark-300 ml-1">
              <input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} /> सिर्फ़ गड़बड़ वाले
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={handleScanDvrVideoAndAudio} disabled={scanningAudio}
                className="px-3 py-1.5 rounded-xl bg-teal-600/20 border border-teal-500/40 text-teal-300 font-bold flex items-center gap-1.5">
                <Radio className={`w-3.5 h-3.5 ${scanningAudio ? 'animate-ping' : ''}`} />
                {scanningAudio ? 'DVR स्कैन चालू...' : 'DVR से ऑडियो+वीडियो स्कैन'}
              </button>
              <button onClick={load} disabled={loading} className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> रिफ्रेश
              </button>
            </div>
          </div>

          {err && <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{err}</div>}

          {s && (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <Box label="ग्राहक (वीडियो)" value={s.customers} tone="text-sky-400" />
                <Box label="बिल (POS)" value={s.posBills} tone="text-violet-400" />
                <Box label="POS कुल" value={`₹${s.posTotal}`} tone="text-emerald-400" />
                <Box label="ऑडियो में सुना" value={`₹${s.audioHeardTotal}`} tone="text-teal-400" />
                <Box label="✅ पक्का मेल" value={s.matched} tone="text-emerald-400" />
                <Box label="🚨 गड़बड़ / बिना बिल" value={s.audioNoBill + s.gallaNoBill + s.amountDiff} tone="text-rose-400" />
              </div>

              <div className="hidden sm:grid grid-cols-12 gap-2 px-3 text-[10px] font-bold text-dark-500 uppercase">
                <div className="col-span-2">समय (Timing)</div>
                <div className="col-span-3 flex items-center gap-1"><Video className="w-3 h-3 text-sky-400" /> 1. वीडियो से कैप्चर</div>
                <div className="col-span-3 flex items-center gap-1"><Mic className="w-3 h-3 text-teal-400" /> 2. ऑडियो से कैप्चर</div>
                <div className="col-span-2 flex items-center gap-1"><Receipt className="w-3 h-3 text-violet-400" /> 3. POS बिल</div>
                <div className="col-span-2">तीनों का मिलान</div>
              </div>

              <div className="space-y-2 max-h-[58vh] overflow-y-auto pr-1">
                {rows.length === 0 && (
                  <div className="text-center text-xs text-dark-400 p-6 border border-dashed border-dark-700 rounded-2xl">
                    {s.visits === 0 ? 'इस समय कोई ग्राहक रिकॉर्ड नहीं हुआ। ऊपर "DVR से ऑडियो+वीडियो स्कैन" दबाएँ।' : 'कोई गड़बड़ नहीं मिली 🎉'}
                  </div>
                )}
                {rows.map((v: any) => {
                  const vd = VERDICT[v.verdict] || VERDICT.NO_PURCHASE;
                  return (
                    <div key={v.id} className="bg-dark-900 border border-dark-800 rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                      <div className="sm:col-span-2 font-mono text-white font-bold">{hhmm(v.time)}</div>

                      <div className="sm:col-span-3 text-dark-300 space-y-1">
                        <div className="flex items-center gap-1 text-sky-300 font-semibold">
                          <Video className="w-3 h-3 text-sky-400" /> +{v.people} ग्राहक काउंटर पर
                        </div>
                        {v.galla && v.galla.length > 0 && (
                          <div className="flex items-center gap-1 text-amber-300">
                            <DoorOpen className="w-3 h-3" /> गल्ला खुला
                          </div>
                        )}
                        <VisitPhoto id={v.id} inlineImg={v.image} />
                      </div>

                      <div className="sm:col-span-3 text-dark-300 space-y-1">
                        <div className="flex items-center gap-1 sm:hidden text-teal-400"><Mic className="w-3 h-3" /> ऑडियो</div>
                        {(!v.audio || v.audio.length === 0) && <span className="text-dark-500">कोई बातचीत नहीं / शांत</span>}
                        {(v.audio || []).map((a: any, i: number) => (
                          <div key={i} className="bg-dark-950 rounded-lg p-1.5 border border-dark-800">
                            <div className="text-white">“{a.text}”</div>
                            {((a.amounts && a.amounts.length > 0) || (a.items && a.items.length > 0)) && (
                              <div className="text-[10px] text-teal-300 mt-0.5 font-semibold">
                                {(a.items || []).map((it: any) => `${it.name}${it.qty ? ' (' + it.qty + ')' : ''}`).join(', ')}
                                {a.amounts && a.amounts.length > 0 && ` • रकम: ₹${a.amounts.join(', ₹')}`}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="sm:col-span-2 text-dark-300 space-y-1">
                        <div className="flex items-center gap-1 sm:hidden text-violet-400"><Receipt className="w-3 h-3" /> POS</div>
                        {(!v.pos?.bills || v.pos.bills.length === 0) && <span className="text-dark-500">कोई बिल नहीं (₹0)</span>}
                        {(v.pos?.bills || []).map((b: any) => (
                          <div key={b.id} className="bg-dark-950 rounded-lg p-1.5 border border-dark-800">
                            <span className="text-emerald-400 font-bold">₹{b.amount}</span>
                            <span className="text-dark-300 block text-[10px]">{b.label} ({b.mode})</span>
                          </div>
                        ))}
                      </div>

                      <div className="sm:col-span-2">
                        <div className={`inline-block px-2 py-1 rounded-lg border font-bold text-[11px] ${vd.cls}`}>{vd.label}</div>
                        <div className="text-[10px] text-dark-400 mt-1">{v.note}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-start gap-1.5 text-[10px] text-dark-500">
                <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                <span>हर ग्राहक विज़िट के ±90 सेकंड के भीतर वीडियो (YOLO), काउंटर माइक ऑडियो (Whisper Hindi AI) और POS बिल का ऑटोमैटिक मिलान।</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
