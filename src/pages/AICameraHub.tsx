import React, { useState, useEffect, useRef, useCallback } from 'react';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  Camera, Eye, ShieldCheck, AlertTriangle, CheckCircle2, RefreshCw, 
  Cpu, Scan, UserCheck, Plus, Trash2, Video, 
  Wifi, WifiOff, Store, QrCode, Sparkles, X, Upload,
  FileVideo, Radio, FileText, Users, HardDrive, Banknote, Smartphone
} from 'lucide-react';
import { ShopAiVideoUpload } from '../components/camera/ShopAiVideoUpload';
import { ShopAiLiveMonitor } from '../components/camera/ShopAiLiveMonitor';
import { ShopAiReportsHub } from '../components/camera/ShopAiReportsHub';
import { ShopPersonProfilesModal } from '../components/camera/ShopPersonProfilesModal';
import { TimeIntervalGallaReportModal } from '../components/camera/TimeIntervalGallaReportModal';
import { DvrPlaybackModal } from '../components/camera/DvrPlaybackModal';
import { FridgeSurveillanceModal } from '../components/camera/FridgeSurveillanceModal';
import { StaffTerminal } from '../components/camera/StaffTerminal';

interface CameraItem {
  _id: string;
  name: string;
  deviceType?: 'DVR' | 'NVR' | 'IP_CAMERA';
  brand?: 'HIKVISION' | 'CP_PLUS' | 'DAHUA' | 'GENERIC_ONVIF';
  channelType?: 'ANALOG' | 'IP';
  locationType: 'COUNTER_OCR' | 'GALLA_SECURITY' | 'SHELF_INVENTORY' | 'GATE_ENTRY' | 'CATTLE_SHED';
  ipAddress: string;
  port: number;
  rtspPort?: number;
  username: string;
  channel: number;
  streamType: 'main' | 'sub';
  snapshotUrl?: string;
  rtspUrl?: string;
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  lastChecked?: string;
}

interface ShelfBlockItem {
  _id: string;
  blockCode: string;
  shelfName: string;
  productName: string;
  category: string;
  currentStock: number;
  capacity: number;
  lowStockThreshold: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'EMPTY' | 'MISPLACED';
  lastDetectedCount?: number;
  lastCameraCheck?: string;
}

interface AuditData {
  accuracyRate: number;
  totalOcrScans: number;
  totalMismatches: number;
  recentMismatches: any[];
  recentVisits: any[];
  shelfLogs: any[];
}

