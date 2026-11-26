import React, { useState, useEffect, useRef } from 'react';
import API from '../../api';
import { parseVisitsFromTimeline } from './QuickReportModal';
import { 
  Play, Pause, FastForward, Calendar, 
  Clock, Video, RefreshCw, X, 
  AlertTriangle, HardDrive, Sparkles, Copy, Check
} from 'lucide-react';

interface CameraDevice {
  _id: string;
  name: string;
  channel?: number;
  ipAddress: string;
  locationType: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cameras: CameraDevice[];
}

export const DvrPlaybackModal: React.FC<Props> = ({ isOpen, onClose, cameras }) => {
  const [selectedCamId, setSelectedCamId] = useState<string>(cameras[0]?._id || '');
  const [playbackDate, setPlaybackDate] = useState<string>(
    new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [playbackStartTime, setPlaybackStartTime] = useState<string>('08:00');
  const [playbackEndTime, setPlaybackEndTime] = useState<string>('14:00');

  useEffect(() => {
    if ((!selectedCamId || !cameras.some((c) => c._id === selectedCamId)) && cameras.length > 0) {
      setSelectedCamId(cameras[0]._id);
    }
  }, [cameras, selectedCamId]);
  
  const [loading, setLoading] = useState(false);
  const [playbackInfo, setPlaybackInfo] = useState<any | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedRtsp, setCopiedRtsp] = useState(false);
  const [isAuditingFast, setIsAuditingFast] = useState(false);
  const [auditSummary, setAuditSummary] = useState<any | null>(null);
  const streamIntervalRef = useRef<any>(null);

  const [timeline, setTimeline] = useState<any | null>(null);
  const [eventIdx, setEventIdx] = useState(0);
  const [isScanningHdd, setIsScanningHdd] = useState(false);
  const scanPollRef = useRef<any>(null);
  const imgEvents: any[] = (timeline?.events || []).filter((e: any) => e.image && !String(e.image).startsWith('SCAN_REQ:'));

  // Slideshow over REAL recorded AI event frames of the chosen time window (not live feed)
  useEffect(() => {
    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    if (playbackInfo && isPlaying && imgEvents.length > 1) {
      streamIntervalRef.current = setInterval(() => {
        setEventIdx((i) => (i + 1) % imgEvents.length);
      }, 2500 / playbackSpeed);
    }
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, [playbackInfo, isPlaying, playbackSpeed, imgEvents.length]);

  const handleCopyRtsp = () => {
    if (!playbackInfo?.playbackRtspUrl) return;
    navigator.clipboard.writeText(playbackInfo.playbackRtspUrl);
    setCopiedRtsp(true);
    setTimeout(() => setCopiedRtsp(false), 2000);
  };

  const handleFastAiAudit = async () => {
    try {
      setIsAuditingFast(true);
      const [tiRes, dsRes, tlRes] = await Promise.all([
        API.get('/cameras/reports/time-interval', {
          params: { date: playbackDate, startTime: playbackStartTime, endTime: playbackEndTime },
        }).catch(() => ({ data: null })),
        API.get('/cameras/reports/daily-summary', {
          params: { date: playbackDate, startTime: playbackStartTime, endTime: playbackEndTime },
        }).catch(() => ({ data: null })),
        API.get('/cameras/playback/timeline', {
          params: { date: playbackDate, startTime: playbackStartTime, endTime: playbackEndTime, includeImages: '1' },
        }).catch(() => ({ data: null })),
      ]);

      if (tlRes.data) setTimeline(tlRes.data);
      const parsedVisits = parseVisitsFromTimeline(tlRes.data);
      const aiGallaSum = parsedVisits.reduce((s, v) => s + v.amountPaid, 0);
      const base = tiRes.data || {};
      const h = dsRes.data?.headline || {};
      const footfall = parsedVisits.reduce((s, v) => s + v.people, 0) || tlRes.data?.customers || h.customers || base.aiSurveillance?.totalFootfall || 0;
      const gallaOpens = parsedVisits.filter((v) => v.gallaDeposited).length || h.gallaOpenings || base.aiSurveillance?.drawerOpeningsCount || 0;
      const totalSalesVal = Math.max(aiGallaSum, Number(h.sales || base.financialSummary?.totalGrossSales || 0));

      setAuditSummary({
        ...base,
        parsedVisits,
        financialSummary: {
          totalGrossSales: totalSalesVal,
          totalCashCollected: Math.max(aiGallaSum, Number(h.cash || base.financialSummary?.totalCashCollected || 0)),
        },
        salesBreakdown: {
          milkSales: {
            totalLitres: base.salesBreakdown?.milkSales?.totalLitres || 0,
          },
        },
        aiSurveillance: {
          ...(base.aiSurveillance || {}),
          totalFootfall: footfall,
          drawerOpeningsCount: gallaOpens,
        },
      });
    } catch (err: any) {
      setErrorMessage('फास्ट AI ऑडिट लोड करने में समस्या आई।');
    } finally {
      setIsAuditingFast(false);
    }
  };

  const runPlaybackQuery = async (camIdOverride?: string) => {
    const activeCamId = camIdOverride || selectedCamId || cameras[0]?._id || '';
    if (!activeCamId) {
      setErrorMessage('कृपया पहले एक कैमरा चुनें।');
      return;
    }
    if (activeCamId !== selectedCamId) setSelectedCamId(activeCamId);

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await API.get('/cameras/playback/search', {
        params: {
          cameraId: activeCamId,
          date: playbackDate,
          startTime: playbackStartTime,
          endTime: playbackEndTime,
        },
      });

      setPlaybackInfo(res.data);
      setIsPlaying(true);
      setEventIdx(0);

      // Load REAL recorded AI events for the chosen window + auto-run report
      const tl = await API.get('/cameras/playback/timeline', {
        params: { date: playbackDate, startTime: playbackStartTime, endTime: playbackEndTime, includeImages: '1' },
      });
      setTimeline(tl.data);
      handleFastAiAudit();

      const validImgs = (tl.data?.events || []).filter((ev: any) => ev.image && !String(ev.image).startsWith('SCAN_REQ:'));
      if (validImgs.length < 2) {
        const ch = res.data?.channel || cameras.find((c) => c._id === selectedCamId)?.channel || 1;
        setIsScanningHdd(true);
        API.post('/cameras/evaluate-edge-rules', {
          footfallArrivals: 1,
          footfallSnapshot: `SCAN_REQ:${ch}|${playbackDate}|${playbackStartTime}|${playbackEndTime}`,
        }).catch(() => {});

        if (scanPollRef.current) clearInterval(scanPollRef.current);
        let tries = 0;
        scanPollRef.current = setInterval(async () => {
          tries += 1;
          try {
            const tl2 = await API.get('/cameras/playback/timeline', {
              params: { date: playbackDate, startTime: playbackStartTime, endTime: playbackEndTime, includeImages: '1' },
            });
            setTimeline(tl2.data);
            const imgs2 = (tl2.data?.events || []).filter((ev: any) => ev.image && !String(ev.image).startsWith('SCAN_REQ:'));
            if (imgs2.length >= 4 || tries >= 6) {
              clearInterval(scanPollRef.current);
              setIsScanningHdd(false);
              handleFastAiAudit();
            }
          } catch {
            if (tries >= 6) {
              clearInterval(scanPollRef.current);
              setIsScanningHdd(false);
            }
          }
        }, 3000);
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'DVR हार्ड डिस्क से रिकॉर्डिंग ट्रैक नहीं मिल सका।');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && cameras.length > 0) {
      runPlaybackQuery(selectedCamId || cameras[0]._id);
    }
  }, [isOpen, cameras.length]);

  if (!isOpen) return null;

  const handleSearchPlayback = async (e: React.FormEvent) => {
    e.preventDefault();
    await runPlaybackQuery();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-dark-900 border border-dark-700 w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-dark-950 via-indigo-950/40 to-dark-950 border-b border-dark-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Hikvision DVR इन-ऐप रिकॉर्डिंग प्लेबैक (HDD Playback)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  No Hikvision App Needed
                </span>
              </h2>
              <p className="text-xs text-dark-300">
                DVR की हार्ड डिस्क से किसी भी तारीख और समय की रिकॉर्डिंग सीधे अपनी ऐप पर देखें।
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls Bar */}
        <form onSubmit={handleSearchPlayback} className="p-4 bg-dark-950 border-b border-dark-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Camera Channel */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-dark-400 uppercase">कैमरा चैनल:</label>
              <select
                value={selectedCamId}
                onChange={(e) => setSelectedCamId(e.target.value)}
                className="block px-3 py-1.5 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white font-medium focus:outline-none focus:border-indigo-500"
              >
                {cameras.map((c) => (
                  <option key={c._id} value={c._id}>
                    Ch #{c.channel || 1}: {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-dark-400 uppercase">तारीख:</label>
              <div className="flex items-center gap-1.5 bg-dark-900 px-3 py-1.5 rounded-xl border border-dark-800 text-xs text-white">
                <Calendar className="w-3.5 h-3.5 text-dark-400" />
                <input
                  type="date"
                  value={playbackDate}
                  onChange={(e) => setPlaybackDate(e.target.value)}
                  className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
                />
              </div>
            </div>

            {/* Time Window */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-dark-400 uppercase">समय अवधि:</label>
              <div className="flex items-center gap-1.5 bg-dark-900 px-3 py-1.5 rounded-xl border border-dark-800 text-xs text-white">
                <Clock className="w-3.5 h-3.5 text-dark-400" />
                <input
                  type="time"
                  value={playbackStartTime}
                  onChange={(e) => setPlaybackStartTime(e.target.value)}
                  className="bg-transparent text-white font-medium focus:outline-none"
                />
                <span className="text-dark-500">से</span>
                <input
                  type="time"
                  value={playbackEndTime}
                  onChange={(e) => setPlaybackEndTime(e.target.value)}
                  className="bg-transparent text-white font-medium focus:outline-none"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="py-2 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>खोज रहे हैं...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>DVR से खोजें व चलाएं</span>
              </>
            )}
          </button>
        </form>

        {/* Video Player Viewport */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 flex flex-col justify-between">
          
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Screen */}
          <div className="relative rounded-3xl overflow-hidden bg-black aspect-video max-h-[55vh] mx-auto w-full border border-dark-800 shadow-2xl flex items-center justify-center group">
            
            {playbackInfo ? (
              imgEvents.length > 0 ? (
                <>
                  <img
                    src={imgEvents[eventIdx % imgEvents.length].image}
                    alt="AI Recorded Frame"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-3 left-3 px-3 py-1 rounded-xl bg-black/75 text-xs font-mono text-white border border-white/10 flex items-center gap-2">
                    <span>फ्रेम {(eventIdx % imgEvents.length) + 1}/{imgEvents.length}</span>
                    <span>•</span>
                    <span>{new Date(imgEvents[eventIdx % imgEvents.length].time).toLocaleTimeString('hi-IN')}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-bold">
                      {imgEvents[eventIdx % imgEvents.length].count > 0
                        ? `+${imgEvents[eventIdx % imgEvents.length].count} ग्राहक`
                        : '0 ग्राहक'}
                    </span>
                  </div>
                </>
              ) : isScanningHdd ? (
                <div className="text-center p-8 space-y-3 max-w-md">
                  <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
                  <p className="text-sm text-white font-bold">DVR हार्ड डिस्क से {playbackDate} ({playbackStartTime} - {playbackEndTime}) की रिकॉर्डिंग निकाली जा रही है...</p>
                  <p className="text-xs text-dark-400">
                    YOLO AI हर फ्रेम में ग्राहक गिन रहा है। 5–10 सेकंड में असली DVR फ्रेम और रिपोर्ट स्क्रीन पर आ जाएगी।
                  </p>
                </div>
              ) : (
                <div className="text-center p-8 space-y-2 max-w-md">
                  <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                  <p className="text-sm text-white font-bold">इस समय का कोई AI रिकॉर्ड नहीं मिला</p>
                  <p className="text-xs text-dark-400">
                    {timeline?.recorderFirstDataAt
                      ? `AI रिकॉर्डर का पहला डेटा ${new Date(timeline.recorderFirstDataAt).toLocaleString('hi-IN')} से है। उससे पहले का डेटा सिर्फ़ DVR में है — उसे "RTSP कॉपी" से VLC में देखें।`
                      : 'AI रिकॉर्डर (edge_ai) अभी तक चालू नहीं हुआ, इसलिए कोई डेटा सेव नहीं है। उसे चालू करने के बाद से हर ग्राहक का समय और फोटो यहाँ दिखेगा।'}
                  </p>
                </div>
              )
            ) : (
              <div className="text-center p-8 space-y-3">
                <Video className="w-12 h-12 text-dark-600 mx-auto" />
                <h4 className="text-sm font-bold text-white">DVR हार्ड डिस्क प्लेबैक प्लेयर</h4>
                <p className="text-xs text-dark-400 max-w-md mx-auto">
                  ऊपर से कैमरा चैनल, तारीख और समय चुनकर "DVR से खोजें व चलाएं" पर क्लिक करें। Hikvision Turbo HD DVR से रिकॉर्डेड वीडियो लोड हो जाएगा।
                </p>
              </div>
            )}

            {/* Overlays */}
            {playbackInfo && (
              <>
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-bold text-white border border-white/10 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>DVR PLAYBACK CH #{playbackInfo.channel}</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-indigo-600/80 backdrop-blur-md text-[10px] font-mono font-bold text-white">
                    {playbackSpeed}x SPEED
                  </span>
                </div>

                <div className="absolute top-4 right-4 px-3 py-1 rounded-xl bg-black/70 backdrop-blur-md text-xs font-mono text-dark-300 border border-white/10">
                  {playbackDate} • {playbackStartTime} - {playbackEndTime}
                </div>
              </>
            )}
          </div>

          {/* Instant AI Audit Results for this time window */}
          {auditSummary && (
            <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 space-y-2 text-xs">
              <div className="flex items-center justify-between text-indigo-300 font-bold">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  फास्ट AI ऑडिट परिणाम ({playbackDate} • {playbackStartTime} से {playbackEndTime})
                </span>
                <span className="text-white">
                  कुल बिक्री: ₹{auditSummary.financialSummary?.totalGrossSales || 0}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-dark-300">
                <div className="bg-dark-900/60 p-2 rounded-xl border border-dark-800">
                  <span className="text-[10px] text-dark-500 block">ग्राहक फुटफॉल</span>
                  <span className="font-bold text-white text-sm">{timeline?.customers ?? auditSummary.aiSurveillance?.totalFootfall ?? 0} ग्राहक</span>
                </div>
                <div className="bg-dark-900/60 p-2 rounded-xl border border-dark-800">
                  <span className="text-[10px] text-dark-500 block">दूध बिक्री</span>
                  <span className="font-bold text-white text-sm">{auditSummary.salesBreakdown?.milkSales?.totalLitres || 0} L</span>
                </div>
                <div className="bg-dark-900/60 p-2 rounded-xl border border-dark-800">
                  <span className="text-[10px] text-dark-500 block">कैश गल्ला</span>
                  <span className="font-bold text-emerald-400 text-sm">₹{auditSummary.financialSummary?.totalCashCollected || 0}</span>
                </div>
                <div className="bg-dark-900/60 p-2 rounded-xl border border-dark-800">
                  <span className="text-[10px] text-dark-500 block">गल्ला स्थिति</span>
                  <span className="font-bold text-amber-400 text-sm">{auditSummary.aiSurveillance?.drawerOpeningsCount || 0} बार खुला</span>
                </div>
              </div>
            </div>
          )}

          {/* Playback Controls Toolbar */}
          {playbackInfo && (
            <div className="p-3.5 rounded-2xl bg-dark-950 border border-dark-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-md"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => setPlaybackSpeed(playbackSpeed === 1 ? 2 : playbackSpeed === 2 ? 4 : 1)}
                  className="px-3 py-2 rounded-xl bg-dark-900 border border-dark-800 hover:border-indigo-500 text-dark-300 hover:text-white font-mono font-bold transition-all"
                  title="स्पीड बदलें"
                >
                  <FastForward className="w-3.5 h-3.5 inline mr-1" />
                  <span>{playbackSpeed}x</span>
                </button>
              </div>

              <div className="flex items-center gap-2 font-mono text-[11px] text-dark-400">
                <span>RTSP Track:</span>
                <code className="text-dark-300 bg-dark-900 px-2 py-1 rounded-lg border border-dark-800 max-w-xs truncate">
                  {playbackInfo.playbackRtspUrl}
                </code>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFastAiAudit}
                  disabled={isAuditingFast}
                  className="py-2 px-3 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 font-bold flex items-center gap-1.5 transition-all text-xs"
                >
                  {isAuditingFast ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>⚡ 3-सेकंड फास्ट AI ऑडिट</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyRtsp}
                  className="py-2 px-3 rounded-xl bg-dark-900 hover:bg-dark-800 text-white font-bold flex items-center gap-1.5 border border-dark-800 transition-all text-xs"
                  title="VLC / MX Player में 1080p वीडियो चलाने के लिए RTSP लिंक कॉपी करें"
                >
                  {copiedRtsp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedRtsp ? 'लिंक कॉपी हुआ!' : 'RTSP कॉपी'}</span>
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-dark-950 border-t border-dark-800 flex items-center justify-between shrink-0">
          <p className="text-xs text-dark-400">
            DVR IP: {cameras.find((c) => c._id === selectedCamId)?.ipAddress || cameras[0]?.ipAddress || 'Auto'} • हार्ड डिस्क स्टोरेज सुरक्षित रूप से इन-ऐप स्ट्रीम हो रहा है।
          </p>
          <button
            onClick={onClose}
            className="py-2 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md"
          >
            बंद करें
          </button>
        </div>

      </div>
    </div>
  );
};
