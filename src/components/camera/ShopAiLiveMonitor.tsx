import React, { useState, useEffect, useRef, useCallback } from 'react';
import API from '../../api';
import { useAuth } from '../../context/AuthContext';
import { 
  Sparkles, AlertTriangle, 
  CheckCircle2, RefreshCw, Camera,
  LayoutGrid, Maximize2, Video, ShieldAlert,
  Play, X, Calendar
} from 'lucide-react';
import { UltraCrispIncidentCard, type UltraCrispIncidentItem } from './UltraCrispIncidentCard';
import { ShopAiReportDetailModal } from './ShopAiReportDetailModal';
import type { ShopAiReportItem } from './ShopAiReportDetailModal';

interface CameraDevice {
  _id: string;
  name: string;
  deviceType?: 'DVR' | 'NVR' | 'IP_CAMERA';
  brand?: 'HIKVISION' | 'CP_PLUS' | 'DAHUA' | 'GENERIC_ONVIF';
  channel?: number;
  channelType?: 'ANALOG' | 'IP';
  ipAddress: string;
  locationType: string;
  status: string;
}

interface Props {
  cameras: CameraDevice[];
  onReportCreated?: () => void;
  onOpenProfiles?: () => void;
  onOpenTimeGalla?: () => void;
  onOpenDvrPlayback?: () => void;
  onOpenFridge?: () => void;
  onOpenStaffTerminal?: () => void;
}

