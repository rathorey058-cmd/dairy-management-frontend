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
        actionText?: string;
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

export interface LocalActiveActionProp {
  id: string;
  channel: number;
  text: string;
  kind: 'CUSTOMER' | 'GALLA' | 'GATE' | 'ZONE';
  normBox?: { x: number; y: number; width: number; height: number };
}

interface Props {
  cameras: CameraDevice[];
  gridSnapshots: Record<string, string>;
  pairingBlocks: any[];
  onSelectSingleCamera: (cameraId: string) => void;
  onOpenVisualPairingForChannel?: (channel: number) => void;
  liveTelemetry?: LiveTelemetryProp | null;
  isVideoTestMode?: boolean;
  localSpeechQuote?: string;
  localGallaPulseAt?: number;
  localActiveActions?: LocalActiveActionProp[];
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
  actionText?: string;
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
    pos: [0.2, 4.1, 1.3],
    lookAt: [0.0, 0.85, 4.1],
    screenPos: [0.0, 2.42, 2.05],
    screenRotY: 0,
    zoneBounds: { xCenter: 0.0, zCenter: 3.55, width: 6.2, depth: 2.8 },
    title: 'Ch#1: मुख्य दूध काउंटर व पतीला',
    color: 0x38bdf8,
    hex: '#38bdf8',
  },
  2: {
    pos: [-2.1, 4.1, -0.3],
    lookAt: [1.4, 0.6, 0.6],
    screenPos: [4.65, 2.35, 0.65],
    screenRotY: -Math.PI / 2,
    zoneBounds: { xCenter: 1.55, zCenter: 0.85, width: 4.8, depth: 3.2 },
    title: 'Ch#2: गल्ला दराज व डीप फ्रीजर',
    color: 0xf43f5e,
    hex: '#f43f5e',
  },
  3: {
    pos: [2.4, 4.1, -2.2],
    lookAt: [0.0, 0.75, -3.6],
    screenPos: [0.0, 2.45, -4.65],
    screenRotY: 0,
    zoneBounds: { xCenter: 0.0, zCenter: -3.15, width: 6.8, depth: 2.6 },
    title: 'Ch#3: तौल कांटा व भरा हुआ डेयरी रैक',
    color: 0xa855f7,
    hex: '#a855f7',
  },
  4: {
    pos: [4.0, 4.3, 4.5],
    lookAt: [5.4, 0.5, 7.8],
    screenPos: [6.2, 2.4, 5.1],
    screenRotY: -0.35,
    zoneBounds: { xCenter: 4.2, zCenter: 6.4, width: 5.8, depth: 3.8 },
    title: 'Ch#4: मुख्य गेट व मिल्क कैन ट्रिपवायर',
    color: 0x10b981,
    hex: '#10b981',
  },
  5: {
    pos: [-4.0, 4.3, 4.5],
    lookAt: [-5.4, 0.5, 7.8],
    screenPos: [-6.2, 2.4, 5.1],
    screenRotY: 0.35,
    zoneBounds: { xCenter: -4.2, zCenter: 6.4, width: 5.8, depth: 3.8 },
    title: 'Ch#5: बाहरी सड़क व वाहन लेन',
    color: 0xf59e0b,
    hex: '#f59e0b',
  },
};

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child: any) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m: any) => {
        if (m.map) m.map.dispose();
        m.dispose?.();
      });
    }
  });
}

/** Crisp Polished Dairy Marble Tile OR Sleek Tesla FSD Grid Floor Texture */
function createShopFloorTexture(isRealistic: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  if (isRealistic) {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 0, 512, 512);
    const step = 64;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#f1f5f9' : '#dde6f0';
        ctx.fillRect(x * step + 2, y * step + 2, step - 4, step - 4);
      }
    }
  } else {
    ctx.fillStyle = '#0c1322';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Realistic Asphalt Street with Crosswalk & Yellow Lane Divider */
function createRoadTexture(isRealistic: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = isRealistic ? '#1e293b' : '#080d18';
  ctx.fillRect(0, 0, 1024, 256);

  ctx.fillStyle = isRealistic ? '#94a3b8' : '#38bdf8';
  ctx.fillRect(0, 8, 1024, 5);
  ctx.fillRect(0, 243, 1024, 5);

  ctx.fillStyle = isRealistic ? '#facc15' : '#10b981';
  for (let x = 20; x < 1024; x += 82) {
    ctx.fillRect(x, 124, 46, 8);
  }

  // Zebra pedestrian crossing in front of shop gate
  ctx.fillStyle = isRealistic ? 'rgba(248,250,252,0.55)' : 'rgba(56,189,248,0.22)';
  for (let y = 26; y < 230; y += 30) {
    ctx.fillRect(468, y, 88, 16);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Bright Glowing Hindi Shop Signboard */
function createShopSignboardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 180;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.5, '#1e3a8a');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 180);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 1012, 168);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 46px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🥛 श्री कृष्णा डेयरी एवं मिल्क पार्लर', 512, 82);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('LIVE 3D TESLA DIGITAL TWIN • AI CAMERA SYNC', 512, 136);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildOverheadCardSprite(ent: Tracked3DEntity, cutImg?: HTMLImageElement): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 128;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = 'rgba(9, 14, 26, 0.92)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 376, 120, 20);
  ctx.fill();

  const hexCol = '#' + ent.color.toString(16).padStart(6, '0');
  ctx.strokeStyle = hexCol;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  let tx = 18;
  if (cutImg) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(12, 12, 82, 104, 12);
    ctx.clip();
    ctx.drawImage(cutImg, 12, 12, 82, 104);
    ctx.restore();
    tx = 106;
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillText(ent.label.slice(0, 22), tx, 38);

  if (ent.actionText) {
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(`⚡ ${ent.actionText.slice(0, 25)}`, tx, 68);
  }

  const mins = Math.floor(ent.dwellSec / 60);
  const secs = ent.dwellSec % 60;
  const dwellTxt = ent.dwellSec > 0 ? `${mins}:${String(secs).padStart(2, '0')}s` : 'LIVE';

  ctx.fillStyle = hexCol;
  ctx.font = 'bold 17px monospace';
  ctx.fillText(`Ch#${ent.channel} • ${dwellTxt} • ${ent.confidence}%`, tx, ent.actionText ? 98 : 80);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(1.78, 0.59, 1);
  sp.position.set(0, ent.kind === 'CAR' ? 1.65 : ent.kind === 'BIKE' ? 1.45 : 2.18, 0);
  sp.name = 'overheadCard';
  return sp;
}

