import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Compass, Play, Pause, Maximize2, Minimize2, Tag, Users,
  DoorOpen, Box, Camera, ShieldCheck, Radio, Sparkles, Eye,
  Layers, RotateCcw, Sun, Cpu, Mic, AlertTriangle, Crosshair
} from 'lucide-react';
import { mobileYolo, type DetectedObject } from '../../services/mobileYoloService';
import { aiBrainService } from '../../services/aiBrainService';

interface CameraDevice {
  _id: string;
  name: string;
  channel?: number;
  ipAddress: string;
  locationType: string;
  status: string;
}

export interface LiveTelemetryProp {
  updatedAt?: number;
  channels?: Record<
    number,
    {
      channel: number;
      detections: Array<{
        trackId: string;
        className: string;
        role: 'CUSTOMER' | 'STAFF' | 'PASSERBY' | 'BIKE' | 'CAR' | 'CAN';
        customLabel?: string;
        confidence: number;
        box: { x: number; y: number; width: number; height: number };
        dwellSec: number;
        cropDataUrl?: string;
      }>;
      activeZones?: string[];
    }
  >;
  audio?: {
    rms: number;
    speaking: boolean;
    lastTranscript?: {
      text: string;
      amounts?: number[];
      at: string;
    } | null;
  };
  galla?: {
    state: 'OPEN' | 'CLOSED';
    lastOpenedAt?: string | null;
    lastBilled?: boolean;
  };
  unattendedAlert?: {
    active: boolean;
    waitSec: number;
    customerCount: number;
    message: string;
  } | null;
}

interface Props {
  cameras: CameraDevice[];
  gridSnapshots: Record<string, string>;
  pairingBlocks: any[];
  onSelectSingleCamera: (cameraId: string) => void;
  onOpenVisualPairingForChannel?: (channel: number) => void;
  liveTelemetry?: LiveTelemetryProp | null;
  localSpeechQuote?: string;
  localGallaPulseAt?: number;
  todayStats?: {
    customers?: number;
    gallaOpenings?: number;
    audioClips?: number;
  };
}

interface Tracked3DEntity {
  id: string;
  kind: 'CUSTOMER' | 'STAFF' | 'BIKE' | 'CAR' | 'PASSERBY' | 'DAIRY_ASSET';
  label: string;
  channel: number;
  confidence: number;
  dwellSec: number;
  targetX: number;
  targetZ: number;
  curX: number;
  curZ: number;
  trail: Array<[number, number]>;
  color: number;
  firstSeen: number;
  lastSeen: number;
  cropDataUrl?: string;
  source: 'EDGE_LIVE' | 'DEVICE_YOLO';
}

const CAM_3D_ANCHORS: Record<
  number,
  {
    pos: [number, number, number];
    lookAt: [number, number, number];
    screenPos: [number, number, number];
    screenRotY: number;
    zoneBounds: { xCenter: number; zCenter: number; width: number; depth: number };
    title: string;
    color: number;
    hex: string;
  }
> = {
  1: {
    pos: [0.2, 3.85, 1.4],
    lookAt: [0.0, 0.85, 4.1],
    screenPos: [-3.95, 2.45, 3.15],
    screenRotY: 0.24,
    zoneBounds: { xCenter: 0.0, zCenter: 3.55, width: 6.2, depth: 2.8 },
    title: 'Ch#1: मुख्य काउंटर व दूध पतीला',
    color: 0x38bdf8,
    hex: '#38bdf8',
  },
  2: {
    pos: [-2.1, 3.85, -0.2],
    lookAt: [1.4, 0.6, 0.6],
    screenPos: [4.25, 2.45, 1.55],
    screenRotY: -0.38,
    zoneBounds: { xCenter: 1.55, zCenter: 0.85, width: 4.8, depth: 3.2 },
    title: 'Ch#2: गल्ला दराज व डीप फ्रीजर',
    color: 0xf43f5e,
    hex: '#f43f5e',
  },
  3: {
    pos: [2.4, 3.85, -2.2],
    lookAt: [0.0, 0.75, -3.6],
    screenPos: [0.0, 2.55, -4.75],
    screenRotY: 0,
    zoneBounds: { xCenter: 0.0, zCenter: -3.15, width: 6.8, depth: 2.6 },
    title: 'Ch#3: तौल कांटा व डेयरी रैक',
    color: 0xa855f7,
    hex: '#a855f7',
  },
  4: {
    pos: [4.0, 4.1, 4.5],
    lookAt: [5.4, 0.5, 7.8],
    screenPos: [6.35, 2.45, 5.1],
    screenRotY: -0.35,
    zoneBounds: { xCenter: 4.2, zCenter: 6.4, width: 5.8, depth: 3.8 },
    title: 'Ch#4: मुख्य गेट व कैन ट्रिपवायर',
    color: 0x10b981,
    hex: '#10b981',
  },
  5: {
    pos: [-4.0, 4.1, 4.5],
    lookAt: [-5.4, 0.5, 7.8],
    screenPos: [-6.35, 2.45, 5.1],
    screenRotY: 0.35,
    zoneBounds: { xCenter: -4.2, zCenter: 6.4, width: 5.8, depth: 3.8 },
    title: 'Ch#5: बाहरी सड़क व वाहन लेन',
    color: 0xf59e0b,
    hex: '#f59e0b',
  },
};

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child: any) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m: any) => {
        if (m.map) m.map.dispose();
        m.dispose?.();
      });
    }
  });
}

/** Crisp Tesla FSD Matte Floor Grid Texture (Zero blurry camera smear) */
function createFsdFloorTexture(mode: 'FSD_AUTOPILOT' | 'STUDIO_TWIN' | 'OCCUPANCY_VOXEL'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  if (mode === 'STUDIO_TWIN') {
    ctx.fillStyle = '#dce4ee';
    ctx.fillRect(0, 0, 512, 512);
    const step = 64;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#e7eef6' : '#d5dfeb';
        ctx.fillRect(x * step + 1, y * step + 1, step - 2, step - 2);
      }
    }
  } else {
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1.5;
    const step = 64;
    for (let i = 0; i <= 512; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
    // Subtle corner crosshairs like Tesla Autopilot ground calibration
    ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
    for (let y = 0; y <= 512; y += 128) {
      for (let x = 0; x <= 512; x += 128) {
        ctx.fillRect(x - 2, y - 0.5, 5, 1.5);
        ctx.fillRect(x - 0.5, y - 2, 1.5, 5);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Crisp Tesla-Style Street Lane Texture */
function createFsdRoadTexture(isStudio: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = isStudio ? '#1f2937' : '#060a12';
  ctx.fillRect(0, 0, 1024, 256);

  // Clean Tesla lane boundary lines
  ctx.fillStyle = isStudio ? '#94a3b8' : 'rgba(56, 189, 248, 0.55)';
  ctx.fillRect(0, 10, 1024, 4);
  ctx.fillRect(0, 242, 1024, 4);

  // Center Autopilot lane dashes
  ctx.fillStyle = isStudio ? '#facc15' : 'rgba(16, 185, 129, 0.65)';
  for (let x = 24; x < 1024; x += 84) {
    ctx.fillRect(x, 125, 46, 6);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createShopFasciaTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#090f1d';
  ctx.fillRect(0, 0, 1024, 160);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 1012, 148);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 42px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('श्री कृष्णा डेयरी एवं मिल्क पार्लर', 512, 74);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '600 24px monospace';
  ctx.fillText('TESLA FSD SPATIAL TWIN • REAL-TIME MULTI-CAMERA TRACKING', 512, 122);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Sleek, Compact Tesla FSD Overhead Pill Tag (Never obscures the 3D scene) */
function buildCompactFsdTagSprite(ent: Tracked3DEntity, cutImg?: HTMLImageElement): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 96;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = 'rgba(7, 12, 22, 0.90)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 312, 88, 20);
  ctx.fill();

  const hexCol = '#' + ent.color.toString(16).padStart(6, '0');
  ctx.strokeStyle = hexCol;
  ctx.lineWidth = 3;
  ctx.stroke();

  let tx = 18;
  if (cutImg) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(12, 12, 64, 72, 12);
    ctx.clip();
    ctx.drawImage(cutImg, 12, 12, 64, 72);
    ctx.restore();
    tx = 88;
  }

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillText(ent.label.slice(0, 20), tx, 38);

  const mins = Math.floor(ent.dwellSec / 60);
  const secs = ent.dwellSec % 60;
  const dwellTxt = ent.dwellSec > 0 ? `${mins}:${String(secs).padStart(2, '0')}s` : 'LIVE';

  ctx.fillStyle = hexCol;
  ctx.font = 'bold 17px monospace';
  ctx.fillText(`Ch#${ent.channel} • ${dwellTxt} • ${ent.confidence}%`, tx, 70);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(1.42, 0.43, 1);
  sp.position.set(0, ent.kind === 'CAR' ? 1.55 : ent.kind === 'BIKE' ? 1.35 : 2.02, 0);
  sp.name = 'overheadCard';
  return sp;
}

/** Floating 3D Speech Bubble above Counter when customer speaks */
function build3DSpeechBubbleSprite(quoteText: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 560;
  c.height = 112;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = 'rgba(6, 78, 59, 0.92)';
  ctx.beginPath();
  ctx.roundRect(6, 6, 548, 86, 22);
  ctx.fill();

  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Speech pointer triangle
  ctx.beginPath();
  ctx.moveTo(265, 92);
  ctx.lineTo(280, 110);
  ctx.lineTo(295, 92);
  ctx.closePath();
  ctx.fillStyle = '#34d399';
  ctx.fill();

  ctx.fillStyle = '#a7f3d0';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText('🎙️ लाइव काउंटर ऑडियो (सुना गया):', 24, 34);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px system-ui, sans-serif';
  const clipped = quoteText.length > 36 ? quoteText.slice(0, 35) + '…' : quoteText;
  ctx.fillText(`“${clipped}”`, 24, 70);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(3.2, 0.64, 1);
  sp.position.set(0.2, 2.65, 3.45);
  sp.name = 'liveSpeechSprite';
  return sp;
}

/** True 3D Occupancy Voxel Cloud Builder (for OCCUPANCY_VOXEL mode) */
function createOccupancyVoxelPoints(
  img: HTMLImageElement,
  cfg: (typeof CAM_3D_ANCHORS)[number]
): THREE.Points {
  const cols = 52;
  const rows = 36;
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, cols, rows);
  const data = ctx.getImageData(0, 0, cols, rows).data;

  const numPts = cols * rows;
  const positions = new Float32Array(numPts * 3);
  const colors = new Float32Array(numPts * 3);
  const { xCenter, zCenter, width, depth } = cfg.zoneBounds;

  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const idx = (r * cols + col) * 4;
      const cr = data[idx] / 255;
      const cg = data[idx + 1] / 255;
      const cb = data[idx + 2] / 255;
      const lum = cr * 0.299 + cg * 0.587 + cb * 0.114;

      const u = col / (cols - 1) - 0.5;
      const v = r / (rows - 1) - 0.5;

      positions[k * 3] = xCenter + u * width;
      positions[k * 3 + 1] = 0.08 + lum * 1.55;
      positions[k * 3 + 2] = zCenter + v * depth;

      // Tesla occupancy cyan-to-emerald elevation tint blended with real RGB
      colors[k * 3] = Math.min(1, cr * 0.7 + 0.12);
      colors[k * 3 + 1] = Math.min(1, cg * 0.75 + lum * 0.35);
      colors[k * 3 + 2] = Math.min(1, cb * 0.8 + 0.25);
      k++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.13,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
  });
  return new THREE.Points(geo, mat);
}

