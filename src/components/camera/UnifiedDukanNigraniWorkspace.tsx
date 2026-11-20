import React, { useState, useEffect, useRef, useCallback } from 'react';
import API from '../../api';
import {
  Video, Upload, Camera, Mic, MicOff, Volume2, VolumeX,
  Play, Pause, Trash2, RotateCcw, ShieldAlert,
  FileBarChart2, HardDrive, Settings, Palette, ArrowLeftRight
} from 'lucide-react';

type ZoneType = 'gate' | 'customer' | 'tank' | 'ignore' | 'galla';

interface DrawnZone {
  id: string;
  type: ZoneType;
  name: string;
  // Normalized coordinates (0..1) so resizing canvas never shifts zones
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  // Tank/item specific
  capacity?: number;
  currentEstimate?: number;
  baselineColor?: [number, number, number];
  // Gate specific
  outSign?: 1 | -1;
}

interface ActivityLogItem {
  id: string;
  clockTime: string;
  videoStamp: string;
  zoneName: string;
  message: string;
  tone: 'info' | 'customer' | 'galla' | 'voice' | 'alert';
}

interface PendingVoiceOrder {
  id: string;
  amount: number;
  text: string;
  createdAt: number;
  matched: boolean;
}

interface Props {
  cameras: any[];
  onOpenTimeGalla?: () => void;
  onOpenDvrPlayback?: () => void;
  onOpenCameraSettings?: () => void;
}

const DEFAULT_RATE_LIST = `दूध=60
दही=50
पनीर=400
घी=700
छाछ=20`;

const HINDI_NUMS: Record<string, number> = {
  'पाव': 0.25, 'आधा': 0.5, 'आधी': 0.5, 'एक': 1, 'दो': 2, 'तीन': 3,
  'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9,
  'दस': 10, 'पंद्रह': 15, 'बीस': 20, 'पच्चीस': 25, 'तीस': 30,
  'चालीस': 40, 'पचास': 50, 'साठ': 60, 'सत्तर': 70, 'अस्सी': 80,
  'नब्बे': 90, 'सौ': 100,
};

const ZONE_META: Record<ZoneType, { label: string; short: string; color: string; defaultPrefix: string }> = {
  gate:     { label: 'गेट लाइन (चोरी अलर्ट)',   short: 'गेट',     color: '#059669', defaultPrefix: 'गेट' },
  customer: { label: 'ग्राहक ज़ोन',             short: 'ग्राहक',  color: '#2563EB', defaultPrefix: 'ग्राहक' },
  tank:     { label: 'टंकी / सामान ज़ोन',        short: 'टंकी',    color: '#0D9488', defaultPrefix: 'टंकी' },
  ignore:   { label: 'अनदेखा ज़ोन (सड़क/ट्रैफ़िक)', short: 'अनदेखा', color: '#71717A', defaultPrefix: 'अनदेखा' },
  galla:    { label: 'गल्ला ज़ोन',               short: 'गल्ला',   color: '#D97706', defaultPrefix: 'गल्ला' },
};

const formatVideoTime = (sec: number) => {
  if (!isFinite(sec) || sec < 0) return 'लाइव';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `वीडियो ${m}:${s.toString().padStart(2, '0')}`;
};

const nowClock = () =>
  new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase();