function buildZoneActionBeaconSprite(actionText: string, borderHex = '#facc15'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 84;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 472, 76, 18);
  ctx.fill();

  ctx.strokeStyle = borderHex;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#fef08a';
  ctx.font = 'bold 22px system-ui, sans-serif';
  const clipped = actionText.length > 34 ? actionText.slice(0, 33) + '…' : actionText;
  ctx.fillText(`⚡ ${clipped}`, 20, 50);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(2.55, 0.45, 1);
  return sp;
}

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
  sp.position.set(0.2, 2.85, 3.45);
  sp.name = 'liveSpeechSprite';
  return sp;
}

function createOccupancyVoxelPoints(
  img: HTMLImageElement,
  cfg: (typeof CAM_3D_ANCHORS)[number]
): THREE.Points {
  const cols = 48;
  const rows = 32;
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

      positions[k * 3] = xCenter + (col / (cols - 1) - 0.5) * width;
      positions[k * 3 + 1] = 0.08 + lum * 1.5;
      positions[k * 3 + 2] = zCenter + (r / (rows - 1) - 0.5) * depth;

      colors[k * 3] = Math.min(1, cr * 1.15);
      colors[k * 3 + 1] = Math.min(1, cg * 1.15);
      colors[k * 3 + 2] = Math.min(1, cb * 1.15);
      k++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.9 })
  );
}

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
      label: `🏍️ बाइक (${confidence}%)`,
      color: 0xf59e0b,
    };
  }

  if (explicitRole === 'CAR' || className === 'car' || className === 'truck' || className === 'bus') {
    const sideOffset = channel === 5 ? -5.2 : 4.4;
    return {
      x: sideOffset + (cx - 0.5) * 7.5,
      z: 8.6 + (1 - cy) * 2.2,
      kind: 'CAR',
      label: `🚗 वाहन (${confidence}%)`,
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
        label: '👨‍💼 काउंटर स्टाफ',
        color: 0x6366f1,
      };
    }
    if (role === 'PASSERBY') {
      return {
        x: (cx - 0.5) * 7.5,
        z: 6.7 + (0.4 - Math.min(0.4, ny2)) * 3.5,
        kind: 'PASSERBY',
        label: '🚶 राहगीर',
        color: 0x94a3b8,
      };
    }
    return {
      x: (cx - 0.5) * 4.6,
      z: 4.25 + (0.52 - ny2) * 1.4,
      kind: 'CUSTOMER',
      label: '👤 ग्राहक @ काउंटर',
      color: 0x10b981,
    };
  }

  if (channel === 2) {
    return {
      x: -0.6 + cx * 4.2,
      z: -0.8 + cy * 2.8,
      kind: 'STAFF',
      label: '👨‍💼 गल्ला/फ्रीजर ज़ोन',
      color: 0xf43f5e,
    };
  }

  if (channel === 3) {
    return {
      x: -2.4 + cx * 4.8,
      z: -3.4 + cy * 2.2,
      kind: 'STAFF',
      label: '👤 आंतरिक रैक ज़ोन',
      color: 0xa855f7,
    };
  }

  if (channel === 4) {
    const isEntering = explicitRole === 'CUSTOMER' || ny2 > 0.48;
    return {
      x: 2.8 + (cx - 0.5) * 5.2,
      z: isEntering ? 5.2 + (1 - cy) * 1.8 : 7.0 + (1 - cy) * 2.5,
      kind: isEntering ? 'CUSTOMER' : 'PASSERBY',
      label: isEntering ? '🚶 गेट प्रवेश ग्राहक' : '🚶 सड़क राहगीर',
      color: isEntering ? 0x10b981 : 0x94a3b8,
    };
  }

  return {
    x: -3.8 + (cx - 0.5) * 5.4,
    z: 6.6 + (1 - cy) * 2.8,
    kind: 'PASSERBY',
    label: '🚶 पश्चिमी सड़क',
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
  isVideoTestMode = false,
  localSpeechQuote,
  localGallaPulseAt,
  localActiveActions = [],
  todayStats,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Default to Rich, Bright Ultra-Realistic 3D Dairy Shop + Live Tesla Tracking (0 lag, vibrant details!)
  const [visualStyle, setVisualStyle] = useState<'REALISTIC_3D' | 'TESLA_FSD' | 'OCCUPANCY_VOXEL'>('REALISTIC_3D');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [show3DVideoWalls, setShow3DVideoWalls] = useState<boolean>(true);
  const [showLaserCones, setShowLaserCones] = useState<boolean>(true);
  const [browserYoloFallback, setBrowserYoloFallback] = useState<boolean>(true);
  const [mountGracePassed, setMountGracePassed] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [selectedZoneCh, setSelectedZoneCh] = useState<number>(1);
  const [activePreset, setActivePreset] = useState<'TESLA_ISO' | 'DRONE_TOP' | 'COUNTER' | 'GALLA' | 'STREET'>('TESLA_ISO');
  const [liveEntities, setLiveEntities] = useState<Tracked3DEntity[]>([]);
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null);
  const [yoloScanChannel, setYoloScanChannel] = useState<number>(1);

  const orbitCurRef = useRef({
    theta: 0.22,
    phi: 0.66,
    radius: 14.5,
    targetX: 0,
    targetY: 0.65,
    targetZ: 1.35,
  });
  const orbitGoalRef = useRef({
    theta: 0.22,
    phi: 0.66,
    radius: 14.5,
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
  const actionBeaconsGroupRef = useRef<THREE.Group | null>(null);

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
      g.radius = 14.5;
      g.targetX = 0;
      g.targetZ = 1.35;
    } else if (preset === 'COUNTER') {
      g.theta = 0.04;
      g.phi = 0.78;
      g.radius = 8.5;
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

  useEffect(() => {
    const t = setTimeout(() => setMountGracePassed(true), 5200);
    return () => clearTimeout(t);
  }, []);

  // 1. Zero-Lag Primary Source: Python Edge AI Live Telemetry (0% Browser CPU!)
  const edgeTelemetryAgeMs = liveTelemetry?.updatedAt ? Date.now() - Number(liveTelemetry.updatedAt) : 999999;
  const edgeTelemetryFresh = Boolean(liveTelemetry?.updatedAt && edgeTelemetryAgeMs >= -15000 && edgeTelemetryAgeMs < 18000);

  const deriveHindiActionText = useCallback((kind: Tracked3DEntity['kind'], ch: number, dwellSec: number) => {
    if (kind === 'DAIRY_ASSET') return 'सीखा गया डेयरी सामान दिखा';
    if (kind === 'BIKE' || kind === 'CAR') return 'दुकान के बाहर वाहन गतिविधि';
    if (ch === 1) {
      if (kind === 'CUSTOMER') return dwellSec >= 4 ? `दूध काउंटर पर ग्राहक खड़ा है (${dwellSec}s)` : 'दूध काउंटर पर ग्राहक आया';
      if (kind === 'STAFF') return 'काउंटर पर स्टाफ सक्रिय';
      return 'गेट के बाहर राहगीर';
    }
    if (ch === 2) return 'गल्ला / डीप फ्रीजर ज़ोन में व्यक्ति सक्रिय';
    if (ch === 3) return 'किराना रैक / कांटा ज़ोन में व्यक्ति सक्रिय';
    if (ch === 4) return kind === 'CUSTOMER' ? 'मुख्य गेट से ग्राहक प्रवेश' : 'मुख्य गेट के पास हलचल';
    return 'बाहरी सड़क ज़ोन में हलचल';
  }, []);

  useEffect(() => {
    if (!edgeTelemetryFresh && localActiveActions.length === 0) return;
    const now = Date.now();
    const nextList: Tracked3DEntity[] = [];

    if (liveTelemetry?.channels && edgeTelemetryFresh) {
      Object.entries(liveTelemetry.channels).forEach(([chStr, chData]) => {
        const ch = Number(chStr) || 1;
        const texImg = videoTexturesRef.current[ch]?.image;
        (chData?.detections || []).forEach((d) => {
          const p3 = mapBoxAndRoleTo3DWorld(d.box, ch, d.role, d.className, d.confidence);
          const prev = entitiesRef.current.find((e) => e.id === d.trackId);
          const curX = prev ? prev.curX : p3.x;
          const curZ = prev ? prev.curZ : p3.z;
          const trail: Array<[number, number]> = prev ? [...prev.trail] : [[curX, curZ]];
          const lastPt = trail[trail.length - 1];
          if (!lastPt || Math.hypot(p3.x - lastPt[0], p3.z - lastPt[1]) > 0.14) {
            trail.push([p3.x, p3.z]);
            if (trail.length > 24) trail.shift();
          }

          let liveCrop = d.cropDataUrl || prev?.cropDataUrl;
          if (!liveCrop && texImg instanceof HTMLImageElement && texImg.naturalWidth > 0) {
            liveCrop = cropDetectionToDataUrl(texImg, {
              className: d.className,
              confidence: d.confidence,
              box: d.box,
            });
          }

          nextList.push({
            id: d.trackId,
            kind: p3.kind,
            label: d.customLabel || p3.label,
            actionText: d.actionText || deriveHindiActionText(p3.kind, ch, d.dwellSec || 0),
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
            cropDataUrl: liveCrop,
            source: 'EDGE_LIVE',
          });
        });
      });
    }

    // Also synthesize live 3D avatars from 2D drawn zone motion if no YOLO track is already on that channel
    localActiveActions.forEach((act) => {
      if (act.kind === 'CUSTOMER' && act.normBox && !nextList.some((e) => e.channel === act.channel)) {
        const p3 = mapBoxAndRoleTo3DWorld(act.normBox, act.channel, 'CUSTOMER', 'person', 92);
        const prev = entitiesRef.current.find((e) => e.id === act.id);
        nextList.push({
          id: act.id,
          kind: 'CUSTOMER',
          label: p3.label,
          actionText: act.text,
          channel: act.channel,
          confidence: 92,
          dwellSec: prev ? Math.max(1, Math.round((now - prev.firstSeen) / 1000)) : 1,
          targetX: p3.x,
          targetZ: p3.z,
          curX: prev ? prev.curX : p3.x,
          curZ: prev ? prev.curZ : p3.z,
          trail: prev ? prev.trail : [[p3.x, p3.z]],
          color: 0x10b981,
          firstSeen: prev ? prev.firstSeen : now,
          lastSeen: now,
          source: 'EDGE_LIVE',
        });
      }
    });

    if (edgeTelemetryFresh || nextList.length > 0) {
      const graceEntities = entitiesRef.current.filter(
        (old) => !nextList.some((n) => n.id === old.id) && now - old.lastSeen < 3500
      );
      const merged = [...nextList, ...graceEntities];
      entitiesRef.current = merged;
      setLiveEntities(merged);
    }
  }, [liveTelemetry, edgeTelemetryFresh, localActiveActions, deriveHindiActionText]);

  // 2. Sync Galla 3D Drawer Slide + Shockwave Ring
  useEffect(() => {
    const isOpenEdge = liveTelemetry?.galla?.state === 'OPEN';
    const recentLocalPulse = Boolean(localGallaPulseAt && Date.now() - localGallaPulseAt < 6500);
    const shouldOpen = isOpenEdge || recentLocalPulse;
    gallaAnimRef.current.targetOpen = shouldOpen ? 1 : 0;
    gallaAnimRef.current.billed = liveTelemetry?.galla?.lastBilled !== false;
    if (shouldOpen) gallaAnimRef.current.pulseClock = 1.0;
  }, [liveTelemetry?.galla?.state, liveTelemetry?.galla?.lastBilled, localGallaPulseAt]);

  // 3. Sync Floating 3D Speech Bubble
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

  // 4. Browser On-Device YOLOv8 — 0% CPU when Python Edge AI is fresh; auto-activates smoothly if Edge AI is off or in Video Test Mode!
  const shouldRunBrowserYolo = isVideoTestMode || (browserYoloFallback && mountGracePassed);

  useEffect(() => {
    if (edgeTelemetryFresh || !shouldRunBrowserYolo) return;
    let cancelled = false;
    let step = 0;
    let busy = false;

    const runDeviceScan = async () => {
      if (cancelled || busy) return;
      const now = Date.now();
      const pruned = entitiesRef.current.filter((e) => now - e.lastSeen < 5000);
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
          let brainPersonLabel: string | null = null;
          if (det.className === 'person') {
            const matchedP = aiBrainService.matchPersonInFrame(img, det.box);
            if (matchedP.person) {
              const vCnt = matchedP.person.visitCount || 1;
              const regBadge = matchedP.person.personRole === 'REGULAR_CUSTOMER' || vCnt >= 3 ? ' • रेगुलर' : '';
              brainPersonLabel = `👤 ${matchedP.person.label}${regBadge} (${vCnt}x)`;
            }
          }

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
            if (trail.length > 24) trail.shift();
          }

          return {
            id,
            kind: p3.kind,
            label: brainPersonLabel || p3.label,
            actionText: deriveHindiActionText(p3.kind, ch, dwellSec),
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

        const graceSameCh = currentChPrev.filter(
          (e) => !usedPrevIds.has(e.id) && scanTs - e.lastSeen < 2500
        );
        const merged = [...otherChannelEntities, ...mappedForCh, ...graceSameCh];
        entitiesRef.current = merged;
        setLiveEntities(merged);
      } catch {
        // ignore
      } finally {
        busy = false;
      }
    };

    const iv = setInterval(runDeviceScan, isVideoTestMode ? 1800 : 3200);
    runDeviceScan();
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [cameras, gridSnapshots, edgeTelemetryFresh, shouldRunBrowserYolo, isVideoTestMode]);

  // 5. Load Live Camera Feeds onto Crisp HD 3D Screens
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
            wallMesh.material.opacity = 1.0;
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

  // 6. Calibrated 3D Zone Volumes (`VisualPairingBlocks`)
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
        opacity: isActiveNow ? 0.28 : 0.11,
        depthWrite: false,
      });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.position.set(bx, isActiveNow ? 0.68 : 0.48, bz);
      grp.add(boxMesh);

      const edges = new THREE.EdgesGeometry(boxGeo);
      const wire = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: isActiveNow ? 1.0 : 0.7 })
      );
      wire.position.copy(boxMesh.position);
      grp.add(wire);
    });
  }, [pairingBlocks, visualStyle, liveTelemetry]);

  // 7. Rich, Vibrant 60FPS Three.js Scene (Full Stocked Dairy Shop + Tesla FSD Precision)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isRealistic = visualStyle === 'REALISTIC_3D';
    const isVoxel = visualStyle === 'OCCUPANCY_VOXEL';
    const width = container.clientWidth || 920;
    const height = isFullscreen ? Math.max(580, window.innerHeight - 160) : 480;

    const scene = new THREE.Scene();
    const bgHex = isRealistic ? 0x0f172a : 0x070c17;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, isRealistic ? 0.011 : 0.016);

    const camera = new THREE.PerspectiveCamera(43, width / height, 0.1, 140);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isRealistic ? 1.28 : 1.12;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Bright Warm Showroom + Daylight Lighting
    const hemiLight = new THREE.HemisphereLight(
      isRealistic ? 0xffffff : 0xdbeafe,
      isRealistic ? 0x475569 : 0x0f172a,
      isRealistic ? 2.0 : 1.5
    );
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(isRealistic ? 0xfffbeb : 0x7dd3fc, isRealistic ? 2.4 : 1.8);
    sunLight.position.set(14, 24, 16);
    sunLight.castShadow = true;
    scene.add(sunLight);

    const counterSpot = new THREE.PointLight(isRealistic ? 0xfef3c7 : 0x38bdf8, isRealistic ? 2.6 : 2.1, 18);
    counterSpot.position.set(0, 4.2, 3.0);
    scene.add(counterSpot);

    const bhattiGlow = new THREE.PointLight(0xf97316, isRealistic ? 2.2 : 1.2, 8);
    bhattiGlow.position.set(4.1, 0.9, -1.2);
    scene.add(bhattiGlow);

    // 1. CRISP CERAMIC TILE DAIRY FLOOR & SURROUNDING GRID
    const gridHelper = new THREE.GridHelper(38, 38, isRealistic ? 0x334155 : 0x0ea5e9, 0x1e293b);
    gridHelper.position.y = 0.004;
    scene.add(gridHelper);

    const floorTex = createShopFloorTexture(isRealistic);
    const shopFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(12.2, 9.8),
      new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: isRealistic ? 0.22 : 0.5,
        metalness: 0.14,
      })
    );
    shopFloor.rotation.x = -Math.PI / 2;
    shopFloor.position.set(0, 0.015, -0.35);
    shopFloor.receiveShadow = true;
    scene.add(shopFloor);

    // Sidewalk Curb, Street Lamp Posts & Asphalt Road
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(36, 0.14, 0.62),
      new THREE.MeshStandardMaterial({ color: isRealistic ? 0x94a3b8 : 0x1e293b, roughness: 0.6 })
    );
    curb.position.set(0, 0.07, 4.75);
    scene.add(curb);

    const roadTex = createRoadTexture(isRealistic);
    const roadMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 6.5),
      new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.82 })
    );
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(0, 0.01, 8.35);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.2 });
    for (const lx of [-7.2, 7.2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 12), poleMat);
      pole.position.set(lx, 2.2, 4.8);
      scene.add(pole);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      lamp.position.set(lx, 4.45, 5.1);
      scene.add(lamp);
    }

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

    // 2. FULL RICH 3D DAIRY SHOP ARCHITECTURE & STOCKED EQUIPMENT
    const addBox = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
      edgeCol?: number
    ) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      if (edgeCol !== undefined) {
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: edgeCol }));
        line.position.copy(m.position);
        scene.add(line);
      }
      return m;
    };

    // Pillars, Glass Walls & Hindi Signboard
    const pillarMat = new THREE.MeshStandardMaterial({ color: isRealistic ? 0xe2e8f0 : 0x1e293b, roughness: 0.3 });
    for (const [px, pz] of [[-5.9, 4.4], [5.9, 4.4], [-5.9, -4.9], [5.9, -4.9]]) {
      addBox(0.36, 3.6, 0.36, px, 1.8, pz, pillarMat, 0x38bdf8);
    }

    const signTex = createShopSignboardTexture();
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 1.0, 0.2),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    signBoard.position.set(0, 3.65, 4.4);
    scene.add(signBoard);

    const wallMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0x94a3b8 : 0x1e293b,
      transparent: true,
      opacity: isRealistic ? 0.3 : 0.38,
      roughness: 0.3,
    });
    addBox(12.0, 3.2, 0.16, 0, 1.6, -5.0, wallMat, 0x475569);
    addBox(0.16, 3.2, 9.5, -5.9, 1.6, -0.25, wallMat, 0x475569);
    addBox(0.16, 3.2, 9.5, 5.9, 1.6, -0.25, wallMat, 0x475569);

    // Granite Milk Counter + Weighing Scale + Shiny Milk Patila + Stocked Red Milk Crates (Ch#1)
    const counterBaseMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0x1e293b : 0x0f2942,
      roughness: 0.25,
      metalness: 0.3,
    });
    const graniteTopMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0x0f172a : 0x1e3a5f,
      roughness: 0.12,
      metalness: 0.5,
    });
    addBox(6.4, 0.98, 1.15, 0, 0.49, 3.3, counterBaseMat, isRealistic ? 0x64748b : 0x38bdf8);
    addBox(6.55, 0.09, 1.26, 0, 1.02, 3.3, graniteTopMat, 0x38bdf8);

    const scaleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.2 });
    addBox(0.48, 0.14, 0.44, -0.35, 1.13, 3.35, scaleMat, 0x10b981);

    const steelMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.94, roughness: 0.1 });
    const patilaMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.46, 0.62, 32), steelMat);
    patilaMesh.position.set(0.5, 1.37, 3.3);
    patilaMesh.castShadow = true;
    scene.add(patilaMesh);

    const milkSurface = new THREE.Mesh(
      new THREE.CircleGeometry(0.46, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    milkSurface.rotation.x = -Math.PI / 2;
    milkSurface.position.set(0.5, 1.685, 3.3);
    scene.add(milkSurface);

    const trayMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35 });
    const pktMats = [
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 }),
    ];
    for (const tx of [-1.2, -2.15]) {
      addBox(0.82, 0.24, 0.72, tx, 1.18, 3.3, trayMat, 0xf87171);
      for (let p = 0; p < 3; p++) {
        addBox(0.22, 0.18, 0.48, tx - 0.22 + p * 0.22, 1.32, 3.3, pktMats[p]);
      }
    }

    const laptopMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.2 });
    addBox(0.48, 0.04, 0.34, 1.85, 1.09, 3.1, laptopMat, 0x38bdf8);
    const laptopScreen = addBox(0.48, 0.32, 0.03, 1.85, 1.26, 3.25, laptopMat, 0x10b981);
    laptopScreen.rotation.x = -0.18;

    // Animated Cash Galla Desk + Sliding Drawer + Pulse Ring (Ch#2)
    const gallaMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0x78350f : 0x312e81,
      roughness: 0.35,
    });
    addBox(1.55, 1.02, 1.15, 2.35, 0.51, 1.85, gallaMat, 0xf43f5e);

    const gallaDrawerGroup = new THREE.Group();
    gallaDrawerGroup.position.set(2.35, 0.8, 1.85);
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
      new THREE.RingGeometry(0.75, 0.98, 36),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0 })
    );
    gallaPulseRing.rotation.x = -Math.PI / 2;
    gallaPulseRing.position.set(2.35, 0.05, 1.85);
    scene.add(gallaPulseRing);

    // Two White Glass-Top Sliding Deep Freezers (Ch#2 & Ch#3)
    const whiteFreezerMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0xf8fafc : 0x1e3a5f,
      roughness: 0.18,
      metalness: 0.15,
    });
    const glassLidMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.52,
      roughness: 0.08,
      metalness: 0.6,
    });
    for (const fx of [-0.85, 1.65]) {
      addBox(2.15, 0.94, 1.18, fx, 0.47, -1.2, whiteFreezerMat, 0x38bdf8);
      addBox(2.0, 0.05, 1.05, fx, 0.96, -1.2, glassLidMat);
    }

    // Staff Chair + Milk Boiling Bhatti / Kadhai + 4 Shiny 50L Milk Cans
    const chairMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.35 });
    addBox(0.68, 0.48, 0.68, -3.4, 0.24, -0.5, chairMat);
    addBox(0.12, 0.58, 0.68, -3.7, 0.75, -0.5, chairMat);

    const bhattiMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    addBox(1.15, 0.78, 1.15, 4.1, 0.39, -1.2, bhattiMat, 0xf97316);
    const kadhai = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 0.32, 24), steelMat);
    kadhai.position.set(4.1, 0.92, -1.2);
    scene.add(kadhai);

    for (const [cx, cz] of [[3.8, 0.35], [4.45, 0.35], [3.8, -0.25], [4.45, -0.25]]) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.25, 0.78, 22), steelMat);
      can.position.set(cx, 0.39, cz);
      can.castShadow = true;
      scene.add(can);
    }

    // 4-Tier Fully Stocked Kirana & Dairy Back Shelf Rack (Ch#3)
    const rackFrameMat = new THREE.MeshStandardMaterial({ color: isRealistic ? 0x334155 : 0x1e293b, metalness: 0.5 });
    addBox(7.4, 2.35, 0.85, 0.2, 1.18, -4.25, rackFrameMat, isRealistic ? 0x94a3b8 : 0xa855f7);
    const itemPalette = [0xef4444, 0xf59e0b, 0x10b981, 0x38bdf8, 0xec4899, 0xf8fafc].map(
      (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.3 })
    );
    for (let tier = 0; tier < 3; tier++) {
      const sy = 0.55 + tier * 0.65;
      for (let slot = 0; slot < 8; slot++) {
        const sx = -2.6 + slot * 0.78;
        addBox(0.45, 0.38, 0.45, sx, sy, -4.05, itemPalette[(tier * 8 + slot) % itemPalette.length]);
      }
    }

    // 3. CRISP 3D LIVE CCTV SCREENS & LASER FOV CONES
    videoMeshesRef.current = {};
    coneMeshesRef.current = {};

    Object.entries(CAM_3D_ANCHORS).forEach(([chStr, cfg]) => {
      const ch = Number(chStr);
      const hasCam = cameras.some((c, idx) => (c.channel || idx + 1) === ch);
      const screenGeo = new THREE.PlaneGeometry(2.85, 1.65);
      const screenMat = new THREE.MeshBasicMaterial({
        color: videoTexturesRef.current[ch] ? 0xffffff : 0x1e293b,
        map: videoTexturesRef.current[ch] || null,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: hasCam || cameras.length === 0 ? 0.98 : 0.3,
      });
      const screenMesh = new THREE.Mesh(screenGeo, screenMat);
      screenMesh.position.set(...cfg.screenPos);
      screenMesh.rotation.y = cfg.screenRotY;
      screenMesh.visible = show3DVideoWalls && (hasCam || cameras.length === 0);
      scene.add(screenMesh);
      videoMeshesRef.current[ch] = screenMesh;

      const borderEdges = new THREE.EdgesGeometry(screenGeo);
      screenMesh.add(new THREE.LineSegments(borderEdges, new THREE.LineBasicMaterial({ color: cfg.color })));

      const coneGeo = new THREE.ConeGeometry(1.4, 3.4, 4, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        wireframe: true,
        transparent: true,
        opacity: isRealistic ? 0.12 : 0.22,
      });
      const coneMesh = new THREE.Mesh(coneGeo, coneMat);
      coneMesh.position.set(cfg.pos[0], cfg.pos[1] - 1.0, cfg.pos[2]);
      coneMesh.lookAt(...cfg.lookAt);
      coneMesh.visible = showLaserCones && (hasCam || cameras.length === 0);
      scene.add(coneMesh);
      coneMeshesRef.current[ch] = coneMesh;
    });

    const blocksGroup = new THREE.Group();
    scene.add(blocksGroup);
    blocksGroupRef.current = blocksGroup;

    const actionBeaconsGroup = new THREE.Group();
    scene.add(actionBeaconsGroup);
    actionBeaconsGroupRef.current = actionBeaconsGroup;

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

    const create3DAvatar = (ent: Tracked3DEntity): THREE.Group => {
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
        const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 18);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65 });
        for (const wz of [0.52, -0.52]) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(0, 0.28, wz);
          g.add(w);
        }
        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.2, 0.85, 8, 16),
          new THREE.MeshStandardMaterial({ color: isRealistic ? 0xdc2626 : 0xfbbf24, metalness: 0.6, roughness: 0.22 })
        );
        body.rotation.x = Math.PI / 2;
        body.position.set(0, 0.56, 0);
        g.add(body);
      } else if (ent.kind === 'CAR') {
        const carMat = new THREE.MeshStandardMaterial({
          color: isRealistic ? 0xf8fafc : 0x38bdf8,
          metalness: 0.7,
          roughness: 0.2,
        });
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.52, 3.25), carMat);
        chassis.position.y = 0.4;
        g.add(chassis);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.44, 1.72), carMat);
        cabin.position.set(0, 0.84, -0.08);
        g.add(cabin);
      } else {
        const shirtHex =
          ent.kind === 'CUSTOMER' ? 0x10b981 : ent.kind === 'STAFF' ? 0x3b82f6 : 0x94a3b8;
        const shirtMat = new THREE.MeshStandardMaterial({
          color: shirtHex,
          roughness: 0.32,
          emissive: new THREE.Color(shirtHex),
          emissiveIntensity: isRealistic ? 0.06 : 0.22,
        });
        const pantsMat = new THREE.MeshStandardMaterial({
          color: isRealistic ? 0x1e293b : shirtHex,
          roughness: 0.5,
        });
        const skinMat = new THREE.MeshStandardMaterial({
          color: isRealistic ? 0xf1c27d : shirtHex,
          roughness: 0.4,
        });

        const legGeo = new THREE.CapsuleGeometry(0.08, 0.54, 6, 12);
        const leftLeg = new THREE.Mesh(legGeo, pantsMat);
        leftLeg.position.set(-0.11, 0.38, 0);
        leftLeg.name = 'leftLeg';
        g.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeo, pantsMat);
        rightLeg.position.set(0.11, 0.38, 0);
        rightLeg.name = 'rightLeg';
        g.add(rightLeg);

        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.44, 8, 16), shirtMat);
        torso.position.set(0, 1.03, 0);
        torso.scale.set(1.12, 1, 0.78);
        torso.castShadow = true;
        g.add(torso);

        const armGeo = new THREE.CapsuleGeometry(0.058, 0.42, 6, 10);
        const leftArm = new THREE.Mesh(armGeo, shirtMat);
        leftArm.position.set(-0.28, 1.02, 0);
        leftArm.name = 'leftArm';
        g.add(leftArm);

        const rightArm = new THREE.Mesh(armGeo, shirtMat);
        rightArm.position.set(0.28, 1.02, 0);
        rightArm.name = 'rightArm';
        g.add(rightArm);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.175, 18, 18), skinMat);
        head.position.set(0, 1.54, 0);
        g.add(head);
      }

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.54, 32),
        new THREE.MeshBasicMaterial({ color: ent.color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.035;
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
          g.add(buildOverheadCardSprite(ent, img));
        };
        img.src = ent.cropDataUrl;
      } else {
        g.add(buildOverheadCardSprite(ent));
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
        goal.theta += 0.0024;
      }

      const damp = 0.12;
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

      const ga = gallaAnimRef.current;
      ga.openRatio += (ga.targetOpen - ga.openRatio) * 0.14;
      gallaDrawerGroup.position.z = 1.85 - ga.openRatio * 0.42;
      (drawerEdges.material as THREE.LineBasicMaterial).color.setHex(ga.billed ? 0x10b981 : 0xf43f5e);

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

      if (speechGroup.children.length > 0) {
        speechGroup.children[0].position.y = 2.85 + Math.sin(clock * 2.2) * 0.05;
      }

      const activeIds = new Set<string>();
      const nowMs = Date.now();

      entitiesRef.current.forEach((ent, idx) => {
        activeIds.add(ent.id);
        const dx = ent.targetX - ent.curX;
        const dz = ent.targetZ - ent.curZ;
        const speed = Math.hypot(dx, dz);
        ent.curX += dx * 0.12;
        ent.curZ += dz * 0.12;

        const tagStamp = `${Math.floor(ent.dwellSec / 2)}-${ent.label}-${ent.actionText || ''}-${Boolean(ent.cropDataUrl)}`;
        let rec = entityMeshMap[ent.id];
        if (!rec) {
          const grp = create3DAvatar(ent);
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

        if (ent.trail.length >= 2) {
          const pts3d = ent.trail.map(([tx, tz]) => new THREE.Vector3(tx, 0.035, tz));
          pts3d.push(new THREE.Vector3(ent.curX, 0.035, ent.curZ));
          const existingLine = trailLineMap[ent.id];
          if (existingLine) {
            existingLine.geometry.dispose();
            existingLine.geometry = new THREE.BufferGeometry().setFromPoints(pts3d);
          } else {
            const ln = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(pts3d),
              new THREE.LineBasicMaterial({ color: ent.color, transparent: true, opacity: 0.8 })
            );
            trailLineMap[ent.id] = ln;
            trailsGroup.add(ln);
          }
        }
      });

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

  // Build unified Live Shop Actions Feed (Edge AI detections + Active Zones + Galla + Speech + Local 2D Zones)
  const liveActionItems = (() => {
    const items: Array<{ id: string; channel: number; text: string; tone: 'emerald' | 'amber' | 'rose' | 'cyan'; entity?: Tracked3DEntity }> = [];
    const seenTexts = new Set<string>();

    if (liveTelemetry?.galla?.state === 'OPEN' || (localGallaPulseAt && Date.now() - localGallaPulseAt < 7000)) {
      const gTxt = '💸 गल्ला दराज खुला (लाइव हलचल)!';
      seenTexts.add(gTxt);
      items.push({ id: 'act-galla', channel: 2, text: gTxt, tone: 'amber' });
    }

    liveEntities.forEach((ent) => {
      const txt = `Ch#${ent.channel} ${ent.actionText || ent.label}`;
      if (!seenTexts.has(txt)) {
        seenTexts.add(txt);
        items.push({
          id: `act-ent-${ent.id}`,
          channel: ent.channel,
          text: txt,
          tone: ent.kind === 'CUSTOMER' ? 'emerald' : ent.kind === 'BIKE' || ent.kind === 'CAR' ? 'amber' : 'cyan',
          entity: ent,
        });
      }
    });

    if (liveTelemetry?.channels) {
      Object.entries(liveTelemetry.channels).forEach(([chStr, chObj]) => {
        const ch = Number(chStr) || 1;
        (chObj?.activeZones || []).forEach((zn) => {
          const zTxt = `Ch#${ch} ज़ोन सक्रिय: ${zn}`;
          if (!seenTexts.has(zTxt)) {
            seenTexts.add(zTxt);
            items.push({ id: `act-zn-${ch}-${zn}`, channel: ch, text: zTxt, tone: 'cyan' });
          }
        });
      });
    }

    localActiveActions.forEach((la) => {
      const lTxt = `Ch#${la.channel} ${la.text}`;
      if (!seenTexts.has(lTxt)) {
        seenTexts.add(lTxt);
        items.push({ id: la.id, channel: la.channel, text: lTxt, tone: la.kind === 'GALLA' ? 'amber' : 'emerald' });
      }
    });

    return items.slice(0, 6);
  })();

  // Sync 3D Zone Action Beacons on the 3D Map Floor/Ceiling
  useEffect(() => {
    const grp = actionBeaconsGroupRef.current;
    if (!grp) return;
    while (grp.children.length > 0) {
      const ch = grp.children[0];
      grp.remove(ch);
      disposeObject3D(ch);
    }

    const perChannelAction = new Map<number, string>();
    liveActionItems.forEach((it) => {
      if (!perChannelAction.has(it.channel) && !it.entity) {
        perChannelAction.set(it.channel, it.text);
      }
    });

    perChannelAction.forEach((txt, ch) => {
      const anchor = CAM_3D_ANCHORS[ch] || CAM_3D_ANCHORS[1];
      const sp = buildZoneActionBeaconSprite(txt, anchor.hex);
      sp.position.set(anchor.zoneBounds.xCenter, 2.55, anchor.zoneBounds.zCenter);
      grp.add(sp);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.15, 36),
        new THREE.MeshBasicMaterial({ color: anchor.color, side: THREE.DoubleSide, transparent: true, opacity: 0.72 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(anchor.zoneBounds.xCenter, 0.04, anchor.zoneBounds.zCenter);
      grp.add(ring);
    });
  }, [liveActionItems]);

  return (
    <div ref={wrapperRef} className={`space-y-3 ${isFullscreen ? 'bg-slate-950 p-4 overflow-y-auto' : ''}`}>
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

      {/* Top 3D Control Header */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950/60 to-emerald-950/40 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
            <Compass className={`w-4.5 h-4.5 ${autoRotate ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs sm:text-sm font-black text-white tracking-wide">
                {visualStyle === 'REALISTIC_3D'
                  ? '🌍 ULTRA-REALISTIC 3D DAIRY + TESLA LIVE SYNC'
                  : visualStyle === 'TESLA_FSD'
                  ? '🛸 TESLA FSD DARK SPATIAL RADAR 3D'
                  : '✨ 3D OCCUPANCY VOXEL DEPTH VIEW'}
              </h4>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                  edgeTelemetryFresh
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                    : isVideoTestMode || browserYoloFallback
                    ? 'bg-sky-500/20 text-sky-300 border-sky-400/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                }`}
              >
                {edgeTelemetryFresh
                  ? '● 60FPS EDGE AI LIVE'
                  : isVideoTestMode
                  ? `● TEST VIDEO 3D Ch#${yoloScanChannel}`
                  : browserYoloFallback
                  ? `● BROWSER YOLO Ch#${yoloScanChannel}`
                  : '● 60FPS SMOOTH 3D'}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              भरा हुआ 3D डेयरी रैक, दूध पतीला, भट्टी, फ्रीजर, लाइव कैमरा स्क्रीन और स्मूथ 60FPS Tesla ट्रैकिंग (ज़ीरो लैग)।
            </p>
          </div>
        </div>

        {/* Mode & Camera Angle Controls */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-emerald-500/35">
            <button
              type="button"
              onClick={() => setVisualStyle('REALISTIC_3D')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                visualStyle === 'REALISTIC_3D'
                  ? 'bg-emerald-600 text-white keep-white-text shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>रियलिस्टिक डेयरी 3D</span>
            </button>
            <button
              type="button"
              onClick={() => setVisualStyle('TESLA_FSD')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                visualStyle === 'TESLA_FSD'
                  ? 'bg-cyan-600 text-white keep-white-text shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Tesla डार्क 3D</span>
            </button>
            <button
              type="button"
              onClick={() => setVisualStyle('OCCUPANCY_VOXEL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                visualStyle === 'OCCUPANCY_VOXEL'
                  ? 'bg-purple-600 text-white keep-white-text shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>3D पॉइंट-क्लाउड</span>
            </button>
          </div>

          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(
              [
                ['TESLA_ISO', '3D एंगल'],
                ['DRONE_TOP', 'ड्रोन टॉप'],
                ['COUNTER', 'काउंटर'],
                ['GALLA', 'गल्ला'],
                ['STREET', 'सड़क'],
              ] as const
            ).map(([key, lbl]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyCameraPreset(key)}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
                  activePreset === key ? 'bg-cyan-600 text-white keep-white-text' : 'text-slate-400 hover:text-white'
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
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
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
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3D स्क्रीन</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLaserCones(!showLaserCones)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1 transition ${
              showLaserCones
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>लेज़र</span>
          </button>

          {!edgeTelemetryFresh && !isVideoTestMode && (
            <button
              type="button"
              onClick={() => setBrowserYoloFallback(!browserYoloFallback)}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition ${
                browserYoloFallback
                  ? 'bg-sky-600 text-white keep-white-text border-sky-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title="जब PC पर Edge AI बंद हो तब ब्राउज़र के अंदर YOLO चलाने के लिए"
            >
              फोन YOLO {browserYoloFallback ? 'ON' : 'OFF'}
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white text-[11px] font-semibold"
            title="फुलस्क्रीन 3D"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* MAIN 3D WEBGL VIEWPORT */}
      <div className="relative rounded-3xl overflow-hidden bg-[#0b111e] border-2 border-cyan-500/30 shadow-2xl select-none">
        <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-20">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-mono font-bold text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>LIVE 3D TRACKS: {liveEntities.length}</span>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-bold text-white border border-white/10">
              🟢 ग्राहक • 🔵 स्टाफ • 🟠 बाइक/वाहन
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
              className="px-2.5 py-1 rounded-xl bg-black/75 hover:bg-slate-800 text-[10px] font-bold text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> रीसेट एंगल
            </button>
          </div>
        </div>

        {/* LIVE SHOP ACTIONS TICKER BAR RIGHT ON THE 3D MAP */}
        {liveActionItems.length > 0 && (
          <div className="absolute top-12 left-3 right-3 flex flex-wrap items-center gap-1.5 z-20 pointer-events-auto">
            {liveActionItems.map((act) => (
              <button
                key={act.id}
                type="button"
                onClick={() => {
                  if (act.entity) focusOnEntity(act.entity);
                  else if (act.channel === 1) applyCameraPreset('COUNTER');
                  else if (act.channel === 2) applyCameraPreset('GALLA');
                  else if (act.channel >= 4) applyCameraPreset('STREET');
                  else applyCameraPreset('TESLA_ISO');
                }}
                className={`px-2.5 py-1 rounded-xl backdrop-blur-md text-[10px] font-extrabold border shadow-lg flex items-center gap-1.5 transition hover:scale-[1.02] ${
                  act.tone === 'amber'
                    ? 'bg-amber-950/90 text-amber-200 border-amber-400/50'
                    : act.tone === 'emerald'
                    ? 'bg-emerald-950/90 text-emerald-200 border-emerald-400/50'
                    : 'bg-sky-950/90 text-sky-200 border-sky-400/50'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
                <span>⚡ {act.text}</span>
              </button>
            ))}
          </div>
        )}

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

        {/* Bottom-Left Live 3D Tracked Objects Inspector */}
        <div className="absolute bottom-3 left-3 w-64 sm:w-72 bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl p-2.5 space-y-1.5 text-[11px] z-20">
          <div className="flex items-center justify-between text-[10px] font-bold text-cyan-300 border-b border-white/10 pb-1">
            <span>🎯 लाइव 3D ट्रैक ({liveEntities.length})</span>
            <span className="font-mono text-emerald-400">{edgeTelemetryFresh ? 'EDGE LIVE' : '60FPS'}</span>
          </div>
          <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
            {liveEntities.length === 0 ? (
              <div className="text-[10px] text-slate-400 py-0.5">
                अभी कैमरे के सामने कोई हलचल नहीं है — ग्राहक आते ही 3D अवतार दिखेगा।
              </div>
            ) : (
              liveEntities.map((ent) => (
                <button
                  key={ent.id}
                  type="button"
                  onClick={() => focusOnEntity(ent)}
                  className={`w-full px-2 py-1 rounded-lg flex items-center justify-between gap-2 text-[10px] transition text-left ${
                    focusedEntityId === ent.id ? 'bg-cyan-500/20 border border-cyan-500/40' : 'hover:bg-slate-900'
                  }`}
                >
                  <span className="text-white font-semibold truncate flex items-center gap-1">
                    <Crosshair className="w-3 h-3 text-cyan-400 shrink-0" />
                    {ent.label}
                  </span>
                  <span className="font-mono text-emerald-400 shrink-0">
                    {ent.dwellSec > 0 ? `${ent.dwellSec}s` : `${ent.confidence}%`}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Bottom-Right Floating PiP Camera Inspector */}
        {selectedCam && (
          <div className="absolute bottom-3 right-3 w-56 sm:w-64 bg-black/85 backdrop-blur-md border border-cyan-500/40 rounded-2xl overflow-hidden shadow-2xl z-20">
            <div className="px-2.5 py-1.5 bg-slate-950/90 border-b border-white/10 flex items-center justify-between text-[10px]">
              <span className="font-extrabold text-white truncate">
                📹 Ch#{selectedCam.channel || 1}: {selectedCam.name}
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
                  title="फुल स्क्रीन"
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
                  <Camera className="w-4 h-4 mr-1 animate-pulse" /> लाइव फ्रेम लोड हो रहा है...
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Camera Zone Selector Pills */}
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
                  ? 'bg-cyan-950/40 border-cyan-400 ring-1 ring-cyan-400/40'
                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold" style={{ color: cfg.hex }}>
                  3D ZONE #{ch} • {chDetCount} लाइव
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                  {camBlocks.length} AI ब्लॉक
                </span>
              </div>
              <div className="text-xs font-extrabold text-white truncate">{camObj ? camObj.name : cfg.title}</div>
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
                    <Sparkles className="w-2.5 h-2.5" /> +ब्लॉक
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Summary Strip */}
      <div className="px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span>
            माउस ड्रैग: 360° घुमाएँ • Right-Click ड्रैग: पैन • Scroll: ज़ूम • किसी भी लाइव ट्रैक पर क्लिक कर फ़ोकस करें
          </span>
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-indigo-400" /> AI ज़ोन: <strong className="text-white">{pairingBlocks.length}</strong>
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
