import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io as createSocket } from 'socket.io-client';
import API from '../../api';
import { useAuth } from '../../context/AuthContext';
import { mobileYolo } from '../../services/mobileYoloService';
import {
  Video, Upload, Camera, Mic, MicOff, Volume2, VolumeX,
  Play, Pause, Trash2, RotateCcw, ShieldAlert, LayoutGrid,
  Maximize2, Minimize2, FileBarChart2, HardDrive, Settings,
  Palette, ArrowLeftRight, Compass, Crown, Activity, Cpu
} from 'lucide-react';
import { UnifiedStore360View, type LiveTelemetryProp } from './UnifiedStore360View';
import { VisualPairingModal } from './VisualPairingModal';
import { AiTrainerStudioModal } from './AiTrainerStudioModal';
import { parseVisitsFromTimeline } from './QuickReportModal';
import { aiBrainService, compute96DFeatureVector, extractSpokenPersonNames } from '../../services/aiBrainService';
import type { DetectedObject } from '../../services/mobileYoloService';

type ZoneType = 'gate' | 'customer' | 'tank' | 'ignore' | 'galla';

interface DrawnZone {
  id: string;
  backendBlockId?: string;
  cameraKey: string; // camera._id or 'FILE' or 'WEBCAM'
  cameraLabel?: string;
  type: ZoneType;
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  capacity?: number;
  currentEstimate?: number;
  baselineColor?: [number, number, number];
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
  'पाव': 0.25, 'पाओ': 0.25, 'आधा': 0.5, 'आधी': 0.5, 'डेढ़': 1.5, 'ढाई': 2.5,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5,
  'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9,
  'दस': 10, 'पंद्रह': 15, 'बीस': 20, 'बिस': 20, 'पच्चीस': 25, 'तीस': 30,
  'चालीस': 40, 'पचास': 50, 'साठ': 60, 'सत्तर': 70, 'अस्सी': 80,
  'नब्बे': 90, 'सौ': 100, 'दो सौ': 200, 'पाँच सौ': 500,
};