export const ShopAiLiveMonitor: React.FC<Props> = ({ 
  cameras, 
  onReportCreated
}) => {
  const { t, language } = useAuth();
  const [viewMode, setViewMode] = useState<'GRID' | 'SINGLE'>('GRID');
  const [selectedCameraId, setSelectedCameraId] = useState<string>(cameras[0]?._id || '');
  const [cameraSource, setCameraSource] = useState<'HIKVISION' | 'WEBCAM'>('HIKVISION');
  const [isLiveStreaming, setIsLiveStreaming] = useState(false);
  const [liveSnapshotUrl, setLiveSnapshotUrl] = useState<string | null>(null);
  const [gridSnapshots, setGridSnapshots] = useState<Record<string, string>>({});
  const [streamError, setStreamError] = useState<string | null>(null);

  // Sync selected camera when cameras list loads
  useEffect(() => {
    if ((!selectedCameraId || !cameras.some(c => c._id === selectedCameraId)) && cameras.length > 0) {
      setSelectedCameraId(cameras[0]._id);
    }
  }, [cameras, selectedCameraId]);

  const [isAuditingNow, setIsAuditingNow] = useState(false);
  const [lastAuditResult, setLastAuditResult] = useState<ShopAiReportItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Ultra-Crisp Actionable Incidents Stream
  const [incidents, setIncidents] = useState<UltraCrispIncidentItem[]>([]);
  const [selectedReplayIncident, setSelectedReplayIncident] = useState<UltraCrispIncidentItem | null>(null);
  const [incidentFilter, setIncidentFilter] = useState<'ALL' | 'FLAGGED_THEFT' | 'PENDING_REVIEW'>('ALL');

  // Date Filtering State
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };
  const [datePreset, setDatePreset] = useState<'TODAY' | 'YESTERDAY' | 'ALL' | 'CUSTOM'>('TODAY');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());

  // Live Shop Context
  const [liveContextPrompt] = useState(
    'दुकान: श्री कृष्णा डेयरी। काउंटर पर नौकर आकाश है। गल्ला, ग्राहक बिक्री व हाथ की हरकतों पर 2-लाइन क्रिस्प अलर्ट दें।'
  );

  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const snapshotIntervalRef = useRef<any>(null);
  const gridIntervalRef = useRef<any>(null);

  // Fetch Ultra-Crisp Incidents from server (With Date Filter)
  const fetchIncidents = useCallback(async () => {
    try {
      const params: any = {};
      if (datePreset === 'TODAY') {
        params.date = getTodayStr();
      } else if (datePreset === 'YESTERDAY') {
        params.date = getYesterdayStr();
      } else if (datePreset === 'CUSTOM' && selectedDate) {
        params.date = selectedDate;
      }

      const res = await API.get('/cameras/incidents', { params });
      if (res.data?.success && res.data.incidents) {
        setIncidents(res.data.incidents);
      }
    } catch (e) {
      console.warn('Failed to load incidents', e);
    }
  }, [datePreset, selectedDate]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // Handle Incident Status Change
  const handleIncidentStatusChange = async (id: string, newStatus: 'FLAGGED_THEFT' | 'CLEARED_SAFE') => {
    try {
      await API.patch(`/cameras/incidents/${id}/status`, { status: newStatus });
      setIncidents(prev => prev.map(inc => inc.id === id ? { ...inc, status: newStatus } : inc));
    } catch (e) {
      console.error('Failed to update incident status', e);
    }
  };

  // Zero-Cost Edge Rule Trigger Helper
  const triggerEdgeRuleTest = async (ruleType: 'GALLA_MISMATCH' | 'DELTA_COIN' | 'HAND_POCKET' | 'HAND_MOUTH' | 'COUNTER_CROSS') => {
    try {
      let payload: any = {};
      if (ruleType === 'GALLA_MISMATCH') {
        payload = {
          drawerOpened: true,
          activeBillAmount: 0,
          noteInsertedOrDetected: 500,
          micActivity: { channel: 'GALLA', decibels: 78, matchedKeywords: ['दराज खटकी', 'नोट'] }
        };
      } else if (ruleType === 'DELTA_COIN') {
        payload = {
          drawerOpened: true,
          activeBillAmount: 120,
          noteInsertedOrDetected: 500,
          micActivity: { channel: 'COUNTER', decibels: 65, matchedKeywords: ['500 रुपये दिए', 'चिल्लर'] }
        };
      } else if (ruleType === 'HAND_POCKET') {
        payload = {
          drawerOpened: false,
          activeBillAmount: 0,
          poseAlert: 'HAND_TO_POCKET',
          micActivity: { channel: 'COUNTER', decibels: 45 }
        };
      } else if (ruleType === 'HAND_MOUTH') {
        payload = {
          drawerOpened: false,
          activeBillAmount: 0,
          poseAlert: 'HAND_TO_MOUTH',
          micActivity: { channel: 'COUNTER', decibels: 48 }
        };
      } else if (ruleType === 'COUNTER_CROSS') {
        payload = {
          drawerOpened: false,
          activeBillAmount: 0,
          counterItemPassed: true,
          counterItemBilled: false,
          micActivity: { channel: 'COUNTER', decibels: 72, matchedKeywords: ['ले जाओ बाद में देना'] }
        };
      }

      // If in webcam mode, attach screenshot frame
      if (cameraSource === 'WEBCAM') {
        payload.snapshotImage = captureWebcamBase64();
      }

      const res = await API.post('/cameras/evaluate-edge-rules', payload);
      if (res.data?.success && res.data.incident) {
        setIncidents(prev => [res.data.incident, ...prev.slice(0, 30)]);
      }
    } catch (err: any) {
      console.error('Edge rule trigger error:', err);
    }
  };

  // 1. Fetch Single Hikvision Snapshot (Blob URL)
  const fetchLiveHikvisionSnapshot = useCallback(async () => {
    if (!selectedCameraId) return;
    try {
      const res = await API.get(`/cameras/${selectedCameraId}/live-snapshot?t=${Date.now()}`, {
        responseType: 'blob'
      });
      const objectUrl = URL.createObjectURL(res.data);
      setLiveSnapshotUrl((prev) => {
        if (prev && prev.startsWith('blob:')) {
          URL.revokeObjectURL(prev);
        }
        return objectUrl;
      });
      setStreamError(null);
    } catch (err: any) {
      console.warn('Hikvision snapshot stream error:', err);
    }
  }, [selectedCameraId]);

  // 2. Fetch Multi-Camera Grid Snapshots
  const fetchGridSnapshots = useCallback(async () => {
    if (cameraSource !== 'HIKVISION' || cameras.length === 0) return;
    try {
      await Promise.allSettled(
        cameras.map(async (cam) => {
          try {
            const res = await API.get(`/cameras/${cam._id}/live-snapshot?t=${Date.now()}`, {
              responseType: 'blob',
              timeout: 6000
            });
            const objectUrl = URL.createObjectURL(res.data);
            setGridSnapshots((prev) => {
              if (prev[cam._id] && prev[cam._id].startsWith('blob:')) {
                URL.revokeObjectURL(prev[cam._id]);
              }
              return { ...prev, [cam._id]: objectUrl };
            });
          } catch (e) {}
        })
      );
    } catch (e) {}
  }, [cameras, cameraSource]);

  // Loop for Multi-Camera Grid
  useEffect(() => {
    if (viewMode === 'GRID' && cameraSource === 'HIKVISION' && cameras.length > 0) {
      fetchGridSnapshots();
      gridIntervalRef.current = setInterval(fetchGridSnapshots, 3500);
    }
    return () => {
      if (gridIntervalRef.current) clearInterval(gridIntervalRef.current);
    };
  }, [viewMode, cameraSource, cameras, fetchGridSnapshots]);

  // Loop for Single Focus Hikvision Stream
  useEffect(() => {
    if (viewMode === 'SINGLE' && cameraSource === 'HIKVISION' && selectedCameraId) {
      fetchLiveHikvisionSnapshot();
      snapshotIntervalRef.current = setInterval(fetchLiveHikvisionSnapshot, 2500);
    }
    return () => {
      if (snapshotIntervalRef.current) clearInterval(snapshotIntervalRef.current);
    };
  }, [viewMode, cameraSource, selectedCameraId, fetchLiveHikvisionSnapshot]);

  // WebCam Handling
  const startWebcam = async () => {
    try {
      setStreamError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
        audio: false
      });
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
        await webcamVideoRef.current.play();
      }
      setIsLiveStreaming(true);
    } catch (err: any) {
      setStreamError(`वेबकैम शुरू नहीं हो पाया: ${err.message}. कृपया कैमरा अनुमति प्रदान करें।`);
      setIsLiveStreaming(false);
    }
  };

  const stopWebcam = () => {
    if (webcamVideoRef.current?.srcObject) {
      const stream = webcamVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      webcamVideoRef.current.srcObject = null;
    }
    setIsLiveStreaming(false);
  };

  const handleToggleCameraSource = (source: 'HIKVISION' | 'WEBCAM') => {
    if (source === 'WEBCAM') {
      if (snapshotIntervalRef.current) clearInterval(snapshotIntervalRef.current);
      if (gridIntervalRef.current) clearInterval(gridIntervalRef.current);
      setViewMode('SINGLE');
      startWebcam();
    } else {
      stopWebcam();
    }
    setCameraSource(source);
  };

  const captureWebcamBase64 = (): string | null => {
    if (!webcamVideoRef.current) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = webcamVideoRef.current.videoWidth || 640;
      canvas.height = webcamVideoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(webcamVideoRef.current, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch (e) {
      return null;
    }
  };

  // Instant AI Live Audit
  const handleInstantLiveAudit = async (camIdToAudit?: string) => {
    const targetCamId = camIdToAudit || selectedCameraId;
    const targetCam = cameras.find((c) => c._id === targetCamId);
    setIsAuditingNow(true);
    setStreamError(null);

    try {
      let snapshotBase64 = '';
      if (cameraSource === 'WEBCAM') {
        snapshotBase64 = captureWebcamBase64() || '';
      }

      const payload = {
        cameraId: cameraSource === 'HIKVISION' ? targetCamId : undefined,
        snapshotBase64: snapshotBase64 || undefined,
        userContextPrompt: liveContextPrompt,
        cameraName: targetCam 
          ? `${targetCam.name} (Ch #${targetCam.channel || 1})` 
          : (cameraSource === 'HIKVISION' ? 'Hikvision IP Camera' : 'Counter Webcam'),
      };

      const res = await API.post('/cameras/shop-ai/live-audit', payload, { timeout: 120000 });
      if (res.data?.report) {
        setLastAuditResult(res.data.report);
        if (onReportCreated) onReportCreated();
        fetchIncidents();
      }
    } catch (err: any) {
      setStreamError(err.response?.data?.message || err.message || 'लाइव निरीक्षण में त्रुटि आई।');
    } finally {
      setIsAuditingNow(false);
    }
  };

  const selectedCamObj = cameras.find((c) => c._id === selectedCameraId) || cameras[0];
  const filteredIncidents = incidents.filter(i => {
    if (incidentFilter === 'FLAGGED_THEFT') return i.status === 'FLAGGED_THEFT';
    if (incidentFilter === 'PENDING_REVIEW') return i.status === 'PENDING_REVIEW';
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Sleek Minimalist Live Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 px-5 rounded-2xl bg-dark-900 border border-dark-800 shadow-md">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>LIVE</span>
          </span>
          <h2 className="text-sm md:text-base font-extrabold text-white">
            {language === 'hi' ? 'लाइव AI कैमरा व चोरी रोकथाम' : 'Live AI Camera & Theft Monitor'}
          </h2>
          <span className="hidden sm:inline-block text-[11px] text-dark-400 font-medium">
            • {cameras.length} {language === 'hi' ? 'कैमरे सक्रिय' : 'Cameras Active'}
          </span>
        </div>

        {/* View & Source Toggles */}
        <div className="flex items-center gap-2">
          {cameraSource === 'HIKVISION' && cameras.length > 1 && (
            <div className="flex items-center gap-1 bg-dark-950 p-1 rounded-xl border border-dark-800">
              <button
                type="button"
                onClick={() => setViewMode('GRID')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'GRID' ? 'bg-indigo-600 text-white shadow-sm' : 'text-dark-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{language === 'hi' ? 'ग्रिड' : 'Grid'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('SINGLE')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'SINGLE' ? 'bg-indigo-600 text-white shadow-sm' : 'text-dark-400 hover:text-white'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>{language === 'hi' ? 'सिंगल' : 'Single'}</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 bg-dark-950 p-1 rounded-xl border border-dark-800">
            <button
              type="button"
              onClick={() => handleToggleCameraSource('HIKVISION')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                cameraSource === 'HIKVISION' ? 'bg-indigo-600 text-white shadow-sm' : 'text-dark-400 hover:text-white'
              }`}
            >
              📹 DVR
            </button>
            <button
              type="button"
              onClick={() => handleToggleCameraSource('WEBCAM')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                cameraSource === 'WEBCAM' ? 'bg-indigo-600 text-white shadow-sm' : 'text-dark-400 hover:text-white'
              }`}
            >
              📱 वेबकैम
            </button>
          </div>
        </div>
      </div>

      {/* Main Viewport + Ultra-Crisp Incidents Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Live Video/Snapshot Feed (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-3xl bg-dark-900 border border-dark-800 shadow-xl space-y-4">
            
            {/* Header / Select Cam */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <div>
                  <h3 className="text-sm font-black text-white">
                    {cameraSource === 'HIKVISION' 
                      ? (selectedCamObj ? `${selectedCamObj.name} [Ch #${selectedCamObj.channel || 1}]` : 'DVR लाइव स्ट्रीम') 
                      : 'वेबकैम स्ट्रीम'}
                  </h3>
                  <p className="text-[10px] text-dark-400">
                    {cameraSource === 'HIKVISION' ? 'Hikvision Turbo HD DVR • LAN Feed' : 'Local WebCam Device'}
                  </p>
                </div>
              </div>

              {cameraSource === 'HIKVISION' && cameras.length > 0 && (
                <select
                  value={selectedCameraId}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
                >
                  {cameras.map((cam) => (
                    <option key={cam._id} value={cam._id}>
                      {cam.name} [Ch #{cam.channel || 1}]
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Viewport Frame */}
            <div className="relative rounded-3xl overflow-hidden bg-black border border-dark-800 aspect-video flex items-center justify-center shadow-inner">
              {cameraSource === 'HIKVISION' ? (
                viewMode === 'GRID' && cameras.length > 1 ? (
                  <div className="w-full h-full grid grid-cols-2 md:grid-cols-3 gap-1.5 p-1.5 bg-black">
                    {cameras.map((cam) => (
                      <div
                        key={cam._id}
                        onClick={() => { setSelectedCameraId(cam._id); setViewMode('SINGLE'); }}
                        className="relative rounded-2xl overflow-hidden bg-dark-950 border border-dark-800 cursor-pointer group flex items-center justify-center hover:border-indigo-500/50 transition-all"
                      >
                        {gridSnapshots[cam._id] ? (
                          <img
                            src={gridSnapshots[cam._id]}
                            alt={cam.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-center p-2">
                            <Camera className="w-5 h-5 text-dark-600 mx-auto mb-1 animate-pulse" />
                            <span className="text-[10px] text-dark-400 font-bold block">{cam.name}</span>
                          </div>
                        )}
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[9px] font-bold text-white">
                          Ch #{cam.channel || 1}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : liveSnapshotUrl ? (
                  <img
                    src={liveSnapshotUrl}
                    alt="Hikvision Live Feed"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <Camera className="w-10 h-10 text-dark-500 mx-auto animate-pulse" />
                    <p className="text-xs text-dark-400">कैमरा स्नैपशॉट लोड हो रहा है...</p>
                    <button
                      onClick={fetchLiveHikvisionSnapshot}
                      className="px-3 py-1.5 rounded-xl bg-dark-800 text-white text-xs font-semibold hover:bg-dark-700"
                    >
                      पुनः प्रयास करें
                    </button>
                  </div>
                )
              ) : (
                <>
                  <video
                    ref={webcamVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${!isLiveStreaming ? 'hidden' : ''}`}
                  />
                  {!isLiveStreaming && (
                    <div className="text-center p-6 space-y-3">
                      <Camera className="w-10 h-10 text-dark-500 mx-auto" />
                      <p className="text-xs text-dark-400">वेबकैम बंद है।</p>
                      <button
                        onClick={startWebcam}
                        className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 shadow-lg"
                      >
                        वेबकैम चालू करें
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Status Badges Overlay */}
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-bold text-white border border-white/10 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>LIVE ACTIVE</span>
                </span>
                <span className="px-2.5 py-1 rounded-full bg-indigo-500/80 backdrop-blur-md text-[10px] font-bold text-white flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" />
                  <span>2-LINE CRISP THEFT AUDIT</span>
                </span>
              </div>

              {/* Timecode */}
              <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-[10px] font-mono text-dark-300 border border-white/10">
                {new Date().toLocaleTimeString('hi-IN')}
              </div>
            </div>

            {/* Quick Audit Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <button
                type="button"
                onClick={() => handleInstantLiveAudit()}
                disabled={isAuditingNow}
                className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-extrabold text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                {isAuditingNow ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>AI ऑडिट जारी है...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-emerald-200" />
                    <span>⚡ त्वरित AI ऑडिट (Instant Audit)</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      triggerEdgeRuleTest(e.target.value as any);
                      e.target.value = '';
                    }
                  }}
                  className="px-2.5 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs font-semibold text-dark-300 hover:text-white focus:outline-none"
                  title="लोकल एज टेस्ट (Edge Rule Simulator)"
                >
                  <option value="" disabled>🧪 टेस्ट अलर्ट सिमुलेशन...</option>
                  <option value="GALLA_MISMATCH">🚨 गल्ला चोरी (₹0 बिल)</option>
                  <option value="DELTA_COIN">🪙 चिल्लर गणना (₹500 vs ₹120)</option>
                  <option value="HAND_POCKET">✋ जेब में हाथ (Theft Pose)</option>
                  <option value="HAND_MOUTH">🥛 अनधिकृत उपभोग</option>
                  <option value="COUNTER_CROSS">📦 बिना बिल सामान पार</option>
                </select>
              </div>
            </div>

            {streamError && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{streamError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Ultra-Crisp 2-Line Actionable Incidents Stream (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-3xl bg-dark-900 border border-dark-800 shadow-xl space-y-4 flex flex-col h-full">
            
            {/* Header & Filter */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>2-लाइन क्रिस्प घटना अलर्ट्स (Actionable Alerts)</span>
                </h3>
                <p className="text-[10px] text-dark-400">
                  बिना लंबे पैराग्राफ के सीधा समय, प्रकार, मूल कारण व 10s क्लिप
                </p>
              </div>

              <button
                onClick={fetchIncidents}
                className="p-1.5 rounded-xl bg-dark-950 text-dark-400 hover:text-white border border-dark-800"
                title="अलर्ट्स रिफ्रेश करें"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 📅 Date Filter Selector Bar */}
            <div className="p-2 rounded-2xl bg-dark-950 border border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setDatePreset('TODAY');
                    setSelectedDate(getTodayStr());
                  }}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-black transition-all ${
                    datePreset === 'TODAY'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-dark-400 hover:text-white'
                  }`}
                >
                  {t('today')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDatePreset('YESTERDAY');
                    setSelectedDate(getYesterdayStr());
                  }}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-black transition-all ${
                    datePreset === 'YESTERDAY'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-dark-400 hover:text-white'
                  }`}
                >
                  {t('yesterday')}
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('ALL')}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-black transition-all ${
                    datePreset === 'ALL'
                      ? 'bg-slate-700 text-white shadow-md'
                      : 'text-dark-400 hover:text-white'
                  }`}
                >
                  {t('allDays')}
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setDatePreset('CUSTOM');
                  }}
                  className="px-2 py-0.5 rounded-lg bg-dark-900 border border-slate-700 text-[11px] font-mono text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-dark-950 p-1 rounded-xl border border-dark-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setIncidentFilter('ALL')}
                className={`px-3 py-1 rounded-lg transition-all ${incidentFilter === 'ALL' ? 'bg-indigo-600 text-white shadow-sm' : 'text-dark-400'}`}
              >
                सभी ({incidents.length})
              </button>
              <button
                type="button"
                onClick={() => setIncidentFilter('FLAGGED_THEFT')}
                className={`px-3 py-1 rounded-lg transition-all ${incidentFilter === 'FLAGGED_THEFT' ? 'bg-rose-600 text-white shadow-sm' : 'text-dark-400'}`}
              >
                🚨 चोरी ({incidents.filter(i => i.status === 'FLAGGED_THEFT').length})
              </button>
              <button
                type="button"
                onClick={() => setIncidentFilter('PENDING_REVIEW')}
                className={`px-3 py-1 rounded-lg transition-all ${incidentFilter === 'PENDING_REVIEW' ? 'bg-amber-600 text-white shadow-sm' : 'text-dark-400'}`}
              >
                जांच लंबित ({incidents.filter(i => i.status === 'PENDING_REVIEW').length})
              </button>
            </div>

            {/* Incident Cards List */}
            <div className="space-y-2.5 overflow-y-auto max-h-[520px] custom-scrollbar pr-1 flex-1">
              {filteredIncidents.length === 0 ? (
                <div className="p-8 text-center space-y-2 rounded-2xl bg-dark-950 border border-dark-800 my-auto">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <h4 className="text-xs font-black text-white">कोई संदिग्ध चोरी या गड़बड़ी नहीं</h4>
                  <p className="text-[10px] text-dark-400">
                    गल्ला, चिल्लर व काउंटर का मिलान सुरक्षित है। टेस्ट करने हेतु ऊपर के 'लोकल एज टेस्टर्स' बटन दबाएं।
                  </p>
                </div>
              ) : (
                filteredIncidents.map((incident) => (
                  <UltraCrispIncidentCard
                    key={incident.id}
                    incident={incident}
                    onStatusChange={handleIncidentStatusChange}
                    onOpenReplay={(inc) => setSelectedReplayIncident(inc)}
                  />
                ))
              )}
            </div>

          </div>
        </div>

      </div>

      {/* 10s Video Replay / Snapshot Modal */}
      {selectedReplayIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-lg bg-dark-900 border border-dark-750 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-indigo-400 fill-current" />
                <h4 className="text-sm font-black text-white">
                  10s घटना वीडियो क्लिप रीप्ले ({selectedReplayIncident.timeCode})
                </h4>
              </div>
              <button
                onClick={() => setSelectedReplayIncident(null)}
                className="p-1.5 rounded-xl text-dark-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Video or Snapshot Canvas */}
            <div className="rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-dark-800 relative">
              {selectedReplayIncident.snapshotImage ? (
                <img
                  src={selectedReplayIncident.snapshotImage}
                  alt="Incident Visual Proof"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-6 space-y-2">
                  <Video className="w-10 h-10 text-indigo-400 mx-auto animate-pulse" />
                  <p className="text-xs text-white font-bold">10s घटना बफ़र क्लिप ({selectedReplayIncident.timeCode})</p>
                  <p className="text-[10px] text-dark-400">DVR HDD चैनल #1 से 10 सेकंड का बैकवर्ड वीडियो बफर</p>
                </div>
              )}

              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-[9px] font-mono text-emerald-400 border border-white/10 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>10s REPLAY CLIP</span>
              </div>
            </div>

            {/* Incident Summary in Modal */}
            <div className="p-3 rounded-xl bg-dark-950 border border-dark-800 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="font-bold text-white">{selectedReplayIncident.alertType}</span>
                <span className="font-mono text-dark-400">{selectedReplayIncident.amountOrItem}</span>
              </div>
              <p className="text-[11px] text-dark-300">{selectedReplayIncident.rootCause}</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  handleIncidentStatusChange(selectedReplayIncident.id, 'FLAGGED_THEFT');
                  setSelectedReplayIncident(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                🚨 चोरी पुष्टि करें
              </button>
              <button
                type="button"
                onClick={() => {
                  handleIncidentStatusChange(selectedReplayIncident.id, 'CLEARED_SAFE');
                  setSelectedReplayIncident(null);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                ✓ सुरक्षित है (Clear)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal for full reports */}
      {isDetailModalOpen && lastAuditResult && (
        <ShopAiReportDetailModal
          report={lastAuditResult}
          onClose={() => setIsDetailModalOpen(false)}
        />
      )}

    </div>
  );
};
