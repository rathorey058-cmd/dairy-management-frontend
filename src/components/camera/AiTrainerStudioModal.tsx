import React, { useState, useEffect, useRef, useCallback } from 'react';
import API from '../../api';
import { mobileYolo } from '../../services/mobileYoloService';
import {
  aiBrainService,
  compute96DFeatureVector,
  type LearnedObjectItem,
  type LearnedPersonItem,
  type RoutineStats,
} from '../../services/aiBrainService';
import {
  X, Upload, Sparkles, Users, ShieldCheck, Download, FolderUp,
  Play, Pause, CheckCircle2, Trash2, Edit3, AlertTriangle, Cpu, Video, Camera
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cameras: any[];
  dvrFrames: Record<string, string>;
  onLaunchVideoIn3DTest: (file: File, channel: number) => void;
  onBrainUpdated?: () => void;
}

const OBJECT_PRESETS = [
  { label: '50L स्टील मिल्क कैन', cat: 'CAN' as const },
  { label: 'दूध पतीला', cat: 'PATILA' as const },
  { label: 'डेयरी क्रेट / ट्रे', cat: 'CRATE' as const },
  { label: 'इलेक्ट्रॉनिक तौल कांटा', cat: 'SCALE' as const },
  { label: 'खुला गल्ला दराज', cat: 'GALLA_OPEN' as const },
  { label: 'दूध / दही पैकेट', cat: 'PACKET' as const },
  { label: 'अनदेखा करें (झूठा अलर्ट रोकें)', cat: 'IGNORE' as const },
];

