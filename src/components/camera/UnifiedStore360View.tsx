import React, { useState, useEffect, useRef } from 'react';
import {
  Compass, Play, Pause, Maximize2, Tag, Users,
  DoorOpen, Box, Camera, ShieldCheck, Radio, Sparkles
} from 'lucide-react';

interface CameraDevice {
  _id: string;
  name: string;
  channel?: number;
  ipAddress: string;
  locationType: string;
  status: string;
}

interface Props {
  cameras: CameraDevice[];
  gridSnapshots: Record<string, string>;
  pairingBlocks: any[];
  onSelectSingleCamera: (cameraId: string) => void;
  onOpenVisualPairingForChannel?: (channel: number) => void;
  todayStats?: {
    customers?: number;
    gallaOpenings?: number;
    audioClips?: number;
  };
}

// Logical spatial ordering from Shop Entrance (0 deg) -> Counter (72 deg) -> Galla (144 deg) -> Shelf (216 deg) -> Inner Shed (288 deg)
const SPATIAL_ORDER: Record<number, { order: number; angle: string; zoneTitle: string; badgeColor: string; roleDesc: string }> = {
  4: { order: 1, angle: '0° - 72°',   zoneTitle: '🚪 ज़ोन 1: मुख्य गेट व कैन एंट्री',   badgeColor: 'from-emerald-600 to-teal-700',  roleDesc: 'प्रवेश/निकासी व मिल्क कैन ट्रिपवायर' },
  1: { order: 2, angle: '72° - 144°', zoneTitle: '🥛 ज़ोन 2: दूध काउंटर व कांटा',      badgeColor: 'from-sky-600 to-indigo-700',    roleDesc: 'ग्राहक फुटफॉल, तौल कांटा व माइक' },
  2: { order: 3, angle: '144° - 216°',zoneTitle: '💵 ज़ोन 3: मुख्य गल्ला व बिलिंग',     badgeColor: 'from-rose-600 to-amber-700',    roleDesc: 'कैश दराज, नोट व POS बिल मिलान' },
  3: { order: 4, angle: '216° - 288°',zoneTitle: '🛒 ज़ोन 4: किराना व डेयरी फ्रिज रैक', badgeColor: 'from-blue-600 to-violet-700',   roleDesc: 'शेल्फ पिक काउंटर व स्टॉक निगरानी' },
  5: { order: 5, angle: '288° - 360°',zoneTitle: '🐄 ज़ोन 5: आंतरिक शेड व स्टोरेज बाड़ा',badgeColor: 'from-amber-600 to-orange-700', roleDesc: 'बल्क चिलर, टंकी व आंतरिक सुरक्षा' },
};