const ZONE_META: Record<ZoneType, { label: string; short: string; color: string; defaultPrefix: string }> = {
  gate:     { label: 'गेट लाइन (चोरी अलर्ट)',     short: 'गेट',     color: '#059669', defaultPrefix: 'गेट' },
  customer: { label: 'ग्राहक ज़ोन',               short: 'ग्राहक',  color: '#2563EB', defaultPrefix: 'ग्राहक' },
  tank:     { label: 'टंकी / सामान ज़ोन',          short: 'टंकी',    color: '#0D9488', defaultPrefix: 'टंकी' },
  ignore:   { label: 'अनदेखा ज़ोन (सड़क/ट्रैफ़िक)', short: 'अनदेखा', color: '#71717A', defaultPrefix: 'अनदेखा' },
  galla:    { label: 'गल्ला ज़ोन',                 short: 'गल्ला',   color: '#D97706', defaultPrefix: 'गल्ला' },
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
  const { user, tenant } = useAuth();
  const activeTenantId = String(tenant?._id || tenant?.id || user?.tenantId || '');

  // Video source & multi-cam layout state
  const [sourceMode, setSourceMode] = useState<'DVR' | 'FILE' | 'WEBCAM'>('DVR');
  const [showTesla3D, setShowTesla3D] = useState<boolean>(true);
  const [isPairingModalOpen, setIsPairingModalOpen] = useState<boolean>(false);
  const [isTrainerModalOpen, setIsTrainerModalOpen] = useState<boolean>(false);
  const [testVideoChannel, setTestVideoChannel] = useState<number>(1);
  const [videoTestFrameUrl, setVideoTestFrameUrl] = useState<string | null>(null);
  const [routineAnomalyBanner, setRoutineAnomalyBanner] = useState<string | null>(null);
  const [pairingBlocks, setPairingBlocks] = useState<any[]>([]);
  const [focusedCamId, setFocusedCamId] = useState<string | null>(null); // null = show ALL cameras in grid
  const [dvrFrames, setDvrFrames] = useState<Record<string, string>>({});
  const [dvrStatus, setDvrStatus] = useState<Record<string, 'LIVE' | 'OFFLINE'>>({});
  const [liveTelemetry, setLiveTelemetry] = useState<LiveTelemetryProp | null>(null);
  const [localGallaPulseAt, setLocalGallaPulseAt] = useState<number>(0);
  const [pipelineHealth, setPipelineHealth] = useState<{
    socketConnected: boolean;
    dvrBridgeOnline: boolean;
    edgeAiOnline: boolean;
    recorderOnline: boolean;
    freshCamerasCount: number;
    yoloReady: boolean;
  }>({
    socketConnected: false,
    dvrBridgeOnline: false,
    edgeAiOnline: false,
    recorderOnline: false,
    freshCamerasCount: 0,
    yoloReady: false,
  });

  // Video file / webcam state
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Drawing tool state
  const [drawTool, setDrawTool] = useState<ZoneType>('customer');
  const [zoneNameInput, setZoneNameInput] = useState('ग्राहक 1');
  const [tankCapacityInput, setTankCapacityInput] = useState('10');
  const [zones, setZones] = useState<DrawnZone[]>(() => {
    try {
      const saved = localStorage.getItem('dukan_nigrani_zones_v2');
      if (saved) return JSON.parse(saved);
      const legacy = localStorage.getItem('dukan_nigrani_zones_v1');
      return legacy ? JSON.parse(legacy).map((z: any) => ({ ...z, cameraKey: z.cameraKey || 'FILE' })) : [];
    } catch {
      return [];
    }
  });
  const [dragState, setDragState] = useState<{
    cameraKey: string;
    cameraLabel: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
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
  const [interimText, setInterimText] = useState('');
  const [lastHeardText, setLastHeardText] = useState('');
  const [rateListText, setRateListText] = useState<string>(() => {
    return localStorage.getItem('dukan_nigrani_rates_v1') || DEFAULT_RATE_LIST;
  });
  const [matchedVoiceCash, setMatchedVoiceCash] = useState(0);
  const [suspiciousVoiceCash, setSuspiciousVoiceCash] = useState(0);

  // Activity Log
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);

  // Refs for simultaneous multi-camera zero-lag analysis
  const videoRef = useRef<HTMLVideoElement>(null);
  const dvrImgRefs = useRef<Record<string, HTMLImageElement | null>>({});
  const overlayCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFramesRef = useRef<Record<string, Uint8ClampedArray>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const micDesiredRef = useRef(false);

  const zonesRef = useRef<DrawnZone[]>(zones);
  const dragStateRef = useRef(dragState);
  const standingRef = useRef(standingZones);
  const zoneStateRef = useRef<Record<string, {
    motionStart: number;
    countedThisPresence: boolean;
    lastTriggerAt: number;
    prevCentroidSide?: number;
  }>>({});
  const pendingVoiceRef = useRef<PendingVoiceOrder[]>([]);
  const lastGallaEventRef = useRef<number>(0);
  const rateListRef = useRef<string>(rateListText);


  const fetchPairingBlocks = useCallback(async () => {
    try {
      const res = await API.get('/cameras/pairing-blocks');
      if (res.data?.blocks) setPairingBlocks(res.data.blocks);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPairingBlocks();
    const syncTodayFromTimeline = () => {
      const todayStr = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split('T')[0];
      API.get('/cameras/playback/timeline', { params: { date: todayStr, startTime: '00:00', endTime: '23:59' } })
        .then((res) => {
          const visits = parseVisitsFromTimeline(res.data);
          if (visits.length > 0) {
            const totalCust = visits.reduce((acc, v) => acc + v.people, 0);
            const totalCash = visits.reduce((acc, v) => acc + v.amountPaid, 0);
            const gallaCnt = visits.filter((v) => v.gallaDeposited).length;
            setCustomerZoneCount((prev) => Math.max(prev, totalCust));
            setGallaMotionCount((prev) => Math.max(prev, gallaCnt));
            setEnteredCash((prev) => Math.max(prev, totalCash));
          }
        })
        .catch(() => {});
    };
    syncTodayFromTimeline();
    const tlInterval = setInterval(syncTodayFromTimeline, 22000);
    return () => clearInterval(tlInterval);
  }, [fetchPairingBlocks]);

  // Only initialize heavy 30MB WASM YOLO when needed (Test Video / Webcam) so Live DVR opens in 0ms with zero lag!
  useEffect(() => {
    if (sourceMode === 'DVR') {
      setPipelineHealth((p) => ({ ...p, yoloReady: true }));
      return;
    }
    let mounted = true;
    mobileYolo.initModel().then((ready) => {
      if (mounted) setPipelineHealth((p) => ({ ...p, yoloReady: ready }));
    });
    return () => {
      mounted = false;
    };
  }, [sourceMode]);

  // Bidirectional MongoDB Slab Sync: Load saved VisualPairingBlocks on camera load (handles both {blocks:[]} and [])
  useEffect(() => {
    if (!cameras || cameras.length === 0) return;
    let alive = true;
    API.get('/cameras/pairing-blocks')
      .then((res) => {
        if (!alive) return;
        const rawBlocks = Array.isArray(res.data) ? res.data : (res.data?.blocks || []);
        if (!Array.isArray(rawBlocks)) return;
        setPairingBlocks(rawBlocks);
        const revCat: Record<string, ZoneType> = {
          GALLA: 'galla',
          GATE_TRIPWIRE: 'gate',
          REUSABLE_CAN: 'gate',
          SHELF: 'tank',
          MACHINERY: 'customer',
          CUSTOM: 'customer',
        };
        const mapped: DrawnZone[] = [];
        rawBlocks.forEach((blk: any) => {
          const cam = cameras.find((c) => Number(c.channel || 1) === Number(blk.cameraChannel || 1));
          if (!cam || !blk.coordinates) return;
          const x1 = Math.max(0, Math.min(1, Number(blk.coordinates.x || 0) / 100));
          const y1 = Math.max(0, Math.min(1, Number(blk.coordinates.y || 0) / 100));
          const x2 = Math.max(0, Math.min(1, (Number(blk.coordinates.x || 0) + Number(blk.coordinates.width || 20)) / 100));
          const y2 = Math.max(0, Math.min(1, (Number(blk.coordinates.y || 0) + Number(blk.coordinates.height || 20)) / 100));
          mapped.push({
            id: `db-${blk._id}`,
            backendBlockId: blk._id,
            cameraKey: cam._id,
            cameraLabel: `Ch #${cam.channel || 1}`,
            type: revCat[blk.category] || 'customer',
            name: blk.name || blk.blockCode || 'स्लैब',
            x1,
            y1,
            x2,
            y2,
            capacity: blk.shelfConfig?.capacity || 10,
            outSign: 1,
          });
        });
        if (mapped.length > 0) {
          setZones((prev) => {
            const existingIds = new Set(prev.map((z) => z.backendBlockId || z.id));
            const additions = mapped.filter((m) => !existingIds.has(m.backendBlockId || m.id));
            return additions.length > 0 ? [...prev, ...additions] : prev;
          });
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [cameras]);

  useEffect(() => {
    zonesRef.current = zones;
    try {
      localStorage.setItem('dukan_nigrani_zones_v2', JSON.stringify(zones));
    } catch { /* ignore */ }
  }, [zones]);

  useEffect(() => { dragStateRef.current = dragState; }, [dragState]);
  useEffect(() => { standingRef.current = standingZones; }, [standingZones]);

  useEffect(() => {
    rateListRef.current = rateListText;
    try {
      localStorage.setItem('dukan_nigrani_rates_v1', rateListText);
    } catch { /* ignore */ }
  }, [rateListText]);

  const handleSelectTool = (tool: ZoneType) => {
    setDrawTool(tool);
    const sameCount = zones.filter((z) => z.type === tool).length + 1;
    setZoneNameInput(`${ZONE_META[tool].defaultPrefix} ${sameCount}`);
  };

  const getVideoStamp = useCallback((camLabel?: string) => {
    if (sourceMode === 'FILE' && videoRef.current) {
      return formatVideoTime(videoRef.current.currentTime);
    }
    if (sourceMode === 'WEBCAM') return 'लाइव वेबकैम';
    return camLabel || 'लाइव DVR';
  }, [sourceMode]);

  const appendLog = useCallback((zoneName: string, message: string, tone: ActivityLogItem['tone'] = 'info', camLabel?: string) => {
    const entry: ActivityLogItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      clockTime: nowClock(),
      videoStamp: getVideoStamp(camLabel),
      zoneName,
      message,
      tone,
    };
    setLogs((prev) => [entry, ...prev].slice(0, 150));
  }, [getVideoStamp]);

  const stopWebcam = () => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }
  };

  // Upload Video File
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopWebcam();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setSourceMode('FILE');
    setVideoUrl(url);
    setVideoFileName(file.name);
    delete prevFramesRef.current['FILE'];
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
      delete prevFramesRef.current['WEBCAM'];
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.src = '';
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      }, 60);
      appendLog('वेबकैम', 'लाइव वेबकैम चालू किया गया', 'info');
    } catch {
      alert('वेबकैम की अनुमति नहीं मिली या वेबकैम उपलब्ध नहीं है।');
    }
  };

  // Switch to Live Multi-Camera DVR Mode
  const handleStartLiveDvr = () => {
    stopWebcam();
    setSourceMode('DVR');
    appendLog('DVR मल्टी-कैमरा', `${cameras.length || 0} कैमरों का लाइव फीड चालू`, 'info');
  };

  // Real-Time Socket.IO + Live Telemetry Auto-Sync (Edge AI + DVR Bridge + Audio + Counters)
  const lastEdgeTranscriptStampRef = useRef<string>('');
  // Shared per-camera fetch guard so Socket.IO push and fallback poll NEVER double-fetch the same camera!
  const camLastFetchAtRef = useRef<Record<string, number>>({});
  const camInFlightRef = useRef<Record<string, boolean>>({});

  const fetchCameraSnapshotDeduped = useCallback(async (camId: string, minGapMs = 1350) => {
    const now = Date.now();
    if (camInFlightRef.current[camId] || now - (camLastFetchAtRef.current[camId] || 0) < minGapMs) {
      return;
    }
    camInFlightRef.current[camId] = true;
    camLastFetchAtRef.current[camId] = now;
    try {
      const res = await API.get(`/cameras/${camId}/live-snapshot`, {
        params: { t: now },
        responseType: 'blob',
        timeout: 4500,
      });
      const blobUrl = URL.createObjectURL(res.data);
      setDvrFrames((prev) => {
        const oldUrl = prev[camId];
        if (oldUrl && oldUrl !== blobUrl) {
          setTimeout(() => URL.revokeObjectURL(oldUrl), 7000);
        }
        return { ...prev, [camId]: blobUrl };
      });
      setDvrStatus((prev) => ({ ...prev, [camId]: 'LIVE' }));
      setPipelineHealth((p) => ({ ...p, dvrBridgeOnline: true }));
    } catch {
      setDvrStatus((prev) => ({ ...prev, [camId]: 'OFFLINE' }));
    } finally {
      camInFlightRef.current[camId] = false;
    }
  }, []);
  const dvrFramesLatestRef = useRef<Record<string, string>>({});
  useEffect(() => {
    dvrFramesLatestRef.current = dvrFrames;
  }, [dvrFrames]);

  useEffect(() => {
    let alive = true;
    const applyTelemetryState = (tele: any, health?: any) => {
      if (!alive || !tele) return;
      setLiveTelemetry(tele);
      if (health) {
        setPipelineHealth((prev) => ({
          ...prev,
          edgeAiOnline: Boolean(health.edgeAiOnline),
          recorderOnline: Boolean(health.recorderHeartbeatOnline),
          dvrBridgeOnline: Boolean(health.dvrBridgeOnline),
          freshCamerasCount: Number(health.freshCamerasCount || 0),
        }));
      } else if (tele.updatedAt) {
        const fresh = Date.now() - tele.updatedAt < 12000;
        setPipelineHealth((prev) => ({ ...prev, edgeAiOnline: fresh, recorderOnline: fresh || prev.recorderOnline }));
      }

      if (tele.countersToday) {
        if (tele.countersToday.customers > 0) {
          setCustomerZoneCount((prev) => Math.max(prev, Number(tele.countersToday.customers)));
        }
        if (tele.countersToday.gallaOpenings > 0) {
          setGallaMotionCount((prev) => Math.max(prev, Number(tele.countersToday.gallaOpenings)));
        }
        if (tele.countersToday.unbilledAlerts > 0) {
          setTheftAlertCount((prev) => Math.max(prev, Number(tele.countersToday.unbilledAlerts)));
        }
      }

      const tr = tele.audio?.lastTranscript;
      if (tr?.text && tr?.at && lastEdgeTranscriptStampRef.current !== tr.at) {
        lastEdgeTranscriptStampRef.current = tr.at;
        setLastHeardText(tr.text);
        const amtTxt = Array.isArray(tr.amounts) && tr.amounts.length > 0 ? ` (₹${tr.amounts[tr.amounts.length - 1]})` : '';
        appendLog('DVR ऑडियो AI', `“${tr.text}”${amtTxt}`, 'voice', 'माइक Ch#1');
      }
    };

    const pollTelemetry = async () => {
      try {
        const res = await API.get('/cameras/live-telemetry');
        if (!alive || !res.data?.success) return;
        applyTelemetryState(res.data.telemetry, res.data.health);
      } catch {
        // Ignore transient network error
      }
    };

    pollTelemetry();
    const pollIv = setInterval(pollTelemetry, 5500);

    const socketBaseUrl = (API.defaults.baseURL || 'https://dairy-management-backendd.onrender.com/api').replace(/\/api\/?$/, '');
    const socket = createSocket(socketBaseUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
    });

    socket.on('connect', () => {
      if (!alive) return;
      setPipelineHealth((p) => ({ ...p, socketConnected: true }));
      if (activeTenantId) {
        socket.emit('camera:join_live', activeTenantId);
      }
    });

    socket.on('disconnect', () => {
      if (alive) setPipelineHealth((p) => ({ ...p, socketConnected: false }));
    });

    socket.on('camera:live_telemetry', (payload: any) => {
      applyTelemetryState(payload);
    });

    socket.on('camera:ai_brain_updated', (ev: any) => {
      aiBrainService.refreshBrain(true);
      if (ev?.anomaly?.detail) {
        setRoutineAnomalyBanner(`${ev.anomaly.title}: ${ev.anomaly.detail}`);
        appendLog('AI रूटीन अलर्ट', ev.anomaly.detail, 'alert', 'AI ब्रेन');
      } else if (ev?.person?.isNameConfirmed && ev?.person?.label) {
        appendLog('AI स्व-पहचान', `नया नाम पक्का हुआ: “${ev.person.label}” (${ev.person.visitCount || 1} बार दिखा)`, 'customer', 'AI ब्रेन');
      }
    });

    socket.on('camera:frame_ready', (ev: { cameraId?: string }) => {
      if (!alive || sourceMode !== 'DVR' || !ev?.cameraId) return;
      fetchCameraSnapshotDeduped(ev.cameraId, 1300);
    });

    return () => {
      alive = false;
      clearInterval(pollIv);
      socket.disconnect();
    };
  }, [activeTenantId, sourceMode, appendLog, fetchCameraSnapshotDeduped]);

  // Lightweight Fallback Multi-Camera DVR Polling (skips automatically whenever Socket.IO just updated that camera!)
  useEffect(() => {
    if (sourceMode !== 'DVR' || cameras.length === 0) return;
    let alive = true;
    const timers: any[] = [];

    cameras.forEach((cam, idx) => {
      const startTimer = setTimeout(() => {
        if (!alive) return;
        fetchCameraSnapshotDeduped(cam._id, 1200);
        const iv = setInterval(() => {
          if (alive) fetchCameraSnapshotDeduped(cam._id, 2200);
        }, Math.max(2400, cameras.length * 650));
        timers.push(iv);
      }, idx * 400);
      timers.push(startTimer);
    });

    return () => {
      alive = false;
      timers.forEach((t) => {
        clearTimeout(t);
        clearInterval(t);
      });
    };
  }, [sourceMode, cameras, fetchCameraSnapshotDeduped]);

  useEffect(() => {
    return () => {
      stopWebcam();
      Object.values(dvrFramesLatestRef.current).forEach((u) => {
        try { URL.revokeObjectURL(u); } catch { /* ignore */ }
      });
      micDesiredRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  // Parse Rate List textarea ("दूध=60")
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

  // Precision Hindi Dairy Voice Parser
  const processSpokenHindi = useCallback((transcript: string) => {
    const clean = transcript.trim();
    if (!clean) return;
    setLastHeardText(clean);

    const low = clean.toLowerCase();
    const rates = parseRateList(rateListRef.current);
    let computedAmt = 0;

    // 1. Explicit rupee phrases ("20 का दूध", "₹50", "50 रुपये")
    const rupeeMatch = clean.match(/(?:₹\s*(\d+))|(\d+)\s*(?:रुपये|रुपए|रू|रु|का|की|के|वाला)/i);
    if (rupeeMatch) {
      const v = parseInt(rupeeMatch[1] || rupeeMatch[2], 10);
      if (v >= 5 && v <= 50000) computedAmt = v;
    }

    // 2. Hindi number word + का/की/रुपये ("बीस का दूध", "पचास रुपये")
    if (computedAmt === 0) {
      for (const [w, val] of Object.entries(HINDI_NUMS)) {
        if (val >= 5 && (low.includes(`${w} का`) || low.includes(`${w} की`) || low.includes(`${w} के`) || low.includes(`${w} रुपये`) || low.includes(`${w} रुपए`))) {
          computedAmt = val;
          break;
        }
      }
    }

    // 3. Rate list item + quantity ("आधा लीटर दूध", "दो दूध", "पाव भर पनीर")
    if (computedAmt === 0) {
      for (const [itemKey, unitPrice] of Object.entries(rates)) {
        if (low.includes(itemKey)) {
          let qty = 0;
          const numBefore = low.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:लीटर|किलो|पैकेट|ग्राम)?\\s*${itemKey}`));
          if (numBefore) {
            const rawNum = parseFloat(numBefore[1]);
            qty = low.includes('ग्राम') ? rawNum / 1000 : rawNum;
          } else {
            for (const [w, val] of Object.entries(HINDI_NUMS)) {
              if (val <= 10 && low.includes(w)) {
                qty = val;
                break;
              }
            }
          }
          if (qty > 0) {
            computedAmt = Math.round(qty * unitPrice);
          } else {
            // Standalone number spoken alongside item (e.g. "दूध दे दो 20")
            const standalone = clean.match(/\b(\d{2,4})\b/);
            if (standalone) {
              const v = parseInt(standalone[1], 10);
              if (v >= 5 && v <= 5000) computedAmt = v;
            }
          }
          break;
        }
      }
    }

    if (computedAmt > 0) {
      const now = Date.now();
      if (now - lastGallaEventRef.current <= 6000) {
        setMatchedVoiceCash((c) => c + computedAmt);
        appendLog('माइक + गल्ला', `“${clean}” → ₹${computedAmt} गल्ला हलचल के साथ मिला`, 'voice', 'ऑडियो');
      } else {
        const order: PendingVoiceOrder = {
          id: `${now}-${Math.random().toString(36).slice(2, 5)}`,
          amount: computedAmt,
          text: clean,
          createdAt: now,
          matched: false,
        };
        pendingVoiceRef.current.push(order);
        appendLog('माइक', `“${clean}” (₹${computedAmt}) — 25 सेकंड में गल्ला जाँच...`, 'voice', 'ऑडियो');

        setTimeout(() => {
          const idx = pendingVoiceRef.current.findIndex((o) => o.id === order.id);
          if (idx !== -1 && !pendingVoiceRef.current[idx].matched) {
            pendingVoiceRef.current.splice(idx, 1);
            setSuspiciousVoiceCash((s) => s + order.amount);
            appendLog('संदिग्ध अलर्ट', `बोला गया “${order.text}” (₹${order.amount}), पर 25 सेकंड में गल्ला नहीं खुला!`, 'alert', 'ऑडियो');
          }
        }, 25000);
      }
    } else {
      appendLog('माइक', `सुना गया: “${clean}”`, 'info', 'ऑडियो');
    }

    // Self-Supervised Voice-to-Face Name Learning: if a person is visible in Ch#1 (Live DVR or Test Video), vote spoken names!
    const spokenNames = extractSpokenPersonNames(clean);
    if (spokenNames.length > 0) {
      const ch1Cam = cameras.find((c, idx) => Number(c.channel || idx + 1) === 1) || cameras[0];
      const activeVisualEl: HTMLVideoElement | HTMLImageElement | null =
        sourceMode !== 'DVR' ? videoRef.current : ch1Cam ? dvrImgRefs.current[ch1Cam._id] : null;
      if (activeVisualEl) {
        mobileYolo
          .detectFrame(activeVisualEl)
          .then((dets: DetectedObject[]) => {
            const persons = dets.filter((d) => d.className === 'person' && d.confidence >= 48);
            if (persons.length === 1) {
              const p = persons[0];
              const feat = compute96DFeatureVector(activeVisualEl, {
                x: p.box.x,
                y: p.box.y,
                width: p.box.width,
                height: p.box.height * 0.62,
              });
              if (feat) {
                API.post('/cameras/ai-brain/observe-person', {
                  channel: 1,
                  featureVector: feat.vector,
                  thumbnailBase64: feat.thumbnailBase64,
                  spokenNames,
                  fromVideoTest: sourceMode !== 'DVR',
                })
                  .then(() => aiBrainService.refreshBrain(true))
                  .catch(() => {});
              }
            }
          })
          .catch(() => {});
      }
    }
  }, [appendLog, cameras, sourceMode]);

  // Reliable Auto-Restarting Chrome Web Speech API Mic
  const toggleMic = () => {
    if (micActive) {
      micDesiredRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
      setMicActive(false);
      setInterimText('');
      appendLog('माइक', 'वॉयस माइक बंद किया गया', 'info', 'ऑडियो');
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('आपके ब्राउज़र में Web Speech API उपलब्ध नहीं है। कृपया Google Chrome या Microsoft Edge का उपयोग करें।');
      return;
    }

    micDesiredRef.current = true;
    const rec = new SpeechRec();
    rec.lang = 'hi-IN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          setInterimText('');
          processSpokenHindi(t);
        } else {
          interim += t;
        }
      }
      if (interim) setInterimText(interim);
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        micDesiredRef.current = false;
        setMicActive(false);
      }
    };
    rec.onend = () => {
      if (micDesiredRef.current) {
        setTimeout(() => {
          if (micDesiredRef.current) {
            try { rec.start(); } catch { setMicActive(false); }
          }
        }, 250);
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setMicActive(true);
      appendLog('माइक', 'लाइव हिंदी वॉयस मॉनिटरिंग चालू', 'voice', 'ऑडियो');
    } catch {
      micDesiredRef.current = false;
      setMicActive(false);
    }
  };

  // Capture Baseline Color for a Tank / Item Zone on its specific camera
  const captureTankBaseline = (zoneId: string) => {
    const z = zonesRef.current.find((item) => item.id === zoneId);
    if (!z) return;
    const work = workCanvasRef.current;
    if (!work) return;
    const wctx = work.getContext('2d', { willReadFrequently: true });
    if (!wctx) return;

    const W = work.width;
    const H = work.height;
    let drew = false;
    if (z.cameraKey === 'FILE' || z.cameraKey === 'WEBCAM') {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        wctx.drawImage(videoRef.current, 0, 0, W, H);
        drew = true;
      }
    } else {
      const img = dvrImgRefs.current[z.cameraKey];
      if (img && img.complete && img.naturalWidth > 0) {
        wctx.drawImage(img, 0, 0, W, H);
        drew = true;
      }
    }
    if (!drew) return;

    const x0 = Math.floor(Math.min(z.x1, z.x2) * W);
    const y0 = Math.floor(Math.min(z.y1, z.y2) * H);
    const w = Math.max(2, Math.floor(Math.abs(z.x2 - z.x1) * W));
    const h = Math.max(2, Math.floor(Math.abs(z.y2 - z.y1) * H));
    const imgData = wctx.getImageData(x0, y0, w, h).data;
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
    appendLog(z.name, `भरी हुई टंकियों का रंग बेसलाइन सेट किया गया (${z.capacity || 10} नग)`, 'info', z.cameraLabel);
  };

  // =========================================================================
  // SIMULTANEOUS MULTI-CAMERA MOTION & VECTOR OVERLAY LOOP (ZERO-LAG)
  // Analyzes ALL connected cameras (3, 4, 5+) independently on every tick!
  // =========================================================================
  useEffect(() => {
    const W = 240;
    const H = 135;
    if (!workCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      workCanvasRef.current = c;
    }

    const analyzeSource = (
      cameraKey: string,
      cameraLabel: string,
      sourceEl: HTMLImageElement | HTMLVideoElement | null
    ) => {
      const work = workCanvasRef.current;
      const overlay = overlayCanvasRefs.current[cameraKey];
      if (!work) return;
      const wctx = work.getContext('2d', { willReadFrequently: true });
      if (!wctx) return;

      const camZones = zonesRef.current.filter((z) => z.cameraKey === cameraKey);
      const ignoreZones = camZones.filter((z) => z.type === 'ignore');

      let hasFrame = false;
      if (sourceEl) {
        if (sourceEl instanceof HTMLVideoElement && sourceEl.readyState >= 2) {
          wctx.drawImage(sourceEl, 0, 0, W, H);
          hasFrame = true;
        } else if (sourceEl instanceof HTMLImageElement && sourceEl.complete && sourceEl.naturalWidth > 0) {
          wctx.drawImage(sourceEl, 0, 0, W, H);
          hasFrame = true;
        }
      }

      if (hasFrame && camZones.length > 0) {
        const cur = wctx.getImageData(0, 0, W, H).data;
        const prev = prevFramesRef.current[cameraKey];
        const now = Date.now();

        const isIgnored = (px: number, py: number) => {
          const nx = px / W;
          const ny = py / H;
          return ignoreZones.some(
            (ig) => nx >= Math.min(ig.x1, ig.x2) && nx <= Math.max(ig.x1, ig.x2) && ny >= Math.min(ig.y1, ig.y2) && ny <= Math.max(ig.y1, ig.y2)
          );
        };

        if (prev && prev.length === cur.length) {
          let standingChanged = false;
          const nextStanding = { ...standingRef.current };

          camZones.forEach((z) => {
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
                  if (diff > 60) diffPixels++;
                }
              }
              const ratio = totalPixels > 0 ? diffPixels / totalPixels : 0;

              if (z.type === 'customer') {
                const wasStanding = Boolean(nextStanding[z.id]);
                if (ratio > 0.055) {
                  if (st.motionStart === 0) st.motionStart = now;
                  if (now - st.motionStart >= 1800) {
                    if (!wasStanding) {
                      nextStanding[z.id] = true;
                      standingChanged = true;
                    }
                    if (!st.countedThisPresence && now - st.lastTriggerAt > 4500) {
                      st.countedThisPresence = true;
                      st.lastTriggerAt = now;
                      setCustomerZoneCount((c) => c + 1);
                      appendLog(z.name, 'ग्राहक आया', 'customer', cameraLabel);
                    }
                  }
                } else {
                  st.motionStart = 0;
                  st.countedThisPresence = false;
                  if (wasStanding) {
                    nextStanding[z.id] = false;
                    standingChanged = true;
                  }
                }
              }

              if (z.type === 'galla') {
                if (ratio > 0.068 && now - st.lastTriggerAt > 3500) {
                  st.lastTriggerAt = now;
                  lastGallaEventRef.current = now;
                  setLocalGallaPulseAt(now);
                  setGallaMotionCount((c) => c + 1);
                  appendLog(z.name, 'गल्ले पर हलचल', 'galla', cameraLabel);

                  const pending = pendingVoiceRef.current.find((o) => !o.matched && now - o.createdAt <= 25000);
                  if (pending) {
                    pending.matched = true;
                    setMatchedVoiceCash((c) => c + pending.amount);
                    appendLog('गल्ला + ऑडियो', `₹${pending.amount} (${pending.text}) गल्ला हलचल के साथ मेल खाया`, 'voice', cameraLabel);
                  }
                }
              }
            } else if (z.type === 'gate') {
              const lx0 = Math.max(0, Math.floor(Math.min(z.x1, z.x2) * W) - 8);
              const ly0 = Math.max(0, Math.floor(Math.min(z.y1, z.y2) * H) - 8);
              const lx1 = Math.min(W - 1, Math.floor(Math.max(z.x1, z.x2) * W) + 8);
              const ly1 = Math.min(H - 1, Math.floor(Math.max(z.y1, z.y2) * H) + 8);
              let sumX = 0, sumY = 0, cnt = 0;
              for (let y = ly0; y <= ly1; y += 2) {
                for (let x = lx0; x <= lx1; x += 2) {
                  if (isIgnored(x, y)) continue;
                  const idx = (y * W + x) * 4;
                  const diff = Math.abs(cur[idx] - prev[idx]) + Math.abs(cur[idx + 1] - prev[idx + 1]) + Math.abs(cur[idx + 2] - prev[idx + 2]);
                  if (diff > 65) {
                    sumX += x / W;
                    sumY += y / H;
                    cnt++;
                  }
                }
              }
              if (cnt > 14) {
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
                    appendLog(z.name, 'गेट से बाहर क्रॉसिंग (चोरी अलर्ट)', 'alert', cameraLabel);
                  } else {
                    setGateInCount((c) => c + 1);
                    appendLog(z.name, 'गेट से अंदर प्रवेश', 'info', cameraLabel);
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
                z.currentEstimate = Math.min(z.capacity || 10, Math.round((matched / total) * (z.capacity || 10)));
              }
            }
          });

          if (standingChanged) setStandingZones(nextStanding);
        }

        prevFramesRef.current[cameraKey] = new Uint8ClampedArray(cur);
      }

      // Draw crisp vector zones on this camera's overlay canvas
      if (!overlay) return;
      const octx = overlay.getContext('2d');
      if (!octx) return;
      const rect = overlay.getBoundingClientRect();
      const targetW = Math.max(1, Math.round(rect.width));
      const targetH = Math.max(1, Math.round(rect.height));
      if (overlay.width !== targetW || overlay.height !== targetH) {
        overlay.width = targetW;
        overlay.height = targetH;
      }
      octx.clearRect(0, 0, targetW, targetH);

      camZones.forEach((z) => {
        const meta = ZONE_META[z.type];
        octx.strokeStyle = meta.color;
        octx.lineWidth = 2.2;
        octx.font = '700 11px Inter, "Noto Sans Devanagari", sans-serif';

        if (z.type === 'gate') {
          const ax = z.x1 * targetW, ay = z.y1 * targetH, bx = z.x2 * targetW, by = z.y2 * targetH;
          octx.beginPath();
          octx.moveTo(ax, ay);
          octx.lineTo(bx, by);
          octx.stroke();

          const mx = (ax + bx) / 2, my = (ay + by) / 2;
          const dx = bx - ax, dy = by - ay;
          const len = Math.hypot(dx, dy) || 1;
          const sign = z.outSign || 1;
          octx.strokeStyle = '#EF4444';
          octx.beginPath();
          octx.moveTo(mx, my);
          octx.lineTo(mx + (-dy / len) * 18 * sign, my + (dx / len) * 18 * sign);
          octx.stroke();

          octx.fillStyle = meta.color;
          octx.fillText(z.name, ax + 5, Math.max(14, ay - 5));
        } else {
          const rx = Math.min(z.x1, z.x2) * targetW;
          const ry = Math.min(z.y1, z.y2) * targetH;
          const rw = Math.abs(z.x2 - z.x1) * targetW;
          const rh = Math.abs(z.y2 - z.y1) * targetH;

          octx.fillStyle = z.type === 'ignore' ? 'rgba(113,113,122,0.22)' : `${meta.color}18`;
          octx.fillRect(rx, ry, rw, rh);
          octx.strokeRect(rx, ry, rw, rh);

          let label = z.name;
          if (z.type === 'customer' && standingRef.current[z.id]) label += ' • खड़ा';
          if (z.type === 'tank' && z.currentEstimate !== undefined) label += ` (${z.currentEstimate}/${z.capacity || 10})`;

          octx.fillStyle = meta.color;
          octx.fillText(label, rx + 5, ry + 14);
        }
      });

      // Active drag preview on this camera
      const dr = dragStateRef.current;
      if (dr && dr.cameraKey === cameraKey) {
        const meta = ZONE_META[drawTool];
        octx.strokeStyle = meta.color;
        octx.lineWidth = 2.2;
        octx.setLineDash([5, 4]);
        if (drawTool === 'gate') {
          octx.beginPath();
          octx.moveTo(dr.x1 * targetW, dr.y1 * targetH);
          octx.lineTo(dr.x2 * targetW, dr.y2 * targetH);
          octx.stroke();
        } else {
          const rx = Math.min(dr.x1, dr.x2) * targetW;
          const ry = Math.min(dr.y1, dr.y2) * targetH;
          octx.strokeRect(rx, ry, Math.abs(dr.x2 - dr.x1) * targetW, Math.abs(dr.y2 - dr.y1) * targetH);
        }
        octx.setLineDash([]);
      }
    };

    const interval = setInterval(() => {
      if (sourceMode === 'DVR') {
        cameras.forEach((cam) => {
          const label = `Ch #${cam.channel || 1}`;
          analyzeSource(cam._id, label, dvrImgRefs.current[cam._id] || null);
        });
      } else {
        const key = sourceMode; // 'FILE' or 'WEBCAM'
        analyzeSource(key, sourceMode === 'FILE' ? 'वीडियो' : 'वेबकैम', videoRef.current);
      }
    }, 450);

    return () => clearInterval(interval);
  }, [sourceMode, cameras, drawTool, appendLog]);

  // Pointer handlers for drawing directly on ANY camera in the grid or single view
  const getNormPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handleCanvasDown = (cameraKey: string, cameraLabel: string, e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = getNormPos(e);
    setDragState({ cameraKey, cameraLabel, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };

  const handleCanvasMove = (cameraKey: string, e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragState || dragState.cameraKey !== cameraKey) return;
    const p = getNormPos(e);
    setDragState((prev) => (prev ? { ...prev, x2: p.x, y2: p.y } : null));
  };

  const handleCanvasUp = () => {
    if (!dragState) return;
    const dist = Math.hypot(dragState.x2 - dragState.x1, dragState.y2 - dragState.y1);
    if (dist > 0.03) {
      const sameCount = zones.filter((z) => z.type === drawTool).length + 1;
      const finalName = zoneNameInput.trim() || `${ZONE_META[drawTool].defaultPrefix} ${sameCount}`;
      const newZone: DrawnZone = {
        id: `z-${Date.now()}`,
        cameraKey: dragState.cameraKey,
        cameraLabel: dragState.cameraLabel,
        type: drawTool,
        name: finalName,
        x1: dragState.x1,
        y1: dragState.y1,
        x2: dragState.x2,
        y2: dragState.y2,
        capacity: drawTool === 'tank' ? parseInt(tankCapacityInput, 10) || 10 : undefined,
        outSign: 1,
      };
      setZones((prev) => [...prev, newZone]);
      setZoneNameInput(`${ZONE_META[drawTool].defaultPrefix} ${sameCount + 1}`);
      appendLog(finalName, `${ZONE_META[drawTool].label} जोड़ा गया`, 'info', dragState.cameraLabel);

      // Sync drawn slab to backend VisualPairingBlocks so Edge AI monitors & logs reports for it
      const matchedCam = cameras.find((c) => c._id === dragState.cameraKey);
      if (matchedCam && drawTool !== 'ignore') {
        const catMap: Record<Exclude<ZoneType, 'ignore'>, string> = {
          gate: 'GATE_TRIPWIRE',
          galla: 'GALLA',
          tank: 'SHELF',
          customer: 'CUSTOM',
        };
        const xMin = Math.min(dragState.x1, dragState.x2) * 100;
        const yMin = Math.min(dragState.y1, dragState.y2) * 100;
        const wPct = Math.max(4, Math.abs(dragState.x2 - dragState.x1) * 100);
        const hPct = Math.max(4, Math.abs(dragState.y2 - dragState.y1) * 100);
        API.post('/cameras/pairing-blocks', {
          blockCode: `SLAB-CH${matchedCam.channel || 1}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
          name: `${finalName} (Ch#${matchedCam.channel || 1})`,
          category: catMap[drawTool],
          color: ZONE_META[drawTool].color,
          cameraChannel: matchedCam.channel || 1,
          coordinates: {
            x: Math.round(xMin),
            y: Math.round(yMin),
            width: Math.round(wPct),
            height: Math.round(hPct),
          },
          shelfConfig: drawTool === 'tank' ? { capacity: parseInt(tankCapacityInput, 10) || 10, pickCount: 0 } : undefined,
        })
          .then((res) => {
            const savedId = res.data?.block?._id || res.data?._id;
            if (savedId) {
              setZones((prev) => prev.map((item) => (item.id === newZone.id ? { ...item, backendBlockId: savedId } : item)));
            }
          })
          .catch(() => {});
      }
    }
    setDragState(null);
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

  // Bridge Uploaded Test Video / Webcam directly into the 3D Tesla Twin (`videoTestFrameUrl`) so Test Mode = 100% Live 3D Parity!
  useEffect(() => {
    if (sourceMode === 'DVR') {
      setVideoTestFrameUrl(null);
      return;
    }
    const grabCanvas = document.createElement('canvas');
    grabCanvas.width = 640;
    grabCanvas.height = 360;
    const gctx = grabCanvas.getContext('2d');

    const captureTestFrame = () => {
      const v = videoRef.current;
      if (!v || v.readyState < 2 || !gctx) return;
      gctx.drawImage(v, 0, 0, 640, 360);
      setVideoTestFrameUrl(grabCanvas.toDataURL('image/jpeg', 0.78));
    };

    const iv = setInterval(captureTestFrame, 850);
    captureTestFrame();
    return () => clearInterval(iv);
  }, [sourceMode, videoUrl, isPlaying]);

  const launchVideoFromTrainerIn3D = useCallback((file: File, ch: number) => {
    stopWebcam();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setTestVideoChannel(ch);
    setSourceMode('FILE');
    setShowTesla3D(true);
    setVideoUrl(url);
    setVideoFileName(file.name);
    delete prevFramesRef.current['FILE'];
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = url;
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }, 80);
    appendLog('3D टेस्ट मोड', `फुटेज "${file.name}" को Ch#${ch} पर Tesla 3D मॉडल के साथ लाइव जोड़ा गया`, 'info');
  }, [videoUrl, appendLog]);

  const effective3DCameras = (() => {
    if (sourceMode === 'DVR') return cameras;
    const matched = cameras.find((c, idx) => Number(c.channel || idx + 1) === Number(testVideoChannel));
    if (matched) return cameras;
    return [
      ...cameras,
      {
        _id: `virtual-test-ch-${testVideoChannel}`,
        name: `टेस्ट फुटेज (Ch#${testVideoChannel})`,
        channel: testVideoChannel,
        ipAddress: 'TEST-MODE',
        locationType: 'TEST_SIMULATION',
        status: 'ONLINE',
      },
    ];
  })();

  const effective3DSnapshots = (() => {
    if (sourceMode === 'DVR' || !videoTestFrameUrl) return dvrFrames;
    const matched = effective3DCameras.find((c, idx) => Number(c.channel || idx + 1) === Number(testVideoChannel));
    if (!matched) return dvrFrames;
    return { ...dvrFrames, [matched._id]: videoTestFrameUrl };
  })();

  const visibleCameras = focusedCamId ? cameras.filter((c) => c._id === focusedCamId) : cameras;
  const gridColsClass =
    focusedCamId || visibleCameras.length <= 1
      ? 'grid-cols-1'
      : visibleCameras.length === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : visibleCameras.length === 3
      ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-1 md:grid-cols-2'; // 4 or 5+ cameras look ultra crisp in 2-col grid (or 3-col on wide)

  const cashDiff = matchedVoiceCash - enteredCash;

  return (
    <div className="space-y-4">
      {/* Top Executive Command Header */}
      <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            दुकान निगरानी — मल्टी-कैमरा AI कमांड सेंटर
          </h2>
          <p className="text-xs text-dark-400 mt-0.5">
            एक ही स्क्रीन पर अपने सभी DVR कैमरे (3, 4 या 5+) देखें, किसी भी कैमरे पर सीधे ज़ोन खींचें, और लाइव ऑडियो + गल्ला हिसाब ट्रैक करें।
          </p>
        </div>

        {/* Source Switcher & Quick Reports */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTesla3D(!showTesla3D)}
            className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition-all shadow ${
              showTesla3D
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white border-cyan-400 keep-white-text'
                : 'bg-dark-800 text-cyan-300 border-cyan-500/40 hover:border-cyan-400'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>🛸 3D Tesla व्यू {showTesla3D ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTrainerModalOpen(true)}
            className="px-3 py-2 rounded-xl text-xs font-extrabold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25 flex items-center gap-1.5 shadow"
          >
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>🧠 AI ट्रेनर व टेस्ट लैब</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPairingModalOpen(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/35 hover:bg-amber-500/25 flex items-center gap-1.5"
          >
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>💎 प्लान स्लैब्स व ब्लॉक्स ({pairingBlocks.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              handleStartLiveDvr();
              setFocusedCamId(null);
            }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              sourceMode === 'DVR'
                ? 'bg-emerald-600 text-white border-emerald-600 keep-white-text'
                : 'bg-dark-800 text-dark-200 border-dark-700 hover:border-emerald-500/40'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>सभी DVR कैमरे ({cameras.length})</span>
          </button>

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
            <span>वीडियो फ़ाइल</span>
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

      {/* Live System Health & Setup Diagnostics Bar (Always-On Instant Visibility) */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-md">
        <div className="flex items-center gap-2 font-bold text-slate-200">
          <Activity className="w-4 h-4 text-sky-400" />
          <span>लाइव सिस्टम हेल्थ:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 1. DVR Camera Feed / Bridge Status */}
          {(() => {
            const liveCamCnt = Object.values(dvrStatus).filter((s) => s === 'LIVE').length;
            const dvrOk = liveCamCnt > 0 || pipelineHealth.dvrBridgeOnline;
            return (
              <span
                className={`px-2.5 py-1 rounded-xl border font-semibold flex items-center gap-1.5 ${
                  dvrOk
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/35 text-amber-300'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${dvrOk ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span>
                  DVR ब्रिज: {dvrOk ? `LIVE (${Math.max(liveCamCnt, pipelineHealth.freshCamerasCount)}/${cameras.length || 0} कैमरे)` : sourceMode !== 'DVR' ? sourceMode : 'कनेक्ट हो रहा है'}
                </span>
              </span>
            );
          })()}

          {/* 2. Python Edge AI Engine Status */}
          <span
            className={`px-2.5 py-1 rounded-xl border font-semibold flex items-center gap-1.5 ${
              pipelineHealth.edgeAiOnline
                ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                : pipelineHealth.recorderOnline
                ? 'bg-sky-500/10 border-sky-500/35 text-sky-300'
                : 'bg-slate-900 border-slate-700 text-slate-300'
            }`}
            title="दुकान के PC पर start_edge_ai.bat चालू रहने पर 24/7 YOLO + ऑडियो रिंग चलता है"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                pipelineHealth.edgeAiOnline
                  ? 'bg-emerald-400 animate-pulse'
                  : pipelineHealth.recorderOnline
                  ? 'bg-sky-400'
                  : 'bg-slate-500'
              }`}
            />
            <span>
              Edge AI Python: {pipelineHealth.edgeAiOnline ? 'LIVE (24/7 सिंक)' : pipelineHealth.recorderOnline ? 'बैकग्राउंड चालू' : 'ब्राउज़र AI मोड'}
            </span>
          </span>

          {/* 3. Live Audio / Mic Level Meter */}
          {(() => {
            const rms = liveTelemetry?.audio?.rms || 0;
            const pct = Math.min(100, Math.round((rms / 9000) * 100));
            const audioLive = micActive || pipelineHealth.edgeAiOnline;
            return (
              <span
                className={`px-2.5 py-1 rounded-xl border font-semibold flex items-center gap-2 ${
                  audioLive
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${audioLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span>माइक ऑडियो: {micActive ? 'ब्राउज़र LIVE' : pipelineHealth.edgeAiOnline ? 'DVR RTSP LIVE' : 'स्टैंडबाय'}</span>
                {pipelineHealth.edgeAiOnline && (
                  <span className="w-12 h-1.5 rounded-full bg-slate-800 overflow-hidden inline-block">
                    <span
                      className="h-full bg-emerald-400 block transition-all duration-300"
                      style={{ width: `${Math.max(8, pct)}%` }}
                    />
                  </span>
                )}
              </span>
            );
          })()}

          {/* 4. 3D Tracker + Real-Time Socket Status */}
          <span
            className={`px-2.5 py-1 rounded-xl border font-semibold flex items-center gap-1.5 ${
              pipelineHealth.yoloReady || pipelineHealth.edgeAiOnline
                ? 'bg-sky-500/10 border-sky-500/35 text-sky-300'
                : 'bg-amber-500/10 border-amber-500/35 text-amber-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                pipelineHealth.socketConnected ? 'bg-sky-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>
              3D ट्रैकर: {pipelineHealth.yoloReady || pipelineHealth.edgeAiOnline ? '60FPS LIVE' : 'लोड हो रहा है'} • सॉकेट {pipelineHealth.socketConnected ? 'ON' : 'SYNC'}
            </span>
          </span>
        </div>
      </div>

      {routineAnomalyBanner && (
        <div className="px-4 py-2.5 rounded-2xl bg-amber-950/75 border border-amber-500/50 flex items-center justify-between gap-3 text-xs text-amber-200 font-semibold">
          <span>🧠 {routineAnomalyBanner}</span>
          <button
            type="button"
            onClick={() => setRoutineAnomalyBanner(null)}
            className="px-2 py-0.5 rounded bg-amber-900/60 text-amber-100 text-[11px]"
          >
            ठीक है
          </button>
        </div>
      )}

      {/* Three.js WebGL 60FPS Tesla FSD 3D Reality View (Works identically on Live DVR AND Uploaded Test Footage!) */}
      {showTesla3D && (
        <UnifiedStore360View
          cameras={effective3DCameras}
          gridSnapshots={effective3DSnapshots}
          pairingBlocks={pairingBlocks}
          liveTelemetry={sourceMode === 'DVR' ? liveTelemetry : null}
          isVideoTestMode={sourceMode !== 'DVR'}
          localSpeechQuote={lastHeardText}
          localGallaPulseAt={localGallaPulseAt}
          onSelectSingleCamera={(camId) => {
            if (!camId.startsWith('virtual-test-')) {
              setSourceMode('DVR');
              setFocusedCamId(camId);
            }
          }}
          onOpenVisualPairingForChannel={() => setIsPairingModalOpen(true)}
          todayStats={{
            customers: customerZoneCount,
            gallaOpenings: gallaMotionCount,
          }}
        />
      )}

      {/* In-Software Self-Learning AI Model Trainer & Video-to-3D Test Studio */}
      <AiTrainerStudioModal
        isOpen={isTrainerModalOpen}
        onClose={() => setIsTrainerModalOpen(false)}
        cameras={cameras}
        dvrFrames={dvrFrames}
        onLaunchVideoIn3DTest={launchVideoFromTrainerIn3D}
        onBrainUpdated={() => {
          aiBrainService.refreshBrain(true);
        }}
      />

      {/* Visual Pairing & Plan Slabs Modal */}
      <VisualPairingModal
        isOpen={isPairingModalOpen}
        onClose={() => {
          setIsPairingModalOpen(false);
          fetchPairingBlocks();
        }}
        cameras={cameras}
      />

      {/* Main Unified 12-Column Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* ============================================================== */}
        {/* LEFT COLUMN (8 Cols): Multi-Camera Frame + Zone Draw Toolbar   */}
        {/* ============================================================== */}
        <div className="xl:col-span-8 space-y-4">
          {/* Multi-Camera / Single-Source Unified Video Frame */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-3 space-y-3">
            {sourceMode === 'DVR' ? (
              <>
                {/* Top Strip inside Multi-Camera Frame */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      {focusedCamId
                        ? `फ़ोकस व्यू: ${visibleCameras[0]?.name || 'कैमरा'}`
                        : `एक साथ ${cameras.length} लाइव DVR कैमरे (हर कैमरे पर अलग AI एनालिसिस चालू)`}
                    </span>
                  </div>
                  {focusedCamId && (
                    <button
                      type="button"
                      onClick={() => setFocusedCamId(null)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white keep-white-text font-semibold flex items-center gap-1"
                    >
                      <Minimize2 className="w-3 h-3" /> सभी {cameras.length} कैमरे एक साथ देखें
                    </button>
                  )}
                </div>

                {cameras.length === 0 ? (
                  <div className="aspect-video bg-zinc-950 rounded-xl flex flex-col items-center justify-center p-6 text-center space-y-3 border border-dark-800">
                    <Video className="w-10 h-10 text-zinc-500" />
                    <p className="text-sm font-semibold text-zinc-200">अभी कोई DVR कैमरा जुड़ा नहीं है</p>
                    <p className="text-xs text-zinc-400 max-w-md">
                      ऊपर “DVR सेटिंग” से अपने 3, 4 या 5 DVR चैनल जोड़ें, या “वीडियो फ़ाइल” बटन से DVR रिकॉर्डिंग तुरंत टेस्ट करें।
                    </p>
                    <div className="flex items-center gap-2">
                      {onOpenCameraSettings && (
                        <button
                          type="button"
                          onClick={onOpenCameraSettings}
                          className="px-4 py-2 rounded-lg bg-emerald-600 text-white keep-white-text text-xs font-semibold"
                        >
                          + DVR कैमरा जोड़ें
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-100 text-xs font-semibold"
                      >
                        वीडियो फ़ाइल चुनें
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`grid ${gridColsClass} gap-2.5`}>
                    {visibleCameras.map((cam) => {
                      const camLabel = `Ch #${cam.channel || 1}`;
                      const frameSrc = dvrFrames[cam._id];
                      const isOnline = dvrStatus[cam._id] === 'LIVE';
                      const camZoneCount = zones.filter((z) => z.cameraKey === cam._id).length;

                      return (
                        <div
                          key={cam._id}
                          className="relative bg-zinc-950 rounded-xl overflow-hidden border border-dark-800 flex flex-col select-none"
                        >
                          {/* Mini Camera Header */}
                          <div className="px-2.5 py-1.5 bg-zinc-900/95 border-b border-zinc-800 flex items-center justify-between gap-2 text-[11px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              <span className="font-semibold text-zinc-100 truncate">
                                {camLabel} • {cam.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {camZoneCount > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
                                  {camZoneCount} ज़ोन
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setFocusedCamId(focusedCamId === cam._id ? null : cam._id)}
                                className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                                title={focusedCamId === cam._id ? 'ग्रिड व्यू' : 'बड़ा करके ज़ोन खींचें'}
                              >
                                {focusedCamId === cam._id ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>

                          {/* Camera Video + Direct Drag-to-Draw Canvas */}
                          <div className="relative w-full aspect-video bg-zinc-950">
                            {frameSrc ? (
                              <img
                                ref={(el) => { dvrImgRefs.current[cam._id] = el; }}
                                src={frameSrc}
                                alt={cam.name}
                                crossOrigin="anonymous"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
                                <Camera className="w-6 h-6 text-zinc-600 mb-1" />
                                <span className="text-[11px] text-zinc-400 font-medium">{camLabel} सिंक हो रहा है...</span>
                                <span className="text-[10px] text-zinc-500 mt-0.5">ड्रैग करके ज़ोन अभी भी सेट कर सकते हैं</span>
                              </div>
                            )}

                            <canvas
                              ref={(el) => { overlayCanvasRefs.current[cam._id] = el; }}
                              onMouseDown={(e) => handleCanvasDown(cam._id, camLabel, e)}
                              onMouseMove={(e) => handleCanvasMove(cam._id, e)}
                              onMouseUp={handleCanvasUp}
                              onMouseLeave={handleCanvasUp}
                              className="absolute inset-0 w-full h-full cursor-crosshair z-10"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              /* Single Video File or Webcam Viewport */
              <>
                <div className="relative w-full aspect-video bg-zinc-950 rounded-xl overflow-hidden border border-dark-800 select-none">
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
                      className="w-full h-full flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:bg-zinc-900/60 transition-colors space-y-2"
                    >
                      <Upload className="w-8 h-8 text-emerald-400" />
                      <p className="text-sm font-semibold text-zinc-100">DVR रिकॉर्डिंग वीडियो फ़ाइल चुनने के लिए क्लिक करें</p>
                    </div>
                  )}
                  <canvas
                    ref={(el) => { overlayCanvasRefs.current[sourceMode] = el; }}
                    onMouseDown={(e) => handleCanvasDown(sourceMode, sourceMode === 'FILE' ? 'वीडियो' : 'वेबकैम', e)}
                    onMouseMove={(e) => handleCanvasMove(sourceMode, e)}
                    onMouseUp={handleCanvasUp}
                    onMouseLeave={handleCanvasUp}
                    className="absolute inset-0 w-full h-full cursor-crosshair z-10"
                  />
                </div>

                {sourceMode === 'FILE' && videoUrl && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={togglePlayPause}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white keep-white-text font-semibold flex items-center gap-1.5"
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{isPlaying ? 'रोकें' : 'चलाएँ'}</span>
                      </button>
                      <select
                        value={testVideoChannel}
                        onChange={(e) => setTestVideoChannel(Number(e.target.value))}
                        className="px-2.5 py-1.5 rounded-lg bg-dark-950 border border-dark-700 text-xs text-sky-300 font-semibold"
                        title="इस टेस्ट फुटेज को किस 3D कैमरा ज़ोन पर चलाना है?"
                      >
                        <option value={1}>3D मैप: Ch#1 काउंटर</option>
                        <option value={2}>3D मैप: Ch#2 गल्ला/फ्रीजर</option>
                        <option value={3}>3D मैप: Ch#3 रैक/कांटा</option>
                        <option value={4}>3D मैप: Ch#4 मुख्य गेट</option>
                        <option value={5}>3D मैप: Ch#5 सड़क</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setIsTrainerModalOpen(true)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-semibold"
                      >
                        🧠 इस वीडियो से सिखाएँ
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
                      <RotateCcw className="w-3.5 h-3.5" /> गिनती रीसेट
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Drawing Controls Card ("क्या खींचना है? (स्क्रीन पर ड्रैग करें)") */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">क्या खींचना है? (किसी भी कैमरे की स्क्रीन पर ड्रैग करें)</h3>
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
                }}
                className="text-[11px] text-dark-400 hover:text-white flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> गिनती रीसेट
              </button>
            </div>

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

            <div className="text-[11px] leading-relaxed text-dark-400 space-y-1 pt-1 border-t border-dark-800">
              <p>
                आप एक साथ 3, 4 या 5 कैमरों में से हर कैमरे पर अलग-अलग ज़ोन खींच सकते हैं (जैसे Ch #1 पर <strong className="text-dark-200">ग्राहक ज़ोन + अनदेखा ज़ोन</strong>, Ch #2 पर <strong className="text-dark-200">गल्ला ज़ोन</strong>, और Ch #3 पर <strong className="text-dark-200">टंकी / सामान ज़ोन</strong>)। हर कैमरा स्वतंत्र रूप से और बिना लैग के एनालाइज़ होता है।
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* RIGHT COLUMN (4 Cols): Stats + Cash + Voice + Zones + Logs     */}
        {/* ============================================================== */}
        <div className="xl:col-span-4 space-y-4">
          {/* 1. आज का हिसाब */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 space-y-3">
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
                className="w-28 px-3 py-2 rounded-xl border border-dark-700 bg-dark-950 text-xs font-semibold"
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

          {/* 2. माइक व रेट लिस्ट */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleMic}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all ${
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
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-dark-950 text-dark-200 border border-dark-700 hover:border-dark-500 flex items-center gap-1.5"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{isMuted ? 'फुटेज आवाज़ चालू' : 'फुटेज आवाज़ बंद'}</span>
              </button>
            </div>

            {interimText && (
              <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-400">
                🎙️ सुन रहा है: {interimText}...
              </div>
            )}

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
          </div>

          {/* 3. ज़ोन और लाइनें */}
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
                अभी कोई ज़ोन नहीं बना है। बाईं ओर किसी भी कैमरे पर माउस से ड्रैग करके ज़ोन खींचें।
              </p>
            ) : (
              <div className="divide-y divide-dark-800 max-h-48 overflow-y-auto pr-1">
                {zones.map((z) => (
                  <div key={z.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ZONE_META[z.type].color }} />
                      <div className="min-w-0">
                        <span className="font-semibold text-dark-100 block truncate">
                          {ZONE_META[z.type].short}: {z.name}
                        </span>
                        {z.cameraLabel && (
                          <span className="text-[10px] text-dark-400">{z.cameraLabel}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {z.type === 'tank' && (
                        <button
                          type="button"
                          onClick={() => captureTankBaseline(z.id)}
                          className="px-2 py-1 rounded-lg bg-dark-950 border border-dark-700 text-[10px] text-teal-400 font-semibold flex items-center gap-1"
                        >
                          <Palette className="w-3 h-3" /> रंग सेट
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
                          className="px-2 py-1 rounded-lg bg-dark-950 border border-dark-700 text-[10px] text-dark-300 font-semibold flex items-center gap-1"
                        >
                          <ArrowLeftRight className="w-3 h-3" /> दिशा
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (z.backendBlockId) {
                            API.delete(`/cameras/pairing-blocks/${z.backendBlockId}`).catch(() => {});
                          }
                          setZones((prev) => prev.filter((item) => item.id !== z.id));
                        }}
                        className="px-2 py-1 rounded-lg bg-dark-950 border border-dark-700 text-dark-300 hover:text-rose-400 hover:border-rose-500/40 font-semibold"
                      >
                        हटाएँ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. गतिविधि लॉग */}
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
                  कोई गतिविधि अभी दर्ज नहीं हुई है। कैमरे चालू हैं — हलचल होते ही यहाँ लॉग दिखेगा।
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