export const AICameraHub: React.FC = () => {
  const { language } = useAuth();

  // Primary 3 Clean Tabs: 'live' (default) | 'reports' | 'settings'
  const [activeTab, setActiveTab] = useState<'live' | 'reports' | 'settings'>('live');
  const [settingsSubTab, setSettingsSubTab] = useState<'cameras' | 'upload' | 'desk' | 'shelf' | 'audit'>('cameras');

  // Cameras State
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [loadingCameras, setLoadingCameras] = useState(false);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  // New Modals State
  const [isProfilesModalOpen, setIsProfilesModalOpen] = useState(false);
  const [isTimeGallaModalOpen, setIsTimeGallaModalOpen] = useState(false);
  const [isDvrPlaybackModalOpen, setIsDvrPlaybackModalOpen] = useState(false);
  const [isFridgeModalOpen, setIsFridgeModalOpen] = useState(false);
  const [isStaffTerminalActive, setIsStaffTerminalActive] = useState(false);

  // Dual-Audit & Smart Milk Desk State
  const [tokenInput, setTokenInput] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const [selectedFarmer, setSelectedFarmer] = useState<any | null>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);

  // Live Scan / OCR States
  const [isScanning, setIsScanning] = useState(false);
  const [scanImagePreview, setScanImagePreview] = useState<string | null>(null);
  const [aiReadings, setAiReadings] = useState<{
    weight: number | null;
    fat: number | null;
    snf: number | null;
    clr: number | null;
    confidence: number;
    rawDetectedText: string;
  } | null>(null);

  // Operator manual inputs
  const [operatorWeight, setOperatorWeight] = useState('');
  const [operatorFat, setOperatorFat] = useState('');
  const [operatorSnf, setOperatorSnf] = useState('');
  const [milkType, setMilkType] = useState<'Cow' | 'Buffalo' | 'Mixed'>('Cow');
  const [shift, setShift] = useState<'Morning' | 'Evening'>('Morning');

  // Save submission state
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [deskSuccessMsg, setDeskSuccessMsg] = useState<string | null>(null);
  const [deskErrorMsg, setDeskErrorMsg] = useState<string | null>(null);

  // Camera Source & Live Streaming States
  const [cameraSource, setCameraSource] = useState<'HIKVISION' | 'WEBCAM'>('HIKVISION');
  const [isLiveStreaming, setIsLiveStreaming] = useState(false);
  const [liveStreamUrl, setLiveStreamUrl] = useState<string | null>(null);
  const [liveStreamError, setLiveStreamError] = useState<string | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const liveIntervalRef = useRef<any>(null);

  // Camera Management Modal
  const [isAddCameraOpen, setIsAddCameraOpen] = useState(false);
  const [camForm, setCamForm] = useState({
    id: '',
    name: 'Counter Scale Cam',
    deviceType: 'DVR' as 'DVR' | 'NVR' | 'IP_CAMERA',
    brand: 'HIKVISION' as 'HIKVISION' | 'CP_PLUS' | 'DAHUA' | 'GENERIC_ONVIF',
    channelType: 'ANALOG' as 'ANALOG' | 'IP',
    locationType: 'COUNTER_OCR',
    ipAddress: '192.168.31.129',
    port: 80,
    rtspPort: 554,
    username: 'admin',
    password: '',
    channel: 1,
    streamType: 'sub',
    snapshotUrl: '',
    rtspUrl: '',
    notes: 'DVR Channel 1 points directly at weighing scale and milk analyzer'
  });
  const [testingCam, setTestingCam] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; image?: string } | null>(null);

  // Shelf Inventory State
  const [shelves, setShelves] = useState<ShelfBlockItem[]>([]);
  const [loadingShelves, setLoadingShelves] = useState(false);
  const [isAddShelfOpen, setIsAddShelfOpen] = useState(false);
  const [shelfForm, setShelfForm] = useState({
    id: '',
    blockCode: 'A1',
    shelfName: 'Top Rack - Dairy',
    productName: 'Desi Ghee 1L',
    category: 'Ghee',
    currentStock: 15,
    capacity: 25,
    lowStockThreshold: 5
  });
  const [isAuditingShelf, setIsAuditingShelf] = useState(false);
  const [shelfAuditSummary, setShelfAuditSummary] = useState<string | null>(null);

  // Audit Logs & Footfall State
  const [auditData, setAuditData] = useState<AuditData>({
    accuracyRate: 100,
    totalOcrScans: 0,
    totalMismatches: 0,
    recentMismatches: [],
    recentVisits: [],
    shelfLogs: []
  });
  const [, setLoadingAudit] = useState(false);
  const [previewModalImage, setPreviewModalImage] = useState<string | null>(null);

  // Footfall Search query
  const [searchPersonQuery, setSearchPersonQuery] = useState('');

  // 1. Fetch Cameras
  const fetchCameras = useCallback(async () => {
    setLoadingCameras(true);
    try {
      const res = await API.get('/cameras');
      setCameras(res.data || []);
      if (res.data?.length > 0 && !selectedCameraId) {
        setSelectedCameraId(res.data[0]._id);
      }
    } catch (e) {
      console.error('Failed to load cameras', e);
    } finally {
      setLoadingCameras(false);
    }
  }, [selectedCameraId]);

  // 2. Fetch Shelf Blocks
  const fetchShelves = useCallback(async () => {
    setLoadingShelves(true);
    try {
      const res = await API.get('/cameras/shelf-blocks');
      setShelves(res.data || []);
    } catch (e) {
      console.error('Failed to load shelf blocks', e);
    } finally {
      setLoadingShelves(false);
    }
  }, []);

  // 3. Fetch Audit Logs
  const fetchAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const res = await API.get('/cameras/audit-logs');
      setAuditData(res.data || {
        accuracyRate: 100,
        totalOcrScans: 0,
        totalMismatches: 0,
        recentMismatches: [],
        recentVisits: [],
        shelfLogs: []
      });
    } catch (e) {
      console.error('Failed to load audit logs', e);
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
    fetchShelves();
    fetchAuditLogs();
  }, [fetchCameras, fetchShelves, fetchAuditLogs]);

  // Auto focus token scanner input when in Desk tab
  useEffect(() => {
    if (activeTab === 'settings' && settingsSubTab === 'desk') {
      tokenInputRef.current?.focus();
    }
  }, [activeTab, settingsSubTab]);

  // Handle Token / Barcode Scanner Search
  const handleTokenSearch = async (codeToSearch?: string) => {
    const code = (codeToSearch || tokenInput).trim();
    if (!code) return;
    setTokenLoading(true);
    setDeskErrorMsg(null);
    try {
      const res = await API.get(`/cameras/resolve-token?token=${encodeURIComponent(code)}`);
      setSelectedFarmer(res.data);
      setTokenInput('');
    } catch (err: any) {
      setDeskErrorMsg(err.response?.data?.message || `टोकन "${code}" का कोई किसान नहीं मिला।`);
      setSelectedFarmer(null);
    } finally {
      setTokenLoading(false);
    }
  };

  // Start WebCam
  const startWebcam = async () => {
    try {
      setLiveStreamError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } }
      });
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
        await webcamVideoRef.current.play();
      }
      setIsLiveStreaming(true);
    } catch (err: any) {
      setLiveStreamError(`वेबकैम शुरू नहीं हुआ: ${err.message}. कृपया ब्राउज़र में कैमरा की परमिशन दें।`);
      setIsLiveStreaming(false);
    }
  };

  // Stop WebCam
  const stopWebcam = () => {
    if (webcamVideoRef.current?.srcObject) {
      const stream = webcamVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      webcamVideoRef.current.srcObject = null;
    }
    setIsLiveStreaming(false);
  };

  // Start Hikvision Live Stream (Polling snapshots)
  const startHikvisionLive = () => {
    if (!selectedCameraId) {
      setLiveStreamError('कृपया पहले लिस्ट में से एक Hikvision कैमरा चुनें।');
      return;
    }
    setLiveStreamError(null);
    setIsLiveStreaming(true);

    const pollFrame = async () => {
      try {
        const timestamp = Date.now();
        const res = await API.get(`/cameras/${selectedCameraId}/live-snapshot?t=${timestamp}`, {
          responseType: 'blob'
        });
        const objectUrl = URL.createObjectURL(res.data);
        setLiveStreamUrl((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
          return objectUrl;
        });
        setLiveStreamError(null);
      } catch (err: any) {
        setLiveStreamError('Hikvision कैमरा से लाइव फ्रेम नहीं मिल पा रहा है (401 Unauthorized या नेटवर्क एरर)। कृपया कैमरे का पासवर्ड चेक करें।');
      }
    };

    pollFrame();
    liveIntervalRef.current = setInterval(pollFrame, 1500);
  };

  // Stop Hikvision Live Stream
  const stopHikvisionLive = () => {
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
    setIsLiveStreaming(false);
  };

  // Cleanup on unmount or tab change
  useEffect(() => {
    return () => {
      stopWebcam();
      stopHikvisionLive();
    };
  }, []);

  // Perform AI Camera OCR Scan (Zero-Fake-Data)
  const handleTriggerAIScan = async (customImageBase64?: string) => {
    setIsScanning(true);
    setDeskErrorMsg(null);
    setDeskSuccessMsg(null);
    try {
      let imageToAnalyze = customImageBase64;

      // If in WebCam mode and no custom image, grab current frame from webcam video element
      if (!imageToAnalyze && cameraSource === 'WEBCAM' && webcamVideoRef.current) {
        const video = webcamVideoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          imageToAnalyze = canvas.toDataURL('image/jpeg', 0.85);
          setScanImagePreview(imageToAnalyze);
        }
      }

      const payload: any = {};
      if (imageToAnalyze) {
        payload.imageBase64 = imageToAnalyze;
      } else if (selectedCameraId) {
        payload.cameraId = selectedCameraId;
      } else {
        setDeskErrorMsg('कृपया पहले कैमरा चालू करें, Hikvision कैमरा चुनें या फोटो अपलोड करें।');
        setIsScanning(false);
        return;
      }

      const res = await API.post('/cameras/capture-ocr', payload);
      const ocr = res.data.ocrResult;
      setAiReadings(ocr);

      if (res.data.snapshotImage) {
        setScanImagePreview(res.data.snapshotImage);
      }

      // Check if actual digital meter readings were detected
      if (ocr.weight !== null && ocr.weight !== undefined) {
        setOperatorWeight(ocr.weight.toString());
      } else {
        setOperatorWeight('');
      }

      if (ocr.fat !== null && ocr.fat !== undefined) {
        setOperatorFat(ocr.fat.toString());
      } else {
        setOperatorFat('');
      }

      if (ocr.snf !== null && ocr.snf !== undefined) {
        setOperatorSnf(ocr.snf.toString());
      } else {
        setOperatorSnf('');
      }

      // If farmer tag was recognized in image and none selected yet
      if (res.data.matchedFarmer && !selectedFarmer) {
        setSelectedFarmer(res.data.matchedFarmer);
      }

      // Display genuine result status
      if (ocr.weight === null && ocr.fat === null) {
        setDeskErrorMsg(
          ocr.notes || 'इमेज में कोई वजन कांटा या फैट मशीन स्क्रीन नहीं दिखी। कृपया कैमरा कांटा/मशीन के सामने सीधा रखें।'
        );
      } else {
        setDeskSuccessMsg(
          `रीडिंग सफलतापूर्वक पढ़ी गई: वजन ${ocr.weight ?? '--'}L, FAT ${ocr.fat ?? '--'}% (AI Confidence: ${Math.round(
            ocr.confidence * 100
          )}%)`
        );
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      setDeskErrorMsg(
        err.response?.data?.message || 'कैमरा स्कैन नहीं हो पाया। कृपया कैमरा कनेक्शन या इमेज चेक करें।'
      );
    } finally {
      setIsScanning(false);
    }
  };

  // Upload Photo manually from PC/Phone
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setScanImagePreview(base64);
      handleTriggerAIScan(base64);
    };
    reader.readAsDataURL(file);
  };

  // Compute Mismatch in Real-Time
  const numOpWeight = parseFloat(operatorWeight) || 0;
  const numOpFat = parseFloat(operatorFat) || 0;
  const numAiWeight = aiReadings?.weight || 0;
  const numAiFat = aiReadings?.fat || 0;

  const isWeightMismatched = aiReadings?.weight !== null && aiReadings?.weight !== undefined && Math.abs(numOpWeight - numAiWeight) > 0.15;
  const isFatMismatched = aiReadings?.fat !== null && aiReadings?.fat !== undefined && numOpFat > 0 && Math.abs(numOpFat - numAiFat) > 0.15;
  const hasMismatch = isWeightMismatched || isFatMismatched;

  // Submit Milk Entry with Dual-Audit Tag
  const handleSaveMilkEntry = async () => {
    if (!selectedFarmer) {
      setDeskErrorMsg('कृपया पहले किसान का टोकन स्कैन करें या किसान चुनें।');
      return;
    }
    if (!operatorWeight || parseFloat(operatorWeight) <= 0) {
      setDeskErrorMsg('कृपया दूध की मात्रा (Weight) दर्ज करें।');
      return;
    }

    setIsSavingEntry(true);
    setDeskErrorMsg(null);
    setDeskSuccessMsg(null);

    try {
      const payload: any = {
        farmerId: selectedFarmer._id,
        date: new Date().toISOString().split('T')[0],
        shift,
        milkType,
        quantity: parseFloat(operatorWeight),
        fat: parseFloat(operatorFat) || 0,
        snf: parseFloat(operatorSnf) || 0,
        aiVerification: {
          aiDetected: aiReadings ? {
            weight: aiReadings.weight || undefined,
            fat: aiReadings.fat || undefined,
            snf: aiReadings.snf || undefined,
            confidence: aiReadings.confidence,
            rawText: aiReadings.rawDetectedText
          } : undefined,
          operatorEntered: {
            weight: parseFloat(operatorWeight),
            fat: parseFloat(operatorFat) || 0,
            snf: parseFloat(operatorSnf) || 0
          },
          isMismatched: hasMismatch,
          mismatchReason: hasMismatch 
            ? `Manual edit: AI [${numAiWeight}L, ${numAiFat}%] vs Operator [${numOpWeight}L, ${numOpFat}%]`
            : 'Exact Match',
          snapshotImage: scanImagePreview || undefined,
          verificationStatus: hasMismatch ? 'OVERRIDDEN' : (aiReadings ? 'MATCHED' : 'MANUAL')
        }
      };

      await API.post('/milk/collections', payload);

      setDeskSuccessMsg(`दूध एंट्री सफलतापूर्वक दर्ज हो गई! (किसान: ${selectedFarmer.name}, मात्रा: ${operatorWeight}L)`);
      
      // Reset form for next farmer
      setSelectedFarmer(null);
      setOperatorWeight('');
      setOperatorFat('');
      setOperatorSnf('');
      setAiReadings(null);
      setScanImagePreview(null);
      tokenInputRef.current?.focus();
      fetchAuditLogs();
    } catch (err: any) {
      setDeskErrorMsg(err.response?.data?.message || 'दूध एंट्री सेव करने में त्रुटि आई।');
    } finally {
      setIsSavingEntry(false);
    }
  };

  // Test Camera
  const handleTestCamera = async () => {
    setTestingCam(true);
    setTestResult(null);
    try {
      const res = await API.post('/cameras/test-connection', camForm);
      setTestResult({
        success: res.data.success,
        message: res.data.message,
        image: res.data.previewImage
      });
      if (res.data.workingPath) {
        setCamForm((prev) => ({
          ...prev,
          snapshotUrl: `http://${prev.ipAddress.trim()}:${prev.port || 80}${res.data.workingPath}`
        }));
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.response?.data?.message || 'Connection failed'
      });
    } finally {
      setTestingCam(false);
    }
  };

  // Save Camera
  const handleSaveCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await API.post('/cameras', camForm);
      setIsAddCameraOpen(false);
      fetchCameras();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save camera');
    }
  };

  // Delete Camera
  const handleDeleteCamera = async (id: string) => {
    if (!window.confirm('क्या आप इस कैमरे को हटाना चाहते हैं?')) return;
    try {
      await API.delete(`/cameras/${id}`);
      fetchCameras();
    } catch (err) {
      console.error(err);
    }
  };

  // Save Shelf Block
  const handleSaveShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await API.post('/cameras/shelf-blocks', shelfForm);
      setIsAddShelfOpen(false);
      fetchShelves();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save shelf block');
    }
  };

  // Trigger Shelf Visual Audit
  const handleAuditShelfViaCamera = async (customImage?: string) => {
    setIsAuditingShelf(true);
    setShelfAuditSummary(null);
    try {
      const res = await API.post('/cameras/scan-shelf', {
        cameraId: cameras.find(c => c.locationType === 'SHELF_INVENTORY')?._id || selectedCameraId,
        imageBase64: customImage || 'data:image/jpeg;base64,'
      });
      setShelfAuditSummary(`AI शेल्फ स्कैन पूर्ण: कुल ${res.data.totalItemsVisible || 0} पीस दिखे। ${res.data.summary}`);
      fetchShelves();
      fetchAuditLogs();
    } catch (e) {
      console.error(e);
      alert('शेल्फ ऑडिट विफल रहा।');
    } finally {
      setIsAuditingShelf(false);
    }
  };

  if (isStaffTerminalActive) {
    return <StaffTerminal onExitStaffMode={() => setIsStaffTerminalActive(false)} />;
  }

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-dark-900 via-indigo-950/60 to-dark-900 border border-indigo-900/30 p-6 shadow-xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-bold tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-400" />
              <span>Hikvision + Google Gemini Vision AI</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <Camera className="w-7 h-7 text-indigo-400" />
              <span>AI Camera & Vision Hub</span>
            </h1>
            <p className="text-xs md:text-sm text-dark-300 max-w-2xl">
              CCTV वीडियो व ऑडियो अपलोड, लाइव कैमरा AI वॉचर, ग्राहक गिनती, नौकर (आकाश) निगरानी, वॉयस ट्रांसक्रिप्ट व लिखित रिपोर्ट्स।
            </p>
          </div>

          {/* Quick Metrics Pill */}
          <div className="flex items-center gap-3 bg-dark-900/90 border border-dark-800 p-3 rounded-2xl shadow-inner">
            <div className="text-center px-2">
              <p className="text-[10px] text-dark-400 font-bold uppercase">AI Accuracy</p>
              <p className="text-lg font-black text-emerald-400">{auditData.accuracyRate}%</p>
            </div>
            <div className="w-px h-8 bg-dark-800" />
            <div className="text-center px-2">
              <p className="text-[10px] text-dark-400 font-bold uppercase">Active Cams</p>
              <p className="text-lg font-black text-indigo-400">{cameras.length}</p>
            </div>
            <div className="w-px h-8 bg-dark-800" />
            <div className="text-center px-2">
              <p className="text-[10px] text-dark-400 font-bold uppercase">Mismatches</p>
              <p className={`text-lg font-black ${auditData.totalMismatches > 0 ? 'text-amber-400' : 'text-dark-400'}`}>
                {auditData.totalMismatches}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs - Consolidated to ONLY 3 Clean, Simple Tabs */}
        <div className="flex items-center gap-2 mt-6 overflow-x-auto no-scrollbar border-b border-dark-800/80 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('live')}
            className={`flex items-center gap-2 px-5 py-3 rounded-t-2xl text-xs md:text-sm font-black transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'live'
                ? 'border-emerald-500 text-white bg-emerald-500/10'
                : 'border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>{language === 'hi' ? '🎥 लाइव कैमरा व अलर्ट्स' : '🎥 Live Monitor & Alerts'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-2 px-5 py-3 rounded-t-2xl text-xs md:text-sm font-black transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'reports'
                ? 'border-indigo-500 text-white bg-indigo-500/10'
                : 'border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            <FileText className="w-4 h-4 text-indigo-400" />
            <span>{language === 'hi' ? '📊 AI रिपोर्ट्स व ऑडिट' : '📊 Reports & Intelligence'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-5 py-3 rounded-t-2xl text-xs md:text-sm font-black transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'settings'
                ? 'border-cyan-500 text-white bg-cyan-500/10'
                : 'border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            <Video className="w-4 h-4 text-cyan-400" />
            <span>{language === 'hi' ? '⚙️ कैमरा सेटअप व टूल्स' : '⚙️ Setup & Tools'}</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: LIVE CAMERA STREAM & REAL-TIME AI AUDIT (DEFAULT VIEW)  */}
      {/* ============================================================== */}
      {activeTab === 'live' && (
        <ShopAiLiveMonitor 
          cameras={cameras} 
          onReportCreated={fetchAuditLogs}
          onOpenProfiles={() => setIsProfilesModalOpen(true)}
          onOpenTimeGalla={() => setIsTimeGallaModalOpen(true)}
          onOpenDvrPlayback={() => setIsDvrPlaybackModalOpen(true)}
          onOpenFridge={() => setIsFridgeModalOpen(true)}
          onOpenStaffTerminal={() => setIsStaffTerminalActive(true)}
        />
      )}

      {/* ============================================================== */}
      {/* TAB 2: SHOP AI REPORTS & ANALYTICS HUB                         */}
      {/* ============================================================== */}
      {activeTab === 'reports' && (
        <ShopAiReportsHub />
      )}

      {/* ============================================================== */}
      {/* TAB 3: CAMERA SETUP, SMART TOOLS & HARDWARE CONFIG             */}
      {/* ============================================================== */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Quick Smart Tools Bar */}
          <div className="p-4 rounded-3xl bg-dark-900 border border-dark-800 space-y-3 shadow-md">
            <span className="text-[11px] font-bold text-dark-400 uppercase tracking-wider block">
              ⚡ {language === 'hi' ? 'स्मार्ट टूल्स व इन-ऐप फीचर्स:' : 'Smart Dairy Tools & Features:'}
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              <button
                type="button"
                onClick={() => setIsProfilesModalOpen(true)}
                className="p-3 rounded-2xl bg-dark-950 hover:bg-dark-800 text-indigo-300 border border-indigo-500/20 text-xs font-bold flex flex-col items-center gap-1.5 transition-all text-center shadow-sm"
              >
                <Users className="w-5 h-5 text-indigo-400" />
                <span>मालिक व स्टाफ पहचान</span>
              </button>
              <button
                type="button"
                onClick={() => setIsTimeGallaModalOpen(true)}
                className="p-3 rounded-2xl bg-dark-950 hover:bg-dark-800 text-emerald-300 border border-emerald-500/20 text-xs font-bold flex flex-col items-center gap-1.5 transition-all text-center shadow-sm"
              >
                <Banknote className="w-5 h-5 text-emerald-400" />
                <span>गल्ला व समय रिपोर्ट</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDvrPlaybackModalOpen(true)}
                className="p-3 rounded-2xl bg-dark-950 hover:bg-dark-800 text-purple-300 border border-purple-500/20 text-xs font-bold flex flex-col items-center gap-1.5 transition-all text-center shadow-sm"
              >
                <HardDrive className="w-5 h-5 text-purple-400" />
                <span>DVR प्लेबैक (HDD)</span>
              </button>
              <button
                type="button"
                onClick={() => setIsFridgeModalOpen(true)}
                className="p-3 rounded-2xl bg-dark-950 hover:bg-dark-800 text-cyan-300 border border-cyan-500/20 text-xs font-bold flex flex-col items-center gap-1.5 transition-all text-center shadow-sm"
              >
                <Store className="w-5 h-5 text-cyan-400" />
                <span>डीप फ्रीजर सुरक्षा</span>
              </button>
              <button
                type="button"
                onClick={() => setIsStaffTerminalActive(true)}
                className="p-3 rounded-2xl bg-dark-950 hover:bg-dark-800 text-amber-300 border border-amber-500/20 text-xs font-bold flex flex-col items-center gap-1.5 transition-all text-center shadow-sm"
              >
                <Smartphone className="w-5 h-5 text-amber-400" />
                <span>स्टाफ टर्मिनल मोड</span>
              </button>
            </div>
          </div>

          {/* Sub-Tabs Selector */}
          <div className="flex items-center gap-1.5 bg-dark-900 p-1.5 rounded-2xl border border-dark-800 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setSettingsSubTab('cameras')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                settingsSubTab === 'cameras' ? 'bg-indigo-600 text-white shadow-sm' : 'text-dark-400 hover:text-white'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>{language === 'hi' ? `कैमरे व DVR (${cameras.length})` : `Cameras & DVR (${cameras.length})`}</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsSubTab('upload')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                settingsSubTab === 'upload' ? 'bg-indigo-600 text-white shadow-sm' : 'text-dark-400 hover:text-white'
              }`}
            >
              <FileVideo className="w-3.5 h-3.5" />
              <span>{language === 'hi' ? 'CCTV वीडियो अपलोड' : 'Video Upload'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsSubTab('desk')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                settingsSubTab === 'desk' ? 'bg-indigo-600 text-white shadow-sm' : 'text-dark-400 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>{language === 'hi' ? 'स्मार्ट मिल्क डेस्क' : 'Smart Milk Desk'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsSubTab('shelf')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                settingsSubTab === 'shelf' ? 'bg-indigo-600 text-white shadow-sm' : 'text-dark-400 hover:text-white'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>{language === 'hi' ? `किराना शेल्फ (${shelves.length})` : `Shelf Blocks (${shelves.length})`}</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsSubTab('audit')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                settingsSubTab === 'audit' ? 'bg-indigo-600 text-white shadow-sm' : 'text-dark-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{language === 'hi' ? 'AI एक्यूरेसी लॉग' : 'AI Accuracy Logs'}</span>
            </button>
          </div>

          {/* Subtab: Upload */}
          {settingsSubTab === 'upload' && (
            <ShopAiVideoUpload onReportCreated={fetchAuditLogs} />
          )}

      {/* ============================================================== */}
      {/* SUBTAB 1: SMART MILK COLLECTION DESK (DUAL-AUDIT)              */}
      {/* ============================================================== */}
      {settingsSubTab === 'desk' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Token Scanner & Camera View (7 Cols) */}
          <div className="lg:col-span-7 space-y-5">
            
            {/* 1. Fast Token / Barcode Scanner Card */}
            <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">किसान टोकन स्कैनर (Instant Token ID)</h3>
                    <p className="text-[11px] text-dark-400">टोकन स्कैन करें या किसान कोड (जैसे 01, F-0001) डालें</p>
                  </div>
                </div>

                {selectedFarmer && (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>किसान सेलेक्टेड</span>
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    ref={tokenInputRef}
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleTokenSearch();
                      }
                    }}
                    placeholder="टोकन बारकोड स्कैन करें या नंबर लिखें..."
                    className="w-full pl-4 pr-10 py-3 rounded-2xl bg-dark-950 border border-dark-700 text-white placeholder-dark-500 text-sm font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <Scan className="w-4 h-4 text-dark-400 absolute right-3.5 top-3.5" />
                </div>

                <button
                  onClick={() => handleTokenSearch()}
                  disabled={tokenLoading}
                  className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {tokenLoading ? 'खोज...' : 'सर्च'}
                </button>
              </div>

              {/* Farmer Info Badge if found */}
              {selectedFarmer && (
                <div className="mt-3 p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center font-black text-emerald-300 text-sm">
                      {selectedFarmer.name[0]}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>{selectedFarmer.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-dark-800 text-emerald-400 font-mono">
                          ID: {selectedFarmer.farmerId}
                        </span>
                      </h4>
                      <p className="text-[11px] text-dark-300">
                        गाँव: {selectedFarmer.village || 'N/A'} • मो: {selectedFarmer.mobile}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedFarmer(null)}
                    className="p-1.5 rounded-lg text-dark-400 hover:text-rose-400 hover:bg-dark-800 transition-colors"
                    title="हटाएं"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* 2. Live Camera View & OCR Trigger Card */}
            <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                    <Video className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">काउंटर कैमरा विज़न (Live Camera Stream)</h3>
                    <p className="text-[11px] text-dark-400">वजन कांटा व फैट एनालाइजर स्क्रीन स्कैनर</p>
                  </div>
                </div>

                {/* Camera Source Switcher */}
                <div className="flex items-center p-1 rounded-xl bg-dark-950 border border-dark-800 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      stopWebcam();
                      setCameraSource('HIKVISION');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      cameraSource === 'HIKVISION'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-dark-400 hover:text-white'
                    }`}
                  >
                    📹 Hikvision IP
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopHikvisionLive();
                      setCameraSource('WEBCAM');
                      startWebcam();
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      cameraSource === 'WEBCAM'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-dark-400 hover:text-white'
                    }`}
                  >
                    📱 लाइव वेबकैम / फ़ोन
                  </button>
                </div>
              </div>

              {/* Hikvision Controls Bar (If Hikvision active) */}
              {cameraSource === 'HIKVISION' && (
                <div className="space-y-2 p-2.5 rounded-2xl bg-dark-950 border border-dark-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-dark-400 font-bold">कैमरा चैनल ({cameras.length}):</span>
                      {cameras.map((c) => (
                        <button
                          key={c._id}
                          type="button"
                          onClick={() => {
                            setSelectedCameraId(c._id);
                            if (isLiveStreaming) {
                              stopHikvisionLive();
                              setTimeout(() => startHikvisionLive(), 100);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                            selectedCameraId === c._id
                              ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                              : 'bg-dark-900 border-dark-800 text-dark-300 hover:text-white'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${selectedCameraId === c._id ? 'bg-emerald-300 animate-pulse' : 'bg-dark-600'}`} />
                          <span>Ch #{c.channel || 1}: {c.name.replace(/\(Camera \d\)/, '').trim()}</span>
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (isLiveStreaming) {
                          stopHikvisionLive();
                        } else {
                          startHikvisionLive();
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                        isLiveStreaming
                          ? 'bg-rose-600/20 text-rose-300 border border-rose-500/40 animate-pulse'
                          : 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/30'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isLiveStreaming ? 'bg-rose-500' : 'bg-indigo-400'}`} />
                      <span>{isLiveStreaming ? 'लाइव स्ट्रीम बंद करें' : '🔴 लाइव स्ट्रीम चालू करें'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* WebCam Controls Bar (If WebCam active) */}
              {cameraSource === 'WEBCAM' && (
                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-indigo-950/20 border border-indigo-500/30">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-white">डिवाइस वेबकैम लाइव एक्टिव है (30 FPS)</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (isLiveStreaming) {
                        stopWebcam();
                      } else {
                        startWebcam();
                      }
                    }}
                    className="px-3 py-1 rounded-xl bg-dark-800 text-xs text-dark-200 hover:text-white"
                  >
                    {isLiveStreaming ? 'वेबकैम रोकें' : 'वेबकैम रीस्टार्ट'}
                  </button>
                </div>
              )}

              {/* Camera Frame Preview Container */}
              <div className="relative aspect-video w-full rounded-2xl bg-dark-950 border border-dark-800 overflow-hidden flex items-center justify-center group shadow-inner">
                {/* 1. WEBCAM REAL-TIME LIVE VIDEO */}
                {cameraSource === 'WEBCAM' ? (
                  <video
                    ref={webcamVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                ) : isLiveStreaming && liveStreamUrl ? (
                  /* 2. HIKVISION LIVE STREAM POLLER */
                  <img
                    src={liveStreamUrl}
                    alt="Hikvision Live Stream"
                    className="w-full h-full object-contain"
                  />
                ) : scanImagePreview ? (
                  /* 3. CAPTURED SNAPSHOT */
                  <img
                    src={scanImagePreview}
                    alt="Captured Scan Preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  /* 4. DEFAULT PLACEHOLDER */
                  <div className="text-center p-6 space-y-2">
                    <Camera className="w-12 h-12 text-dark-700 mx-auto group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-semibold text-dark-300">
                      Hikvision काउंटर कैमरा (192.168.31.129) कनेक्टेड है
                    </p>
                    <p className="text-[11px] text-dark-500">
                      लाइव देखने के लिए ऊपर "🔴 लाइव स्ट्रीम चालू करें" दबाएं या सीधे "AI स्कैन" करें
                    </p>
                  </div>
                )}

                {/* Error Banner inside Camera Frame */}
                {liveStreamError && (
                  <div className="absolute inset-x-4 bottom-4 p-3.5 rounded-2xl bg-rose-950/95 border border-rose-500/60 backdrop-blur-md text-xs text-rose-200 space-y-2 z-10 shadow-xl">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold flex items-center gap-1.5 text-rose-300">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{liveStreamError}</span>
                      </p>
                      {selectedCameraId && (
                        <button
                          type="button"
                          onClick={() => {
                            const c = cameras.find((cam) => cam._id === selectedCameraId);
                            if (c) {
                              setCamForm({
                                id: c._id,
                                name: c.name,
                                deviceType: c.deviceType || 'DVR',
                                brand: c.brand || 'HIKVISION',
                                channelType: c.channelType || 'ANALOG',
                                locationType: c.locationType,
                                ipAddress: c.ipAddress,
                                port: c.port || 80,
                                rtspPort: c.rtspPort || 554,
                                username: c.username || 'admin',
                                password: '',
                                channel: c.channel,
                                streamType: c.streamType,
                                snapshotUrl: c.snapshotUrl || '',
                                rtspUrl: c.rtspUrl || '',
                                notes: ''
                              });
                              setIsAddCameraOpen(true);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] shrink-0 shadow-sm"
                        >
                          कैमरा पासवर्ड बदलें
                        </button>
                      )}
                    </div>
                    <div className="text-[11px] text-rose-200/90 bg-rose-900/40 p-2 rounded-xl border border-rose-500/20">
                      💡 <strong>समाधान:</strong> Hikvision कैमरे का यूजरनेम <code>admin</code> रखें और पासवर्ड वही डालें जो कैमरे को ऑन करते समय SADP टूल में डाला था (अपना मोबाइल नंबर न डालें)।
                    </div>
                  </div>
                )}

                {/* HUD Live Badge */}
                {isLiveStreaming && (
                  <div className="absolute top-3 left-3 bg-rose-600/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-white font-bold flex items-center gap-1.5 shadow-md">
                    <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    <span>LIVE</span>
                  </div>
                )}

                {/* HUD Overlay for OCR */}
                {aiReadings && aiReadings.confidence > 0 && (
                  <div className="absolute top-3 right-3 bg-dark-950/80 backdrop-blur-md border border-indigo-500/40 px-3 py-1.5 rounded-xl text-[11px] text-indigo-300 font-mono shadow-md">
                    <span>AI Confidence: {Math.round(aiReadings.confidence * 100)}%</span>
                  </div>
                )}

                {isScanning && (
                  <div className="absolute inset-0 bg-dark-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20">
                    <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                    <p className="text-xs font-bold text-white tracking-wide">
                      Gemini Vision AI स्क्रीन रीडिंग पढ़ रहा है...
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons: Scan Hikvision vs Upload/Webcam */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleTriggerAIScan()}
                  disabled={isScanning}
                  className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 disabled:opacity-50 transition-all"
                >
                  <Camera className="w-4 h-4" />
                  <span>
                    {cameraSource === 'WEBCAM'
                      ? '📸 वेबकैम से फ्रेम कैप्चर व AI स्कैन करें'
                      : '📸 Hikvision कैमरा से रीडिंग स्कैन करें'}
                  </span>
                </button>

                <label className="py-3 px-4 rounded-2xl bg-dark-800 hover:bg-dark-750 border border-dark-700 text-dark-200 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors active:scale-95">
                  <Upload className="w-4 h-4 text-dark-400" />
                  <span>फोटो अपलोड करें</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Raw OCR Text Indicator */}
              {aiReadings?.rawDetectedText && (
                <div className="p-2.5 rounded-xl bg-dark-950 border border-dark-800 text-[11px] text-dark-400 font-mono flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">AI Raw Display: {aiReadings.rawDetectedText}</span>
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Dual Verification & Entry Form (5 Cols) */}
          <div className="lg:col-span-5 space-y-5">
            
            {/* Dual Verification Card */}
            <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Dual-Audit (AI vs ऑपरेटर)</h3>
                    <p className="text-[11px] text-dark-400">धोखाधड़ी व गलत टाइपिंग से सुरक्षा</p>
                  </div>
                </div>

                {/* Match Status Badge */}
                {aiReadings && (
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                      hasMismatch
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    }`}
                  >
                    {hasMismatch ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Mismatch Alert!</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>100% Matched</span>
                      </>
                    )}
                  </span>
                )}
              </div>

              {/* Side-by-Side Comparison Box */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-dark-950 border border-dark-800">
                {/* AI Detected */}
                <div className="space-y-1.5 border-r border-dark-800 pr-2">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>AI Detection</span>
                  </p>
                  <p className="text-xs text-dark-300">
                    वजन: <strong className="text-white font-mono text-sm">{aiReadings?.weight ?? '--'} L</strong>
                  </p>
                  <p className="text-xs text-dark-300">
                    FAT: <strong className="text-white font-mono text-sm">{aiReadings?.fat ?? '--'} %</strong>
                  </p>
                  <p className="text-xs text-dark-300">
                    SNF: <strong className="text-white font-mono text-sm">{aiReadings?.snf ?? '--'}</strong>
                  </p>
                </div>

                {/* Operator Entered */}
                <div className="space-y-1.5 pl-2">
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    <span>Operator Entry</span>
                  </p>
                  <p className="text-xs text-dark-300">
                    वजन: <strong className="text-white font-mono text-sm">{operatorWeight || '--'} L</strong>
                  </p>
                  <p className="text-xs text-dark-300">
                    FAT: <strong className="text-white font-mono text-sm">{operatorFat || '--'} %</strong>
                  </p>
                  <p className="text-xs text-dark-300">
                    SNF: <strong className="text-white font-mono text-sm">{operatorSnf || '--'}</strong>
                  </p>
                </div>
              </div>

              {/* Mismatch Warning Message */}
              {hasMismatch && (
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 text-[11px] text-rose-300 space-y-1">
                  <p className="font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>रीडिंग में अंतर पाया गया!</span>
                  </p>
                  <p className="text-dark-300">
                    {isWeightMismatched && `वजन में अंतर: AI ने ${numAiWeight}L पढ़ा, आपने ${numOpWeight}L डाला। `}
                    {isFatMismatched && `फैट में अंतर: AI ने ${numAiFat}% पढ़ा, आपने ${numOpFat}% डाला। `}
                  </p>
                  <p className="text-[10px] text-amber-300">
                    यह बदलाव फोटो प्रूफ के साथ मालिक के ऑडिट लॉग में सेव होगा।
                  </p>
                </div>
              )}

              {/* Manual Editable Fields */}
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-dark-400 uppercase">दूध का प्रकार</label>
                    <select
                      value={milkType}
                      onChange={(e: any) => setMilkType(e.target.value)}
                      className="w-full mt-1 px-3 py-2.5 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-semibold focus:outline-none"
                    >
                      <option value="Cow">गाय (Cow)</option>
                      <option value="Buffalo">भैंस (Buffalo)</option>
                      <option value="Mixed">मिक्स (Mixed)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-dark-400 uppercase">शिफ्ट</label>
                    <select
                      value={shift}
                      onChange={(e: any) => setShift(e.target.value)}
                      className="w-full mt-1 px-3 py-2.5 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-semibold focus:outline-none"
                    >
                      <option value="Morning">सुबह (Morning)</option>
                      <option value="Evening">शाम (Evening)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-dark-400 uppercase">मात्रा (Ltr) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={operatorWeight}
                      onChange={(e) => setOperatorWeight(e.target.value)}
                      placeholder="0.00"
                      className={`w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border text-white text-sm font-mono font-bold focus:outline-none ${
                        isWeightMismatched ? 'border-rose-500 text-rose-300' : 'border-dark-700'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-dark-400 uppercase">FAT (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={operatorFat}
                      onChange={(e) => setOperatorFat(e.target.value)}
                      placeholder="0.0"
                      className={`w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border text-white text-sm font-mono font-bold focus:outline-none ${
                        isFatMismatched ? 'border-rose-500 text-rose-300' : 'border-dark-700'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-dark-400 uppercase">SNF</label>
                    <input
                      type="number"
                      step="0.01"
                      value={operatorSnf}
                      onChange={(e) => setOperatorSnf(e.target.value)}
                      placeholder="0.00"
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-sm font-mono font-bold focus:outline-none"
                    />
                  </div>
                </div>

                {/* Status Messages */}
                {deskSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{deskSuccessMsg}</span>
                  </div>
                )}
                {deskErrorMsg && (
                  <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{deskErrorMsg}</span>
                  </div>
                )}

                {/* Submit Entry Button */}
                <button
                  onClick={handleSaveMilkEntry}
                  disabled={isSavingEntry || !selectedFarmer}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-bold shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {isSavingEntry 
                      ? 'सुरक्षित सेव हो रहा है...' 
                      : selectedFarmer 
                        ? `${selectedFarmer.name} का दूध सेव करें` 
                        : 'पहले किसान सेलेक्ट करें'}
                  </span>
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ============================================================== */}
      {/* SUBTAB 2: DVR (ANALOG HD), NVR & IP CAMERAS CONFIGURATION      */}
      {/* ============================================================== */}
      {settingsSubTab === 'cameras' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">DVR (Analog HD), NVR व IP कैमरा सेटअप</h2>
              <p className="text-xs text-dark-400">Hikvision Turbo HD DVR, CP Plus, Dahua XVR, NVR व IP कैमरों का AI इंटीग्रेशन</p>
            </div>

            <button
              onClick={() => {
                setCamForm({
                  id: '',
                  name: `Camera ${cameras.length + 1}`,
                  deviceType: 'DVR',
                  brand: 'HIKVISION',
                  channelType: 'ANALOG',
                  locationType: 'COUNTER_OCR',
                  ipAddress: '192.168.1.64',
                  port: 80,
                  rtspPort: 554,
                  username: 'admin',
                  password: '',
                  channel: 1,
                  streamType: 'sub',
                  snapshotUrl: '',
                  rtspUrl: '',
                  notes: ''
                });
                setTestResult(null);
                setIsAddCameraOpen(true);
              }}
              className="px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>नया कैमरा / DVR जोड़ें</span>
            </button>
          </div>

          {/* Quick Guide Card */}
          <div className="p-4 rounded-3xl bg-indigo-950/30 border border-indigo-500/30 text-xs text-indigo-200 space-y-2">
            <h4 className="font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>DVR और NVR दोनों प्रणालियों के लिए महत्वपूर्ण जानकारी:</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-dark-300">
              <div className="p-2.5 rounded-xl bg-dark-900/60 border border-dark-800">
                <span className="text-indigo-300 font-bold block mb-1">1. DVR (Analog BNC) सपोर्ट:</span>
                अगर आपकी दुकान में साधारण BNC केबल वाला DVR (Hikvision Turbo HD, CP Plus, Dahua) लगा है, तो 'DVR' चुनें। चैनल 1 से 16 तक सभी कैमरे सीधे कनेक्ट होते हैं।
              </div>
              <div className="p-2.5 rounded-xl bg-dark-900/60 border border-dark-800">
                <span className="text-indigo-300 font-bold block mb-1">2. यूजरनेम व डिवाइस पासवर्ड:</span>
                यूजरनेम में <code>admin</code> लिखें। पासवर्ड में अपने DVR/NVR का मुख्य डिवाइस पासवर्ड दर्ज करें।
              </div>
              <div className="p-2.5 rounded-xl bg-dark-900/60 border border-dark-800">
                <span className="text-indigo-300 font-bold block mb-1">3. ऑटो-कैंडिडेट पाथ डिटेक्शन:</span>
                हमारा AI सिस्टम Hikvision ISAPI, CP Plus व Dahua CGI के स्नैपशॉट पाथ्स को अपने-आप जांचकर सही पाथ लॉक कर लेता है।
              </div>
            </div>
          </div>

          {loadingCameras ? (
            <div className="p-8 text-center text-dark-400 text-xs font-bold">कैमरे लोड हो रहे हैं...</div>
          ) : cameras.length === 0 ? (
            <div className="bg-dark-900 border border-dark-800 rounded-3xl p-8 text-center space-y-3">
              <Camera className="w-12 h-12 text-dark-600 mx-auto" />
              <h3 className="text-sm font-bold text-white">कोई कैमरा या DVR नहीं जुड़ा है</h3>
              <p className="text-xs text-dark-400 max-w-md mx-auto">
                अपनी डेयरी के DVR (Turbo HD BNC) या NVR का IP पता (जैसे 192.168.1.64) डालकर कनेक्ट करें।
              </p>
              <button
                onClick={() => {
                  setCamForm({
                    id: '',
                    name: 'Counter Scale Cam',
                    deviceType: 'DVR',
                    brand: 'HIKVISION',
                    channelType: 'ANALOG',
                    locationType: 'COUNTER_OCR',
                    ipAddress: '192.168.1.64',
                    port: 80,
                    rtspPort: 554,
                    username: 'admin',
                    password: '',
                    channel: 1,
                    streamType: 'sub',
                    snapshotUrl: '',
                    rtspUrl: '',
                    notes: ''
                  });
                  setTestResult(null);
                  setIsAddCameraOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>DVR / कैमरा जोड़ें</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {cameras.map((cam) => (
                <div
                  key={cam._id}
                  className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-4 hover:border-indigo-500/40 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>{cam.name}</span>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            cam.status === 'ONLINE' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                          }`}
                        />
                      </h4>
                      <p className="text-[11px] text-dark-400 font-mono mt-0.5">
                        {cam.ipAddress}:{cam.port} • Ch #{cam.channel}
                      </p>
                    </div>

                    <span className="px-2 py-0.5 rounded-md bg-dark-800 text-[10px] font-bold text-indigo-400 border border-dark-700">
                      {cam.locationType}
                    </span>
                  </div>

                  {/* Device and Brand Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-[10px] font-bold text-indigo-400 border border-indigo-500/30">
                      {cam.deviceType === 'DVR' ? 'DVR (Analog BNC)' : cam.deviceType === 'NVR' ? 'NVR (IP Network)' : 'IP Camera'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-dark-800 text-[10px] font-bold text-dark-300 border border-dark-700">
                      {cam.brand || 'HIKVISION'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-dark-800 text-[10px] font-bold text-dark-400 border border-dark-700">
                      {cam.channelType === 'ANALOG' ? 'Analog BNC' : 'IP Stream'} Ch #{cam.channel}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-dark-950 border border-dark-800 space-y-1 text-xs">
                    <p className="text-[10px] text-dark-500 font-mono truncate">
                      Snapshot: <span className="text-dark-300">{cam.snapshotUrl || `/channels/${cam.channel}01/picture`}</span>
                    </p>
                    <p className="text-[10px] text-dark-500 font-mono truncate">
                      RTSP URL: <span className="text-dark-300">{cam.rtspUrl || `rtsp://${cam.ipAddress}:${cam.rtspPort || 554}`}</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-dark-400">
                      {cam.status === 'ONLINE' ? (
                        <>
                          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-semibold">Online (LAN)</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                          <span className="text-rose-400 font-semibold">Offline / Standby</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setCamForm({
                            id: cam._id,
                            name: cam.name,
                            deviceType: cam.deviceType || 'DVR',
                            brand: cam.brand || 'HIKVISION',
                            channelType: cam.channelType || 'ANALOG',
                            locationType: cam.locationType,
                            ipAddress: cam.ipAddress,
                            port: cam.port || 80,
                            rtspPort: cam.rtspPort || 554,
                            username: cam.username,
                            password: '',
                            channel: cam.channel,
                            streamType: cam.streamType,
                            snapshotUrl: cam.snapshotUrl || '',
                            rtspUrl: cam.rtspUrl || '',
                            notes: ''
                          });
                          setTestResult(null);
                          setIsAddCameraOpen(true);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-200 text-xs font-semibold"
                      >
                        एडिट
                      </button>
                      <button
                        onClick={() => handleDeleteCamera(cam._id)}
                        className="p-1.5 rounded-lg text-dark-400 hover:text-rose-400 hover:bg-dark-800 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* SUBTAB 3: KIRANA & SHELF BLOCK INVENTORY                       */}
      {/* ============================================================== */}
      {settingsSubTab === 'shelf' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white">किराना दुकान व शेल्फ स्टॉक ट्रैकिंग</h2>
              <p className="text-xs text-dark-400">रैक/ब्लॉक मैपिंग, विजुअल AI शेल्फ स्कैन और आउट-ऑफ-स्टॉक अलर्ट</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAuditShelfViaCamera()}
                disabled={isAuditingShelf}
                className="px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                <span>{isAuditingShelf ? 'AI स्कैन हो रहा है...' : '📸 AI शेल्फ ऑडिट स्कैन'}</span>
              </button>

              <button
                onClick={() => {
                  setShelfForm({
                    id: '',
                    blockCode: `B${shelves.length + 1}`,
                    shelfName: 'Center Rack',
                    productName: 'Paneer 200g',
                    category: 'Paneer',
                    currentStock: 10,
                    capacity: 20,
                    lowStockThreshold: 4
                  });
                  setIsAddShelfOpen(true);
                }}
                className="px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>नया ब्लॉक जोड़ें</span>
              </button>
            </div>
          </div>

          {shelfAuditSummary && (
            <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
              <span>{shelfAuditSummary}</span>
            </div>
          )}

          {/* Shelves Grid */}
          {loadingShelves ? (
            <div className="p-8 text-center text-dark-400 text-xs font-bold">शेल्फ लोड हो रहे हैं...</div>
          ) : shelves.length === 0 ? (
            <div className="bg-dark-900 border border-dark-800 rounded-3xl p-8 text-center space-y-3">
              <Store className="w-12 h-12 text-dark-600 mx-auto" />
              <h3 className="text-sm font-bold text-white">कोई शेल्फ ब्लॉक नहीं बना है</h3>
              <p className="text-xs text-dark-400 max-w-md mx-auto">
                अपनी दुकान के रैक के लिए ब्लॉक कोड (जैसे Block A1: घी 1L, Block A2: पनीर) बनाएं।
              </p>
              <button
                onClick={() => setIsAddShelfOpen(true)}
                className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>पहला शेल्फ ब्लॉक जोड़ें</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {shelves.map((block) => {
                const stockPercent = Math.min(100, Math.round((block.currentStock / (block.capacity || 1)) * 100));
                const isLow = block.currentStock <= block.lowStockThreshold;
                const isEmpty = block.currentStock === 0;

                return (
                  <div
                    key={block._id}
                    className="bg-dark-900 border border-dark-800 rounded-3xl p-4 shadow-md space-y-3 hover:border-amber-500/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-xl bg-amber-600/20 border border-amber-500/30 font-black text-amber-400 text-xs flex items-center justify-center font-mono">
                          {block.blockCode}
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-white">{block.productName}</h4>
                          <p className="text-[10px] text-dark-400">{block.shelfName}</p>
                        </div>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isEmpty
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : isLow
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {isEmpty ? 'Empty' : isLow ? 'Low Stock' : 'In Stock'}
                      </span>
                    </div>

                    {/* Stock Meter */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-dark-400">स्टॉक: <strong className="text-white">{block.currentStock} पीस</strong></span>
                        <span className="text-dark-500">क्षमता: {block.capacity}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-dark-950 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isEmpty ? 'bg-rose-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${stockPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Footer Check Info */}
                    <div className="flex items-center justify-between text-[10px] text-dark-500 pt-1 border-t border-dark-800">
                      <span>AI चेक: {block.lastCameraCheck ? new Date(block.lastCameraCheck).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'कभी नहीं'}</span>
                      <button
                        onClick={() => {
                          setShelfForm({
                            id: block._id,
                            blockCode: block.blockCode,
                            shelfName: block.shelfName,
                            productName: block.productName,
                            category: block.category,
                            currentStock: block.currentStock,
                            capacity: block.capacity,
                            lowStockThreshold: block.lowStockThreshold
                          });
                          setIsAddShelfOpen(true);
                        }}
                        className="text-indigo-400 hover:underline font-semibold"
                      >
                        अपडेट
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* SUBTAB 4: AI AUDIT SCORECARD & FOOTFALL LOGS                   */}
      {/* ============================================================== */}
      {settingsSubTab === 'audit' && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-dark-400 uppercase">AI OCR Accuracy Rate</span>
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-3xl font-black text-white">{auditData.accuracyRate}%</p>
              <p className="text-[11px] text-emerald-400">कुल {auditData.totalOcrScans} स्कैन्स में से सत्यापित</p>
            </div>

            <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-dark-400 uppercase">ऑपरेटर मिसमैच फ्लैग्स</span>
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <p className="text-3xl font-black text-white">{auditData.totalMismatches}</p>
              <p className="text-[11px] text-dark-400">मैन्युअल बदलाव जिनके फोटो प्रूफ सुरक्षित हैं</p>
            </div>

            <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-dark-400 uppercase">दिन भर के विज़िटर्स</span>
                <UserCheck className="w-5 h-5 text-indigo-400" />
              </div>
              <p className="text-3xl font-black text-white">{auditData.recentVisits.length}</p>
              <p className="text-[11px] text-indigo-400">काउंटर पर किसानों/ग्राहकों की आमद</p>
            </div>
          </div>

          {/* Mismatch Audit Trail Table */}
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">संदेहास्पद एंट्रीज़ व मिसमैच लॉग (Mismatch Trail)</h3>
                <p className="text-[11px] text-dark-400">जहां ऑपरेटर ने AI रीडिंग से भिन्न वैल्यू डाली</p>
              </div>
            </div>

            {auditData.recentMismatches.length === 0 ? (
              <div className="p-6 text-center text-dark-400 text-xs font-medium">
                🎉 कोई मिसमैच नहीं मिला! सभी एंट्रीज़ AI रीडिंग से शत-प्रतिशत मेल खाती हैं।
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-dark-950 text-dark-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-3 rounded-l-xl">समय</th>
                      <th className="p-3">किसान</th>
                      <th className="p-3">AI रीडिंग</th>
                      <th className="p-3">ऑपरेटर एंट्री</th>
                      <th className="p-3">अंतर (Variance)</th>
                      <th className="p-3 rounded-r-xl">फोटो प्रूफ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800">
                    {auditData.recentMismatches.map((item, idx) => (
                      <tr key={idx} className="hover:bg-dark-850/50 transition-colors">
                        <td className="p-3 font-mono text-dark-300">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-3 font-semibold text-white">
                          {item.personName || item.farmerIdCode || 'अज्ञात'}
                        </td>
                        <td className="p-3 font-mono text-indigo-300">
                          {item.aiReading?.weight ?? '--'}L | {item.aiReading?.fat ?? '--'}%
                        </td>
                        <td className="p-3 font-mono text-rose-300 font-bold">
                          {item.operatorReading?.weight ?? '--'}L | {item.operatorReading?.fat ?? '--'}%
                        </td>
                        <td className="p-3 text-[11px] text-dark-400">
                          {item.mismatchReason || 'अंतर दर्ज'}
                        </td>
                        <td className="p-3">
                          {item.snapshotImage ? (
                            <button
                              onClick={() => setPreviewModalImage(item.snapshotImage)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 text-[10px] font-bold"
                            >
                              फोटो देखें
                            </button>
                          ) : (
                            <span className="text-dark-500 text-[10px]">उपलब्ध नहीं</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footfall & Visits Timeline */}
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">"यह व्यक्ति दिन भर में कितनी बार आया?" (Visit Timeline)</h3>
                <p className="text-[11px] text-dark-400">चेहरा व टोकन के आधार पर विजिट टाइमस्टैम्प</p>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={searchPersonQuery}
                  onChange={(e) => setSearchPersonQuery(e.target.value)}
                  placeholder="किसान का नाम खोजें..."
                  className="px-3 py-1.5 rounded-xl bg-dark-950 border border-dark-700 text-xs text-white placeholder-dark-500 focus:outline-none"
                />
              </div>
            </div>

            {auditData.recentVisits.length === 0 ? (
              <div className="p-6 text-center text-dark-400 text-xs">
                आज के विज़िट्स अभी रिकॉर्ड नहीं हुए हैं।
              </div>
            ) : (
              <div className="space-y-2.5">
                {auditData.recentVisits
                  .filter((v) => 
                    !searchPersonQuery || 
                    (v.personName || '').toLowerCase().includes(searchPersonQuery.toLowerCase())
                  )
                  .map((visit, vIdx) => (
                    <div
                      key={vIdx}
                      className="p-3 rounded-2xl bg-dark-950 border border-dark-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 font-bold text-xs flex items-center justify-center">
                          #{visit.visitCountToday}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">
                            {visit.personName || 'किसान / विज़िटर'}
                          </h4>
                          <p className="text-[10px] text-dark-400">
                            {visit.notes || 'काउंटर पर उपस्थिति'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-dark-200">
                          {new Date(visit.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <p className="text-[10px] text-indigo-400 font-semibold">
                          आज {visit.visitCountToday} बार आए
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADD / EDIT DVR / NVR / IP CAMERA                        */}
      {/* ============================================================== */}
      {isAddCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-indigo-400" />
                <span>DVR / NVR / IP कैमरा कॉन्फ़िगरेशन</span>
              </h3>
              <button
                onClick={() => setIsAddCameraOpen(false)}
                className="p-1 rounded-lg text-dark-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick 1-Click Presets */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                त्वरित प्रीसेट (1-Click Presets):
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setCamForm(prev => ({
                    ...prev,
                    deviceType: 'DVR',
                    brand: 'HIKVISION',
                    channelType: 'ANALOG',
                    port: 80,
                    rtspPort: 554,
                    notes: 'Hikvision Turbo HD DVR'
                  }))}
                  className={`p-2 rounded-xl border text-left transition-all ${
                    camForm.deviceType === 'DVR' && camForm.brand === 'HIKVISION'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                      : 'bg-dark-950 border-dark-800 text-dark-300 hover:border-dark-700'
                  }`}
                >
                  <div className="text-[11px] font-bold text-indigo-300">Hikvision DVR</div>
                  <div className="text-[9px] text-dark-400">Turbo HD / BNC</div>
                </button>

                <button
                  type="button"
                  onClick={() => setCamForm(prev => ({
                    ...prev,
                    deviceType: 'DVR',
                    brand: 'CP_PLUS',
                    channelType: 'ANALOG',
                    port: 80,
                    rtspPort: 554,
                    notes: 'CP Plus Cosmic/Orange HD DVR'
                  }))}
                  className={`p-2 rounded-xl border text-left transition-all ${
                    camForm.deviceType === 'DVR' && camForm.brand === 'CP_PLUS'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                      : 'bg-dark-950 border-dark-800 text-dark-300 hover:border-dark-700'
                  }`}
                >
                  <div className="text-[11px] font-bold text-indigo-300">CP Plus DVR</div>
                  <div className="text-[9px] text-dark-400">Cosmic / Analog</div>
                </button>

                <button
                  type="button"
                  onClick={() => setCamForm(prev => ({
                    ...prev,
                    deviceType: 'DVR',
                    brand: 'DAHUA',
                    channelType: 'ANALOG',
                    port: 80,
                    rtspPort: 554,
                    notes: 'Dahua XVR / Cooper HD DVR'
                  }))}
                  className={`p-2 rounded-xl border text-left transition-all ${
                    camForm.deviceType === 'DVR' && camForm.brand === 'DAHUA'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                      : 'bg-dark-950 border-dark-800 text-dark-300 hover:border-dark-700'
                  }`}
                >
                  <div className="text-[11px] font-bold text-indigo-300">Dahua XVR</div>
                  <div className="text-[9px] text-dark-400">Cooper / Analog</div>
                </button>

                <button
                  type="button"
                  onClick={() => setCamForm(prev => ({
                    ...prev,
                    deviceType: 'NVR',
                    brand: 'HIKVISION',
                    channelType: 'IP',
                    port: 80,
                    rtspPort: 554,
                    notes: 'Hikvision NVR IP Channels'
                  }))}
                  className={`p-2 rounded-xl border text-left transition-all ${
                    camForm.deviceType === 'NVR'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                      : 'bg-dark-950 border-dark-800 text-dark-300 hover:border-dark-700'
                  }`}
                >
                  <div className="text-[11px] font-bold text-indigo-300">Hikvision NVR</div>
                  <div className="text-[9px] text-dark-400">Digital IP Stream</div>
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveCamera} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-dark-400 uppercase">कैमरा नाम *</label>
                <input
                  type="text"
                  required
                  value={camForm.name}
                  onChange={(e) => setCamForm({ ...camForm, name: e.target.value })}
                  placeholder="e.g. Counter Scale Cam (DVR Ch 1)"
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-medium focus:outline-none"
                />
              </div>

              {/* Device Type & Brand & Channel Type Selectors */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-dark-400 uppercase">सिस्टम प्रकार (Device) *</label>
                  <select
                    value={camForm.deviceType}
                    onChange={(e: any) => setCamForm({ ...camForm, deviceType: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-medium focus:outline-none"
                  >
                    <option value="DVR">DVR (Analog BNC)</option>
                    <option value="NVR">NVR (Digital IP)</option>
                    <option value="IP_CAMERA">Standalone IP Cam</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-dark-400 uppercase">ब्रांड (Brand) *</label>
                  <select
                    value={camForm.brand}
                    onChange={(e: any) => setCamForm({ ...camForm, brand: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-medium focus:outline-none"
                  >
                    <option value="HIKVISION">Hikvision (Turbo HD / DS)</option>
                    <option value="CP_PLUS">CP Plus (Cosmic / Orange)</option>
                    <option value="DAHUA">Dahua (XVR / Cooper)</option>
                    <option value="GENERIC_ONVIF">Generic ONVIF / RTSP</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-dark-400 uppercase">चैनल प्रकार</label>
                  <select
                    value={camForm.channelType}
                    onChange={(e: any) => setCamForm({ ...camForm, channelType: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-medium focus:outline-none"
                  >
                    <option value="ANALOG">Analog (BNC केबल)</option>
                    <option value="IP">IP (LAN / PoE केबल)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-dark-400 uppercase">लोकेशन रोल *</label>
                  <select
                    value={camForm.locationType}
                    onChange={(e: any) => setCamForm({ ...camForm, locationType: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-medium focus:outline-none"
                  >
                    <option value="COUNTER_OCR">दूध काउंटर (Scale & Fat)</option>
                    <option value="GALLA_SECURITY">गल्ला व कैश काउंटर</option>
                    <option value="SHELF_INVENTORY">किराना शेल्फ व रैक</option>
                    <option value="GATE_ENTRY">गेट व टैंकर एंट्री</option>
                    <option value="CATTLE_SHED">बाड़ा व शेड</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-dark-400 uppercase">चैनल नंबर (1 - 32) *</label>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={camForm.channel}
                    onChange={(e) => setCamForm({ ...camForm, channel: parseInt(e.target.value, 10) || 1 })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-medium focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-dark-400 uppercase">DVR/NVR का IP पता *</label>
                  <input
                    type="text"
                    required
                    value={camForm.ipAddress}
                    onChange={(e) => setCamForm({ ...camForm, ipAddress: e.target.value })}
                    placeholder="192.168.1.64"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-mono font-medium focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-dark-400 uppercase">HTTP पोर्ट</label>
                  <input
                    type="number"
                    value={camForm.port}
                    onChange={(e) => setCamForm({ ...camForm, port: parseInt(e.target.value, 10) || 80 })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-mono font-medium focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-dark-400 uppercase">RTSP पोर्ट</label>
                  <input
                    type="number"
                    value={camForm.rtspPort}
                    onChange={(e) => setCamForm({ ...camForm, rtspPort: parseInt(e.target.value, 10) || 554 })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-mono font-medium focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-dark-400 uppercase">यूज़रनेम</label>
                  <input
                    type="text"
                    value={camForm.username}
                    onChange={(e) => setCamForm({ ...camForm, username: e.target.value })}
                    placeholder="admin"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-medium focus:outline-none"
                  />
                  <p className="text-[10px] text-dark-500 mt-1">डिफ़ॉल्ट <code>admin</code> (DVR एडमिन यूजर)</p>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-dark-400 uppercase">पासवर्ड</label>
                  <input
                    type="password"
                    value={camForm.password}
                    onChange={(e) => setCamForm({ ...camForm, password: e.target.value })}
                    placeholder={camForm.id ? "पासवर्ड बदलने के लिए लिखें" : "DVR/NVR पासवर्ड"}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-medium focus:outline-none"
                  />
                  <p className="text-[10px] text-dark-500 mt-1">DVR/कैमरा डिवाइस पासवर्ड</p>
                </div>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-2xl text-xs font-medium space-y-2 ${
                    testResult.success
                      ? 'bg-emerald-950/30 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/30 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <p>{testResult.message}</p>
                  </div>

                  {testResult.image && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-emerald-500/30 bg-black/60 p-1">
                      <p className="text-[10px] text-emerald-400 font-bold px-1 pb-1">
                        ✓ लाइव DVR स्नैपशॉट प्रीव्यू (Probe Success):
                      </p>
                      <img
                        src={testResult.image}
                        alt="Camera Live Preview"
                        className="w-full h-44 object-cover rounded-lg"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleTestCamera}
                  disabled={testingCam}
                  className="px-4 py-2.5 rounded-xl bg-dark-800 hover:bg-dark-750 text-dark-200 text-xs font-bold transition-all disabled:opacity-50"
                >
                  {testingCam ? 'DVR टेस्ट हो रहा है...' : 'कनेक्शन व पाथ टेस्ट करें'}
                </button>

                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-all"
                >
                  कैमरा / DVR सेव करें
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADD / EDIT SHELF BLOCK                                  */}
      {/* ============================================================== */}
      {isAddShelfOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-amber-400" />
                <span>शेल्फ ब्लॉक व माल जोड़ें</span>
              </h3>
              <button
                onClick={() => setIsAddShelfOpen(false)}
                className="p-1 rounded-lg text-dark-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShelf} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-dark-400 uppercase">ब्लॉक कोड *</label>
                  <input
                    type="text"
                    required
                    value={shelfForm.blockCode}
                    onChange={(e) => setShelfForm({ ...shelfForm, blockCode: e.target.value.toUpperCase() })}
                    placeholder="e.g. A1, B2"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-mono font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-dark-400 uppercase">शेल्फ / रैक का नाम</label>
                  <input
                    type="text"
                    required
                    value={shelfForm.shelfName}
                    onChange={(e) => setShelfForm({ ...shelfForm, shelfName: e.target.value })}
                    placeholder="e.g. Top Rack"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-medium focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-dark-400 uppercase">प्रोडक्ट का नाम *</label>
                <input
                  type="text"
                  required
                  value={shelfForm.productName}
                  onChange={(e) => setShelfForm({ ...shelfForm, productName: e.target.value })}
                  placeholder="e.g. Desi Ghee 1L, Paneer 200g"
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-semibold focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-dark-400 uppercase">वर्तमान स्टॉक</label>
                  <input
                    type="number"
                    value={shelfForm.currentStock}
                    onChange={(e) => setShelfForm({ ...shelfForm, currentStock: parseInt(e.target.value, 10) || 0 })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-mono font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-dark-400 uppercase">अधिकतम क्षमता</label>
                  <input
                    type="number"
                    value={shelfForm.capacity}
                    onChange={(e) => setShelfForm({ ...shelfForm, capacity: parseInt(e.target.value, 10) || 20 })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-mono font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-dark-400 uppercase">अलर्ट सीमा (Low)</label>
                  <input
                    type="number"
                    value={shelfForm.lowStockThreshold}
                    onChange={(e) => setShelfForm({ ...shelfForm, lowStockThreshold: parseInt(e.target.value, 10) || 5 })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-dark-950 border border-dark-700 text-white text-xs font-mono font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md transition-all"
                >
                  ब्लॉक सुरक्षित करें
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: PHOTO PROOF VIEWER                                      */}
      {/* ============================================================== */}
      {previewModalImage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-3xl p-4 max-w-2xl w-full space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-400" />
                <span>AI कैमरा फोटो प्रूफ (Captured Snapshot)</span>
              </h4>
              <button
                onClick={() => setPreviewModalImage(null)}
                className="p-1 rounded-lg text-dark-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden bg-black flex items-center justify-center max-h-[70vh]">
              <img
                src={previewModalImage}
                alt="Captured Snapshot Proof"
                className="w-full h-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODALS: ADVANCED SURVEILLANCE & SAAS EXTENSIONS               */}
      {/* ============================================================== */}
      <ShopPersonProfilesModal
        isOpen={isProfilesModalOpen}
        onClose={() => setIsProfilesModalOpen(false)}
      />

      <TimeIntervalGallaReportModal
        isOpen={isTimeGallaModalOpen}
        onClose={() => setIsTimeGallaModalOpen(false)}
      />

      <DvrPlaybackModal
        isOpen={isDvrPlaybackModalOpen}
        onClose={() => setIsDvrPlaybackModalOpen(false)}
        cameras={cameras}
      />

      <FridgeSurveillanceModal
        isOpen={isFridgeModalOpen}
        onClose={() => setIsFridgeModalOpen(false)}
      />

    </div>
  );
};