/** Calibrated 2D Camera Box -> 3D Shop World Coordinates */
function mapBoxAndRoleTo3DWorld(
  box: { x: number; y: number; width: number; height: number },
  channel: number,
  explicitRole?: string,
  className?: string,
  confidence = 85
): {
  x: number;
  z: number;
  kind: Tracked3DEntity['kind'];
  label: string;
  color: number;
} {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const ny2 = box.y + box.height;

  if (explicitRole === 'CAN') {
    const anchor = CAM_3D_ANCHORS[channel] || CAM_3D_ANCHORS[1];
    const zb = anchor.zoneBounds;
    return {
      x: zb.xCenter + (cx - 0.5) * zb.width * 0.7,
      z: zb.zCenter + (cy - 0.5) * zb.depth * 0.7,
      kind: 'DAIRY_ASSET',
      label: className || 'सीखा गया डेयरी सामान',
      color: 0x14b8a6,
    };
  }

  if (explicitRole === 'BIKE' || className === 'motorcycle' || className === 'bicycle') {
    const sideOffset = channel === 5 ? -4.8 : channel === 4 ? 4.4 : 0;
    return {
      x: sideOffset + (cx - 0.5) * 6.8,
      z: 7.1 + (1 - cy) * 2.8,
      kind: 'BIKE',
      label: `दोपहिया (${confidence}%)`,
      color: 0xf59e0b,
    };
  }

  if (explicitRole === 'CAR' || className === 'car' || className === 'truck' || className === 'bus') {
    const sideOffset = channel === 5 ? -5.2 : 4.4;
    return {
      x: sideOffset + (cx - 0.5) * 7.5,
      z: 8.6 + (1 - cy) * 2.2,
      kind: 'CAR',
      label: `वाहन (${confidence}%)`,
      color: 0x38bdf8,
    };
  }

  if (channel === 1) {
    const role =
      explicitRole ||
      (cy > 0.62
        ? 'STAFF'
        : ny2 < 0.32 || box.height < 0.18
        ? 'PASSERBY'
        : cx >= 0.14 && cx <= 0.78 && ny2 >= 0.32 && ny2 <= 0.78
        ? 'CUSTOMER'
        : cy > 0.46
        ? 'STAFF'
        : 'PASSERBY');

    if (role === 'STAFF') {
      return {
        x: 0.4 + (cx - 0.5) * 4.2,
        z: 1.85 + (cy - 0.5) * 1.3,
        kind: 'STAFF',
        label: 'काउंटर स्टाफ',
        color: 0x6366f1,
      };
    }
    if (role === 'PASSERBY') {
      return {
        x: (cx - 0.5) * 7.5,
        z: 6.7 + (0.4 - Math.min(0.4, ny2)) * 3.5,
        kind: 'PASSERBY',
        label: 'सड़क राहगीर',
        color: 0x94a3b8,
      };
    }
    return {
      x: (cx - 0.5) * 4.6,
      z: 4.25 + (0.52 - ny2) * 1.4,
      kind: 'CUSTOMER',
      label: 'ग्राहक @ काउंटर',
      color: 0x10b981,
    };
  }

  if (channel === 2) {
    return {
      x: -0.6 + cx * 4.2,
      z: -0.8 + cy * 2.8,
      kind: 'STAFF',
      label: 'स्टाफ @ गल्ला/फ्रीजर',
      color: 0xf43f5e,
    };
  }

  if (channel === 3) {
    return {
      x: -2.4 + cx * 4.8,
      z: -3.6 + cy * 2.2,
      kind: 'STAFF',
      label: 'स्टाफ @ रैक/कांटा',
      color: 0xa855f7,
    };
  }

  if (channel === 4) {
    const isEntering = explicitRole === 'CUSTOMER' || ny2 > 0.48;
    return {
      x: 2.8 + (cx - 0.5) * 5.2,
      z: isEntering ? 5.2 + (1 - cy) * 1.8 : 7.0 + (1 - cy) * 2.5,
      kind: isEntering ? 'CUSTOMER' : 'PASSERBY',
      label: isEntering ? 'गेट प्रवेश ग्राहक' : 'पूर्वी राहगीर',
      color: isEntering ? 0x10b981 : 0x94a3b8,
    };
  }

  return {
    x: -3.8 + (cx - 0.5) * 5.4,
    z: 6.6 + (1 - cy) * 2.8,
    kind: 'PASSERBY',
    label: 'पश्चिमी सड़क',
    color: 0xf59e0b,
  };
}

function cropDetectionToDataUrl(img: HTMLImageElement, det: DetectedObject): string | undefined {
  try {
    const c = document.createElement('canvas');
    c.width = 80;
    c.height = 104;
    const ctx = c.getContext('2d');
    if (!ctx) return undefined;
    const sx = Math.max(0, det.box.x * img.naturalWidth);
    const sy = Math.max(0, det.box.y * img.naturalHeight);
    const sw = Math.max(16, Math.min(img.naturalWidth - sx, det.box.width * img.naturalWidth));
    const sh = Math.max(16, Math.min(img.naturalHeight - sy, det.box.height * img.naturalHeight));
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 80, 104);
    return c.toDataURL('image/jpeg', 0.78);
  } catch {
    return undefined;
  }
}