export const UnifiedDukanNigraniWorkspace: React.FC<Props> = ({
  cameras,
  onOpenTimeGalla,
  onOpenDvrPlayback,
  onOpenCameraSettings,
}) => {
  // Video source state
  const [sourceMode, setSourceMode] = useState<'FILE' | 'WEBCAM' | 'DVR'>('FILE');
  const [selectedCamId, setSelectedCamId] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [dvrFrameUrl, setDvrFrameUrl] = useState<string | null>(null);
  const [dvrError, setDvrError] = useState<string | null>(null);

  // Drawing tool state
  const [drawTool, setDrawTool] = useState<ZoneType>('gate');
  const [zoneNameInput, setZoneNameInput] = useState('गेट 1');
  const [tankCapacityInput, setTankCapacityInput] = useState('10');
  const [zones, setZones] = useState<DrawnZone[]>(() => {
    try {
      const saved = localStorage.getItem('dukan_nigrani_zones_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [dragRect, setDragRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [standingZones, setStandingZones] = useState<Record<string, boolean>>({});

  // Today's Counters ("आज का हिसाब")
  const [gateInCount, setGateInCount] = useState(0);
  const [gateOutCount, setGateOutCount] = useState(0);
  const [theftAlertCount, setTheftAlertCount] = useState(0);
  const [customerZoneCount, setCustomerZoneCount] = useState(0);
  const [gallaMotionCount, setGallaMotionCount] = useState(0);
  const [enteredCash, setEnteredCash] = useState(0);
  const [cashInput, setCashInput] = useState('');

  // Voice & Rate List state
  const [micActive, setMicActive] = useState(false);
  const [lastHeardText, setLastHeardText] = useState('');
  const [rateListText, setRateListText] = useState<string>(() => {
    return localStorage.getItem('dukan_nigrani_rates_v1') || DEFAULT_RATE_LIST;
  });
  const [matchedVoiceCash, setMatchedVoiceCash] = useState(0);
  const [suspiciousVoiceCash, setSuspiciousVoiceCash] = useState(0);

  // Activity Log
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);

  // Refs for real-time 10fps processing loop
  const videoRef = useRef<HTMLVideoElement>(null);
  const dvrImgRef = useRef<HTMLImageElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);

  // Zone runtime motion tracking refs
  const zonesRef = useRef<DrawnZone[]>(zones);
  const zoneStateRef = useRef<Record<string, {
    motionStart: number;
    countedThisPresence: boolean;
    lastTriggerAt: number;
    prevCentroidSide?: number;
  }>>({});
  const pendingVoiceRef = useRef<PendingVoiceOrder[]>([]);
  const lastGallaEventRef = useRef<number>(0);
  const rateListRef = useRef<string>(rateListText);

  useEffect(() => {
    zonesRef.current = zones;
    try {
      localStorage.setItem('dukan_nigrani_zones_v1', JSON.stringify(zones));
    } catch { /* ignore */ }
  }, [zones]);

  useEffect(() => {
    rateListRef.current = rateListText;
    try {
      localStorage.setItem('dukan_nigrani_rates_v1', rateListText);
    } catch { /* ignore */ }
  }, [rateListText]);

  useEffect(() => {
    if (cameras.length > 0 && !selectedCamId) {
      setSelectedCamId(cameras[0]._id);
    }
  }, [cameras, selectedCamId]);

  // Auto-update default zone name when switching drawing tool
  const handleSelectTool = (tool: ZoneType) => {
    setDrawTool(tool);
    const sameCount = zones.filter((z) => z.type === tool).length + 1;
    setZoneNameInput(`${ZONE_META[tool].defaultPrefix} ${sameCount}`);
  };

  const getVideoStamp = useCallback(() => {
    if (sourceMode === 'FILE' && videoRef.current) {
      return formatVideoTime(videoRef.current.currentTime);
    }
    return sourceMode === 'DVR' ? 'लाइव DVR' : 'लाइव वेबकैम';
  }, [sourceMode]);

  const appendLog = useCallback((zoneName: string, message: string, tone: ActivityLogItem['tone'] = 'info') => {
    const entry: ActivityLogItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      clockTime: nowClock(),
      videoStamp: getVideoStamp(),
      zoneName,
      message,
      tone,
    };
    setLogs((prev) => [entry, ...prev].slice(0, 120));
  }, [getVideoStamp]);

  // Stop webcam helper
  const stopWebcam = () => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }
  };

  // Handle Video File Upload (DVR footage)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopWebcam();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setSourceMode('FILE');
    setVideoUrl(url);
    setVideoFileName(file.name);
    setDvrError(null);
    prevFrameRef.current = null;
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = url;
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }, 60);
    appendLog('सिस्टम', `DVR फुटेज लोड हुई: ${file.name}`, 'info');
  };

  // Start Webcam
  const handleStartWebcam = async () => {
    try {
      stopWebcam();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540 }, audio: false });
      webcamStreamRef.current = stream;
      setSourceMode('WEBCAM');
      setDvrError(null);
      prevFrameRef.current = null;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.src = '';
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      }, 60);
      appendLog('वेबकैम', 'लाइव वेबकैम चालू किया गया', 'info');
    } catch {
      setDvrError('वेबकैम की अनुमति नहीं मिली या वेबकैम उपलब्ध नहीं है।');
    }
  };

  // Switch to Live DVR Camera Polling
  const handleStartLiveDvr = () => {
    stopWebcam();
    setSourceMode('DVR');
    setDvrError(null);
    prevFrameRef.current = null;
    appendLog('DVR लाइव', 'लाइव Hikvision DVR फीड से जुड़ रहा है...', 'info');
  };

  // Poll Live DVR Snapshot when sourceMode === 'DVR'
  useEffect(() => {
    if (sourceMode !== 'DVR') return;
    const camId = selectedCamId || cameras[0]?._id;
    if (!camId) {
      setDvrError('कोई DVR कैमरा कॉन्फ़िगर नहीं है। सेटअप टैब से कैमरा जोड़ें या वीडियो फ़ाइल चुनें।');
      return;
    }
    let alive = true;
    const fetchSnap = async () => {
      try {
        const res = await API.get(`/cameras/${camId}/live-snapshot`, {
          params: { t: Date.now() },
          responseType: 'blob',
          timeout: 4000,
        });
        if (!alive) return;
        const blobUrl = URL.createObjectURL(res.data);
        setDvrFrameUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return blobUrl;
        });
        setDvrError(null);
      } catch {
        if (alive) setDvrError('DVR लाइव स्नैपशॉट अभी ऑफ़लाइन है — आप DVR वीडियो फ़ाइल या वेबकैम से भी तुरंत एनालिसिस चला सकते हैं।');
      }
    };
    fetchSnap();
    const id = setInterval(fetchSnap, 1100);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [sourceMode, selectedCamId, cameras]);

  useEffect(() => {
    return () => {
      stopWebcam();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  // Parse Rate List textarea ("दूध=60") into map
  const parseRateList = (txt: string): Record<string, number> => {
    const map: Record<string, number> = {};
    txt.split('\n').forEach((line) => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const k = parts[0].trim().toLowerCase();
        const v = parseFloat(parts[1].trim());
        if (k && !isNaN(v) && v > 0) map[k] = v;
      }
    });
    return map;
  };

  // Parse spoken Hindi order against Rate List + explicit rupees
  const processSpokenHindi = useCallback((transcript: string) => {
    const clean = transcript.trim();
    if (!clean) return;
    setLastHeardText(clean);

    const low = clean.toLowerCase();
    const rates = parseRateList(rateListRef.current);
    let computedAmt = 0;

    // 1. Check explicit rupee phrases: "20 का", "50 रुपये", "₹30"
    const rupeeMatch = clean.match(/(?:₹\s*(\d+))|(\d+)\s*(?:रुपये|रुपए|रू|रु|का|की|के|वाला)/i);
    if (rupeeMatch) {
      const v = parseInt(rupeeMatch[1] || rupeeMatch[2], 10);
      if (v >= 5 && v <= 50000) computedAmt = v;
    }

    // 2. Check Hindi number word + का/रुपये (e.g., "बीस का दूध")
    if (computedAmt === 0) {
      for (const [w, val] of Object.entries(HINDI_NUMS)) {
        if (val >= 5 && (low.includes(`${w} का`) || low.includes(`${w} की`) || low.includes(`${w} रुपये`) || low.includes(`${w} रुपए`))) {
          computedAmt = val;
          break;
        }
      }
    }

    // 3. Check Rate List item + quantity (e.g., "दो दूध", "आधा दूध", "एक पनीर")
    if (computedAmt === 0) {
      for (const [itemKey, unitPrice] of Object.entries(rates)) {
        if (low.includes(itemKey)) {
          let qty = 1;
          const numBefore = low.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:लीटर|किलो|पैकेट)?\\s*${itemKey}`));
          if (numBefore) {
            qty = parseFloat(numBefore[1]) || 1;
          } else {
            for (const [w, val] of Object.entries(HINDI_NUMS)) {
              if (val <= 10 && low.includes(w)) {
                qty = val;
                break;
              }
            }
          }
          computedAmt = Math.round(qty * unitPrice);
          break;
        }
      }
    }

    if (computedAmt > 0) {
      const now = Date.now();
      // If Galla already opened in the last 6 seconds, match immediately!
      if (now - lastGallaEventRef.current <= 6000) {
        setMatchedVoiceCash((c) => c + computedAmt);
        appendLog('माइक + गल्ला', `“${clean}” → ₹${computedAmt} गल्ला हलचल के साथ मिला`, 'voice');
      } else {
        const order: PendingVoiceOrder = {
          id: `${now}`,
          amount: computedAmt,
          text: clean,
          createdAt: now,
          matched: false,
        };
        pendingVoiceRef.current.push(order);
        appendLog('माइक', `“${clean}” (₹${computedAmt}) — 25 सेकंड में गल्ला हलचल की जाँच...`, 'voice');

        // 25-second correlation timeout
        setTimeout(() => {
          const idx = pendingVoiceRef.current.findIndex((o) => o.id === order.id);
          if (idx !== -1 && !pendingVoiceRef.current[idx].matched) {
            pendingVoiceRef.current.splice(idx, 1);
            setSuspiciousVoiceCash((s) => s + order.amount);
            appendLog('संदिग्ध अलर्ट', `बोला गया “${order.text}” (₹${order.amount}), पर 25 सेकंड में गल्ला नहीं खुला!`, 'alert');
          }
        }, 25000);
      }
    }
  }, [appendLog]);

  // Browser Web Speech API Mic Toggle (Zero Cost, Chrome/Edge)
  const toggleMic = () => {
    if (micActive) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
      setMicActive(false);
      appendLog('माइक', 'वॉयस माइक बंद किया गया', 'info');
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('आपके ब्राउज़र में Web Speech API उपलब्ध नहीं है। कृपया Google Chrome या Edge का उपयोग करें।');
      return;
    }

    const rec = new SpeechRec();
    rec.lang = 'hi-IN';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const spoken = event.results[i][0]?.transcript || '';
          processSpokenHindi(spoken);
        }
      }
    };
    rec.onerror = () => {};
    rec.onend = () => {
      if (recognitionRef.current === rec) {
        try { rec.start(); } catch { setMicActive(false); }
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setMicActive(true);
      appendLog('माइक', 'लाइव हिंदी वॉयस मॉनिटरिंग चालू (Chrome Web Speech)', 'voice');
    } catch {
      setMicActive(false);
    }
  };

  // Capture Baseline Color for a Tank / Item Zone
  const captureTankBaseline = (zoneId: string) => {
    const work = workCanvasRef.current;
    if (!work) return;
    const ctx = work.getContext('2d');
    if (!ctx) return;
    const z = zonesRef.current.find((item) => item.id === zoneId);
    if (!z) return;
    const W = work.width;
    const H = work.height;
    const x0 = Math.floor(Math.min(z.x1, z.x2) * W);
    const y0 = Math.floor(Math.min(z.y1, z.y2) * H);
    const w = Math.max(2, Math.floor(Math.abs(z.x2 - z.x1) * W));
    const h = Math.max(2, Math.floor(Math.abs(z.y2 - z.y1) * H));
    const imgData = ctx.getImageData(x0, y0, w, h).data;
    let r = 0, g = 0, b = 0, cnt = 0;
    for (let i = 0; i < imgData.length; i += 16) {
      r += imgData[i];
      g += imgData[i + 1];
      b += imgData[i + 2];
      cnt++;
    }
    if (cnt === 0) return;
    const avg: [number, number, number] = [Math.round(r / cnt), Math.round(g / cnt), Math.round(b / cnt)];
    setZones((prev) =>
      prev.map((item) => (item.id === zoneId ? { ...item, baselineColor: avg, currentEstimate: item.capacity || 10 } : item))
    );
    appendLog(z.name, `भरी हुई टंकियों का रंग बेसलाइन सेट किया गया (${z.capacity || 10} नग)`, 'info');
  };

  // Real-Time Motion, Zone, Gate Tripwire & Tank Color Analysis Loop (Runs 100% locally in browser)
  useEffect(() => {
    const W = 320;
    const H = 180;
    if (!workCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      workCanvasRef.current = c;
    }

    const tick = () => {
      const overlay = overlayCanvasRef.current;
      const work = workCanvasRef.current;
      if (!overlay || !work) return;
      const wctx = work.getContext('2d', { willReadFrequently: true });
      const octx = overlay.getContext('2d');
      if (!wctx || !octx) return;

      // 1. Draw current video/DVR frame onto small 320x180 analysis canvas
      let hasFrame = false;
      if (sourceMode === 'DVR' && dvrImgRef.current && dvrImgRef.current.complete && dvrImgRef.current.naturalWidth > 0) {
        wctx.drawImage(dvrImgRef.current, 0, 0, W, H);
        hasFrame = true;
      } else if ((sourceMode === 'FILE' || sourceMode === 'WEBCAM') && videoRef.current && videoRef.current.readyState >= 2) {
        wctx.drawImage(videoRef.current, 0, 0, W, H);
        hasFrame = true;
      }

      if (hasFrame) {
        const cur = wctx.getImageData(0, 0, W, H).data;
        const prev = prevFrameRef.current;
        const now = Date.now();
        const activeZones = zonesRef.current;
        const ignoreZones = activeZones.filter((z) => z.type === 'ignore');

        const isIgnored = (px: number, py: number) => {
          const nx = px / W;
          const ny = py / H;
          return ignoreZones.some(
            (ig) => nx >= Math.min(ig.x1, ig.x2) && nx <= Math.max(ig.x1, ig.x2) && ny >= Math.min(ig.y1, ig.y2) && ny <= Math.max(ig.y1, ig.y2)
          );
        };

        if (prev && prev.length === cur.length) {
          const nextStanding: Record<string, boolean> = {};

          activeZones.forEach((z) => {
            if (z.type === 'ignore') return;
            const st = (zoneStateRef.current[z.id] ||= { motionStart: 0, countedThisPresence: false, lastTriggerAt: 0 });

            if (z.type === 'customer' || z.type === 'galla') {
              const x0 = Math.max(0, Math.floor(Math.min(z.x1, z.x2) * W));
              const y0 = Math.max(0, Math.floor(Math.min(z.y1, z.y2) * H));
              const x1 = Math.min(W - 1, Math.floor(Math.max(z.x1, z.x2) * W));
              const y1 = Math.min(H - 1, Math.floor(Math.max(z.y1, z.y2) * H));

              let diffPixels = 0;
              let totalPixels = 0;
              for (let y = y0; y <= y1; y += 2) {
                for (let x = x0; x <= x1; x += 2) {
                  if (isIgnored(x, y)) continue;
                  totalPixels++;
                  const idx = (y * W + x) * 4;
                  const diff = Math.abs(cur[idx] - prev[idx]) + Math.abs(cur[idx + 1] - prev[idx + 1]) + Math.abs(cur[idx + 2] - prev[idx + 2]);
                  if (diff > 62) diffPixels++;
                }
              }
              const ratio = totalPixels > 0 ? diffPixels / totalPixels : 0;

              if (z.type === 'customer') {
                if (ratio > 0.055) {
                  if (st.motionStart === 0) st.motionStart = now;
                  const heldMs = now - st.motionStart;
                  if (heldMs >= 1800) {
                    nextStanding[z.id] = true;
                    if (!st.countedThisPresence && now - st.lastTriggerAt > 4500) {
                      st.countedThisPresence = true;
                      st.lastTriggerAt = now;
                      setCustomerZoneCount((c) => c + 1);
                      appendLog(z.name, 'ग्राहक आया', 'customer');
                    }
                  }
                } else {
                  st.motionStart = 0;
                  st.countedThisPresence = false;
                }
              }

              if (z.type === 'galla') {
                if (ratio > 0.07 && now - st.lastTriggerAt > 3500) {
                  st.lastTriggerAt = now;
                  lastGallaEventRef.current = now;
                  setGallaMotionCount((c) => c + 1);
                  appendLog(z.name, 'गल्ले पर हलचल', 'galla');

                  // Correlate with any pending spoken voice order within 25s
                  const pending = pendingVoiceRef.current.find((o) => !o.matched && now - o.createdAt <= 25000);
                  if (pending) {
                    pending.matched = true;
                    setMatchedVoiceCash((c) => c + pending.amount);
                    appendLog('गल्ला + ऑडियो', `₹${pending.amount} (${pending.text}) गल्ला हलचल के साथ मेल खाया`, 'voice');
                  }
                }
              }
            } else if (z.type === 'gate') {
              // Band around tripwire line
              const lx0 = Math.max(0, Math.floor(Math.min(z.x1, z.x2) * W) - 10);
              const ly0 = Math.max(0, Math.floor(Math.min(z.y1, z.y2) * H) - 10);
              const lx1 = Math.min(W - 1, Math.floor(Math.max(z.x1, z.x2) * W) + 10);
              const ly1 = Math.min(H - 1, Math.floor(Math.max(z.y1, z.y2) * H) + 10);
              let sumX = 0, sumY = 0, cnt = 0;
              for (let y = ly0; y <= ly1; y += 2) {
                for (let x = lx0; x <= lx1; x += 2) {
                  if (isIgnored(x, y)) continue;
                  const idx = (y * W + x) * 4;
                  const diff = Math.abs(cur[idx] - prev[idx]) + Math.abs(cur[idx + 1] - prev[idx + 1]) + Math.abs(cur[idx + 2] - prev[idx + 2]);
                  if (diff > 68) {
                    sumX += x / W;
                    sumY += y / H;
                    cnt++;
                  }
                }
              }
              if (cnt > 18) {
                const cx = sumX / cnt;
                const cy = sumY / cnt;
                const cross = (z.x2 - z.x1) * (cy - z.y1) - (z.y2 - z.y1) * (cx - z.x1);
                const side = cross >= 0 ? 1 : -1;
                if (st.prevCentroidSide !== undefined && st.prevCentroidSide !== side && now - st.lastTriggerAt > 2500) {
                  st.lastTriggerAt = now;
                  const outSign = z.outSign || 1;
                  if (side === outSign) {
                    setGateOutCount((c) => c + 1);
                    setTheftAlertCount((c) => c + 1);
                    appendLog(z.name, 'गेट से बाहर क्रॉसिंग (चोरी/एग्ज़िट जाँच)', 'alert');
                  } else {
                    setGateInCount((c) => c + 1);
                    appendLog(z.name, 'गेट से अंदर प्रवेश', 'info');
                  }
                }
                st.prevCentroidSide = side;
              }
            } else if (z.type === 'tank' && z.baselineColor) {
              const x0 = Math.max(0, Math.floor(Math.min(z.x1, z.x2) * W));
              const y0 = Math.max(0, Math.floor(Math.min(z.y1, z.y2) * H));
              const x1 = Math.min(W - 1, Math.floor(Math.max(z.x1, z.x2) * W));
              const y1 = Math.min(H - 1, Math.floor(Math.max(z.y1, z.y2) * H));
              const [br, bg, bb] = z.baselineColor;
              let matched = 0, total = 0;
              for (let y = y0; y <= y1; y += 3) {
                for (let x = x0; x <= x1; x += 3) {
                  total++;
                  const idx = (y * W + x) * 4;
                  const dist = Math.abs(cur[idx] - br) + Math.abs(cur[idx + 1] - bg) + Math.abs(cur[idx + 2] - bb);
                  if (dist < 110) matched++;
                }
              }
              if (total > 0) {
                const est = Math.min(z.capacity || 10, Math.round((matched / total) * (z.capacity || 10)));
                z.currentEstimate = est;
              }
            }
          });

          setStandingZones(nextStanding);
        }

        prevFrameRef.current = new Uint8ClampedArray(cur);
      }

      // 2. Render crisp vector zones & labels on the overlay canvas
      const rect = overlay.getBoundingClientRect();
      if (overlay.width !== Math.round(rect.width) || overlay.height !== Math.round(rect.height)) {
        overlay.width = Math.max(1, Math.round(rect.width));
        overlay.height = Math.max(1, Math.round(rect.height));
      }
      const CW = overlay.width;
      const CH = overlay.height;
      octx.clearRect(0, 0, CW, CH);

      zonesRef.current.forEach((z) => {
        const meta = ZONE_META[z.type];
        octx.strokeStyle = meta.color;
        octx.lineWidth = 2.5;
        octx.font = '700 12px Inter, "Noto Sans Devanagari", sans-serif';

        if (z.type === 'gate') {
          const ax = z.x1 * CW, ay = z.y1 * CH, bx = z.x2 * CW, by = z.y2 * CH;
          octx.beginPath();
          octx.moveTo(ax, ay);
          octx.lineTo(bx, by);
          octx.stroke();

          // Draw direction arrow
          const mx = (ax + bx) / 2, my = (ay + by) / 2;
          const dx = bx - ax, dy = by - ay;
          const len = Math.hypot(dx, dy) || 1;
          const sign = z.outSign || 1;
          const nx = (-dy / len) * 20 * sign;
          const ny = (dx / len) * 20 * sign;
          octx.strokeStyle = '#EF4444';
          octx.beginPath();
          octx.moveTo(mx, my);
          octx.lineTo(mx + nx, my + ny);
          octx.stroke();

          octx.fillStyle = meta.color;
          octx.fillText(z.name, ax + 6, Math.max(16, ay - 6));
        } else {
          const rx = Math.min(z.x1, z.x2) * CW;
          const ry = Math.min(z.y1, z.y2) * CH;
          const rw = Math.abs(z.x2 - z.x1) * CW;
          const rh = Math.abs(z.y2 - z.y1) * CH;

          octx.fillStyle = z.type === 'ignore' ? 'rgba(113,113,122,0.22)' : `${meta.color}18`;
          octx.fillRect(rx, ry, rw, rh);
          octx.strokeRect(rx, ry, rw, rh);

          let label = z.name;
          if (z.type === 'customer' && standingZones[z.id]) label += ' • खड़ा';
          if (z.type === 'tank' && z.currentEstimate !== undefined) label += ` (${z.currentEstimate}/${z.capacity || 10})`;

          octx.fillStyle = meta.color;
          octx.fillText(label, rx + 6, ry + 16);
        }
      });

      // Active drag preview
      if (dragRect) {
        const meta = ZONE_META[drawTool];
        octx.strokeStyle = meta.color;
        octx.lineWidth = 2.5;
        octx.setLineDash([6, 4]);
        if (drawTool === 'gate') {
          octx.beginPath();
          octx.moveTo(dragRect.x1 * CW, dragRect.y1 * CH);
          octx.lineTo(dragRect.x2 * CW, dragRect.y2 * CH);
          octx.stroke();
        } else {
          const rx = Math.min(dragRect.x1, dragRect.x2) * CW;
          const ry = Math.min(dragRect.y1, dragRect.y2) * CH;
          octx.strokeRect(rx, ry, Math.abs(dragRect.x2 - dragRect.x1) * CW, Math.abs(dragRect.y2 - dragRect.y1) * CH);
        }
        octx.setLineDash([]);
      }
    };

    const interval = setInterval(tick, 180);
    return () => clearInterval(interval);
  }, [sourceMode, dragRect, drawTool, standingZones, appendLog]);

  // Pointer handlers for drawing zones on canvas
  const getNormPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = getNormPos(e);
    setDragRect({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRect) return;
    const p = getNormPos(e);
    setDragRect((prev) => (prev ? { ...prev, x2: p.x, y2: p.y } : null));
  };

  const handleMouseUp = () => {
    if (!dragRect) return;
    const dist = Math.hypot(dragRect.x2 - dragRect.x1, dragRect.y2 - dragRect.y1);
    if (dist > 0.03) {
      const sameCount = zones.filter((z) => z.type === drawTool).length + 1;
      const finalName = zoneNameInput.trim() || `${ZONE_META[drawTool].defaultPrefix} ${sameCount}`;
      const newZone: DrawnZone = {
        id: `z-${Date.now()}`,
        type: drawTool,
        name: finalName,
        x1: dragRect.x1,
        y1: dragRect.y1,
        x2: dragRect.x2,
        y2: dragRect.y2,
        capacity: drawTool === 'tank' ? parseInt(tankCapacityInput, 10) || 10 : undefined,
        outSign: 1,
      };
      setZones((prev) => [...prev, newZone]);
      setZoneNameInput(`${ZONE_META[drawTool].defaultPrefix} ${sameCount + 1}`);
      appendLog(finalName, `${ZONE_META[drawTool].label} जोड़ा गया`, 'info');
    }
    setDragRect(null);
  };

  const handleAddCash = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(cashInput, 10);
    if (!isNaN(val) && val > 0) {
      setEnteredCash((c) => c + val);
      setCashInput('');
      appendLog('गल्ला कैश', `₹${val} कैश हाथ से दर्ज किया गया`, 'galla');
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleVideoMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
  };

  const cashDiff = matchedVoiceCash - enteredCash;

  return (
    <div className="space-y-4">
      {/* Top Executive Command Header */}
      <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            दुकान निगरानी — AI कैमरा कमांड सेंटर
          </h2>
          <p className="text-xs text-dark-400 mt-0.5">
            DVR की फुटेज (वीडियो फ़ाइल), लाइव DVR या वेबकैम चुनें, फिर स्क्रीन पर गेट लाइन और ज़ोन खींचें। सारा प्रोसेसिंग आपके ब्राउज़र में (₹0 कॉस्ट) होता है।
          </p>
        </div>

        {/* Source Switcher & Quick Reports */}
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              sourceMode === 'FILE'
                ? 'bg-emerald-600 text-white border-emerald-600 keep-white-text'
                : 'bg-dark-800 text-dark-200 border-dark-700 hover:border-emerald-500/40'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>DVR वीडियो फ़ाइल</span>
          </button>

          <button
            type="button"
            onClick={handleStartLiveDvr}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              sourceMode === 'DVR'
                ? 'bg-emerald-600 text-white border-emerald-600 keep-white-text'
                : 'bg-dark-800 text-dark-200 border-dark-700 hover:border-emerald-500/40'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>लाइव DVR</span>
          </button>

          <button
            type="button"
            onClick={handleStartWebcam}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              sourceMode === 'WEBCAM'
                ? 'bg-emerald-600 text-white border-emerald-600 keep-white-text'
                : 'bg-dark-800 text-dark-200 border-dark-700 hover:border-emerald-500/40'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>वेबकैम</span>
          </button>

          {onOpenTimeGalla && (
            <button
              type="button"
              onClick={onOpenTimeGalla}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/15 flex items-center gap-1.5"
            >
              <FileBarChart2 className="w-3.5 h-3.5" />
              <span>AI रिपोर्ट</span>
            </button>
          )}

          {onOpenDvrPlayback && (
            <button
              type="button"
              onClick={onOpenDvrPlayback}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-dark-800 text-dark-200 border border-dark-700 hover:border-indigo-500/40 flex items-center gap-1.5"
            >
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
              <span>प्लेबैक</span>
            </button>
          )}

          {onOpenCameraSettings && (
            <button
              type="button"
              onClick={onOpenCameraSettings}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-dark-800 text-dark-200 border border-dark-700 hover:border-dark-500 flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5 text-dark-400" />
              <span>DVR सेटिंग</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Unified 12-Column Grid (Everything on One Screen!) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* ============================================================== */}
        {/* LEFT COLUMN (7 Cols): Video Canvas + Interactive Zone Toolbar  */}
        {/* ============================================================== */}
        <div className="xl:col-span-7 space-y-4">
          {/* Interactive Video + Drawing Viewport */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-3 space-y-3">
            {/* DVR Channel selector if in DVR mode */}
            {sourceMode === 'DVR' && cameras.length > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-dark-400 font-medium">DVR चैनल चुनें:</span>
                <select
                  value={selectedCamId}
                  onChange={(e) => setSelectedCamId(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-dark-700 bg-dark-950 text-xs font-semibold"
                >
                  {cameras.map((c) => (
                    <option key={c._id} value={c._id}>
                      Ch #{c.channel || 1} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="relative w-full aspect-video bg-zinc-950 rounded-xl overflow-hidden border border-dark-800 select-none">
              {sourceMode === 'DVR' ? (
                dvrFrameUrl ? (
                  <img ref={dvrImgRef} src={dvrFrameUrl} alt="Live DVR" className="w-full h-full object-contain" crossOrigin="anonymous" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                    <Video className="w-10 h-10 text-zinc-500" />
                    <p className="text-xs text-zinc-300 font-medium max-w-md">
                      {dvrError || 'लाइव DVR फीड से कनेक्ट हो रहा है...'}
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2 px-4 py-2 rounded-lg bg-emerald-600 text-white keep-white-text text-xs font-semibold"
                    >
                      या DVR वीडियो फ़ाइल चुनें
                    </button>
                  </div>
                )
              ) : (
                <>
                  <video
                    ref={videoRef}
                    muted={isMuted}
                    playsInline
                    loop
                    className={`w-full h-full object-contain ${!videoUrl && sourceMode === 'FILE' ? 'hidden' : ''}`}
                  />
                  {!videoUrl && sourceMode === 'FILE' && (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-full flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:bg-zinc-900/60 transition-colors space-y-2.5"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-zinc-100">
                        DVR रिकॉर्डिंग वीडियो फ़ाइल चुनने के लिए क्लिक करें
                      </p>
                      <p className="text-xs text-zinc-400 max-w-sm">
                        या ऊपर से “लाइव DVR” या “वेबकैम” चालू करें — फिर स्क्रीन पर ड्रैग करके ग्राहक ज़ोन, गल्ला ज़ोन, गेट लाइन और अनदेखा ज़ोन बनाएँ।
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Interactive Vector Zone Overlay Canvas */}
              <canvas
                ref={overlayCanvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="absolute inset-0 w-full h-full cursor-crosshair z-10"
              />
            </div>

            {/* Video Playback Bar when File is loaded */}
            {sourceMode === 'FILE' && videoUrl && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white keep-white-text font-semibold flex items-center gap-1.5"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isPlaying ? 'रोकें' : 'चलाएँ'}</span>
                  </button>
                  <span className="text-dark-400 truncate max-w-[200px]">{videoFileName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setGateInCount(0);
                    setGateOutCount(0);
                    setTheftAlertCount(0);
                    setCustomerZoneCount(0);
                    setGallaMotionCount(0);
                    setMatchedVoiceCash(0);
                    setSuspiciousVoiceCash(0);
                    setEnteredCash(0);
                    appendLog('सिस्टम', 'आज के काउंटर रीसेट किए गए', 'info');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-dark-800 border border-dark-700 text-dark-300 hover:text-white flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>गिनती रीसेट</span>
                </button>
              </div>
            )}
          </div>

          {/* Drawing Controls Card ("क्या खींचना है? (स्क्रीन पर ड्रैग करें)") */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 space-y-3.5">
            <h3 className="text-sm font-bold text-white">क्या खींचना है? (स्क्रीन पर ड्रैग करें)</h3>

            <div className="flex flex-wrap gap-2">
              {(['gate', 'customer', 'tank', 'ignore', 'galla'] as ZoneType[]).map((t) => {
                const active = drawTool === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleSelectTool(t)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 keep-white-text shadow-sm'
                        : 'bg-dark-950 text-dark-200 border-dark-700 hover:border-emerald-500/40'
                    }`}
                  >
                    {ZONE_META[t].label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
              <label className="flex items-center gap-2 text-dark-300 font-medium">
                <span>नाम</span>
                <input
                  type="text"
                  value={zoneNameInput}
                  onChange={(e) => setZoneNameInput(e.target.value)}
                  className="w-32 px-2.5 py-1.5 rounded-lg border border-dark-700 bg-dark-950 text-xs font-semibold"
                />
              </label>

              <label className="flex items-center gap-2 text-dark-300 font-medium">
                <span>टंकियाँ / नग</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={tankCapacityInput}
                  onChange={(e) => setTankCapacityInput(e.target.value)}
                  className="w-20 px-2.5 py-1.5 rounded-lg border border-dark-700 bg-dark-950 text-xs font-semibold"
                />
              </label>
            </div>

            <div className="text-[11px] leading-relaxed text-dark-400 space-y-1.5 pt-1 border-t border-dark-800">
              <p>
                सड़क या ट्रैफ़िक वाली जगह पर <strong className="text-dark-200">“अनदेखा ज़ोन”</strong> खींचें (वहाँ की हलचल गिनती में नहीं आएगी) और ग्राहक ज़ोन सिर्फ़ दुकान के सामने की जगह पर रखें। ग्राहक तभी गिना जाता है जब हलचल लगभग 2 सेकंड टिके, और ज़ोन में कोई खड़ा हो तो स्क्रीन पर <strong className="text-dark-200">“• खड़ा”</strong> दिखता है।
              </p>
              <p>
                टंकी ज़ोन खींचने के बाद, जब टंकियाँ पूरी भरी हों उस फ्रेम पर <strong className="text-dark-200">“रंग सेट करें”</strong> दबाएँ। फिर सिस्टम रंग मिलान से अंदाज़ा लगाएगा कि कितनी टंकियाँ अभी रखी हैं। गेट लाइन पर “बाहर की दिशा” बदलने का बटन है।
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* RIGHT COLUMN (5 Cols): Stats + Cash + Voice + Zones + Logs     */}
        {/* ============================================================== */}
        <div className="xl:col-span-5 space-y-4">
          {/* 1. आज का हिसाब (6 KPI Cards + Manual Cash Entry) */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 space-y-3.5">
            <h3 className="text-sm font-bold text-white">आज का हिसाब</h3>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-dark-950 border border-dark-800">
                <div className="text-2xl font-bold text-white font-mono">{gateInCount}</div>
                <div className="text-[11px] text-dark-400 font-medium mt-0.5">अंदर आए (गेट)</div>
              </div>
              <div className="p-3 rounded-xl bg-dark-950 border border-dark-800">
                <div className="text-2xl font-bold text-white font-mono">{gateOutCount}</div>
                <div className="text-[11px] text-dark-400 font-medium mt-0.5">बाहर गए (गेट)</div>
              </div>
              <div className="p-3 rounded-xl bg-dark-950 border border-dark-800">
                <div className={`text-2xl font-bold font-mono ${theftAlertCount > 0 ? 'text-rose-400' : 'text-white'}`}>
                  {theftAlertCount}
                </div>
                <div className="text-[11px] text-dark-400 font-medium mt-0.5">चोरी अलर्ट</div>
              </div>
              <div className="p-3 rounded-xl bg-dark-950 border border-dark-800">
                <div className="text-2xl font-bold text-sky-400 font-mono">{customerZoneCount}</div>
                <div className="text-[11px] text-dark-400 font-medium mt-0.5">ग्राहक आए (ज़ोन)</div>
              </div>
              <div className="p-3 rounded-xl bg-dark-950 border border-dark-800">
                <div className="text-2xl font-bold text-amber-400 font-mono">{gallaMotionCount}</div>
                <div className="text-[11px] text-dark-400 font-medium mt-0.5">गल्ला पर हलचल</div>
              </div>
              <div className="p-3 rounded-xl bg-dark-950 border border-dark-800">
                <div className="text-2xl font-bold text-emerald-400 font-mono">₹{enteredCash}</div>
                <div className="text-[11px] text-dark-400 font-medium mt-0.5">गल्ले में कैश (दर्ज)</div>
              </div>
            </div>

            <form onSubmit={handleAddCash} className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min={1}
                placeholder="₹ रकम"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                className="w-32 px-3 py-2 rounded-xl border border-dark-700 bg-dark-950 text-xs font-semibold"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-dark-800 hover:bg-emerald-600 hover:text-white border border-dark-700 text-xs font-semibold text-dark-100 transition-colors"
              >
                कैश जोड़ें
              </button>
            </form>

            <p className="text-[11px] text-dark-400 leading-relaxed">
              नोट की रकम कैमरे से भरोसेमंद नहीं पढ़ी जा सकती, इसलिए कैश यहाँ हाथ से दर्ज होता है; कैमरा सिर्फ़ गल्ला खुलने की हलचल गिनता है।
            </p>
          </div>

          {/* 2. माइक व रेट लिस्ट (Voice + Galla Correlation) */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleMic}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all ${
                  micActive
                    ? 'bg-emerald-600 text-white border-emerald-600 keep-white-text'
                    : 'bg-dark-950 text-dark-200 border-dark-700 hover:border-emerald-500/40'
                }`}
              >
                {micActive ? <Mic className="w-3.5 h-3.5 animate-pulse" /> : <MicOff className="w-3.5 h-3.5" />}
                <span>{micActive ? 'माइक चालू है (बंद करें)' : 'माइक चालू करें'}</span>
              </button>

              <button
                type="button"
                onClick={toggleVideoMute}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-dark-950 text-dark-200 border border-dark-700 hover:border-dark-500 flex items-center gap-1.5"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{isMuted ? 'फुटेज की आवाज़ चालू करें' : 'फुटेज की आवाज़ बंद करें'}</span>
              </button>
            </div>

            {lastHeardText && (
              <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-400 font-medium">
                🎙️ सुना गया: “{lastHeardText}”
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-dark-400 block">
                रेट लिस्ट (नाम=रुपए, हर लाइन में एक)
              </label>
              <textarea
                rows={5}
                value={rateListText}
                onChange={(e) => setRateListText(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-dark-700 bg-dark-950 text-xs font-mono leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-dark-950 border border-dark-800">
                <div className="text-xl font-bold text-emerald-400 font-mono">₹{matchedVoiceCash}</div>
                <div className="text-[11px] text-dark-400 mt-0.5 leading-snug">अनुमानित कैश (गल्ला हलचल के साथ मिला)</div>
              </div>
              <div className="p-3 rounded-xl bg-dark-950 border border-dark-800">
                <div className={`text-xl font-bold font-mono ${suspiciousVoiceCash > 0 ? 'text-rose-400' : 'text-white'}`}>
                  ₹{suspiciousVoiceCash}
                </div>
                <div className="text-[11px] text-dark-400 mt-0.5 leading-snug">संदिग्ध (बोला गया, गल्ला नहीं खुला)</div>
              </div>
            </div>

            <div className="text-xs font-semibold text-dark-300">
              अनुमानित कैश − दर्ज कैश = <span className={cashDiff > 0 ? 'text-amber-400 font-mono' : 'text-emerald-400 font-mono'}>₹{cashDiff}</span>
            </div>

            <p className="text-[11px] text-dark-400 leading-relaxed">
              ग्राहक की बात सुनकर सिस्टम सामान और संख्या पकड़ता है (जैसे “दो दूध” या “20 का दूध”), रेट से रकम निकालता है, फिर 25 सेकंड के भीतर गल्ले पर हलचल देखता है। यह अनुमान है, सटीक गिनती नहीं। माइक सिर्फ़ आसपास की आवाज़ सुनता है; फुटेज की आवाज़ के लिए उसे स्पीकर से चलाकर माइक के पास रखना होगा। Chrome में ही चलेगा।
            </p>
          </div>

          {/* 3. ज़ोन और लाइनें (Drawn Zones Management) */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">ज़ोन और लाइनें ({zones.length})</h3>
              {zones.length > 0 && (
                <button
                  type="button"
                  onClick={() => setZones([])}
                  className="text-[11px] text-rose-400 hover:underline font-medium"
                >
                  सभी हटाएँ
                </button>
              )}
            </div>

            {zones.length === 0 ? (
              <p className="text-xs text-dark-400 py-2">
                अभी कोई ज़ोन नहीं बना है। बाईं ओर वीडियो स्क्रीन पर माउस से ड्रैग करके ज़ोन खींचें।
              </p>
            ) : (
              <div className="divide-y divide-dark-800">
                {zones.map((z) => (
                  <div key={z.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ZONE_META[z.type].color }} />
                      <span className="font-semibold text-dark-100 truncate">
                        {ZONE_META[z.type].short}: {z.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {z.type === 'tank' && (
                        <button
                          type="button"
                          onClick={() => captureTankBaseline(z.id)}
                          className="px-2 py-1 rounded-lg bg-dark-950 border border-dark-700 text-[11px] text-teal-400 font-semibold flex items-center gap-1"
                        >
                          <Palette className="w-3 h-3" /> रंग सेट करें
                        </button>
                      )}
                      {z.type === 'gate' && (
                        <button
                          type="button"
                          onClick={() =>
                            setZones((prev) =>
                              prev.map((item) => (item.id === z.id ? { ...item, outSign: item.outSign === 1 ? -1 : 1 } : item))
                            )
                          }
                          className="px-2 py-1 rounded-lg bg-dark-950 border border-dark-700 text-[11px] text-dark-300 font-semibold flex items-center gap-1"
                        >
                          <ArrowLeftRight className="w-3 h-3" /> दिशा
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setZones((prev) => prev.filter((item) => item.id !== z.id))}
                        className="px-2.5 py-1 rounded-lg bg-dark-950 border border-dark-700 text-dark-300 hover:text-rose-400 hover:border-rose-500/40 font-semibold"
                      >
                        हटाएँ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. गतिविधि लॉग (Live Chronological Activity Log) */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">गतिविधि लॉग</h3>
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLogs([])}
                  className="text-[11px] text-dark-400 hover:text-white flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> साफ़ करें
                </button>
              )}
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-dark-800 pr-1">
              {logs.length === 0 ? (
                <p className="text-xs text-dark-400 py-3">
                  कोई गतिविधि अभी दर्ज नहीं हुई है। वीडियो चलाएँ या लाइव DVR चालू करें।
                </p>
              ) : (
                logs.map((l) => (
                  <div key={l.id} className="py-2 text-xs flex items-start gap-2">
                    {l.tone === 'alert' && <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />}
                    <span
                      className={
                        l.tone === 'alert'
                          ? 'text-rose-400 font-semibold'
                          : l.tone === 'voice'
                          ? 'text-emerald-400 font-medium'
                          : 'text-dark-200'
                      }
                    >
                      <span className="font-mono text-dark-400">{l.clockTime}</span>{' '}
                      <span className="text-dark-400">[{l.videoStamp}]</span>{' '}
                      <strong className="text-white">{l.zoneName}:</strong> {l.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