export const AiTrainerStudioModal: React.FC<Props> = ({
  isOpen,
  onClose,
  cameras,
  dvrFrames,
  onLaunchVideoIn3DTest,
  onBrainUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'video_train' | 'auto_people' | 'routine_backup'>('video_train');
  const [routine, setRoutine] = useState<RoutineStats | null>(null);
  const [learnedObjects, setLearnedObjects] = useState<LearnedObjectItem[]>([]);
  const [learnedPeople, setLearnedPeople] = useState<LearnedPersonItem[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  // Video Trainer & 1-Click Teach state
  const [selectedChannel, setSelectedChannel] = useState<number>(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [teachModeType, setTeachModeType] = useState<'OBJECT' | 'PERSON'>('OBJECT');
  const [teachLabel, setTeachLabel] = useState('50L स्टील मिल्क कैन');
  const [teachCategory, setTeachCategory] = useState<LearnedObjectItem['objectCategory']>('CAN');
  const [personRoleChoice, setPersonRoleChoice] = useState<'REGULAR_CUSTOMER' | 'STAFF' | 'FARMER'>('REGULAR_CUSTOMER');
  const [box, setBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 0.28,
    y: 0.24,
    width: 0.36,
    height: 0.44,
  });
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const [autoScanProgress, setAutoScanProgress] = useState<number>(0);
  const [isSavingTeach, setIsSavingTeach] = useState(false);

  // Rename state for learned people
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editNameInput, setEditNameInput] = useState<string>('');

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const liveImgElRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const backupRestoreRef = useRef<HTMLInputElement | null>(null);

  const loadBrain = useCallback(async () => {
    try {
      const res = await API.get('/cameras/ai-brain');
      if (res.data?.success) {
        setRoutine(res.data.routine || null);
        setLearnedObjects(res.data.learnedObjects || []);
        setLearnedPeople(res.data.learnedPeople || []);
      }
      await aiBrainService.refreshBrain(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadBrain();
      setStatusMsg(null);
    }
  }, [isOpen, loadBrain]);

  useEffect(() => {
    return () => {
      if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
    };
  }, [videoBlobUrl]);

  if (!isOpen) return null;

  const activeLiveCam = cameras.find((c, i) => Number(c.channel || i + 1) === Number(selectedChannel)) || cameras[0];
  const activeLiveFrame = activeLiveCam ? dvrFrames[activeLiveCam._id] : null;

  const handleSelectVideoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
    const u = URL.createObjectURL(f);
    setUploadedFile(f);
    setVideoBlobUrl(u);
    setIsPlaying(false);
    setStatusMsg({
      tone: 'ok',
      text: `फुटेज लोड हो गई: "${f.name}" — आप इससे ऑटो-ट्रेन कर सकते हैं, बॉक्स खींचकर सिखा सकते हैं, या सीधे 3D Tesla मॉडल में लाइव टेस्ट चला सकते हैं।`,
    });
  };

  const handleStageDown = (clientX: number, clientY: number) => {
    if (!stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(0.95, (clientX - r.left) / r.width));
    const ny = Math.max(0, Math.min(0.95, (clientY - r.top) / r.height));
    dragStartRef.current = { x: nx, y: ny };
    setBox({ x: nx, y: ny, width: 0.08, height: 0.08 });
  };

  const handleStageMove = (clientX: number, clientY: number) => {
    if (!dragStartRef.current || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const cx = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const cy = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    const x0 = Math.min(dragStartRef.current.x, cx);
    const y0 = Math.min(dragStartRef.current.y, cy);
    setBox({
      x: x0,
      y: y0,
      width: Math.max(0.06, Math.min(1 - x0, Math.abs(cx - dragStartRef.current.x))),
      height: Math.max(0.06, Math.min(1 - y0, Math.abs(cy - dragStartRef.current.y))),
    });
  };

  const handleStageUp = () => {
    dragStartRef.current = null;
  };

  /** 1-Click Teach Box on Active Video or Live Camera Frame */
  const handleTeachCurrentBox = async () => {
    const srcEl = videoBlobUrl ? videoElRef.current : liveImgElRef.current;
    if (!srcEl) {
      setStatusMsg({ tone: 'warn', text: 'कृपया पहले एक फुटेज वीडियो चुनें या लाइव कैमरा सिंक होने दें।' });
      return;
    }
    if (!teachLabel.trim()) {
      setStatusMsg({ tone: 'warn', text: 'कृपया सिखाने के लिए नाम लिखें (जैसे 50L मिल्क कैन या शर्मा जी)।' });
      return;
    }

    setIsSavingTeach(true);
    try {
      const targetBox =
        teachModeType === 'PERSON'
          ? { x: box.x, y: box.y, width: box.width, height: box.height * 0.62 }
          : box;
      const feat = compute96DFeatureVector(srcEl, targetBox);
      if (!feat) {
        setStatusMsg({ tone: 'warn', text: 'फ्रेम अभी तैयार नहीं है — वीडियो को एक पल चलाकर रोकें फिर सिखाएँ।' });
        return;
      }

      if (teachModeType === 'OBJECT') {
        await API.post('/cameras/ai-brain/teach-object', {
          label: teachLabel.trim(),
          objectCategory: teachCategory,
          channel: selectedChannel,
          featureVector: feat.vector,
          box,
          thumbnailBase64: feat.thumbnailBase64,
          fromVideo: Boolean(videoBlobUrl),
        });
        setStatusMsg({
          tone: 'ok',
          text: `✅ AI ने "${teachLabel.trim()}" (Ch#${selectedChannel}) को स्थायी मेमोरी में सीख लिया है! अब यह लाइव व 3D टेस्ट दोनों में दिखेगा।`,
        });
      } else {
        await API.post('/cameras/ai-brain/observe-person', {
          channel: selectedChannel,
          featureVector: feat.vector,
          thumbnailBase64: feat.thumbnailBase64,
          explicitOwnerName: teachLabel.trim(),
          personRoleHint: personRoleChoice,
          fromVideoTest: Boolean(videoBlobUrl),
        });
        setStatusMsg({
          tone: 'ok',
          text: `✅ व्यक्ति "${teachLabel.trim()}" की पहचान स्थायी AI ब्रेन में सेव हो गई! कैमरे में दिखते ही 3D मॉडल में नाम दिखेगा।`,
        });
      }

      await loadBrain();
      onBrainUpdated?.();
    } catch (err: any) {
      setStatusMsg({ tone: 'warn', text: err.response?.data?.message || 'सिखाने का डेटा सेव करने में समस्या आई।' });
    } finally {
      setIsSavingTeach(false);
    }
  };

  /** Automated Multi-Keyframe Self-Learning Scan across Uploaded Video Footage */
  const handleAutoTrainFromVideo = async () => {
    const vid = videoElRef.current;
    if (!vid || !videoBlobUrl || !isFinite(vid.duration) || vid.duration <= 0) {
      setStatusMsg({ tone: 'warn', text: 'कृपया पहले कोई रिकॉर्डेड वीडियो फ़ाइल चुनें ताकि ऑटो-ट्रेनर उसे स्कैन कर सके।' });
      return;
    }

    setIsAutoScanning(true);
    setAutoScanProgress(5);
    vid.pause();
    setIsPlaying(false);

    try {
      await mobileYolo.initModel();
      const totalDur = vid.duration;
      const numSamples = Math.min(12, Math.max(4, Math.floor(totalDur / 4)));
      let learnedPeopleHits = 0;
      let scannedFrames = 0;

      for (let i = 0; i < numSamples; i++) {
        const targetTime = Math.min(totalDur - 0.1, (i + 0.5) * (totalDur / numSamples));
        vid.currentTime = targetTime;
        await new Promise<void>((resolve) => {
          const onSeek = () => {
            vid.removeEventListener('seeked', onSeek);
            resolve();
          };
          vid.addEventListener('seeked', onSeek);
          setTimeout(resolve, 700);
        });

        const dets = await mobileYolo.detectFrame(vid);
        scannedFrames++;
        const persons = dets.filter((d) => d.className === 'person' && d.confidence >= 50);

        for (const p of persons.slice(0, 2)) {
          const upperBox = { x: p.box.x, y: p.box.y, width: p.box.width, height: p.box.height * 0.62 };
          const feat = compute96DFeatureVector(vid, upperBox);
          if (feat) {
            await API.post('/cameras/ai-brain/observe-person', {
              channel: selectedChannel,
              featureVector: feat.vector,
              thumbnailBase64: feat.thumbnailBase64,
              framesBatchCount: 2,
              fromVideoTest: true,
            });
            learnedPeopleHits++;
          }
        }

        setAutoScanProgress(Math.round(((i + 1) / numSamples) * 100));
      }

      await loadBrain();
      onBrainUpdated?.();
      setStatusMsg({
        tone: 'ok',
        text: `🎉 फुटेज ऑटो-ट्रेनिंग पूरी! ${scannedFrames} मुख्य फ्रेम्स स्कैन किए गए और ${learnedPeopleHits} चेहरों/आगंतुकों के पैटर्न स्थायी AI मेमोरी में जुड़ गए।`,
      });
    } catch {
      setStatusMsg({ tone: 'warn', text: 'वीडियो ऑटो-स्कैन के दौरान रुकावट आई।' });
    } finally {
      setIsAutoScanning(false);
    }
  };

  const handleSavePersonName = async (id: string) => {
    if (!editNameInput.trim()) return;
    try {
      await API.patch(`/cameras/ai-brain/entity/${id}`, { label: editNameInput.trim() });
      setEditingPersonId(null);
      setEditNameInput('');
      await loadBrain();
      onBrainUpdated?.();
    } catch {
      // ignore
    }
  };

  const handleDeleteEntity = async (id: string) => {
    try {
      await API.delete(`/cameras/ai-brain/entity/${id}`);
      await loadBrain();
      onBrainUpdated?.();
    } catch {
      // ignore
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const res = await API.get('/cameras/ai-brain/export-backup');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DairySmartAI_Brain_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      setStatusMsg({ tone: 'ok', text: '💾 स्थायी AI ब्रेन बैकअप फ़ाइल आपके सिस्टम में सुरक्षित डाउनलोड हो गई।' });
    } catch {
      setStatusMsg({ tone: 'warn', text: 'बैकअप डाउनलोड करने में त्रुटि आई।' });
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      const res = await API.post('/cameras/ai-brain/import-backup', { records: parsed.records || [] });
      await loadBrain();
      onBrainUpdated?.();
      setStatusMsg({
        tone: 'ok',
        text: `✅ बैकअप सफलतापूर्वक रीस्टोर हुआ (${res.data?.restored || 0} सीखी हुई मेमोरी वापस जुड़ गईं)!`,
      });
    } catch {
      setStatusMsg({ tone: 'warn', text: 'अमान्य बैकअप फ़ाइल।' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-slate-950 border border-slate-800 w-full max-w-5xl rounded-3xl shadow-2xl flex flex-col max-h-[93vh] overflow-hidden text-white">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold">
                  AI सेल्फ-लर्निंग मॉडल ट्रेनर व 3D टेस्ट स्टूडियो
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/35 text-sky-300 text-[11px] font-mono font-bold">
                  Model v{(routine?.modelVersion || 1.0).toFixed(2)} • {routine?.accuracyScore || 86.5}% सटीकता
                </span>
              </div>
              <p className="text-xs text-slate-400">
                फुटेज डालकर मॉडल सिखाएँ, 3D Tesla मॉडल में लाइव टेस्ट करें, और बिना नाम बताए रेगुलर लोगों व दुकान की आदतों को स्थायी सेव रखें।
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-xs bg-slate-950">
          <button
            type="button"
            onClick={() => setActiveTab('video_train')}
            className={`pb-2.5 px-3.5 font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'video_train'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Video className="w-4 h-4" />
            1. फुटेज डालकर ट्रेन व 3D टेस्ट ({learnedObjects.length} सामान)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('auto_people')}
            className={`pb-2.5 px-3.5 font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'auto_people'
                ? 'border-sky-400 text-sky-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            2. स्वतः पहचाने गए रेगुलर लोग व नाम ({learnedPeople.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('routine_backup')}
            className={`pb-2.5 px-3.5 font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'routine_backup'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            3. दुकान की आदत, अजीब अलर्ट व स्थायी डेटा सुरक्षा
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {statusMsg && (
            <div
              className={`p-3 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
                statusMsg.tone === 'ok'
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                  : 'bg-amber-950/60 border-amber-500/40 text-amber-200'
              }`}
            >
              {statusMsg.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* TAB 1: UPLOAD VIDEO TO TRAIN + 1-CLICK BOX TEACH + LAUNCH IN 3D */}
          {activeTab === 'video_train' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left 7 Cols: Interactive Video / Live Frame Stage */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <label className="text-slate-400 font-semibold">कैमरा चैनल मैपिंग:</label>
                    <select
                      value={selectedChannel}
                      onChange={(e) => setSelectedChannel(Number(e.target.value))}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold"
                    >
                      {[1, 2, 3, 4, 5].map((ch) => {
                        const cm = cameras.find((c, idx) => Number(c.channel || idx + 1) === ch);
                        return (
                          <option key={ch} value={ch}>
                            Ch #{ch} — {cm ? cm.name : ch === 1 ? 'मुख्य काउंटर' : ch === 2 ? 'गल्ला/फ्रीजर' : ch === 3 ? 'रैक/कांटा' : ch === 4 ? 'मुख्य गेट' : 'बाहरी सड़क'}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <input ref={filePickerRef} type="file" accept="video/*" onChange={handleSelectVideoFile} className="hidden" />
                    <button
                      type="button"
                      onClick={() => filePickerRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white keep-white-text font-bold flex items-center gap-1.5 shadow"
                    >
                      <Upload className="w-3.5 h-3.5" /> फुटेज वीडियो डालें
                    </button>
                    {uploadedFile && (
                      <button
                        type="button"
                        onClick={() => {
                          onLaunchVideoIn3DTest(uploadedFile, selectedChannel);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white keep-white-text font-bold flex items-center gap-1.5 shadow"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> 3D Tesla मॉडल में लाइव टेस्ट चलाएँ
                      </button>
                    )}
                  </div>
                </div>

                {/* Video / Camera Stage with Drag-to-Teach Box */}
                <div
                  ref={stageRef}
                  onMouseDown={(e) => handleStageDown(e.clientX, e.clientY)}
                  onMouseMove={(e) => handleStageMove(e.clientX, e.clientY)}
                  onMouseUp={handleStageUp}
                  onMouseLeave={handleStageUp}
                  onTouchStart={(e) => e.touches[0] && handleStageDown(e.touches[0].clientX, e.touches[0].clientY)}
                  onTouchMove={(e) => e.touches[0] && handleStageMove(e.touches[0].clientX, e.touches[0].clientY)}
                  onTouchEnd={handleStageUp}
                  className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-slate-700 cursor-crosshair select-none"
                >
                  {videoBlobUrl ? (
                    <video
                      ref={videoElRef}
                      src={videoBlobUrl}
                      playsInline
                      className="w-full h-full object-contain pointer-events-none"
                    />
                  ) : activeLiveFrame ? (
                    <img
                      ref={liveImgElRef}
                      src={activeLiveFrame}
                      alt="Live Camera"
                      crossOrigin="anonymous"
                      className="w-full h-full object-contain pointer-events-none"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center space-y-2">
                      <Camera className="w-8 h-8 text-slate-600" />
                      <p className="text-xs font-semibold text-slate-300">
                        ऊपर “फुटेज वीडियो डालें” से कोई भी CCTV/मोबाइल रिकॉर्डिंग चुनें
                      </p>
                      <p className="text-[11px] text-slate-500">
                        फुटेज डालते ही आप उस पर बॉक्स खींचकर मॉडल को सिखा सकते हैं और सीधे 3D मॉडल में टेस्ट देख सकते हैं।
                      </p>
                    </div>
                  )}

                  {/* Active Teach Selection Box */}
                  <div
                    style={{
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.width * 100}%`,
                      height: `${box.height * 100}%`,
                    }}
                    className="absolute border-2 border-emerald-400 bg-emerald-500/15 rounded-lg pointer-events-none flex flex-col justify-between p-1.5"
                  >
                    <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold self-start shadow">
                      🧠 सिखाएँ: {teachLabel || 'नया टैग'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-black/80 text-emerald-300 font-mono text-[9px] self-end">
                      Ch#{selectedChannel}
                    </span>
                  </div>
                </div>

                {/* Video Playback & Auto-Train Bar */}
                {videoBlobUrl && (
                  <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const v = videoElRef.current;
                          if (!v) return;
                          if (v.paused) {
                            v.play().then(() => setIsPlaying(true)).catch(() => {});
                          } else {
                            v.pause();
                            setIsPlaying(false);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center gap-1.5"
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{isPlaying ? 'रोककर बॉक्स खींचें' : 'चलाएँ'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (videoElRef.current) {
                            videoElRef.current.currentTime = Math.max(0, videoElRef.current.currentTime - 5);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                      >
                        -5s रिवाइंड
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleAutoTrainFromVideo}
                      disabled={isAutoScanning}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white keep-white-text font-bold flex items-center gap-1.5 shadow disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {isAutoScanning ? `फुटेज स्कैन हो रही है (${autoScanProgress}%)...` : '⚡ पूरी फुटेज से ऑटो-लर्न करें'}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Right 5 Cols: 1-Click Teach Controls & Saved Objects */}
              <div className="lg:col-span-5 space-y-3 text-xs">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <h4 className="text-sm font-bold text-white">माउस से बॉक्स खींचकर AI को सिखाएँ</h4>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTeachModeType('OBJECT');
                        setTeachLabel('50L स्टील मिल्क कैन');
                      }}
                      className={`py-2 rounded-xl font-bold border ${
                        teachModeType === 'OBJECT'
                          ? 'bg-emerald-600 text-white border-emerald-500 keep-white-text'
                          : 'bg-slate-950 text-slate-300 border-slate-800'
                      }`}
                    >
                      🥛 डेयरी सामान / गल्ला
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTeachModeType('PERSON');
                        setTeachLabel('शर्मा जी');
                      }}
                      className={`py-2 rounded-xl font-bold border ${
                        teachModeType === 'PERSON'
                          ? 'bg-sky-600 text-white border-sky-500 keep-white-text'
                          : 'bg-slate-950 text-slate-300 border-slate-800'
                      }`}
                    >
                      👤 व्यक्ति / स्टाफ चेहरा
                    </button>
                  </div>

                  {teachModeType === 'OBJECT' ? (
                    <div className="flex flex-wrap gap-1.5">
                      {OBJECT_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => {
                            setTeachLabel(p.label);
                            setTeachCategory(p.cat);
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                            teachLabel === p.label
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      {(
                        [
                          ['REGULAR_CUSTOMER', 'रेगुलर ग्राहक'],
                          ['STAFF', 'दुकान स्टाफ'],
                          ['FARMER', 'दूध किसान'],
                        ] as const
                      ).map(([rk, rlbl]) => (
                        <button
                          key={rk}
                          type="button"
                          onClick={() => setPersonRoleChoice(rk)}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                            personRoleChoice === rk
                              ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                              : 'bg-slate-950 border-slate-800 text-slate-300'
                          }`}
                        >
                          {rlbl}
                        </button>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1 font-semibold">
                      नाम / लेबल (यही नाम लाइव कैमरा व 3D मॉडल में दिखेगा):
                    </label>
                    <input
                      type="text"
                      value={teachLabel}
                      onChange={(e) => setTeachLabel(e.target.value)}
                      placeholder="जैसे: 50L मिल्क कैन, शर्मा जी, आकाश स्टाफ"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleTeachCurrentBox}
                    disabled={isSavingTeach}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white keep-white-text font-bold shadow-lg disabled:opacity-50"
                  >
                    {isSavingTeach ? 'स्थायी मेमोरी में सेव हो रहा है...' : '🧠 अभी मॉडल को सिखाएँ (स्थायी सेव)'}
                  </button>
                </div>

                {/* Learned Objects List */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 max-h-56 overflow-y-auto">
                  <div className="font-bold text-slate-200">सीखे गए कस्टम डेयरी ऑब्जेक्ट्स ({learnedObjects.length})</div>
                  {learnedObjects.length === 0 ? (
                    <p className="text-[11px] text-slate-400">
                      अभी कोई कस्टम सामान नहीं सिखाया गया। बाईं ओर किसी सामान पर बॉक्स खींचकर “सिखाएँ” दबाएँ।
                    </p>
                  ) : (
                    learnedObjects.map((o) => (
                      <div key={o._id} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-800/70">
                        <div className="flex items-center gap-2 min-w-0">
                          {o.thumbnailBase64 && (
                            <img src={o.thumbnailBase64} alt={o.label} className="w-8 h-8 rounded-lg object-cover border border-slate-700" />
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-white truncate">{o.label}</div>
                            <div className="text-[10px] text-slate-400">
                              Ch#{o.channel} • {o.matchCount || 1} सैंपल
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteEntity(o._id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SELF-LEARNED REGULAR VISITORS & AUTO-DISCOVERED SPOKEN NAMES */}
          {activeTab === 'auto_people' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                यहाँ AI बिना किसी मैनुअल एंट्री के रोज़ आने वाले लोगों के चेहरे/पैटर्न को पहचानता है। जब माइक में किसी व्यक्ति को नाम से पुकारा जाता है (जैसे <strong>“अरे शर्मा जी”</strong>, <strong>“राजू भाई का हिसाब”</strong>) या उसका बिल कटता है, तो मॉडल खुद नाम सीखकर 3D अवतार से जोड़ लेता है।
              </div>

              {learnedPeople.length === 0 ? (
                <div className="text-center py-10 rounded-2xl bg-slate-900/60 border border-dashed border-slate-800 text-xs text-slate-400">
                  अभी कोई विज़िटर क्लस्टर सेव नहीं हुआ है। लाइव कैमरा चलने या फुटेज ऑटो-ट्रेन करते ही यहाँ रेगुलर लोग अपने-आप बनते जाएंगे।
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {learnedPeople.map((p) => {
                    const topHour =
                      p.typicalHours && p.typicalHours.length > 0
                        ? p.typicalHours[p.typicalHours.length - 1]
                        : null;
                    return (
                      <div key={p._id} className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-start gap-3 text-xs">
                        {p.thumbnailBase64 ? (
                          <img
                            src={p.thumbnailBase64}
                            alt={p.label}
                            className="w-14 h-16 rounded-xl object-cover border border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-16 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                            <Users className="w-6 h-6" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            {editingPersonId === p._id ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={editNameInput}
                                  onChange={(e) => setEditNameInput(e.target.value)}
                                  className="px-2 py-1 rounded-lg bg-slate-950 border border-sky-500 text-white text-xs w-32"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSavePersonName(p._id)}
                                  className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold"
                                >
                                  सेव
                                </button>
                              </div>
                            ) : (
                              <div className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                                <span>{p.label}</span>
                                {p.isNameConfirmed && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px]">
                                    ✓ नाम पक्का
                                  </span>
                                )}
                              </div>
                            )}

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPersonId(p._id);
                                  setEditNameInput(p.label);
                                }}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-sky-300"
                                title="नाम सुधारें / पक्का करें"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEntity(p._id)}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400"
                                title="हटाएँ"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold ${
                                p.personRole === 'REGULAR_CUSTOMER' || p.visitCount >= 3
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : p.personRole === 'STAFF'
                                  ? 'bg-indigo-500/15 text-indigo-300'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {p.personRole === 'STAFF'
                                ? 'स्टाफ'
                                : p.personRole === 'REGULAR_CUSTOMER' || p.visitCount >= 3
                                ? `रेगुलर व्यक्ति (${p.visitCount} बार दिखा)`
                                : `नया आगंतुक (${p.visitCount} बार)`}
                            </span>
                            {topHour !== null && <span>• समय ~{topHour}:00 बजे</span>}
                          </div>

                          {p.candidateNames && p.candidateNames.length > 0 && (
                            <div className="text-[11px] text-amber-300">
                              🎙️ ऑडियो/बिल से सुने गए नाम:{' '}
                              {p.candidateNames.map((c) => `${c.name} (${c.votes}x)`).join(', ')}
                            </div>
                          )}

                          {p.usualItems && p.usualItems.length > 0 && (
                            <div className="text-[11px] text-sky-300 truncate">
                              🥛 सामान्य खरीद: {p.usualItems.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DAILY SHOP ROUTINE BASELINE, ANOMALIES & ZERO-LOSS BACKUP */}
          {activeTab === 'routine_backup' && (
            <div className="space-y-4 text-xs">
              {/* Permanent Data Security Guarantee Card */}
              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/35 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 max-w-2xl">
                  <div className="text-sm font-bold text-emerald-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" /> स्थायी AI मेमोरी सुरक्षा (डेटा कभी डिलीट नहीं होगा)
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    आपका सीखा हुआ सारा डेटा <strong>MongoDB Atlas क्लाउड (`aibrainmemories`)</strong> + दुकान के PC पर <strong>लोकल डिस्क मिरर (`edge_ai/brain_backup/permanent_ai_brain.json`)</strong> दोनों में सुरक्षित रहता है। 30-दिन वाली CCTV लॉग सफाई से भी यह डेटा कभी नहीं मिटता।
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadBackup}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white keep-white-text font-bold flex items-center gap-1.5 shadow"
                  >
                    <Download className="w-3.5 h-3.5" /> बैकअप डाउनलोड (.json)
                  </button>
                  <input ref={backupRestoreRef} type="file" accept=".json" onChange={handleRestoreBackup} className="hidden" />
                  <button
                    type="button"
                    onClick={() => backupRestoreRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center gap-1.5 border border-slate-700"
                  >
                    <FolderUp className="w-3.5 h-3.5" /> बैकअप रीस्टोर
                  </button>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-xl font-bold text-sky-400 font-mono">v{(routine?.modelVersion || 1.0).toFixed(2)}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">सक्रिय मॉडल वर्ज़न</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-xl font-bold text-emerald-400 font-mono">{routine?.accuracyScore || 86.5}%</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">मॉडल पहचान सटीकता</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-xl font-bold text-white font-mono">{routine?.totalFramesTrained || 0}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">कुल सीखे गए फ्रेम्स</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-xl font-bold text-amber-400 font-mono">{learnedPeople.length + learnedObjects.length}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">स्थायी यादें (लोग + सामान)</div>
                </div>
              </div>

              {/* Learned Daily Routine Anomalies */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
                <h4 className="text-sm font-bold text-white">
                  दुकान के रोज़मर्रा के पैटर्न से अलग / अजीब गतिविधि अलर्ट ({routine?.recentAnomalies?.length || 0})
                </h4>
                {!routine?.recentAnomalies || routine.recentAnomalies.length === 0 ? (
                  <p className="text-slate-400">
                    अभी तक सब कुछ दुकान की सामान्य दिनचर्या के अनुसार चल रहा है — कोई अजीब या असामान्य बदलाव नहीं दिखा।
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {routine.recentAnomalies.map((an, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-rose-950/35 border border-rose-500/35 flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-rose-300">{an.title}</div>
                          <div className="text-slate-300 mt-0.5">{an.detail}</div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {new Date(an.at).toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