export const UnifiedStore360View: React.FC<Props> = ({
  cameras,
  gridSnapshots,
  pairingBlocks,
  onSelectSingleCamera,
  onOpenVisualPairingForChannel,
  liveTelemetry,
  localSpeechQuote,
  localGallaPulseAt,
  todayStats,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Default to clean, authentic Tesla FSD Dark Spatial Autopilot Mode!
  const [visualStyle, setVisualStyle] = useState<'FSD_AUTOPILOT' | 'STUDIO_TWIN' | 'OCCUPANCY_VOXEL'>('FSD_AUTOPILOT');
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [show3DVideoWalls, setShow3DVideoWalls] = useState<boolean>(true);
  const [showLaserCones, setShowLaserCones] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [selectedZoneCh, setSelectedZoneCh] = useState<number>(1);
  const [activePreset, setActivePreset] = useState<'TESLA_ISO' | 'DRONE_TOP' | 'COUNTER' | 'GALLA' | 'STREET'>('TESLA_ISO');
  const [liveEntities, setLiveEntities] = useState<Tracked3DEntity[]>([]);
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null);
  const [yoloScanChannel, setYoloScanChannel] = useState<number>(1);

  // Smooth damped camera orbit state (current vs desired target for silky Tesla FSD camera glides)
  const orbitCurRef = useRef({
    theta: 0.22,
    phi: 0.66,
    radius: 14.2,
    targetX: 0,
    targetY: 0.65,
    targetZ: 1.35,
  });
  const orbitGoalRef = useRef({
    theta: 0.22,
    phi: 0.66,
    radius: 14.2,
    targetX: 0,
    targetY: 0.65,
    targetZ: 1.35,
  });
  const dragInteractionRef = useRef({
    isDragging: false,
    isPanning: false,
    lastX: 0,
    lastY: 0,
  });

  // Zero fake entities! Starts empty and reflects ONLY genuine live camera detections
  const entitiesRef = useRef<Tracked3DEntity[]>([]);
  const gallaAnimRef = useRef<{ openRatio: number; targetOpen: number; billed: boolean; pulseClock: number }>({
    openRatio: 0,
    targetOpen: 0,
    billed: true,
    pulseClock: 0,
  });

  const videoTexturesRef = useRef<Record<number, THREE.Texture>>({});
  const videoMeshesRef = useRef<Record<number, THREE.Mesh>>({});
  const pointCloudGroupRef = useRef<THREE.Group | null>(null);
  const coneMeshesRef = useRef<Record<number, THREE.Mesh>>({});
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const blocksGroupRef = useRef<THREE.Group | null>(null);
  const speechGroupRef = useRef<THREE.Group | null>(null);

  const applyCameraPreset = useCallback((preset: 'TESLA_ISO' | 'DRONE_TOP' | 'COUNTER' | 'GALLA' | 'STREET') => {
    setActivePreset(preset);
    setFocusedEntityId(null);
    const g = orbitGoalRef.current;
    if (preset === 'DRONE_TOP') {
      g.theta = 0;
      g.phi = 0.20;
      g.radius = 16.5;
      g.targetX = 0;
      g.targetZ = 1.0;
    } else if (preset === 'TESLA_ISO') {
      g.theta = 0.22;
      g.phi = 0.66;
      g.radius = 14.2;
      g.targetX = 0;
      g.targetZ = 1.35;
    } else if (preset === 'COUNTER') {
      g.theta = 0.04;
      g.phi = 0.78;
      g.radius = 8.4;
      g.targetX = 0.1;
      g.targetZ = 3.1;
    } else if (preset === 'GALLA') {
      g.theta = -0.52;
      g.phi = 0.72;
      g.radius = 8.8;
      g.targetX = 1.8;
      g.targetZ = 1.1;
    } else if (preset === 'STREET') {
      g.theta = -0.28;
      g.phi = 0.72;
      g.radius = 15.8;
      g.targetX = 0;
      g.targetZ = 4.6;
    }
  }, []);

  const focusOnEntity = useCallback((ent: Tracked3DEntity) => {
    setFocusedEntityId(ent.id);
    setAutoRotate(false);
    const g = orbitGoalRef.current;
    g.targetX = ent.curX;
    g.targetZ = ent.curZ;
    g.radius = 7.5;
    g.phi = 0.74;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // 1. Primary Source: Instant Python Edge AI Live Telemetry -> 3D Tracked Entities
  const edgeTelemetryFresh = Boolean(liveTelemetry?.updatedAt && Date.now() - liveTelemetry.updatedAt < 10000);

  useEffect(() => {
    if (!liveTelemetry?.channels || !edgeTelemetryFresh) return;
    const now = Date.now();
    const nextList: Tracked3DEntity[] = [];

    Object.entries(liveTelemetry.channels).forEach(([chStr, chData]) => {
      const ch = Number(chStr) || 1;
      (chData?.detections || []).forEach((d) => {
        const p3 = mapBoxAndRoleTo3DWorld(d.box, ch, d.role, d.className, d.confidence);
        const prev = entitiesRef.current.find((e) => e.id === d.trackId);
        const curX = prev ? prev.curX : p3.x;
        const curZ = prev ? prev.curZ : p3.z;
        const trail: Array<[number, number]> = prev ? [...prev.trail] : [[curX, curZ]];
        const lastPt = trail[trail.length - 1];
        if (!lastPt || Math.hypot(p3.x - lastPt[0], p3.z - lastPt[1]) > 0.14) {
          trail.push([p3.x, p3.z]);
          if (trail.length > 26) trail.shift();
        }
        nextList.push({
          id: d.trackId,
          kind: p3.kind,
          label: d.customLabel || p3.label,
          channel: ch,
          confidence: d.confidence,
          dwellSec: d.dwellSec || 0,
          targetX: p3.x,
          targetZ: p3.z,
          curX,
          curZ,
          trail,
          color: p3.color,
          firstSeen: prev ? prev.firstSeen : now,
          lastSeen: now,
          cropDataUrl: d.cropDataUrl || prev?.cropDataUrl,
          source: 'EDGE_LIVE',
        });
      });
    });

    // Keep recently lost tracks for 3.2s grace period so 1-frame occlusions don't pop, then clear cleanly to []!
    const graceEntities = entitiesRef.current.filter(
      (old) => !nextList.some((n) => n.id === old.id) && now - old.lastSeen < 3200
    );
    const merged = [...nextList, ...graceEntities];
    entitiesRef.current = merged;
    setLiveEntities(merged);
  }, [liveTelemetry, edgeTelemetryFresh]);

  // 2. Sync Galla 3D Drawer Slide + Pulse Ring from Live Telemetry or Local Galla Motion
  useEffect(() => {
    const isOpenEdge = liveTelemetry?.galla?.state === 'OPEN';
    const recentLocalPulse = Boolean(localGallaPulseAt && Date.now() - localGallaPulseAt < 6500);
    const shouldOpen = isOpenEdge || recentLocalPulse;
    gallaAnimRef.current.targetOpen = shouldOpen ? 1 : 0;
    gallaAnimRef.current.billed = liveTelemetry?.galla?.lastBilled !== false;
    if (shouldOpen) {
      gallaAnimRef.current.pulseClock = 1.0;
    }
  }, [liveTelemetry?.galla?.state, liveTelemetry?.galla?.lastBilled, localGallaPulseAt]);

  // 3. Sync Floating 3D Speech Callout Sprite above Counter when customer speaks
  const activeSpeechText = (() => {
    const edgeTr = liveTelemetry?.audio?.lastTranscript;
    if (edgeTr?.text && edgeTr?.at) {
      const ageMs = Date.now() - new Date(edgeTr.at).getTime();
      if (ageMs >= 0 && ageMs < 18000) return edgeTr.text;
    }
    return localSpeechQuote || '';
  })();

  useEffect(() => {
    const grp = speechGroupRef.current;
    if (!grp) return;
    while (grp.children.length > 0) {
      const ch = grp.children[0];
      grp.remove(ch);
      disposeObject3D(ch);
    }
    if (activeSpeechText.trim()) {
      grp.add(build3DSpeechBubbleSprite(activeSpeechText.trim()));
    }
  }, [activeSpeechText]);

  // 4. Fallback On-Device Multi-Camera YOLOv8 Scanner (Runs when Edge AI Python is offline)
  useEffect(() => {
    if (edgeTelemetryFresh) return; // Python Edge AI is already streaming live tracks!
    let cancelled = false;
    let step = 0;
    let busy = false;

    const runFallbackDeviceScan = async () => {
      if (cancelled || busy) return;
      const now = Date.now();

      // Always prune expired entities > 4.5s old even if no snapshots exist (ensures empty shop = 0 avatars!)
      const pruned = entitiesRef.current.filter((e) => now - e.lastSeen < 4500);
      if (pruned.length !== entitiesRef.current.length) {
        entitiesRef.current = pruned;
        setLiveEntities([...pruned]);
      }

      if (cameras.length === 0) return;
      const cam = cameras[step % cameras.length];
      const ch = cam.channel || (step % cameras.length) + 1;
      step += 1;

      const snapUrl = gridSnapshots[cam._id];
      if (!snapUrl) return;

      busy = true;
      try {
        const ready = await mobileYolo.initModel();
        if (!ready || cancelled) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = snapUrl;
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
        });

        await aiBrainService.refreshBrain(false);
        const dets = await mobileYolo.detectFrame(img);
        if (cancelled) return;

        setYoloScanChannel(ch);
        const scanTs = Date.now();
        const relevant = dets.filter((d) =>
          ['person', 'motorcycle', 'bicycle', 'car', 'truck', 'bus'].includes(d.className)
        );

        const otherChannelEntities = entitiesRef.current.filter(
          (e) => e.channel !== ch && scanTs - e.lastSeen < 6500
        );

        const currentChPrev = entitiesRef.current.filter((e) => e.channel === ch);
        const usedPrevIds = new Set<string>();

        const mappedForCh: Tracked3DEntity[] = relevant.slice(0, 5).map((det, idx) => {
          const p3 = mapBoxAndRoleTo3DWorld(det.box, ch, undefined, det.className, det.confidence);
          // Match learned regular person identity from AI Brain if person!
          let brainPersonLabel: string | null = null;
          if (det.className === 'person') {
            const matchedP = aiBrainService.matchPersonInFrame(img, det.box);
            if (matchedP.person) {
              const vCnt = matchedP.person.visitCount || 1;
              const regBadge = matchedP.person.personRole === 'REGULAR_CUSTOMER' || vCnt >= 3 ? ' • रेगुलर' : '';
              brainPersonLabel = `👤 ${matchedP.person.label}${regBadge} (${vCnt}x)`;
            }
          }
          // Match closest previous track on same channel for smooth continuous trail & dwellSec!
          let bestPrev: Tracked3DEntity | undefined;
          let bestDist = 1.9;
          for (const cand of currentChPrev) {
            if (usedPrevIds.has(cand.id) || cand.kind !== p3.kind) continue;
            const d = Math.hypot(cand.targetX - p3.x, cand.targetZ - p3.z);
            if (d < bestDist) {
              bestDist = d;
              bestPrev = cand;
            }
          }
          if (bestPrev) usedPrevIds.add(bestPrev.id);

          const id = bestPrev ? bestPrev.id : `dev-ch${ch}-${p3.kind}-${scanTs.toString(36).slice(-3)}-${idx}`;
          const firstSeen = bestPrev ? bestPrev.firstSeen : scanTs;
          const dwellSec = Math.max(0, Math.round((scanTs - firstSeen) / 1000));
          const curX = bestPrev ? bestPrev.curX : p3.x;
          const curZ = bestPrev ? bestPrev.curZ : p3.z;
          const trail: Array<[number, number]> = bestPrev ? [...bestPrev.trail] : [[curX, curZ]];
          const lastPt = trail[trail.length - 1];
          if (!lastPt || Math.hypot(p3.x - lastPt[0], p3.z - lastPt[1]) > 0.14) {
            trail.push([p3.x, p3.z]);
            if (trail.length > 26) trail.shift();
          }

          return {
            id,
            kind: p3.kind,
            label: brainPersonLabel || p3.label,
            channel: ch,
            confidence: det.confidence,
            dwellSec,
            targetX: p3.x,
            targetZ: p3.z,
            curX,
            curZ,
            trail,
            color: p3.color,
            firstSeen,
            lastSeen: scanTs,
            cropDataUrl: cropDetectionToDataUrl(img, det) || bestPrev?.cropDataUrl,
            source: 'DEVICE_YOLO',
          };
        });

        // Also scan owner-taught custom dairy objects (50L Can, Patila, Crate, Scale) on this frame -> show in 3D!
        const learnedAssets = aiBrainService.scanLearnedObjectsOnFrame(img, ch);
        learnedAssets.forEach((la, lIdx) => {
          const p3 = mapBoxAndRoleTo3DWorld(la.box, ch, 'CAN', la.label, la.confidence);
          mappedForCh.push({
            id: `learned-asset-ch${ch}-${lIdx}`,
            kind: 'DAIRY_ASSET',
            label: `🧠 ${la.label}`,
            channel: ch,
            confidence: la.confidence,
            dwellSec: 0,
            targetX: p3.x,
            targetZ: p3.z,
            curX: p3.x,
            curZ: p3.z,
            trail: [],
            color: 0x14b8a6,
            firstSeen: scanTs,
            lastSeen: scanTs,
            source: 'DEVICE_YOLO',
          });
        });

        // Grace window (2.5s) for briefly missed detections on same channel, otherwise clear cleanly!
        const graceSameCh = currentChPrev.filter(
          (e) => !usedPrevIds.has(e.id) && scanTs - e.lastSeen < 2500
        );

        const merged = [...otherChannelEntities, ...mappedForCh, ...graceSameCh];
        entitiesRef.current = merged;
        setLiveEntities(merged);
      } catch {
        // Ignore transient image load error
      } finally {
        busy = false;
      }
    };

    const iv = setInterval(runFallbackDeviceScan, 1600);
    runFallbackDeviceScan();
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [cameras, gridSnapshots, edgeTelemetryFresh]);

  // 5. Load Live Camera Feeds onto Sleek Angled 3D Camera Frustum Screens + Optional Occupancy Voxels
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    cameras.forEach((cam, idx) => {
      const ch = cam.channel || idx + 1;
      const snapUrl = gridSnapshots[cam._id];
      if (!snapUrl) return;
      loader.load(
        snapUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;
          const old = videoTexturesRef.current[ch];
          videoTexturesRef.current[ch] = tex;

          const wallMesh = videoMeshesRef.current[ch];
          if (wallMesh && wallMesh.material instanceof THREE.MeshBasicMaterial) {
            wallMesh.material.map = tex;
            wallMesh.material.color.setHex(0xffffff);
            wallMesh.material.opacity = 0.96;
            wallMesh.material.needsUpdate = true;
          }

          if (visualStyle === 'OCCUPANCY_VOXEL' && pointCloudGroupRef.current && tex.image instanceof HTMLImageElement) {
            const pcGrp = pointCloudGroupRef.current;
            const prevPc = pcGrp.getObjectByName(`pc-ch-${ch}`);
            if (prevPc) {
              pcGrp.remove(prevPc);
              disposeObject3D(prevPc);
            }
            const cfg = CAM_3D_ANCHORS[ch];
            if (cfg) {
              const pts = createOccupancyVoxelPoints(tex.image, cfg);
              pts.name = `pc-ch-${ch}`;
              pcGrp.add(pts);
            }
          }

          if (old && old !== tex) old.dispose();
        },
        undefined,
        () => {}
      );
    });
  }, [gridSnapshots, cameras, visualStyle]);

  useEffect(() => {
    Object.entries(videoMeshesRef.current).forEach(([chStr, m]) => {
      const hasCam = cameras.some((c, idx) => (c.channel || idx + 1) === Number(chStr));
      m.visible = show3DVideoWalls && (hasCam || cameras.length === 0);
    });
    Object.entries(coneMeshesRef.current).forEach(([chStr, m]) => {
      const hasCam = cameras.some((c, idx) => (c.channel || idx + 1) === Number(chStr));
      m.visible = showLaserCones && (hasCam || cameras.length === 0);
    });
  }, [show3DVideoWalls, showLaserCones, cameras]);

  // 6. Calibrated 3D Zone Volumes (`VisualPairingBlocks` mapped by actual % coordinates!)
  useEffect(() => {
    const grp = blocksGroupRef.current;
    if (!grp) return;
    while (grp.children.length > 0) {
      const child = grp.children[0];
      grp.remove(child);
      disposeObject3D(child);
    }

    const activeZoneNamesSet = new Set<string>();
    if (liveTelemetry?.channels) {
      Object.values(liveTelemetry.channels).forEach((chObj) => {
        (chObj.activeZones || []).forEach((zn) => activeZoneNamesSet.add(zn));
      });
    }

    pairingBlocks.forEach((b) => {
      const ch = Number(b.cameraChannel) || 1;
      const anchor = CAM_3D_ANCHORS[ch] || CAM_3D_ANCHORS[1];
      const zb = anchor.zoneBounds;
      const coords = b.coordinates || { x: 20, y: 20, width: 40, height: 40 };

      const uCenter = (Number(coords.x || 20) + Number(coords.width || 35) / 2) / 100 - 0.5;
      const vCenter = (Number(coords.y || 20) + Number(coords.height || 35) / 2) / 100 - 0.5;
      const wScale = Math.max(0.85, (Number(coords.width || 35) / 100) * zb.width * 0.65);
      const dScale = Math.max(0.75, (Number(coords.height || 35) / 100) * zb.depth * 0.65);

      const bx = zb.xCenter + uCenter * zb.width * 0.72;
      const bz = zb.zCenter + vCenter * zb.depth * 0.72;
      const isActiveNow = activeZoneNamesSet.has(b.name) || activeZoneNamesSet.has(b.blockCode);
      const col = new THREE.Color(b.color || '#10b981');

      const boxGeo = new THREE.BoxGeometry(wScale, isActiveNow ? 1.35 : 0.95, dScale);
      const boxMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: isActiveNow ? 0.28 : 0.10,
        depthWrite: false,
      });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.position.set(bx, isActiveNow ? 0.68 : 0.48, bz);
      grp.add(boxMesh);

      const edges = new THREE.EdgesGeometry(boxGeo);
      const wire = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: isActiveNow ? 1.0 : 0.65 })
      );
      wire.position.copy(boxMesh.position);
      grp.add(wire);
    });
  }, [pairingBlocks, visualStyle, liveTelemetry]);

  // 7. Build & Animate Clean Tesla FSD WebGL 3D Scene (Zero Memory Leaks)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isStudio = visualStyle === 'STUDIO_TWIN';
    const isVoxel = visualStyle === 'OCCUPANCY_VOXEL';
    const width = container.clientWidth || 920;
    const height = isFullscreen ? Math.max(580, window.innerHeight - 160) : 480;

    const scene = new THREE.Scene();
    const bgHex = isStudio ? 0x0f172a : 0x060a13;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, isStudio ? 0.011 : 0.016);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 140);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isStudio ? 1.22 : 1.08;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Calibrated Multi-Point Lighting
    const hemiLight = new THREE.HemisphereLight(
      isStudio ? 0xffffff : 0xcbd5e1,
      isStudio ? 0x334155 : 0x090d16,
      isStudio ? 1.85 : 1.45
    );
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(isStudio ? 0xfffbeb : 0xe0f2fe, isStudio ? 2.2 : 1.75);
    dirLight.position.set(12, 22, 14);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const counterSpot = new THREE.PointLight(isStudio ? 0xfef3c7 : 0x38bdf8, isStudio ? 2.4 : 2.0, 16);
    counterSpot.position.set(0, 4.0, 3.1);
    scene.add(counterSpot);

    // 1. CRISP TESLA FSD METRIC FLOOR & STREET
    const floorTex = createFsdFloorTexture(visualStyle);
    const shopFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(12.4, 9.8),
      new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: isStudio ? 0.26 : 0.58,
        metalness: isStudio ? 0.12 : 0.25,
      })
    );
    shopFloor.rotation.x = -Math.PI / 2;
    shopFloor.position.set(0, 0.01, -0.35);
    shopFloor.receiveShadow = true;
    scene.add(shopFloor);

    // Subtle Tesla Radial Calibration Rings around Shop Center
    if (!isStudio) {
      for (const rad of [4.5, 8.5, 13.0]) {
        const ringGeo = new THREE.RingGeometry(rad - 0.025, rad, 72);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.11,
          side: THREE.DoubleSide,
        });
        const rMesh = new THREE.Mesh(ringGeo, ringMat);
        rMesh.rotation.x = -Math.PI / 2;
        rMesh.position.set(0, 0.008, 1.5);
        scene.add(rMesh);
      }
    }

    // Sidewalk Curb & Clean Tesla Lane Road
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(34, 0.12, 0.55),
      new THREE.MeshStandardMaterial({ color: isStudio ? 0x94a3b8 : 0x1e293b, roughness: 0.65 })
    );
    curb.position.set(0, 0.06, 4.75);
    scene.add(curb);

    const roadTex = createFsdRoadTexture(isStudio);
    const roadMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 6.2),
      new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 })
    );
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(0, 0.006, 8.15);
    scene.add(roadMesh);

    const pcGroup = new THREE.Group();
    scene.add(pcGroup);
    pointCloudGroupRef.current = pcGroup;
    if (isVoxel) {
      Object.entries(CAM_3D_ANCHORS).forEach(([chStr, cfg]) => {
        const ch = Number(chStr);
        const texImg = videoTexturesRef.current[ch]?.image;
        if (texImg instanceof HTMLImageElement) {
          const pts = createOccupancyVoxelPoints(texImg, cfg);
          pts.name = `pc-ch-${ch}`;
          pcGroup.add(pts);
        }
      });
    }

    // 2. CLEAN ARCHITECTURAL DAIRY SHOP FIXTURES
    const addBox = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
      edgeHex?: number
    ) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      if (edgeHex !== undefined) {
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: edgeHex, transparent: true, opacity: isStudio ? 0.5 : 0.75 })
        );
        line.position.copy(m.position);
        scene.add(line);
      }
      return m;
    };

    // Subtle Architectural Glass Perimeter Walls & Pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: isStudio ? 0xe2e8f0 : 0x162032, roughness: 0.35 });
    for (const [px, pz] of [[-6.0, 4.45], [6.0, 4.45], [-6.0, -5.1], [6.0, -5.1]]) {
      addBox(0.32, 3.4, 0.32, px, 1.7, pz, pillarMat, 0x38bdf8);
    }

    const fasciaTex = createShopFasciaTexture();
    const fascia = new THREE.Mesh(
      new THREE.BoxGeometry(8.2, 0.88, 0.16),
      new THREE.MeshBasicMaterial({ map: fasciaTex })
    );
    fascia.position.set(0, 3.55, 4.45);
    scene.add(fascia);

    const glassWallMat = new THREE.MeshStandardMaterial({
      color: isStudio ? 0x94a3b8 : 0x0f172a,
      transparent: true,
      opacity: isStudio ? 0.25 : 0.32,
      roughness: 0.25,
    });
    addBox(12.0, 3.1, 0.12, 0, 1.55, -5.1, glassWallMat, 0x334155);
    addBox(0.12, 3.1, 9.5, -6.0, 1.55, -0.32, glassWallMat, 0x334155);
    addBox(0.12, 3.1, 9.5, 6.0, 1.55, -0.32, glassWallMat, 0x334155);

    // Main Dairy Counter + Stainless Patila + Electronic Weighing Scale (Ch#1)
    const counterBodyMat = new THREE.MeshStandardMaterial({
      color: isStudio ? 0x1e293b : 0x0d1b2a,
      roughness: 0.3,
      metalness: 0.35,
    });
    const counterTopMat = new THREE.MeshStandardMaterial({
      color: isStudio ? 0x0f172a : 0x162a45,
      roughness: 0.15,
      metalness: 0.55,
    });
    addBox(6.2, 0.96, 1.12, 0, 0.48, 3.3, counterBodyMat, 0x38bdf8);
    addBox(6.36, 0.08, 1.22, 0, 1.0, 3.3, counterTopMat, 0x38bdf8);

    // Digital Weighing Scale
    const scaleMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8, roughness: 0.2 });
    addBox(0.46, 0.12, 0.42, -0.45, 1.10, 3.32, scaleMat, 0x10b981);

    // Stainless Steel Milk Patila
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.92, roughness: 0.12 });
    const patila = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.43, 0.58, 32), steelMat);
    patila.position.set(0.55, 1.33, 3.3);
    patila.castShadow = true;
    scene.add(patila);

    const milkTop = new THREE.Mesh(
      new THREE.CircleGeometry(0.43, 28),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc })
    );
    milkTop.rotation.x = -Math.PI / 2;
    milkTop.position.set(0.55, 1.625, 3.3);
    scene.add(milkTop);

    // Milk Crate Trays on Left of Counter
    const crateMat = new THREE.MeshStandardMaterial({ color: isStudio ? 0xdc2626 : 0x1e3a8a, roughness: 0.4 });
    for (const tx of [-1.35, -2.25]) {
      addBox(0.76, 0.22, 0.66, tx, 1.15, 3.3, crateMat, 0x38bdf8);
    }

    // POS Terminal / Laptop on Counter Right
    const posMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.2 });
    addBox(0.44, 0.04, 0.32, 1.85, 1.06, 3.12, posMat, 0x38bdf8);
    const posScreen = addBox(0.44, 0.30, 0.03, 1.85, 1.22, 3.26, posMat, 0x10b981);
    posScreen.rotation.x = -0.18;

    // Animated Cash Galla Desk + Sliding Cash Drawer + Shockwave Ring (Ch#2)
    const gallaDeskMat = new THREE.MeshStandardMaterial({
      color: isStudio ? 0x78350f : 0x1e1b4b,
      roughness: 0.35,
    });
    addBox(1.5, 0.98, 1.1, 2.35, 0.49, 1.85, gallaDeskMat, 0xf43f5e);

    const gallaDrawerGroup = new THREE.Group();
    gallaDrawerGroup.position.set(2.35, 0.78, 1.85);
    const drawerBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.18, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.25 })
    );
    gallaDrawerGroup.add(drawerBox);
    const drawerEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(drawerBox.geometry),
      new THREE.LineBasicMaterial({ color: 0x10b981 })
    );
    gallaDrawerGroup.add(drawerEdges);
    scene.add(gallaDrawerGroup);

    const gallaPulseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.95, 36),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0 })
    );
    gallaPulseRing.rotation.x = -Math.PI / 2;
    gallaPulseRing.position.set(2.35, 0.05, 1.85);
    scene.add(gallaPulseRing);

    // Sliding Glass-Top Deep Freezers (Ch#2 / Ch#3)
    const freezerMat = new THREE.MeshStandardMaterial({
      color: isStudio ? 0xf8fafc : 0x111c2d,
      roughness: 0.22,
      metalness: 0.2,
    });
    const glassLid = new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.42,
      roughness: 0.08,
      metalness: 0.65,
    });
    for (const fx of [-0.9, 1.55]) {
      addBox(2.05, 0.92, 1.12, fx, 0.46, -1.25, freezerMat, 0x38bdf8);
      addBox(1.92, 0.04, 1.0, fx, 0.94, -1.25, glassLid);
    }

    // 50L Stainless Steel Milk Cans near Gate/Side
    for (const [cx, cz] of [[3.85, 0.35], [4.45, 0.35], [3.85, -0.25], [4.45, -0.25]]) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.76, 22), steelMat);
      can.position.set(cx, 0.38, cz);
      can.castShadow = true;
      scene.add(can);
    }

    // Back Dairy & Kirana Storage Rack (Ch#3)
    const rackMat = new THREE.MeshStandardMaterial({ color: isStudio ? 0x334155 : 0x0f172a, metalness: 0.5 });
    addBox(7.2, 2.25, 0.78, 0.0, 1.12, -4.3, rackMat, 0xa855f7);

    // Gate Tripwire Laser Line on Floor (Ch#4)
    const gateLineGeo = new THREE.PlaneGeometry(3.8, 0.08);
    const gateLine = new THREE.Mesh(
      gateLineGeo,
      new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    gateLine.rotation.x = -Math.PI / 2;
    gateLine.position.set(3.6, 0.025, 4.55);
    scene.add(gateLine);

    // 3. SLEEK FLOATING CAMERA FRUSTUM MONITORS (Angled cleanly at perimeter so counter is 100% unobstructed!)
    videoMeshesRef.current = {};
    coneMeshesRef.current = {};

    Object.entries(CAM_3D_ANCHORS).forEach(([chStr, cfg]) => {
      const ch = Number(chStr);
      const hasCam = cameras.some((c, idx) => (c.channel || idx + 1) === ch);
      const screenGeo = new THREE.PlaneGeometry(2.35, 1.35);
      const screenMat = new THREE.MeshBasicMaterial({
        color: videoTexturesRef.current[ch] ? 0xffffff : 0x111827,
        map: videoTexturesRef.current[ch] || null,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: hasCam || cameras.length === 0 ? 0.95 : 0.25,
      });
      const screenMesh = new THREE.Mesh(screenGeo, screenMat);
      screenMesh.position.set(...cfg.screenPos);
      screenMesh.rotation.y = cfg.screenRotY;
      screenMesh.visible = show3DVideoWalls && (hasCam || cameras.length === 0);
      scene.add(screenMesh);
      videoMeshesRef.current[ch] = screenMesh;

      const borderEdges = new THREE.EdgesGeometry(screenGeo);
      screenMesh.add(new THREE.LineSegments(borderEdges, new THREE.LineBasicMaterial({ color: cfg.color })));

      const coneGeo = new THREE.ConeGeometry(1.25, 3.1, 4, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        wireframe: true,
        transparent: true,
        opacity: isStudio ? 0.10 : 0.18,
      });
      const coneMesh = new THREE.Mesh(coneGeo, coneMat);
      coneMesh.position.set(cfg.pos[0], cfg.pos[1] - 0.9, cfg.pos[2]);
      coneMesh.lookAt(...cfg.lookAt);
      coneMesh.visible = showLaserCones && (hasCam || cameras.length === 0);
      scene.add(coneMesh);
      coneMeshesRef.current[ch] = coneMesh;
    });

    const blocksGroup = new THREE.Group();
    scene.add(blocksGroup);
    blocksGroupRef.current = blocksGroup;

    const speechGroup = new THREE.Group();
    scene.add(speechGroup);
    speechGroupRef.current = speechGroup;
    if (activeSpeechText.trim()) {
      speechGroup.add(build3DSpeechBubbleSprite(activeSpeechText.trim()));
    }

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);
    dynamicGroupRef.current = dynamicGroup;

    const trailsGroup = new THREE.Group();
    scene.add(trailsGroup);

    const entityMeshMap: Record<string, { group: THREE.Group; lastTagStamp: string }> = {};
    const trailLineMap: Record<string, THREE.Line> = {};

    /** Smooth Tesla FSD Capsule Mannequin & Vehicle Builder */
    const createSmoothFsdAvatar = (ent: Tracked3DEntity): THREE.Group => {
      const g = new THREE.Group();

      if (ent.kind === 'DAIRY_ASSET') {
        const canMat = new THREE.MeshStandardMaterial({
          color: 0x14b8a6,
          metalness: 0.78,
          roughness: 0.18,
          emissive: new THREE.Color(0x0d9488),
          emissiveIntensity: 0.25,
        });
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.86, 24), canMat);
        cyl.position.y = 0.43;
        cyl.castShadow = true;
        g.add(cyl);
      } else if (ent.kind === 'BIKE') {
        const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 20);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
        for (const wz of [0.52, -0.52]) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(0, 0.28, wz);
          g.add(w);
        }
        const bodyMat = new THREE.MeshStandardMaterial({
          color: isStudio ? 0xf59e0b : 0xfbbf24,
          metalness: 0.55,
          roughness: 0.25,
        });
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.85, 8, 16), bodyMat);
        body.rotation.x = Math.PI / 2;
        body.position.set(0, 0.56, 0);
        g.add(body);
      } else if (ent.kind === 'CAR') {
        const carMat = new THREE.MeshStandardMaterial({
          color: isStudio ? 0xe2e8f0 : 0x38bdf8,
          metalness: 0.65,
          roughness: 0.22,
          transparent: !isStudio,
          opacity: isStudio ? 1.0 : 0.88,
        });
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.52, 3.25), carMat);
        chassis.position.y = 0.40;
        g.add(chassis);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.44, 1.72), carMat);
        cabin.position.set(0, 0.84, -0.08);
        g.add(cabin);
      } else {
        // Smooth Tesla FSD Translucent-Metallic Mannequin Silhouette
        const avatarColor =
          ent.kind === 'CUSTOMER' ? 0x10b981 : ent.kind === 'STAFF' ? 0x6366f1 : 0x94a3b8;
        const bodyMat = new THREE.MeshStandardMaterial({
          color: isStudio ? avatarColor : avatarColor,
          roughness: isStudio ? 0.35 : 0.22,
          metalness: isStudio ? 0.15 : 0.45,
          emissive: new THREE.Color(avatarColor),
          emissiveIntensity: isStudio ? 0.08 : 0.24,
        });
        const limbMat = new THREE.MeshStandardMaterial({
          color: isStudio ? 0x1e293b : avatarColor,
          roughness: 0.32,
          metalness: 0.35,
          emissive: new THREE.Color(avatarColor),
          emissiveIntensity: isStudio ? 0.02 : 0.15,
        });

        const legGeo = new THREE.CapsuleGeometry(0.075, 0.54, 6, 12);
        const leftLeg = new THREE.Mesh(legGeo, limbMat);
        leftLeg.position.set(-0.11, 0.38, 0);
        leftLeg.name = 'leftLeg';
        g.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeo, limbMat);
        rightLeg.position.set(0.11, 0.38, 0);
        rightLeg.name = 'rightLeg';
        g.add(rightLeg);

        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 8, 16), bodyMat);
        torso.position.set(0, 1.02, 0);
        torso.scale.set(1.12, 1, 0.76);
        torso.castShadow = true;
        g.add(torso);

        const armGeo = new THREE.CapsuleGeometry(0.055, 0.42, 6, 10);
        const leftArm = new THREE.Mesh(armGeo, bodyMat);
        leftArm.position.set(-0.27, 1.02, 0);
        leftArm.name = 'leftArm';
        g.add(leftArm);

        const rightArm = new THREE.Mesh(armGeo, bodyMat);
        rightArm.position.set(0.27, 1.02, 0);
        rightArm.name = 'rightArm';
        g.add(rightArm);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 20, 20), bodyMat);
        head.position.set(0, 1.52, 0);
        g.add(head);
      }

      // Ground Tesla Target Halo Ring
      const ringGeo = new THREE.RingGeometry(0.38, 0.50, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: ent.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      ring.name = 'pulseRing';
      g.add(ring);

      return g;
    };

    const refreshEntityTag = (g: THREE.Group, ent: Tracked3DEntity) => {
      const oldCard = g.getObjectByName('overheadCard');
      if (oldCard) {
        g.remove(oldCard);
        disposeObject3D(oldCard);
      }
      if (ent.cropDataUrl) {
        const img = new Image();
        img.onload = () => {
          const prevC = g.getObjectByName('overheadCard');
          if (prevC) {
            g.remove(prevC);
            disposeObject3D(prevC);
          }
          g.add(buildCompactFsdTagSprite(ent, img));
        };
        img.src = ent.cropDataUrl;
      } else {
        g.add(buildCompactFsdTagSprite(ent));
      }
    };

    let animId = 0;
    let clock = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      clock += 0.032;

      const cur = orbitCurRef.current;
      const goal = orbitGoalRef.current;
      if (!dragInteractionRef.current.isDragging && autoRotate) {
        goal.theta += 0.0022;
      }

      // Smooth Cinematic Camera Damping (Tesla FSD fluid camera glide)
      const damp = 0.11;
      cur.theta += (goal.theta - cur.theta) * damp;
      cur.phi += (goal.phi - cur.phi) * damp;
      cur.radius += (goal.radius - cur.radius) * damp;
      cur.targetX += (goal.targetX - cur.targetX) * damp;
      cur.targetY += (goal.targetY - cur.targetY) * damp;
      cur.targetZ += (goal.targetZ - cur.targetZ) * damp;

      const sinPhi = Math.sin(cur.phi);
      camera.position.x = cur.targetX + cur.radius * sinPhi * Math.sin(cur.theta);
      camera.position.y = cur.targetY + cur.radius * Math.cos(cur.phi);
      camera.position.z = cur.targetZ + cur.radius * sinPhi * Math.cos(cur.theta);
      camera.lookAt(cur.targetX, cur.targetY, cur.targetZ);

      // Animate 3D Galla Drawer Slide + Alert/Match Pulse Ring
      const ga = gallaAnimRef.current;
      ga.openRatio += (ga.targetOpen - ga.openRatio) * 0.14;
      gallaDrawerGroup.position.z = 1.85 - ga.openRatio * 0.42;
      const dLineMat = (drawerEdges.material as THREE.LineBasicMaterial);
      dLineMat.color.setHex(ga.billed ? 0x10b981 : 0xf43f5e);

      if (ga.pulseClock > 0.01) {
        ga.pulseClock = Math.max(0, ga.pulseClock - 0.012);
        const pScale = 1 + (1 - ga.pulseClock) * 2.2;
        gallaPulseRing.scale.set(pScale, pScale, 1);
        const rMat = gallaPulseRing.material as THREE.MeshBasicMaterial;
        rMat.color.setHex(ga.billed ? 0x10b981 : 0xf43f5e);
        rMat.opacity = ga.pulseClock * 0.85;
      } else {
        (gallaPulseRing.material as THREE.MeshBasicMaterial).opacity = 0;
      }

      // Gentle float on 3D Speech Bubble
      if (speechGroup.children.length > 0) {
        speechGroup.children[0].position.y = 2.65 + Math.sin(clock * 2.2) * 0.05;
      }

      // Update Live 3D Tracked Entities + Glowing Walking Path Trails
      const activeIds = new Set<string>();
      const nowMs = Date.now();

      entitiesRef.current.forEach((ent, idx) => {
        activeIds.add(ent.id);
        const dx = ent.targetX - ent.curX;
        const dz = ent.targetZ - ent.curZ;
        const speed = Math.hypot(dx, dz);
        ent.curX += dx * 0.12;
        ent.curZ += dz * 0.12;

        const tagStamp = `${ent.dwellSec}-${Boolean(ent.cropDataUrl)}`;
        let rec = entityMeshMap[ent.id];
        if (!rec) {
          const grp = createSmoothFsdAvatar(ent);
          refreshEntityTag(grp, ent);
          rec = { group: grp, lastTagStamp: tagStamp };
          entityMeshMap[ent.id] = rec;
          dynamicGroup.add(grp);
        } else if (rec.lastTagStamp !== tagStamp) {
          rec.lastTagStamp = tagStamp;
          refreshEntityTag(rec.group, ent);
        }

        const meshGrp = rec.group;
        meshGrp.position.set(ent.curX, 0, ent.curZ);

        // Smooth fade when track is in grace expiry window
        const silenceMs = nowMs - ent.lastSeen;
        const fadeFactor = silenceMs > 2000 ? Math.max(0.2, 1 - (silenceMs - 2000) / 2500) : 1.0;

        if (speed > 0.025) {
          meshGrp.rotation.y = Math.atan2(dx, dz);
        } else if (ent.kind === 'CUSTOMER') {
          meshGrp.rotation.y = Math.PI;
        }

        const swing = speed > 0.02 ? Math.sin(clock * 4.8 + idx) * 0.42 : Math.sin(clock * 1.4 + idx) * 0.04;
        const lLeg = meshGrp.getObjectByName('leftLeg');
        const rLeg = meshGrp.getObjectByName('rightLeg');
        const lArm = meshGrp.getObjectByName('leftArm');
        const rArm = meshGrp.getObjectByName('rightArm');
        if (lLeg && rLeg && lArm && rArm) {
          lLeg.rotation.x = swing;
          rLeg.rotation.x = -swing;
          lArm.rotation.x = -swing * 0.75;
          rArm.rotation.x = swing * 0.75;
        }

        const ring = meshGrp.getObjectByName('pulseRing') as THREE.Mesh | undefined;
        if (ring) {
          const s = 1 + Math.sin(clock * 2.6 + idx) * 0.12;
          ring.scale.set(s, s, 1);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.82 * fadeFactor;
        }

        // Update 3D Floor Trajectory Trail Ribbon
        if (ent.trail.length >= 2) {
          const pts3d = ent.trail.map(([tx, tz]) => new THREE.Vector3(tx, 0.035, tz));
          pts3d.push(new THREE.Vector3(ent.curX, 0.035, ent.curZ));
          const existingLine = trailLineMap[ent.id];
          if (existingLine) {
            existingLine.geometry.dispose();
            existingLine.geometry = new THREE.BufferGeometry().setFromPoints(pts3d);
          } else {
            const lineGeo = new THREE.BufferGeometry().setFromPoints(pts3d);
            const lineMat = new THREE.LineBasicMaterial({
              color: ent.color,
              transparent: true,
              opacity: 0.75,
            });
            const ln = new THREE.Line(lineGeo, lineMat);
            trailLineMap[ent.id] = ln;
            trailsGroup.add(ln);
          }
        }
      });

      // Dispose departed entities & trails cleanly (Zero VRAM Leak!)
      Object.keys(entityMeshMap).forEach((id) => {
        if (!activeIds.has(id)) {
          dynamicGroup.remove(entityMeshMap[id].group);
          disposeObject3D(entityMeshMap[id].group);
          delete entityMeshMap[id];
        }
      });
      Object.keys(trailLineMap).forEach((id) => {
        if (!activeIds.has(id)) {
          trailsGroup.remove(trailLineMap[id]);
          disposeObject3D(trailLineMap[id]);
          delete trailLineMap[id];
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 920;
      const h = document.fullscreenElement ? Math.max(580, window.innerHeight - 160) : 480;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      disposeObject3D(scene);
      renderer.dispose();
    };
  }, [autoRotate, visualStyle, isFullscreen, cameras.length]);

  const onPointerDown = (clientX: number, clientY: number, isPan = false) => {
    dragInteractionRef.current.isDragging = true;
    dragInteractionRef.current.isPanning = isPan;
    dragInteractionRef.current.lastX = clientX;
    dragInteractionRef.current.lastY = clientY;
  };

  const onPointerMove = (clientX: number, clientY: number) => {
    const dr = dragInteractionRef.current;
    if (!dr.isDragging) return;
    const dx = clientX - dr.lastX;
    const dy = clientY - dr.lastY;
    dr.lastX = clientX;
    dr.lastY = clientY;

    const g = orbitGoalRef.current;
    if (dr.isPanning) {
      g.targetX = Math.max(-8, Math.min(8, g.targetX - dx * 0.018));
      g.targetZ = Math.max(-6, Math.min(10, g.targetZ - dy * 0.018));
    } else {
      g.theta -= dx * 0.0068;
      g.phi = Math.max(0.18, Math.min(1.36, g.phi - dy * 0.0058));
    }
  };

  const onPointerUp = () => {
    dragInteractionRef.current.isDragging = false;
  };

  const onWheelZoom = (deltaY: number) => {
    const g = orbitGoalRef.current;
    g.radius = Math.max(5.8, Math.min(25, g.radius + deltaY * 0.01));
  };

  // Show actual configured cameras first, plus remaining slots cleanly labeled
  const configuredChannels = cameras.length > 0
    ? Array.from(new Set(cameras.map((c, idx) => Number(c.channel || idx + 1)))).sort((a, b) => a - b)
    : [1, 2, 3];

  const selectedCam =
    cameras.find((c, idx) => Number(c.channel || idx + 1) === Number(selectedZoneCh)) || cameras[0];
  const selectedSnap = selectedCam ? gridSnapshots[selectedCam._id] : null;
  const totalPicksAcrossShop = pairingBlocks.reduce(
    (sum, b) => sum + (b.shelfConfig?.pickCount || b.totalPicks || 0),
    0
  );
  const unattendedAlert = liveTelemetry?.unattendedAlert;

  return (
    <div ref={wrapperRef} className={`space-y-3 ${isFullscreen ? 'bg-slate-950 p-4 overflow-y-auto' : ''}`}>
      {/* Unattended Counter Customer Wait Banner */}
      {unattendedAlert?.active && (
        <div className="px-4 py-2.5 rounded-2xl bg-rose-950/80 border border-rose-500/60 flex items-center justify-between gap-3 animate-pulse shadow-lg">
          <div className="flex items-center gap-2.5 text-xs font-bold text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{unattendedAlert.message}</span>
          </div>
          <button
            type="button"
            onClick={() => applyCameraPreset('COUNTER')}
            className="px-3 py-1 rounded-xl bg-rose-600 text-white keep-white-text text-[11px] font-bold shrink-0"
          >
            काउंटर देखें
          </button>
        </div>
      )}

      {/* Top Clean Tesla FSD Mode & Camera Preset Bar */}
      <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center text-sky-400">
            <Compass className={`w-4.5 h-4.5 ${autoRotate ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                {visualStyle === 'FSD_AUTOPILOT'
                  ? 'Tesla FSD 3D Spatial Twin — लाइव दुकान मॉडल'
                  : visualStyle === 'STUDIO_TWIN'
                  ? 'Studio 3D Architectural View — ब्राइट शोरूम मॉडल'
                  : '3D Occupancy Voxel Grid — लाइव डेप्थ वॉक्सेल व्यू'}
              </h4>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                  edgeTelemetryFresh
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                    : 'bg-sky-500/15 text-sky-300 border-sky-500/35'
                }`}
              >
                {edgeTelemetryFresh ? '● EDGE AI LIVE SYNC' : `● ON-DEVICE YOLO Ch#${yoloScanChannel}`}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              असली लाइव डिटेक्शन: कैमरे के सामने इंसान/वाहन आने पर तुरंत 3D अवतार, चलने की ट्रेल लाइन, आवाज़ और गल्ला सिंक दिखेगा।
            </p>
          </div>
        </div>

        {/* Mode & Camera Angle Controls */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setVisualStyle('FSD_AUTOPILOT')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                visualStyle === 'FSD_AUTOPILOT'
                  ? 'bg-sky-600 text-white keep-white-text shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Tesla FSD</span>
            </button>
            <button
              type="button"
              onClick={() => setVisualStyle('STUDIO_TWIN')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                visualStyle === 'STUDIO_TWIN'
                  ? 'bg-emerald-600 text-white keep-white-text shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Studio 3D</span>
            </button>
            <button
              type="button"
              onClick={() => setVisualStyle('OCCUPANCY_VOXEL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                visualStyle === 'OCCUPANCY_VOXEL'
                  ? 'bg-violet-600 text-white keep-white-text shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Voxel 3D</span>
            </button>
          </div>

          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
            {(
              [
                ['TESLA_ISO', '3D आइसो'],
                ['DRONE_TOP', 'ड्रोन टॉप'],
                ['COUNTER', 'काउंटर'],
                ['GALLA', 'गल्ला'],
                ['STREET', 'गेट/सड़क'],
              ] as const
            ).map(([key, lbl]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyCameraPreset(key)}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
                  activePreset === key ? 'bg-slate-700 text-white keep-white-text' : 'text-slate-400 hover:text-white'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1 transition ${
              autoRotate
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{autoRotate ? 'घूम रहा है' : '360° घुमाएँ'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShow3DVideoWalls(!show3DVideoWalls)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1 transition ${
              show3DVideoWalls
                ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>कैमरा स्क्रीन</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLaserCones(!showLaserCones)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1 transition ${
              showLaserCones
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>FOV कोन</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-[11px] font-semibold flex items-center gap-1"
            title="फुलस्क्रीन 3D"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* MAIN 3D WEBGL VIEWPORT */}
      <div className="relative rounded-2xl overflow-hidden bg-[#060a13] border border-slate-800 shadow-2xl select-none">
        {/* Top Floating HUD */}
        <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-20">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-slate-950/85 backdrop-blur-md text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>LIVE TRACKS: {liveEntities.length}</span>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-950/85 backdrop-blur-md text-[10px] font-semibold text-slate-200 border border-slate-800">
              🟢 ग्राहक • 🟣 स्टाफ • ⚪ राहगीर • 🟠 वाहन
            </span>
            {activeSpeechText && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-950/90 backdrop-blur-md text-[10px] font-bold text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                <Mic className="w-3 h-3 animate-pulse" /> “{activeSpeechText.slice(0, 32)}”
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => applyCameraPreset('TESLA_ISO')}
              className="px-2.5 py-1 rounded-xl bg-slate-950/85 hover:bg-slate-800 text-[10px] font-bold text-sky-300 border border-slate-700 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> रीसेट व्यू
            </button>
          </div>
        </div>

        {/* Three.js Canvas */}
        <div
          ref={mountRef}
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={(e) => onPointerDown(e.clientX, e.clientY, e.button === 2 || e.shiftKey)}
          onMouseMove={(e) => onPointerMove(e.clientX, e.clientY)}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerUp}
          onTouchStart={(e) =>
            e.touches[0] && onPointerDown(e.touches[0].clientX, e.touches[0].clientY, e.touches.length >= 2)
          }
          onTouchMove={(e) => e.touches[0] && onPointerMove(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={onPointerUp}
          onWheel={(e) => onWheelZoom(e.deltaY)}
          className={`w-full ${isFullscreen ? 'h-[calc(100vh-170px)]' : 'h-[480px]'} cursor-grab active:cursor-grabbing`}
        />

        {/* Bottom-Left Clickable Live 3D Tracked Objects Inspector */}
        <div className="absolute bottom-3 left-3 w-64 sm:w-72 bg-slate-950/88 backdrop-blur-md border border-slate-800 rounded-2xl p-2.5 space-y-1.5 text-[11px] z-20">
          <div className="flex items-center justify-between text-[10px] font-bold text-sky-300 border-b border-slate-800 pb-1">
            <span>लाइव 3D ट्रैक किए गए लोग/वाहन ({liveEntities.length})</span>
            <span className="font-mono text-emerald-400">{edgeTelemetryFresh ? 'EDGE AI' : 'YOLO'}</span>
          </div>
          <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
            {liveEntities.length === 0 ? (
              <div className="text-[10px] text-slate-400 py-1">
                अभी कैमरों के सामने कोई व्यक्ति या वाहन नहीं है — आते ही यहाँ लाइव दिखेगा।
              </div>
            ) : (
              liveEntities.map((ent) => (
                <button
                  key={ent.id}
                  type="button"
                  onClick={() => focusOnEntity(ent)}
                  className={`w-full px-2 py-1 rounded-lg flex items-center justify-between gap-2 text-[10px] transition text-left ${
                    focusedEntityId === ent.id ? 'bg-sky-500/20 border border-sky-500/40' : 'hover:bg-slate-900'
                  }`}
                >
                  <span className="text-white font-semibold truncate flex items-center gap-1">
                    <Crosshair className="w-3 h-3 text-sky-400 shrink-0" />
                    {ent.label} [Ch#{ent.channel}]
                  </span>
                  <span className="font-mono text-emerald-400 shrink-0">
                    {ent.dwellSec > 0 ? `${ent.dwellSec}s` : `${ent.confidence}%`}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Bottom-Right Floating Picture-in-Picture (PiP) Camera Inspector */}
        {selectedCam && (
          <div className="absolute bottom-3 right-3 w-56 sm:w-64 bg-slate-950/90 backdrop-blur-md border border-slate-700 rounded-2xl overflow-hidden shadow-2xl z-20">
            <div className="px-2.5 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-[10px]">
              <span className="font-bold text-white truncate">
                Ch#{selectedCam.channel || 1}: {selectedCam.name}
              </span>
              <div className="flex items-center gap-1">
                {onOpenVisualPairingForChannel && (
                  <button
                    type="button"
                    onClick={() => onOpenVisualPairingForChannel(selectedCam.channel || 1)}
                    className="px-1.5 py-0.5 rounded bg-indigo-600 text-white keep-white-text text-[9px] font-bold"
                  >
                    +ज़ोन
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelectSingleCamera(selectedCam._id)}
                  className="p-1 rounded bg-slate-800 text-white hover:bg-slate-700"
                  title="फुल कैमरा खोलें"
                >
                  <Maximize2 className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
            <div className="relative aspect-video bg-slate-950">
              {selectedSnap ? (
                <img src={selectedSnap} alt={selectedCam.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                  <Camera className="w-4 h-4 mr-1 animate-pulse" /> लाइव फ्रेम सिंक हो रहा है...
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dynamic Camera Zone Selector Pills (Adapts cleanly to configured cameras) */}
      <div
        className={`grid gap-2 ${
          configuredChannels.length <= 3
            ? 'grid-cols-1 sm:grid-cols-3'
            : configuredChannels.length === 4
            ? 'grid-cols-2 sm:grid-cols-4'
            : 'grid-cols-2 sm:grid-cols-5'
        }`}
      >
        {configuredChannels.map((ch) => {
          const cfg = CAM_3D_ANCHORS[ch] || CAM_3D_ANCHORS[1];
          const camObj = cameras.find((c, idx) => Number(c.channel || idx + 1) === ch);
          const camBlocks = pairingBlocks.filter((b) => Number(b.cameraChannel) === ch);
          const chDetCount = liveEntities.filter((e) => e.channel === ch).length;
          const isSel = selectedZoneCh === ch;

          return (
            <button
              key={ch}
              type="button"
              onClick={() => {
                setSelectedZoneCh(ch);
                if (ch === 1) applyCameraPreset('COUNTER');
                else if (ch === 2) applyCameraPreset('GALLA');
                else if (ch === 4 || ch === 5) applyCameraPreset('STREET');
                else applyCameraPreset('TESLA_ISO');
              }}
              className={`p-2.5 rounded-2xl border text-left transition flex flex-col justify-between space-y-1.5 ${
                isSel
                  ? 'bg-sky-950/40 border-sky-500/60 ring-1 ring-sky-500/30'
                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold" style={{ color: cfg.hex }}>
                  CAM #{ch} • {chDetCount} लाइव
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                  {camBlocks.length} ज़ोन
                </span>
              </div>
              <div className="text-xs font-bold text-white truncate">{camObj ? camObj.name : cfg.title}</div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <Eye className="w-3 h-3" /> 3D फ़ोकस
                </span>
                {onOpenVisualPairingForChannel && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenVisualPairingForChannel(ch);
                    }}
                    className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-0.5"
                  >
                    <Sparkles className="w-2.5 h-2.5" /> +ज़ोन
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Telemetry Strip */}
      <div className="px-4 py-2 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-sky-400" />
          <span>
            माउस ड्रैग: 360° घुमाएँ • Right-Click / Shift+Drag: पैन करें • Scroll: ज़ूम • किसी भी ट्रैक पर क्लिक कर फ़ोकस करें
          </span>
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-indigo-400" /> सक्रिय ज़ोन: <strong className="text-white">{pairingBlocks.length}</strong>
          </span>
          <span className="flex items-center gap-1">
            <Box className="w-3.5 h-3.5 text-sky-400" /> कुल पिक्स: <strong className="text-sky-400">{totalPicksAcrossShop}</strong>
          </span>
          {todayStats?.customers !== undefined && (
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-emerald-400" /> ग्राहक: <strong className="text-emerald-400">{todayStats.customers}</strong>
            </span>
          )}
          {todayStats?.gallaOpenings !== undefined && (
            <span className="flex items-center gap-1">
              <DoorOpen className="w-3.5 h-3.5 text-amber-400" /> गल्ला: <strong className="text-amber-400">{todayStats.gallaOpenings}</strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