export const UnifiedStore360View: React.FC<Props> = ({
  cameras,
  gridSnapshots,
  pairingBlocks,
  onSelectSingleCamera,
  onOpenVisualPairingForChannel,
  todayStats,
}) => {
  const [panoMode, setPanoMode] = useState<'WIDE_STITCH' | 'INTERACTIVE_360'>('WIDE_STITCH');
  const [panAngle, setPanAngle] = useState<number>(0); // 0 to 360 degrees
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [showAiBlocks, setShowAiBlocks] = useState<boolean>(true);
  const [activeZoneChannel, setActiveZoneChannel] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartAngleRef = useRef(0);

  // Sort cameras in spatial 360 shop order
  const orderedCameras = [...cameras].sort((a, b) => {
    const oa = SPATIAL_ORDER[a.channel || 1]?.order ?? (a.channel || 99);
    const ob = SPATIAL_ORDER[b.channel || 1]?.order ?? (b.channel || 99);
    return oa - ob;
  });

  // Smooth 360 auto-rotation tour
  useEffect(() => {
    if (!autoRotate) return;
    const iv = setInterval(() => {
      setPanAngle((prev) => (prev + 1.5) % 360);
    }, 60);
    return () => clearInterval(iv);
  }, [autoRotate]);

  const handlePointerDown = (clientX: number) => {
    isDraggingRef.current = true;
    dragStartXRef.current = clientX;
    dragStartAngleRef.current = panAngle;
  };

  const handlePointerMove = (clientX: number) => {
    if (!isDraggingRef.current) return;
    const dx = dragStartXRef.current - clientX;
    const next = (dragStartAngleRef.current + dx * 0.35 + 360) % 360;
    setPanAngle(Math.round(next));
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  const totalPicksAcrossShop = pairingBlocks.reduce(
    (sum, b) => sum + (b.shelfConfig?.pickCount || b.totalPicks || 0),
    0
  );

  return (
    <div className="space-y-4">
      {/* Top 360 Control Header */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-950/70 via-dark-950 to-emerald-950/50 border border-indigo-500/30 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
            <Compass className={`w-5 h-5 ${autoRotate ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-black text-white">
                🌐 5-कैमरा 360° यूनिफाइड शॉप व्यू (One-Camera Stitched Panorama)
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                {orderedCameras.length} Cams Merged → 1 View
              </span>
            </div>
            <p className="text-[11px] text-dark-300">
              पाँचों कैमरों को जोड़कर पूरी दुकान का एक ही 360° पैनोरमा कैमरा और लाइव शॉप फ्लोर रडार
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className="flex items-center bg-dark-950 p-1 rounded-xl border border-dark-800">
            <button
              type="button"
              onClick={() => setPanoMode('WIDE_STITCH')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                panoMode === 'WIDE_STITCH' ? 'bg-indigo-600 text-white' : 'text-dark-400 hover:text-white'
              }`}
            >
              🖥️ 5-in-1 पैनोरमा
            </button>
            <button
              type="button"
              onClick={() => setPanoMode('INTERACTIVE_360')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                panoMode === 'INTERACTIVE_360' ? 'bg-indigo-600 text-white' : 'text-dark-400 hover:text-white'
              }`}
            >
              🔄 360° ड्रैग रोटेशन
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 transition ${
              autoRotate
                ? 'bg-emerald-600/25 border-emerald-500/50 text-emerald-300'
                : 'bg-dark-950 border-dark-800 text-dark-300 hover:text-white'
            }`}
          >
            {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{autoRotate ? '360° घूम रहा है' : 'ऑटो 360° टूर'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAiBlocks(!showAiBlocks)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 transition ${
              showAiBlocks
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-dark-950 border-dark-800 text-dark-400'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>AI ज़ोन {showAiBlocks ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: SEAMLESS 5-CAMERA STITCHED 360 PANORAMA VIEWPORT */}
      <div
        className="relative rounded-3xl overflow-hidden bg-black border-2 border-indigo-500/30 shadow-2xl select-none"
        onMouseDown={(e) => handlePointerDown(e.clientX)}
        onMouseMove={(e) => handlePointerMove(e.clientX)}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={(e) => e.touches[0] && handlePointerDown(e.touches[0].clientX)}
        onTouchMove={(e) => e.touches[0] && handlePointerMove(e.touches[0].clientX)}
        onTouchEnd={handlePointerUp}
      >
        {/* Top Compass Degree Ruler */}
        <div className="bg-dark-950/90 border-b border-white/10 px-4 py-1.5 flex items-center justify-between text-[10px] font-mono text-dark-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-white font-bold">UNIFIED 360° AI CAMERA</span>
            <span className="text-indigo-400">• कोण (Angle): {Math.round(panAngle)}° / 360°</span>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-[10px]">
            <span>0° गेट</span>
            <span>72° काउंटर</span>
            <span>144° गल्ला</span>
            <span>216° शेल्फ/फ्रिज</span>
            <span>288° आंतरिक बाड़ा</span>
          </div>
          <span className="text-emerald-400 font-bold">LIVE STITCHED</span>
        </div>

        {/* Stitched Panorama Canvas */}
        <div className="relative w-full overflow-hidden bg-dark-950" style={{ height: panoMode === 'INTERACTIVE_360' ? '330px' : '270px' }}>
          <div
            className="flex h-full transition-transform duration-150 ease-out"
            style={{
              width: panoMode === 'INTERACTIVE_360' ? '220%' : '100%',
              transform:
                panoMode === 'INTERACTIVE_360'
                  ? `translateX(-${((panAngle / 360) * 54).toFixed(2)}%)`
                  : autoRotate
                  ? `translateX(-${(Math.sin((panAngle * Math.PI) / 180) * 4).toFixed(2)}%)`
                  : 'translateX(0%)',
            }}
          >
            {orderedCameras.map((cam, idx) => {
              const ch = cam.channel || idx + 1;
              const meta = SPATIAL_ORDER[ch] || {
                order: idx + 1,
                angle: `${idx * 72}° - ${(idx + 1) * 72}°`,
                zoneTitle: `ज़ोन ${idx + 1}: ${cam.name}`,
                badgeColor: 'from-indigo-600 to-sky-700',
                roleDesc: cam.locationType,
              };
              const snap = gridSnapshots[cam._id];
              const camBlocks = pairingBlocks.filter((b) => Number(b.cameraChannel) === Number(ch));
              const isHighlighted = activeZoneChannel === ch;

              return (
                <div
                  key={cam._id}
                  onClick={() => setActiveZoneChannel(isHighlighted ? null : ch)}
                  className={`relative h-full flex-1 overflow-hidden cursor-pointer group ${
                    isHighlighted ? 'ring-2 ring-emerald-400 z-20' : ''
                  }`}
                >
                  {/* Camera Frame */}
                  {snap ? (
                    <img
                      src={snap}
                      alt={cam.name}
                      draggable={false}
                      className="w-full h-full object-cover brightness-105 contrast-105 group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-b from-dark-900 to-dark-950 flex flex-col items-center justify-center p-3 text-center">
                      <Camera className="w-7 h-7 text-dark-600 animate-pulse mb-1" />
                      <span className="text-[11px] font-bold text-dark-300">{cam.name}</span>
                      <span className="text-[9px] text-dark-500">Ch #{ch} सिंक हो रहा है...</span>
                    </div>
                  )}

                  {/* Optical Edge-Blending Gradient between adjacent cameras (makes 5 cameras look seamlessly stitched) */}
                  {idx > 0 && (
                    <div
                      className="absolute inset-y-0 left-0 w-7 pointer-events-none z-10"
                      style={{
                        background: 'linear-gradient(to right, rgba(9,13,22,0.55), rgba(9,13,22,0))',
                      }}
                    />
                  )}
                  {idx < orderedCameras.length - 1 && (
                    <div
                      className="absolute inset-y-0 right-0 w-7 pointer-events-none z-10"
                      style={{
                        background: 'linear-gradient(to left, rgba(9,13,22,0.55), rgba(9,13,22,0))',
                      }}
                    />
                  )}

                  {/* Top Angle & Zone Pill */}
                  <div className="absolute top-2.5 left-2 right-2 flex items-center justify-between pointer-events-none z-20">
                    <span className={`px-2 py-0.5 rounded-lg bg-gradient-to-r ${meta.badgeColor} text-[9px] font-extrabold text-white shadow-md truncate`}>
                      {meta.zoneTitle}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-indigo-300 border border-white/10">
                      {meta.angle}
                    </span>
                  </div>

                  {/* Camera 4 Gate Tripwire lines inside the 360 panorama */}
                  {ch === 4 && (
                    <>
                      <div className="absolute top-[38%] inset-x-0 border-t border-dashed border-emerald-400/90 pointer-events-none z-10">
                        <span className="bg-emerald-950/80 text-emerald-300 text-[8px] px-1 font-bold">▼ IN</span>
                      </div>
                      <div className="absolute top-[70%] inset-x-0 border-t border-dashed border-rose-500/90 pointer-events-none z-10">
                        <span className="bg-rose-950/80 text-rose-300 text-[8px] px-1 font-bold">▲ OUT</span>
                      </div>
                    </>
                  )}

                  {/* Active Color-Coded AI Visual Pairing Blocks Overlay on each segment */}
                  {showAiBlocks &&
                    camBlocks.map((b) => (
                      <div
                        key={b._id}
                        style={{
                          left: `${b.coordinates?.x || 15}%`,
                          top: `${b.coordinates?.y || 20}%`,
                          width: `${b.coordinates?.width || 40}%`,
                          height: `${b.coordinates?.height || 40}%`,
                          borderColor: b.color || '#10B981',
                          backgroundColor: `${b.color || '#10B981'}22`,
                        }}
                        className="absolute border-2 rounded-lg pointer-events-none z-15 flex flex-col justify-between p-1"
                      >
                        <span
                          className="text-[8px] font-extrabold text-white px-1 py-0.2 rounded truncate self-start shadow"
                          style={{ backgroundColor: b.color || '#10B981' }}
                        >
                          {b.name}
                        </span>
                        <span className="text-[8px] font-mono bg-black/80 text-white px-1 rounded self-end">
                          {b.blockCode}
                          {(b.shelfConfig?.pickCount || b.totalPicks) ? ` • ${b.shelfConfig?.pickCount || b.totalPicks}x` : ''}
                        </span>
                      </div>
                    ))}

                  {/* Bottom Bar with Quick Actions */}
                  <div className="absolute bottom-2 inset-x-2 flex items-center justify-between gap-1 z-20">
                    <span className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[9px] font-bold text-white border border-white/10 truncate">
                      Ch #{ch} • {camBlocks.length} AI ज़ोन
                    </span>
                    <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100">
                      {onOpenVisualPairingForChannel && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenVisualPairingForChannel(ch);
                          }}
                          className="px-1.5 py-0.5 rounded bg-indigo-600/90 hover:bg-indigo-500 text-white text-[9px] font-bold shadow"
                          title="इस कैमरे पर नया AI ब्लॉक बनाएँ"
                        >
                          +AI ज़ोन
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSingleCamera(cam._id);
                        }}
                        className="p-1 rounded bg-black/80 hover:bg-dark-800 text-white border border-white/15"
                        title="बड़ा करके देखें"
                      >
                        <Maximize2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 360 Degree Scrubber Bar */}
        <div className="bg-dark-950/95 border-t border-dark-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <span className="text-[10px] font-bold text-indigo-300 whitespace-nowrap">360° रोटेशन स्लाइडर:</span>
            <input
              type="range"
              min={0}
              max={360}
              value={Math.round(panAngle)}
              onChange={(e) => {
                setPanoMode('INTERACTIVE_360');
                setPanAngle(Number(e.target.value));
              }}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <span className="text-[10px] font-mono text-white w-10 text-right">{Math.round(panAngle)}°</span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-dark-300">
            <span className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-indigo-400" />
              कुल AI ज़ोन: <strong className="text-white">{pairingBlocks.length}</strong>
            </span>
            <span className="flex items-center gap-1">
              <Box className="w-3.5 h-3.5 text-sky-400" />
              कुल एसेट गतिविधि/पिक्स: <strong className="text-sky-400">{totalPicksAcrossShop}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 2: UNIFIED 2D/3D SHOP FLOOR RADAR & CUSTOMER FLOW MAP */}
      <div className="p-4 rounded-3xl bg-dark-950/90 border border-dark-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <h5 className="text-xs sm:text-sm font-black text-white">
              🗺️ लाइव शॉप फ्लोर मैप व ग्राहक फ्लो रडार (5-Zone Connected Store Map)
            </h5>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            {todayStats?.customers !== undefined && (
              <span className="px-2.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300 font-bold flex items-center gap-1">
                <Users className="w-3 h-3" /> आज ग्राहक: {todayStats.customers}
              </span>
            )}
            {todayStats?.gallaOpenings !== undefined && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold flex items-center gap-1">
                <DoorOpen className="w-3 h-3" /> गल्ला खुला: {todayStats.gallaOpenings} बार
              </span>
            )}
          </div>
        </div>

        {/* Connected 5-Zone Store Layout Blueprint */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 relative">
          {orderedCameras.map((cam, idx) => {
            const ch = cam.channel || idx + 1;
            const meta = SPATIAL_ORDER[ch] || {
              order: idx + 1,
              angle: `${idx * 72}°`,
              zoneTitle: cam.name,
              badgeColor: 'from-indigo-600 to-sky-700',
              roleDesc: cam.locationType,
            };
            const camBlocks = pairingBlocks.filter((b) => Number(b.cameraChannel) === Number(ch));
            const zonePicks = camBlocks.reduce((s, b) => s + (b.shelfConfig?.pickCount || b.totalPicks || 0), 0);

            return (
              <div
                key={`map-${cam._id}`}
                className="bg-dark-900/90 border border-dark-800 hover:border-indigo-500/50 rounded-2xl p-3 flex flex-col justify-between space-y-2.5 transition relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <span className="text-[10px] font-mono text-indigo-400 font-bold block">
                      STEP {idx + 1} • CH #{ch}
                    </span>
                    <h6 className="text-xs font-extrabold text-white leading-snug">{cam.name}</h6>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0 mt-1" title="AI Active" />
                </div>

                <p className="text-[10px] text-dark-400 leading-relaxed">{meta.roleDesc}</p>

                {/* Active AI Blocks pills inside this zone */}
                <div className="space-y-1">
                  {camBlocks.length === 0 ? (
                    <span className="text-[10px] text-dark-500 italic block">कोई AI ब्लॉक नहीं</span>
                  ) : (
                    camBlocks.slice(0, 3).map((b) => (
                      <div
                        key={b._id}
                        className="flex items-center justify-between text-[10px] px-2 py-1 rounded-lg bg-dark-950 border border-dark-800"
                      >
                        <span className="flex items-center gap-1.5 truncate text-white font-semibold">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color || '#10B981' }} />
                          <span className="truncate">{b.name}</span>
                        </span>
                        <span className="font-mono text-[9px] text-sky-300 ml-1 shrink-0">
                          {b.shelfConfig?.pickCount || b.totalPicks || 0}x
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-1 border-t border-dark-800 flex items-center justify-between text-[10px]">
                  <span className="text-dark-400">
                    गतिविधि: <strong className="text-emerald-400">{zonePicks}</strong>
                  </span>
                  {onOpenVisualPairingForChannel && (
                    <button
                      type="button"
                      onClick={() => onOpenVisualPairingForChannel(ch)}
                      className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-0.5"
                    >
                      <Sparkles className="w-3 h-3" /> +AI ब्लॉक
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[10px] text-dark-400 pt-1">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>ग्राहक फ्लो ट्रैक: मुख्य गेट (Ch#4) ➔ दूध काउंटर (Ch#1) ➔ कैश गल्ला (Ch#2) ➔ किराना/फ्रिज (Ch#3) ➔ आंतरिक बाड़ा (Ch#5)</span>
          </span>
          <span className="text-indigo-400 font-semibold hidden sm:inline">किसी भी ज़ोन पर क्लिक करके नया AI ब्लॉक जोड़ें</span>
        </div>
      </div>
    </div>
  );
};
