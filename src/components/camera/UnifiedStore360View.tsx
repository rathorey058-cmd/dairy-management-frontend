import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Compass, Play, Pause, Maximize2, Minimize2, Users,
  DoorOpen, RotateCcw, Mic, AlertTriangle, Crosshair, Activity, Package, Eye, EyeOff, SlidersHorizontal
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

export interface LiveStationState {
  active: boolean;
  intensity: number;
  channel?: number;
  label: string;
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
        worldX?: number;
        worldZ?: number;
        dwellSec: number;
        actionText?: string;
        cropDataUrl?: string;
      }>;
      activeZones?: string[];
    }
  >;
  stations?: Record<string, LiveStationState>;
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
  fusedChannels: number[];
  confidence: number;
  dwellSec: number;
  targetX: number;
  targetZ: number;
  curX: number;
  curZ: number;
  speedMps: number;
  trail: Array<[number, number]>;
  color: number;
  firstSeen: number;
  lastSeen: number;
  cropDataUrl?: string;
  source: 'EDGE_LIVE' | 'DEVICE_YOLO';
}

/**
 * PnP-Calibrated 3x3 Floor Homography Matrices (verified < 1.2% reprojection error across all 3 real shop cameras).
 * Maps normalized image footpoint (u, v, 1) -> Unified Shop World (X, Z) in meters:
 *   X in [-2.32, +2.32] inside shop (West=-X, East=+X)
 *   Z in [-5.00, +2.18] inside shop (Back=-Z, Front Counter=+2.15), Street Z in [+2.20, +7.80]
 */
const CAM_HOMOGRAPHY_UV_TO_XZ: Record<number, number[][]> = {
  1: [
    [-28.310034, -14.874101, 23.076021],
    [14.148384, -14.604635, 10.164607],
    [2.275582, 4.87486, 1.0],
  ],
  2: [
    [15.451802, 1.007518, -7.46958],
    [1.569499, 13.947695, -11.359648],
    [0.616603, 2.766211, 1.0],
  ],
  3: [
    [16.027016, 11.888742, -20.635326],
    [-13.815899, 16.259908, -5.117795],
    [0.314698, 3.708236, 1.0],
  ],
};

// All 9 Real Shop Stations with exact PnP-verified 3D centers & camera ROIs for live equipment tracking
const SHOP_STATIONS: Record<
  string,
  {
    label: string;
    shortLabel: string;
    pos: [number, number, number];
    ringRadius: number;
    colorHex: string;
    colorNum: number;
    rois: Array<[number, number, number, number, number]>;
  }
> = {
  patila: {
    label: 'दूध पतीला व काउंटर',
    shortLabel: 'दूध पतीला',
    pos: [-1.05, 1.48, 1.82],
    ringRadius: 0.72,
    colorHex: '#38bdf8',
    colorNum: 0x38bdf8,
    rois: [
      [1, 0.56, 0.26, 0.76, 0.50],
      [3, 0.05, 0.68, 0.24, 0.94],
    ],
  },
  laptop_galla: {
    label: 'लैपटॉप व गल्ला डेस्क',
    shortLabel: 'लैपटॉप / गल्ला',
    pos: [-1.35, 1.25, 1.16],
    ringRadius: 0.65,
    colorHex: '#f43f5e',
    colorNum: 0xf43f5e,
    rois: [
      [1, 0.60, 0.52, 0.86, 0.88],
      [3, 0.14, 0.34, 0.36, 0.68],
    ],
  },
  red_crates: {
    label: 'लाल क्रेट व कीप',
    shortLabel: 'लाल क्रेट',
    pos: [-0.45, 1.22, 0.78],
    ringRadius: 0.62,
    colorHex: '#fb7185',
    colorNum: 0xfb7185,
    rois: [
      [1, 0.26, 0.56, 0.49, 0.88],
      [2, 0.16, 0.56, 0.38, 0.92],
      [3, 0.38, 0.52, 0.62, 0.82],
    ],
  },
  basket_freezer: {
    label: '3-बास्केट ग्लास फ्रीजर',
    shortLabel: 'बास्केट फ्रीजर',
    pos: [0.36, 1.22, 0.88],
    ringRadius: 0.78,
    colorHex: '#22d3ee',
    colorNum: 0x22d3ee,
    rois: [
      [1, 0.15, 0.40, 0.45, 0.76],
      [2, 0.37, 0.56, 0.62, 0.96],
      [3, 0.42, 0.64, 0.78, 0.98],
    ],
  },
  visi_cooler: {
    label: 'ग्लास विज़ी-कूलर फ्रिज',
    shortLabel: 'विज़ी-कूलर',
    pos: [1.88, 2.15, 1.80],
    ringRadius: 0.62,
    colorHex: '#34d399',
    colorNum: 0x34d399,
    rois: [[1, 0.20, 0.04, 0.36, 0.44]],
  },
  deep_freezers: {
    label: 'चेस्ट डीप फ्रीजर #1 व #2',
    shortLabel: 'डीप फ्रीजर',
    pos: [-1.96, 1.18, -1.45],
    ringRadius: 0.82,
    colorHex: '#a855f7',
    colorNum: 0xa855f7,
    rois: [
      [2, 0.01, 0.05, 0.21, 0.82],
      [3, 0.30, 0.12, 0.72, 0.56],
    ],
  },
  scale: {
    label: 'इलेक्ट्रॉनिक तौल कांटा',
    shortLabel: 'तौल कांटा',
    pos: [-1.95, 1.32, -1.45],
    ringRadius: 0.45,
    colorHex: '#10b981',
    colorNum: 0x10b981,
    rois: [
      [2, 0.00, 0.18, 0.08, 0.34],
      [3, 0.44, 0.16, 0.55, 0.28],
    ],
  },
  mawa_bhatti: {
    label: 'मावा मशीन / भट्टी',
    shortLabel: 'मावा मशीन',
    pos: [1.55, 1.35, -1.05],
    ringRadius: 0.78,
    colorHex: '#f97316',
    colorNum: 0xf97316,
    rois: [[2, 0.65, 0.24, 0.88, 0.68]],
  },
  milk_cans: {
    label: '50L दूध कैन ज़ोन',
    shortLabel: 'दूध कैन',
    pos: [1.90, 1.12, 1.05],
    ringRadius: 0.56,
    colorHex: '#fbbf24',
    colorNum: 0xfbbf24,
    rois: [
      [1, 0.10, 0.38, 0.24, 0.64],
      [2, 0.76, 0.76, 0.98, 0.99],
    ],
  },
};

const PORTABLE_CLASS_LABELS: Record<string, string> = {
  laptop: '💻 लैपटॉप',
  backpack: '🎒 बैग',
  handbag: '👜 हैंडबैग',
  suitcase: '🧳 सामान',
  bottle: '🍼 बोतल',
  cup: '🥛 कीप / कप',
  bowl: '🥣 बर्तन',
  'cell phone': '📱 मोबाइल',
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

function projectImageUVToWorldXZ(
  ch: number,
  u: number,
  v: number,
  isVehicle = false
): { x: number; z: number } {
  const H = CAM_HOMOGRAPHY_UV_TO_XZ[ch];
  if (H) {
    const w = H[2][0] * u + H[2][1] * v + H[2][2];
    if (Math.abs(w) > 0.08) {
      const wx = (H[0][0] * u + H[0][1] * v + H[0][2]) / w;
      const wz = (H[1][0] * u + H[1][1] * v + H[1][2]) / w;
      if (isVehicle || (ch === 1 && v < 0.39)) {
        return {
          x: Math.max(-5.2, Math.min(5.2, wx)),
          z: Math.max(2.35, Math.min(7.8, wz)),
        };
      }
      return {
        x: Math.max(-2.22, Math.min(2.22, wx)),
        z: Math.max(-4.85, Math.min(6.6, wz)),
      };
    }
  }
  return { x: (u - 0.5) * 4.2, z: (0.5 - v) * 5.0 };
}

function mapDetectionToWorld(
  box: { x: number; y: number; width: number; height: number },
  channel: number,
  explicitRole?: string,
  className?: string,
  confidence = 85,
  explicitWorldX?: number,
  explicitWorldZ?: number
): {
  x: number;
  z: number;
  kind: Tracked3DEntity['kind'];
  label: string;
  color: number;
} {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const isVeh =
    explicitRole === 'BIKE' ||
    explicitRole === 'CAR' ||
    ['motorcycle', 'bicycle', 'car', 'truck', 'bus'].includes(className || '');
  const isPortableObj = explicitRole === 'CAN' || Boolean(className && PORTABLE_CLASS_LABELS[className]);

  let pt: { x: number; z: number };
  if (typeof explicitWorldX === 'number' && typeof explicitWorldZ === 'number') {
    pt = { x: explicitWorldX, z: explicitWorldZ };
  } else if (className === 'person' && channel === 3 && cx < 0.36 && cy >= 0.28 && cy <= 0.68) {
    pt = { x: -1.85, z: 0.85 };
  } else if (className === 'person' && channel === 1 && cx > 0.65 && cy > 0.62) {
    pt = { x: -1.82, z: 0.92 };
  } else {
    const vFoot = Math.min(0.98, box.y + box.height * (isVeh ? 0.85 : 0.92));
    pt = projectImageUVToWorldXZ(channel, cx, vFoot, isVeh);
  }

  if (isPortableObj) {
    const objLbl = (className && PORTABLE_CLASS_LABELS[className]) || className || 'डेयरी सामान';
    return {
      x: pt.x,
      z: pt.z,
      kind: 'DAIRY_ASSET',
      label: objLbl,
      color: 0x14b8a6,
    };
  }

  if (explicitRole === 'BIKE' || className === 'motorcycle' || className === 'bicycle') {
    return {
      x: pt.x,
      z: Math.max(2.65, pt.z),
      kind: 'BIKE',
      label: `🏍️ बाइक/स्कूटी (${confidence}%)`,
      color: 0xf59e0b,
    };
  }

  if (explicitRole === 'CAR' || className === 'car' || className === 'truck' || className === 'bus') {
    return {
      x: pt.x,
      z: Math.max(3.2, pt.z),
      kind: 'CAR',
      label: `🚗 कार/वाहन (${confidence}%)`,
      color: 0x38bdf8,
    };
  }

  const role =
    explicitRole ||
    (pt.z > 3.25
      ? 'PASSERBY'
      : pt.z >= 2.05 && pt.z <= 3.25 && pt.x >= -2.35 && pt.x <= 2.3
      ? 'CUSTOMER'
      : 'STAFF');

  if (role === 'PASSERBY') {
    return { x: pt.x, z: pt.z, kind: 'PASSERBY', label: '🚶 सड़क व्यक्ति', color: 0x94a3b8 };
  }

  if (role === 'CUSTOMER') {
    return { x: pt.x, z: pt.z, kind: 'CUSTOMER', label: '👤 ग्राहक @ काउंटर', color: 0x10b981 };
  }

  const subZone =
    pt.x < -1.15 && pt.z > 0.3
      ? '👨‍💼 स्टाफ @ लैपटॉप/गल्ला'
      : pt.x < -1.1
      ? '👨‍💼 स्टाफ @ डीप फ्रीजर'
      : pt.x > 0.9
      ? '👨‍💼 स्टाफ @ मावा/कैन ज़ोन'
      : '👨‍💼 दुकान स्टाफ';

  return { x: pt.x, z: pt.z, kind: 'STAFF', label: subZone, color: 0x3b82f6 };
}

interface RawWorldCandidate {
  rawId: string;
  kind: Tracked3DEntity['kind'];
  label: string;
  customLabel?: string;
  actionText?: string;
  channel: number;
  confidence: number;
  dwellSec: number;
  x: number;
  z: number;
  color: number;
  cropDataUrl?: string;
  source: 'EDGE_LIVE' | 'DEVICE_YOLO';
}

function fuseMultiCameraCandidates(
  candidates: RawWorldCandidate[],
  prevEntities: Tracked3DEntity[],
  now: number
): Tracked3DEntity[] {
  const clusters: RawWorldCandidate[][] = [];
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);

  const sameCategory = (a: Tracked3DEntity['kind'], b: Tracked3DEntity['kind']) => {
    if (a === b) return true;
    const humanSet = new Set(['CUSTOMER', 'STAFF', 'PASSERBY']);
    return humanSet.has(a) && humanSet.has(b);
  };

  for (const cand of sorted) {
    let joined: RawWorldCandidate[] | null = null;
    let bestDist = cand.kind === 'DAIRY_ASSET' ? 0.85 : 1.35;
    for (const cl of clusters) {
      if (cl.some((m) => m.channel === cand.channel)) continue;
      if (!sameCategory(cl[0].kind, cand.kind)) continue;
      const meanX = cl.reduce((s, m) => s + m.x, 0) / cl.length;
      const meanZ = cl.reduce((s, m) => s + m.z, 0) / cl.length;
      const dist = Math.hypot(cand.x - meanX, cand.z - meanZ);
      if (dist < bestDist) {
        bestDist = dist;
        joined = cl;
      }
    }
    if (joined) joined.push(cand);
    else clusters.push([cand]);
  }

  const usedPrevIds = new Set<string>();
  return clusters.map((cl, idx) => {
    const totalW = cl.reduce((s, m) => s + Math.max(20, m.confidence), 0);
    const fusedX = cl.reduce((s, m) => s + m.x * Math.max(20, m.confidence), 0) / totalW;
    const fusedZ = cl.reduce((s, m) => s + m.z * Math.max(20, m.confidence), 0) / totalW;
    const primary = cl[0];
    const fusedChannels = Array.from(new Set(cl.map((m) => m.channel))).sort((a, b) => a - b);
    const fusedConf =
      cl.length > 1
        ? Math.min(99, Math.round(Math.max(...cl.map((m) => m.confidence)) + (cl.length - 1) * 6))
        : primary.confidence;
    const bestCrop = cl.find((m) => m.cropDataUrl)?.cropDataUrl;
    const bestCustom = cl.find((m) => m.customLabel)?.customLabel;
    const preferCustomer = cl.find((m) => m.kind === 'CUSTOMER');
    const finalKind = preferCustomer ? 'CUSTOMER' : primary.kind;
    const finalColor = preferCustomer ? 0x10b981 : primary.color;

    let bestPrev: Tracked3DEntity | undefined;
    let bestPrevDist = finalKind === 'DAIRY_ASSET' ? 0.9 : 1.65;
    for (const old of prevEntities) {
      if (usedPrevIds.has(old.id) || !sameCategory(old.kind, finalKind)) continue;
      const d = Math.hypot(old.targetX - fusedX, old.targetZ - fusedZ);
      if (d < bestPrevDist) {
        bestPrevDist = d;
        bestPrev = old;
      }
    }
    if (bestPrev) usedPrevIds.add(bestPrev.id);

    const id = bestPrev ? bestPrev.id : cl.length > 1 ? `fused-${fusedChannels.join('_')}-${idx}` : primary.rawId;
    const firstSeen = bestPrev ? bestPrev.firstSeen : now;
    const dtSec = bestPrev ? Math.max(0.2, (now - bestPrev.lastSeen) / 1000) : 1.0;
    const rawStep = bestPrev ? Math.hypot(fusedX - bestPrev.targetX, fusedZ - bestPrev.targetZ) : 0;
    const speedMps = bestPrev ? Number((rawStep / dtSec).toFixed(2)) : 0;

    const dwellSec = Math.max(
      ...cl.map((m) => m.dwellSec || 0),
      Math.max(0, Math.round((now - firstSeen) / 1000))
    );
    const curX = bestPrev ? bestPrev.curX : fusedX;
    const curZ = bestPrev ? bestPrev.curZ : fusedZ;
    const trail: Array<[number, number]> = bestPrev ? [...bestPrev.trail] : [[curX, curZ]];
    const lastPt = trail[trail.length - 1];
    if (!lastPt || Math.hypot(fusedX - lastPt[0], fusedZ - lastPt[1]) > 0.14) {
      trail.push([fusedX, fusedZ]);
      if (trail.length > 26) trail.shift();
    }

    return {
      id,
      kind: finalKind,
      label: bestCustom || (preferCustomer ? preferCustomer.label : primary.label),
      actionText: preferCustomer?.actionText || primary.actionText,
      channel: primary.channel,
      fusedChannels,
      confidence: fusedConf,
      dwellSec,
      targetX: fusedX,
      targetZ: fusedZ,
      curX,
      curZ,
      speedMps,
      trail,
      color: finalColor,
      firstSeen,
      lastSeen: now,
      cropDataUrl: bestCrop || bestPrev?.cropDataUrl,
      source: primary.source,
    };
  });
}

function createUnifiedShopFloorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1b283d';
  ctx.fillRect(0, 0, 512, 512);
  const step = 64;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#24344d' : '#1e2d44';
      ctx.fillRect(x * step + 2, y * step + 2, step - 4, step - 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 3.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type MapDetailLevel = 'FULL' | 'ESSENTIAL' | 'CLEAN';

const CRISP_FONT = '"Noto Sans Devanagari", "Segoe UI", system-ui, -apple-system, sans-serif';

function makeCrispSpriteTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Disable mipmap downsampling blur so Hindi letters stay razor-sharp at every zoom distance
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function buildFixtureLabelSprite(text: string, hexColor = '#38bdf8'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 152;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(7, 12, 24, 0.94)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 752, 136, 32);
  ctx.fill();
  ctx.strokeStyle = hexColor;
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 54px ${CRISP_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 384, 78);

  const tex = makeCrispSpriteTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(1.88, 0.37, 1);
  return sp;
}

function buildStationActiveBadgeSprite(label: string, intensity: number, borderHex: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 720;
  c.height = 148;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(6, 78, 59, 0.96)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 704, 132, 30);
  ctx.fill();
  ctx.strokeStyle = borderHex;
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 5;
  ctx.fillStyle = '#fef08a';
  ctx.font = `800 44px ${CRISP_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`⚡ ${label} सक्रिय (${intensity}%)`, 360, 76);

  const tex = makeCrispSpriteTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(2.1, 0.43, 1);
  return sp;
}

function buildOverheadCardSprite(ent: Tracked3DEntity, cutImg?: HTMLImageElement): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 832;
  c.height = 264;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = 'rgba(8, 13, 25, 0.95)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 816, 248, 38);
  ctx.fill();

  const hexCol = '#' + ent.color.toString(16).padStart(6, '0');
  ctx.strokeStyle = ent.fusedChannels.length > 1 ? '#38bdf8' : hexCol;
  ctx.lineWidth = 7;
  ctx.stroke();

  let tx = 36;
  if (cutImg) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(22, 22, 168, 220, 24);
    ctx.clip();
    ctx.drawImage(cutImg, 22, 22, 168, 220);
    ctx.restore();
    tx = 214;
  }

  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 5;
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 44px ${CRISP_FONT}`;
  ctx.fillText(ent.label.slice(0, 23), tx, 76);

  const stateHint =
    (ent.kind === 'BIKE' || ent.kind === 'CAR') && ent.speedMps > 0.22
      ? 'गुज़र रहा है (Moving)'
      : ent.actionText;

  if (stateHint) {
    ctx.fillStyle = '#fde047';
    ctx.font = `700 33px ${CRISP_FONT}`;
    ctx.fillText(`⚡ ${stateHint.slice(0, 26)}`, tx, 138);
  }

  const mins = Math.floor(ent.dwellSec / 60);
  const secs = ent.dwellSec % 60;
  const dwellTxt = ent.dwellSec > 0 ? `${mins}:${String(secs).padStart(2, '0')}s` : 'LIVE';
  const chBadge =
    ent.fusedChannels.length > 1 ? `Ch#${ent.fusedChannels.join('+')}` : `Ch#${ent.channel}`;
  const confLabel = ent.confidence >= 45 ? `${ent.confidence}%` : 'LIVE';

  ctx.fillStyle = ent.fusedChannels.length > 1 ? '#38bdf8' : hexCol;
  ctx.font = `800 32px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(`${chBadge} • ${dwellTxt} • ${confLabel}`, tx, stateHint ? 206 : 168);

  const tex = makeCrispSpriteTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(2.02, 0.64, 1);
  sp.position.set(
    0,
    ent.kind === 'CAR' ? 1.66 : ent.kind === 'BIKE' ? 1.46 : ent.kind === 'DAIRY_ASSET' ? 1.18 : 2.16,
    0
  );
  sp.name = 'overheadCard';
  return sp;
}

function build3DSpeechBubbleSprite(quoteText: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 216;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = 'rgba(6, 78, 59, 0.96)';
  ctx.beginPath();
  ctx.roundRect(10, 10, 1004, 168, 40);
  ctx.fill();

  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 7;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(486, 178);
  ctx.lineTo(512, 210);
  ctx.lineTo(538, 178);
  ctx.closePath();
  ctx.fillStyle = '#34d399';
  ctx.fill();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 5;
  ctx.fillStyle = '#a7f3d0';
  ctx.font = `800 34px ${CRISP_FONT}`;
  ctx.fillText('🎙️ काउंटर लाइव आवाज़:', 44, 64);

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 46px ${CRISP_FONT}`;
  const clipped = quoteText.length > 36 ? quoteText.slice(0, 35) + '…' : quoteText;
  ctx.fillText(`“${clipped}”`, 44, 134);

  const tex = makeCrispSpriteTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(2.6, 0.55, 1);
  sp.position.set(-0.95, 2.85, 2.35);
  sp.name = 'liveSpeechSprite';
  return sp;
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
  liveTelemetry,
  isVideoTestMode = false,
  localSpeechQuote,
  localGallaPulseAt,
  localActiveActions = [],
  todayStats,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [detailLevel, setDetailLevel] = useState<MapDetailLevel>(() => {
    try {
      const saved = localStorage.getItem('dukan_3d_detail_level');
      if (saved === 'FULL' || saved === 'ESSENTIAL' || saved === 'CLEAN') return saved;
      if (localStorage.getItem('dukan_3d_map_details') === '0') return 'CLEAN';
      return 'FULL';
    } catch {
      return 'FULL';
    }
  });
  const [mountGracePassed, setMountGracePassed] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [activePreset, setActivePreset] = useState<'DEFAULT_3D' | 'TOP_MAP' | 'COUNTER' | 'HALL' | 'STREET'>('DEFAULT_3D');
  const [liveEntities, setLiveEntities] = useState<Tracked3DEntity[]>([]);
  const [activeStations, setActiveStations] = useState<Record<string, LiveStationState>>({});
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null);
  const detailLevelRef = useRef<MapDetailLevel>(detailLevel);

  const orbitCurRef = useRef({
    theta: 0.18,
    phi: 0.67,
    radius: 9.3,
    targetX: 0,
    targetY: 0.32,
    targetZ: 0.35,
  });
  const orbitGoalRef = useRef({
    theta: 0.18,
    phi: 0.67,
    radius: 9.3,
    targetX: 0,
    targetY: 0.32,
    targetZ: 0.35,
  });
  const dragInteractionRef = useRef({
    isDragging: false,
    isPanning: false,
    lastX: 0,
    lastY: 0,
  });

  const entitiesRef = useRef<Tracked3DEntity[]>([]);
  const activeStationsRef = useRef<Record<string, LiveStationState>>({});
  const localStationExpiryRef = useRef<Record<string, { until: number; intensity: number }>>({});
  const prevRoiPatchRef = useRef<Record<string, Uint8Array>>({});
  const prevMotionGridRef = useRef<Record<number, Uint8Array>>({});
  const occupancyDataRef = useRef<Float32Array>(new Float32Array(24 * 32));
  const loadedCamImagesRef = useRef<Record<number, HTMLImageElement>>({});

  const gallaAnimRef = useRef<{ openRatio: number; targetOpen: number; billed: boolean; pulseClock: number }>({
    openRatio: 0,
    targetOpen: 0,
    billed: true,
    pulseClock: 0,
  });

  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const blocksGroupRef = useRef<THREE.Group | null>(null);
  const speechGroupRef = useRef<THREE.Group | null>(null);
  const stationBadgesGroupRef = useRef<THREE.Group | null>(null);
  const fixedLabelsGroupRef = useRef<THREE.Group | null>(null);

  const updateDetailLevel = useCallback((next: MapDetailLevel) => {
    detailLevelRef.current = next;
    setDetailLevel(next);
    try {
      localStorage.setItem('dukan_3d_detail_level', next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    detailLevelRef.current = detailLevel;
    const isFull = detailLevel === 'FULL';
    const showEssential = detailLevel !== 'CLEAN';
    if (fixedLabelsGroupRef.current) fixedLabelsGroupRef.current.visible = isFull;
    if (blocksGroupRef.current) blocksGroupRef.current.visible = isFull;
    if (speechGroupRef.current) speechGroupRef.current.visible = showEssential;
    if (stationBadgesGroupRef.current) {
      stationBadgesGroupRef.current.children.forEach((ch) => {
        if (ch.name === 'stationTextBadge') ch.visible = isFull;
      });
    }
    if (dynamicGroupRef.current) {
      dynamicGroupRef.current.children.forEach((grp) => {
        const isPortableAsset = grp.userData?.entityKind === 'DAIRY_ASSET';
        grp.visible = isPortableAsset ? isFull : true;
        const card = grp.getObjectByName('overheadCard');
        if (card) card.visible = isPortableAsset ? isFull : showEssential;
      });
    }
  }, [detailLevel]);

  const applyCameraPreset = useCallback((preset: 'DEFAULT_3D' | 'TOP_MAP' | 'COUNTER' | 'HALL' | 'STREET') => {
    setActivePreset(preset);
    setFocusedEntityId(null);
    const g = orbitGoalRef.current;
    if (preset === 'TOP_MAP') {
      g.theta = 0;
      g.phi = 0.14;
      g.radius = 10.6;
      g.targetX = 0;
      g.targetZ = 0.45;
    } else if (preset === 'DEFAULT_3D') {
      g.theta = 0.18;
      g.phi = 0.67;
      g.radius = 9.3;
      g.targetX = 0;
      g.targetZ = 0.35;
    } else if (preset === 'COUNTER') {
      g.theta = 0.1;
      g.phi = 0.74;
      g.radius = 5.4;
      g.targetX = -0.55;
      g.targetZ = 1.65;
    } else if (preset === 'HALL') {
      g.theta = -0.3;
      g.phi = 0.64;
      g.radius = 6.6;
      g.targetX = 0;
      g.targetZ = -1.65;
    } else if (preset === 'STREET') {
      g.theta = -0.14;
      g.phi = 0.72;
      g.radius = 8.4;
      g.targetX = 0;
      g.targetZ = 3.6;
    }
  }, []);

  const focusOnEntity = useCallback((ent: Tracked3DEntity) => {
    setFocusedEntityId(ent.id);
    setAutoRotate(false);
    const g = orbitGoalRef.current;
    g.targetX = ent.curX;
    g.targetZ = ent.curZ;
    g.radius = 6.4;
    g.phi = 0.68;
  }, []);

  const focusOnStation = useCallback((stId: string) => {
    const st = SHOP_STATIONS[stId];
    if (!st) return;
    setAutoRotate(false);
    const g = orbitGoalRef.current;
    g.targetX = st.pos[0];
    g.targetZ = st.pos[2];
    g.radius = 6.2;
    g.phi = 0.66;
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
    const t = setTimeout(() => setMountGracePassed(true), 4500);
    return () => clearTimeout(t);
  }, []);

  const edgeTelemetryAgeMs = liveTelemetry?.updatedAt ? Date.now() - Number(liveTelemetry.updatedAt) : 0;
  const edgeTelemetryFresh = Boolean(
    liveTelemetry?.channels && (!liveTelemetry.updatedAt || (edgeTelemetryAgeMs >= -45000 && edgeTelemetryAgeMs < 45000))
  );

  const deriveHindiActionText = useCallback((kind: Tracked3DEntity['kind'], wx: number, wz: number, dwellSec: number) => {
    if (kind === 'DAIRY_ASSET') return 'लाइव सामान ट्रैक किया गया';
    if (kind === 'CAR') return 'सड़क पर कार/वाहन';
    if (kind === 'BIKE') return 'दुकान के बाहर दोपहिया वाहन';
    if (kind === 'CUSTOMER') {
      return dwellSec >= 4 ? `दूध काउंटर पर ग्राहक (${dwellSec}s)` : 'दूध काउंटर पर ग्राहक आया';
    }
    if (kind === 'PASSERBY') return 'दुकान के बाहर सड़क पर व्यक्ति';
    if (wx < -1.2 && wz > 0.3) return 'लैपटॉप व गल्ला डेस्क पर स्टाफ';
    if (wx < -1.1 && wz <= 0.3) return 'डीप फ्रीजर / कांटा ज़ोन में स्टाफ';
    if (wx > 0.9 && wz < 0.8) return 'मावा मशीन / कैन ज़ोन में स्टाफ';
    return 'दुकान के अंदर सक्रिय';
  }, []);

  useEffect(() => {
    if (!edgeTelemetryFresh && localActiveActions.length === 0) return;
    const now = Date.now();
    const rawCandidates: RawWorldCandidate[] = [];

    if (liveTelemetry?.channels && edgeTelemetryFresh) {
      Object.entries(liveTelemetry.channels).forEach(([chStr, chData]) => {
        const ch = Number(chStr) || 1;
        const camImg = loadedCamImagesRef.current[ch];
        (chData?.detections || []).forEach((d) => {
          // Guard against legacy low-confidence (<30%) static appliance ghosts near back wall
          if (d.className === 'person' && d.confidence < 30) return;
          if (d.role === 'CAN' && ch === 1 && d.box.y < 0.36) return;
          const p3 = mapDetectionToWorld(
            d.box,
            ch,
            d.role,
            d.className,
            d.confidence,
            d.worldX,
            d.worldZ
          );
          if (d.className === 'person' && p3.z < -4.2 && d.confidence < 62) return;
          let liveCrop = d.cropDataUrl;
          if (!liveCrop && d.role !== 'CAN' && camImg && camImg.naturalWidth > 0) {
            liveCrop = cropDetectionToDataUrl(camImg, {
              className: d.className,
              confidence: d.confidence,
              box: d.box,
            });
          }
          rawCandidates.push({
            rawId: d.trackId,
            kind: p3.kind,
            label: p3.label,
            customLabel: d.customLabel,
            actionText: d.actionText || deriveHindiActionText(p3.kind, p3.x, p3.z, d.dwellSec || 0),
            channel: ch,
            confidence: d.confidence,
            dwellSec: d.dwellSec || 0,
            x: p3.x,
            z: p3.z,
            color: p3.color,
            cropDataUrl: liveCrop,
            source: 'EDGE_LIVE',
          });
        });
      });
    }

    localActiveActions.forEach((act) => {
      if (act.kind === 'CUSTOMER' && act.normBox) {
        const p3 = mapDetectionToWorld(act.normBox, act.channel, 'CUSTOMER', 'person', 92);
        rawCandidates.push({
          rawId: act.id,
          kind: 'CUSTOMER',
          label: p3.label,
          actionText: act.text,
          channel: act.channel,
          confidence: 92,
          dwellSec: 2,
          x: p3.x,
          z: p3.z,
          color: 0x10b981,
          source: 'EDGE_LIVE',
        });
      }
    });

    const fusedNow = fuseMultiCameraCandidates(rawCandidates, entitiesRef.current, now);
    if (edgeTelemetryFresh || fusedNow.length > 0) {
      const graceEntities = entitiesRef.current.filter(
        (old) =>
          !fusedNow.some((n) => n.id === old.id || Math.hypot(n.targetX - old.targetX, n.targetZ - old.targetZ) < 1.2) &&
          now - old.lastSeen < 4500
      );
      const merged = [...fusedNow, ...graceEntities];
      entitiesRef.current = merged;
      setLiveEntities(merged);
    }
  }, [liveTelemetry, edgeTelemetryFresh, localActiveActions, deriveHindiActionText]);

  const syncMergedStations = useCallback(() => {
    const now = Date.now();
    const next: Record<string, LiveStationState> = {};

    if (edgeTelemetryFresh && liveTelemetry?.stations) {
      Object.entries(liveTelemetry.stations).forEach(([stId, stObj]) => {
        if (stObj?.active) next[stId] = stObj;
      });
    }

    Object.entries(localStationExpiryRef.current).forEach(([stId, rec]) => {
      if (rec.until > now && !next[stId] && SHOP_STATIONS[stId]) {
        next[stId] = {
          active: true,
          intensity: rec.intensity,
          label: SHOP_STATIONS[stId].label,
        };
      }
    });

    if (liveTelemetry?.galla?.state === 'OPEN' || (localGallaPulseAt && now - localGallaPulseAt < 6500)) {
      next.laptop_galla = { active: true, intensity: 95, label: 'गल्ला दराज खुला!' };
    }

    activeStationsRef.current = next;
    setActiveStations(next);
  }, [edgeTelemetryFresh, liveTelemetry?.stations, liveTelemetry?.galla?.state, localGallaPulseAt]);

  useEffect(() => {
    syncMergedStations();
  }, [syncMergedStations]);

  useEffect(() => {
    const workCanvas = document.createElement('canvas');
    const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });

    cameras.forEach((cam, idx) => {
      const ch = cam.channel || idx + 1;
      const snapUrl = gridSnapshots[cam._id];
      if (!snapUrl) return;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        loadedCamImagesRef.current[ch] = img;
        if (!workCtx || !CAM_HOMOGRAPHY_UV_TO_XZ[ch]) return;

        workCanvas.width = 32;
        workCanvas.height = 24;
        workCtx.drawImage(img, 0, 0, 32, 24);
        const rgba = workCtx.getImageData(0, 0, 32, 24).data;
        const curGray = new Uint8Array(32 * 24);
        const prevGray = prevMotionGridRef.current[ch];
        const occ = occupancyDataRef.current;

        for (let py = 0; py < 24; py++) {
          for (let px = 0; px < 32; px++) {
            const pIdx = py * 32 + px;
            const gVal = (rgba[pIdx * 4] * 3 + rgba[pIdx * 4 + 1] * 4 + rgba[pIdx * 4 + 2]) >> 3;
            curGray[pIdx] = gVal;
            if (prevGray) {
              const diff = Math.abs(gVal - prevGray[pIdx]);
              if (diff > 18) {
                const u = (px + 0.5) / 32;
                const v = (py + 0.5) / 24;
                const wpt = projectImageUVToWorldXZ(ch, u, v, ch === 1 && v < 0.39);
                const gx = Math.floor(((wpt.x + 3.2) / 6.4) * 24);
                const gz = Math.floor(((wpt.z + 5.1) / 12.9) * 32);
                if (gx >= 0 && gx < 24 && gz >= 0 && gz < 32) {
                  const cellIdx = gz * 24 + gx;
                  occ[cellIdx] = Math.min(1.0, occ[cellIdx] + diff / 135);
                }
              }
            }
          }
        }
        prevMotionGridRef.current[ch] = curGray;

        const now = Date.now();
        let anyStationTriggered = false;
        workCanvas.width = 16;
        workCanvas.height = 16;

        Object.entries(SHOP_STATIONS).forEach(([stId, meta]) => {
          meta.rois.forEach(([rch, u0, v0, u1, v1]) => {
            if (rch !== ch) return;
            const sx = u0 * img.naturalWidth;
            const sy = v0 * img.naturalHeight;
            const sw = Math.max(8, (u1 - u0) * img.naturalWidth);
            const sh = Math.max(8, (v1 - v0) * img.naturalHeight);
            workCtx.drawImage(img, sx, sy, sw, sh, 0, 0, 16, 16);
            const sData = workCtx.getImageData(0, 0, 16, 16).data;
            const patch = new Uint8Array(256);
            const key = `${stId}-${ch}`;
            const prevP = prevRoiPatchRef.current[key];
            let changed = 0;
            for (let i = 0; i < 256; i++) {
              const lum = (sData[i * 4] * 3 + sData[i * 4 + 1] * 4 + sData[i * 4 + 2]) >> 3;
              patch[i] = lum;
              if (prevP && Math.abs(lum - prevP[i]) > 18) changed++;
            }
            prevRoiPatchRef.current[key] = patch;
            const ratio = changed / 256;
            if (prevP && ratio >= 0.055) {
              localStationExpiryRef.current[stId] = {
                until: now + 4200,
                intensity: Math.min(99, Math.round(ratio * 420)),
              };
              anyStationTriggered = true;
            }
          });
        });

        if (anyStationTriggered) syncMergedStations();
      };
      img.src = snapUrl;
    });
  }, [gridSnapshots, cameras, syncMergedStations]);

  useEffect(() => {
    const isOpenEdge = liveTelemetry?.galla?.state === 'OPEN';
    const recentLocalPulse = Boolean(localGallaPulseAt && Date.now() - localGallaPulseAt < 6500);
    const shouldOpen = isOpenEdge || recentLocalPulse;
    gallaAnimRef.current.targetOpen = shouldOpen ? 1 : 0;
    gallaAnimRef.current.billed = liveTelemetry?.galla?.lastBilled !== false;
    if (shouldOpen) gallaAnimRef.current.pulseClock = 1.0;
  }, [liveTelemetry?.galla?.state, liveTelemetry?.galla?.lastBilled, localGallaPulseAt]);

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

  const shouldRunBrowserYolo = isVideoTestMode || mountGracePassed;
  const perCamDeviceCandsRef = useRef<Record<number, { ts: number; list: RawWorldCandidate[] }>>({});

  useEffect(() => {
    if (edgeTelemetryFresh || !shouldRunBrowserYolo) return;
    let cancelled = false;
    let step = 0;
    let busy = false;

    const runDeviceScan = async () => {
      if (cancelled || busy || cameras.length === 0) return;
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

        const scanTs = Date.now();
        const relevant = dets.filter((d) => {
          if (d.className === 'person') {
            if (d.confidence < 48 || d.box.height < 0.13 || d.box.height < d.box.width * 0.78) return false;
            const cx = d.box.x + d.box.width / 2;
            if (ch === 3 && cx >= 0.70 && d.box.y < 0.12 && d.confidence < 65) return false;
            if (ch === 2 && cx >= 0.17 && cx <= 0.40 && d.box.y < 0.08 && d.confidence < 65) return false;
            return true;
          }
          if (['motorcycle', 'bicycle', 'car', 'truck', 'bus'].includes(d.className)) {
            return d.confidence >= 42;
          }
          if (PORTABLE_CLASS_LABELS[d.className]) {
            if (ch === 1 && d.box.y < 0.38) return false;
            return d.confidence >= 48;
          }
          return false;
        });

        const chCands: RawWorldCandidate[] = relevant.slice(0, 8).map((det, idx) => {
          const isObj = Boolean(PORTABLE_CLASS_LABELS[det.className]);
          const p3 = mapDetectionToWorld(det.box, ch, isObj ? 'CAN' : undefined, det.className, det.confidence);
          let customLbl: string | undefined;
          if (det.className === 'person') {
            const matchedP = aiBrainService.matchPersonInFrame(img, det.box);
            if (matchedP.person) {
              const vCnt = matchedP.person.visitCount || 1;
              const regBadge = matchedP.person.personRole === 'REGULAR_CUSTOMER' || vCnt >= 3 ? ' • रेगुलर' : '';
              customLbl = `👤 ${matchedP.person.label}${regBadge} (${vCnt}x)`;
            }
          }
          return {
            rawId: `dev-ch${ch}-${idx}`,
            kind: p3.kind,
            label: p3.label,
            customLabel: customLbl,
            actionText: deriveHindiActionText(p3.kind, p3.x, p3.z, 1),
            channel: ch,
            confidence: det.confidence,
            dwellSec: 1,
            x: p3.x,
            z: p3.z,
            color: p3.color,
            cropDataUrl: isObj ? undefined : cropDetectionToDataUrl(img, det),
            source: 'DEVICE_YOLO',
          };
        });

        const learnedAssets = aiBrainService.scanLearnedObjectsOnFrame(img, ch);
        learnedAssets.forEach((la, lIdx) => {
          const p3 = mapDetectionToWorld(la.box, ch, 'CAN', la.label, la.confidence);
          chCands.push({
            rawId: `learned-ch${ch}-${lIdx}`,
            kind: 'DAIRY_ASSET',
            label: `🧠 ${la.label}`,
            actionText: 'सीखा गया डेयरी सामान',
            channel: ch,
            confidence: la.confidence,
            dwellSec: 0,
            x: p3.x,
            z: p3.z,
            color: 0x14b8a6,
            source: 'DEVICE_YOLO',
          });
        });

        perCamDeviceCandsRef.current[ch] = { ts: scanTs, list: chCands };

        const allRecentCands: RawWorldCandidate[] = [];
        Object.values(perCamDeviceCandsRef.current).forEach((entry) => {
          if (scanTs - entry.ts < 8000) allRecentCands.push(...entry.list);
        });

        const fused = fuseMultiCameraCandidates(allRecentCands, entitiesRef.current, scanTs);
        entitiesRef.current = fused;
        setLiveEntities(fused);
      } catch {
        // ignore
      } finally {
        busy = false;
      }
    };

    const iv = setInterval(runDeviceScan, isVideoTestMode ? 1600 : 3000);
    runDeviceScan();
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [cameras, gridSnapshots, edgeTelemetryFresh, shouldRunBrowserYolo, isVideoTestMode, deriveHindiActionText]);

  useEffect(() => {
    const grp = stationBadgesGroupRef.current;
    if (!grp) return;
    while (grp.children.length > 0) {
      const ch = grp.children[0];
      grp.remove(ch);
      disposeObject3D(ch);
    }

    Object.entries(activeStations).forEach(([stId, stObj]) => {
      const meta = SHOP_STATIONS[stId];
      if (!meta || !stObj.active) return;
      const badge = buildStationActiveBadgeSprite(meta.shortLabel, stObj.intensity || 80, meta.colorHex);
      badge.name = 'stationTextBadge';
      badge.visible = detailLevelRef.current === 'FULL';
      badge.position.set(meta.pos[0], meta.pos[1] + 0.35, meta.pos[2]);
      grp.add(badge);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(meta.ringRadius * 0.78, meta.ringRadius, 36),
        new THREE.MeshBasicMaterial({
          color: meta.colorNum,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75,
        })
      );
      ring.name = 'stationFloorRing';
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(meta.pos[0], 0.035, meta.pos[2]);
      grp.add(ring);
    });
  }, [activeStations]);

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
      const coords = b.coordinates || { x: 20, y: 20, width: 40, height: 40 };
      const uCenter = Math.max(0.05, Math.min(0.95, (Number(coords.x || 20) + Number(coords.width || 35) / 2) / 100));
      const vBottom = Math.max(0.1, Math.min(0.95, (Number(coords.y || 20) + Number(coords.height || 35) * 0.85) / 100));
      const wpt = projectImageUVToWorldXZ(ch, uCenter, vBottom, false);
      const isActiveNow = activeZoneNamesSet.has(b.name) || activeZoneNamesSet.has(b.blockCode);
      const col = new THREE.Color(b.color || '#10b981');

      const boxGeo = new THREE.BoxGeometry(1.05, isActiveNow ? 1.15 : 0.7, 0.95);
      const wire = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: isActiveNow ? 0.95 : 0.45 })
      );
      wire.position.set(wpt.x, isActiveNow ? 0.58 : 0.35, wpt.z);
      grp.add(wire);
      boxGeo.dispose();
    });
  }, [pairingBlocks, liveTelemetry]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 980;
    const height = isFullscreen
      ? Math.max(620, window.innerHeight - 145)
      : Math.max(650, container.clientHeight || 660);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080e1a);
    scene.fog = new THREE.FogExp2(0x080e1a, 0.011);

    // 36° FOV keeps both back-wall & front-street large, proportionate, and legible without manual zooming
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 130);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    // Supersample at >=1.75x even on standard 1x desktop monitors so 3D edges and Hindi labels are razor-sharp
    renderer.setPixelRatio(Math.max(1.75, Math.min(window.devicePixelRatio || 1, 2.25)));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xf8fafc, 0x1e293b, 1.95));
    const dirLight = new THREE.DirectionalLight(0xfffbeb, 2.1);
    dirLight.position.set(9, 20, 12);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const counterLight = new THREE.PointLight(0x38bdf8, 1.8, 12);
    counterLight.position.set(-0.4, 3.2, 1.8);
    scene.add(counterLight);

    const bhattiGlow = new THREE.PointLight(0xf97316, 1.9, 6.5);
    bhattiGlow.position.set(1.55, 0.95, -1.05);
    scene.add(bhattiGlow);

    const outerGrid = new THREE.GridHelper(28, 28, 0x1e3a5f, 0x0f172a);
    outerGrid.position.y = 0.002;
    scene.add(outerGrid);

    const floorTex = createUnifiedShopFloorTexture();
    const shopFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(4.7, 7.2),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35, metalness: 0.15 })
    );
    shopFloor.rotation.x = -Math.PI / 2;
    shopFloor.position.set(0, 0.012, -1.42);
    shopFloor.receiveShadow = true;
    scene.add(shopFloor);

    const streetMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(12.4, 5.82),
      new THREE.MeshStandardMaterial({ color: 0x111a2b, roughness: 0.85, metalness: 0.1 })
    );
    streetMesh.rotation.x = -Math.PI / 2;
    streetMesh.position.set(0, 0.008, 5.09);
    scene.add(streetMesh);

    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(12.4, 0.06, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 })
    );
    curb.position.set(0, 0.035, 2.18);
    scene.add(curb);

    for (let lx = -5.2; lx <= 5.2; lx += 1.45) {
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.75, 0.09),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.65 })
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(lx, 0.018, 4.85);
      scene.add(dash);
    }

    const occGeo = new THREE.BoxGeometry(0.22, 1.0, 0.32);
    const occMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.36 });
    const occupancyMesh = new THREE.InstancedMesh(occGeo, occMat, 24 * 32);
    occupancyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(occupancyMesh);
    const dummyObj = new THREE.Object3D();

    const stationEdgeLines: Record<string, THREE.LineSegments[]> = {};

    const registerStationEdge = (stId: string | undefined, line: THREE.LineSegments) => {
      if (!stId) return;
      if (!stationEdgeLines[stId]) stationEdgeLines[stId] = [];
      stationEdgeLines[stId].push(line);
    };

    const addBox = (
      x0: number,
      x1: number,
      z0: number,
      z1: number,
      h: number,
      hex: number,
      edgeHex: number,
      opts?: { y0?: number; opacity?: number; metal?: number; rough?: number; stationId?: string }
    ) => {
      const w = x1 - x0;
      const d = z1 - z0;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const y0 = opts?.y0 ?? 0;
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({
        color: hex,
        metalness: opts?.metal ?? 0.25,
        roughness: opts?.rough ?? 0.35,
        transparent: (opts?.opacity ?? 1) < 0.99,
        opacity: opts?.opacity ?? 1,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx, y0 + h / 2, cz);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);

      const line = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: edgeHex, transparent: true, opacity: 0.85 })
      );
      line.position.copy(m.position);
      scene.add(line);
      registerStationEdge(opts?.stationId, line);
      return m;
    };

    addBox(-2.41, -2.32, -5.02, 2.18, 2.55, 0x3b6e5c, 0x34d399, { opacity: 0.24 });
    addBox(-2.41, 2.41, -5.08, -5.0, 2.55, 0x3b6e5c, 0x34d399, { opacity: 0.28 });
    addBox(2.32, 2.41, -5.02, 2.18, 2.55, 0x3b6e5c, 0x34d399, { opacity: 0.24 });

    addBox(-2.28, -0.35, 1.48, 2.15, 0.94, 0x1e293b, 0x38bdf8, { metal: 0.45, rough: 0.22, stationId: 'patila' });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.12 });
    const patila = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.42, 28), steelMat);
    patila.position.set(-0.95, 1.15, 1.82);
    scene.add(patila);

    const westDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.56, 22), steelMat);
    westDrum.position.set(-2.08, 1.22, 1.85);
    scene.add(westDrum);

    addBox(-1.66, -1.32, 1.66, 1.98, 0.26, 0x1e3a8a, 0x60a5fa, { y0: 0.94 });

    addBox(-1.65, -1.05, 0.88, 1.45, 0.78, 0x334155, 0xf43f5e, { stationId: 'laptop_galla' });
    addBox(-1.54, -1.16, 1.04, 1.32, 0.03, 0x0f172a, 0x38bdf8, { y0: 0.78, metal: 0.7 });
    const lapScreen = addBox(-1.54, -1.16, 1.30, 1.33, 0.24, 0x0f172a, 0x10b981, { y0: 0.81, metal: 0.7 });
    lapScreen.rotation.x = -0.2;
    addBox(-2.15, -1.62, 0.55, 1.08, 0.48, 0x475569, 0x94a3b8);

    const gallaDrawerGroup = new THREE.Group();
    gallaDrawerGroup.position.set(-1.35, 0.62, 1.16);
    const drawerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.14, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.55, roughness: 0.25 })
    );
    gallaDrawerGroup.add(drawerMesh);
    const drawerEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(drawerMesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x10b981 })
    );
    gallaDrawerGroup.add(drawerEdges);
    scene.add(gallaDrawerGroup);

    const gallaPulseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.72, 32),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0 })
    );
    gallaPulseRing.rotation.x = -Math.PI / 2;
    gallaPulseRing.position.set(-1.35, 0.035, 1.16);
    scene.add(gallaPulseRing);

    addBox(-0.82, -0.08, 0.1, 1.45, 0.84, 0x1e293b, 0xfb7185, { stationId: 'red_crates' });
    addBox(-0.76, -0.14, 0.78, 1.36, 0.18, 0xdc2626, 0xfca5a5, { y0: 0.84, stationId: 'red_crates' });
    addBox(-0.74, -0.18, 0.22, 0.72, 0.16, 0xdc2626, 0xfca5a5, { y0: 0.84, stationId: 'red_crates' });
    const funnel = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.22, 16),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 })
    );
    funnel.rotation.x = Math.PI;
    funnel.position.set(-0.62, 1.02, 0.22);
    scene.add(funnel);

    addBox(-0.05, 0.78, 0.05, 1.72, 0.86, 0xe2e8f0, 0x22d3ee, { opacity: 0.85, stationId: 'basket_freezer' });
    addBox(-0.01, 0.74, 0.1, 1.67, 0.04, 0xbae6fd, 0x38bdf8, { y0: 0.86, opacity: 0.45, stationId: 'basket_freezer' });
    for (const bz of [0.38, 0.88, 1.38]) {
      addBox(0.04, 0.69, bz - 0.18, bz + 0.18, 0.12, 0xffffff, 0xcbd5e1, { y0: 0.72 });
    }

    addBox(1.52, 2.25, 1.42, 2.18, 1.95, 0xf8fafc, 0x34d399, { opacity: 0.78, stationId: 'visi_cooler' });

    addBox(-2.3, -1.62, -1.45, 0.25, 0.86, 0xf1f5f9, 0xa855f7, { stationId: 'deep_freezers' });
    addBox(-2.3, -1.62, -3.2, -1.5, 0.86, 0xf1f5f9, 0xa855f7, { stationId: 'deep_freezers' });
    addBox(-2.15, -1.75, -1.65, -1.25, 0.12, 0xe2e8f0, 0x10b981, { y0: 0.86, metal: 0.8, stationId: 'scale' });
    addBox(-2.15, -1.5, -4.95, -4.35, 1.22, 0xe2e8f0, 0x38bdf8);

    const blueDrum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.86, 20),
      new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35 })
    );
    blueDrum.position.set(-0.98, 0.43, -4.72);
    scene.add(blueDrum);
    addBox(-0.45, -0.24, -4.96, -4.68, 0.6, 0xcbd5e1, 0x94a3b8, { metal: 0.75 });
    addBox(-0.21, 0.0, -4.96, -4.68, 0.6, 0xcbd5e1, 0x94a3b8, { metal: 0.75 });
    addBox(0.03, 0.24, -4.96, -4.68, 0.6, 0xcbd5e1, 0x94a3b8, { metal: 0.75 });
    addBox(0.28, 0.68, -4.92, -4.52, 0.48, 0xdc2626, 0xf87171);

    for (const [cx, cz] of [
      [1.82, 1.18],
      [2.02, 0.88],
    ]) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.7, 22), steelMat);
      can.position.set(cx, 0.35, cz);
      scene.add(can);
    }
    addBox(1.62, 2.22, 0.72, 1.36, 0.04, 0xfbbf24, 0xfbbf24, { opacity: 0.18, stationId: 'milk_cans' });
    addBox(2.22, 2.31, 0.35, 1.15, 0.56, 0x090d16, 0x38bdf8, { y0: 1.55, metal: 0.6 });

    const gasCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.17, 0.62, 20),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35 })
    );
    gasCyl.position.set(1.85, 0.31, 0.4);
    scene.add(gasCyl);

    addBox(1.1, 2.0, -2.15, 0.05, 0.78, 0x94a3b8, 0xf97316, { metal: 0.75, rough: 0.22, stationId: 'mawa_bhatti' });
    const kadhai = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.26, 0.36, 26), steelMat);
    kadhai.position.set(1.55, 0.96, -0.95);
    scene.add(kadhai);

    addBox(1.0, 2.3, -4.98, -2.25, 0.74, 0x475569, 0x64748b, { rough: 0.75 });

    const fixedLabels: Array<[string, number, number, number, string]> = [
      ['दूध काउंटर व पतीला', -1.32, 1.52, 2.02, '#38bdf8'],
      ['लैपटॉप / गल्ला', -1.55, 1.18, 0.92, '#f43f5e'],
      ['3-बास्केट फ्रीजर', 0.36, 1.12, 0.88, '#22d3ee'],
      ['विज़ी-कूलर', 1.88, 2.22, 1.8, '#34d399'],
      ['डीप फ्रीजर व कांटा', -1.96, 1.22, -1.45, '#a855f7'],
      ['मावा मशीन / भट्टी', 1.55, 1.35, -1.05, '#f97316'],
      ['बाहरी सड़क (Street)', 0, 0.24, 3.85, '#facc15'],
    ];
    const fixedLabelsGroup = new THREE.Group();
    fixedLabelsGroup.visible = detailLevelRef.current === 'FULL';
    fixedLabels.forEach(([txt, lx, ly, lz, col]) => {
      const sp = buildFixtureLabelSprite(txt, col);
      sp.position.set(lx, ly, lz);
      fixedLabelsGroup.add(sp);
    });
    scene.add(fixedLabelsGroup);
    fixedLabelsGroupRef.current = fixedLabelsGroup;

    const blocksGroup = new THREE.Group();
    blocksGroup.visible = detailLevelRef.current === 'FULL';
    scene.add(blocksGroup);
    blocksGroupRef.current = blocksGroup;

    const stationBadgesGroup = new THREE.Group();
    scene.add(stationBadgesGroup);
    stationBadgesGroupRef.current = stationBadgesGroup;

    const speechGroup = new THREE.Group();
    speechGroup.visible = detailLevelRef.current !== 'CLEAN';
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
      g.userData.entityKind = ent.kind;
      g.visible = ent.kind === 'DAIRY_ASSET' ? detailLevelRef.current === 'FULL' : true;

      if (ent.kind === 'DAIRY_ASSET') {
        const assetMat = new THREE.MeshStandardMaterial({
          color: 0x14b8a6,
          metalness: 0.72,
          roughness: 0.22,
          emissive: new THREE.Color(0x0d9488),
          emissiveIntensity: 0.3,
        });
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), assetMat);
        box.position.y = 0.55;
        g.add(box);
      } else if (ent.kind === 'BIKE') {
        const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 18);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
        for (const wz of [0.46, -0.46]) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(0, 0.25, wz);
          g.add(w);
        }
        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.18, 0.78, 8, 16),
          new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.55, roughness: 0.25 })
        );
        body.rotation.x = Math.PI / 2;
        body.position.set(0, 0.52, 0);
        g.add(body);
      } else if (ent.kind === 'CAR') {
        const carMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.65, roughness: 0.22 });
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.48, 3.05), carMat);
        chassis.position.y = 0.36;
        g.add(chassis);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 1.58), carMat);
        cabin.position.set(0, 0.78, -0.05);
        g.add(cabin);
      } else {
        const shirtHex =
          ent.kind === 'CUSTOMER' ? 0x10b981 : ent.kind === 'STAFF' ? 0x3b82f6 : 0x94a3b8;
        const shirtMat = new THREE.MeshStandardMaterial({
          color: shirtHex,
          roughness: 0.32,
          emissive: new THREE.Color(shirtHex),
          emissiveIntensity: 0.14,
        });
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.4 });

        const legGeo = new THREE.CapsuleGeometry(0.078, 0.5, 6, 12);
        const leftLeg = new THREE.Mesh(legGeo, pantsMat);
        leftLeg.position.set(-0.1, 0.35, 0);
        leftLeg.name = 'leftLeg';
        g.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeo, pantsMat);
        rightLeg.position.set(0.1, 0.35, 0);
        rightLeg.name = 'rightLeg';
        g.add(rightLeg);

        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.185, 0.4, 8, 16), shirtMat);
        torso.position.set(0, 0.98, 0);
        torso.scale.set(1.1, 1, 0.78);
        g.add(torso);

        const armGeo = new THREE.CapsuleGeometry(0.052, 0.38, 6, 10);
        const leftArm = new THREE.Mesh(armGeo, shirtMat);
        leftArm.position.set(-0.26, 0.97, 0);
        leftArm.name = 'leftArm';
        g.add(leftArm);

        const rightArm = new THREE.Mesh(armGeo, shirtMat);
        rightArm.position.set(0.26, 0.97, 0);
        rightArm.name = 'rightArm';
        g.add(rightArm);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 18, 18), skinMat);
        head.position.set(0, 1.46, 0);
        g.add(head);
      }

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.36, 0.5, 32),
        new THREE.MeshBasicMaterial({
          color: ent.fusedChannels.length > 1 ? 0x38bdf8 : ent.color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.88,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.032;
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
      const shouldShowCard =
        ent.kind === 'DAIRY_ASSET' ? detailLevelRef.current === 'FULL' : detailLevelRef.current !== 'CLEAN';
      if (ent.cropDataUrl) {
        const img = new Image();
        img.onload = () => {
          const prevC = g.getObjectByName('overheadCard');
          if (prevC) {
            g.remove(prevC);
            disposeObject3D(prevC);
          }
          const sp = buildOverheadCardSprite(ent, img);
          sp.visible =
            ent.kind === 'DAIRY_ASSET' ? detailLevelRef.current === 'FULL' : detailLevelRef.current !== 'CLEAN';
          g.add(sp);
        };
        img.src = ent.cropDataUrl;
      } else {
        const sp = buildOverheadCardSprite(ent);
        sp.visible = shouldShowCard;
        g.add(sp);
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

      const pulseWave = 0.65 + Math.sin(clock * 4.5) * 0.35;
      Object.entries(stationEdgeLines).forEach(([stId, lines]) => {
        const isAct = Boolean(activeStationsRef.current[stId]?.active);
        lines.forEach((ln) => {
          const m = ln.material as THREE.LineBasicMaterial;
          m.opacity = isAct ? pulseWave : 0.72;
        });
      });

      const ga = gallaAnimRef.current;
      ga.openRatio += (ga.targetOpen - ga.openRatio) * 0.14;
      gallaDrawerGroup.position.z = 1.16 - ga.openRatio * 0.32;
      (drawerEdges.material as THREE.LineBasicMaterial).color.setHex(ga.billed ? 0x10b981 : 0xf43f5e);

      if (ga.pulseClock > 0.01) {
        ga.pulseClock = Math.max(0, ga.pulseClock - 0.012);
        const pScale = 1 + (1 - ga.pulseClock) * 2.1;
        gallaPulseRing.scale.set(pScale, pScale, 1);
        const rMat = gallaPulseRing.material as THREE.MeshBasicMaterial;
        rMat.color.setHex(ga.billed ? 0x10b981 : 0xf43f5e);
        rMat.opacity = ga.pulseClock * 0.85;
      } else {
        (gallaPulseRing.material as THREE.MeshBasicMaterial).opacity = 0;
      }

      if (speechGroup.children.length > 0) {
        speechGroup.children[0].position.y = 2.55 + Math.sin(clock * 2.2) * 0.05;
      }

      const occ = occupancyDataRef.current;
      let instIdx = 0;
      for (let gz = 0; gz < 32; gz++) {
        for (let gx = 0; gx < 24; gx++) {
          const val = occ[instIdx];
          if (val > 0.035) {
            occ[instIdx] = val * 0.96;
            const wx = -3.2 + ((gx + 0.5) / 24) * 6.4;
            const wz = -5.1 + ((gz + 0.5) / 32) * 12.9;
            const vh = 0.04 + val * 0.45;
            dummyObj.position.set(wx, vh / 2 + 0.018, wz);
            dummyObj.scale.set(1, vh, 1);
          } else {
            occ[instIdx] = 0;
            dummyObj.position.set(0, -10, 0);
            dummyObj.scale.set(0.001, 0.001, 0.001);
          }
          dummyObj.updateMatrix();
          occupancyMesh.setMatrixAt(instIdx, dummyObj.matrix);
          instIdx++;
        }
      }
      occupancyMesh.instanceMatrix.needsUpdate = true;

      const activeIds = new Set<string>();
      const nowMs = Date.now();

      entitiesRef.current.forEach((ent, idx) => {
        activeIds.add(ent.id);
        const dx = ent.targetX - ent.curX;
        const dz = ent.targetZ - ent.curZ;
        const speed = Math.hypot(dx, dz);
        ent.curX += dx * 0.15;
        ent.curZ += dz * 0.15;

        const tagStamp = `${Math.floor(ent.dwellSec / 2)}-${ent.label}-${ent.actionText || ''}-${ent.fusedChannels.join(',')}-${Boolean(ent.cropDataUrl)}`;
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
        const isSeatedAtLaptop = ent.kind === 'STAFF' && ent.curX < -1.35 && ent.curZ >= 0.45 && ent.curZ <= 1.3;
        meshGrp.position.set(ent.curX, isSeatedAtLaptop ? -0.18 : 0, ent.curZ);

        const silenceMs = nowMs - ent.lastSeen;
        const fadeFactor = silenceMs > 2500 ? Math.max(0.25, 1 - (silenceMs - 2500) / 2500) : 1.0;

        if (speed > 0.025) {
          meshGrp.rotation.y = Math.atan2(dx, dz);
        } else if (isSeatedAtLaptop) {
          meshGrp.rotation.y = 0.65;
        } else if (ent.kind === 'CUSTOMER') {
          meshGrp.rotation.y = Math.PI;
        } else if (ent.kind === 'CAR' || ent.kind === 'BIKE') {
          meshGrp.rotation.y = Math.PI / 2;
        }

        const swing = speed > 0.02 ? Math.sin(clock * 4.8 + idx) * 0.42 : Math.sin(clock * 1.4 + idx) * 0.03;
        const lLeg = meshGrp.getObjectByName('leftLeg');
        const rLeg = meshGrp.getObjectByName('rightLeg');
        const lArm = meshGrp.getObjectByName('leftArm');
        const rArm = meshGrp.getObjectByName('rightArm');
        if (lLeg && rLeg && lArm && rArm) {
          lLeg.rotation.x = isSeatedAtLaptop ? -0.9 : swing;
          rLeg.rotation.x = isSeatedAtLaptop ? -0.9 : -swing;
          lArm.rotation.x = isSeatedAtLaptop ? -0.55 : -swing * 0.75;
          rArm.rotation.x = isSeatedAtLaptop ? -0.55 : swing * 0.75;
        }

        const ring = meshGrp.getObjectByName('pulseRing') as THREE.Mesh | undefined;
        if (ring) {
          const s = 1 + Math.sin(clock * 2.6 + idx) * 0.12;
          ring.scale.set(s, s, 1);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.86 * fadeFactor;
        }

        if (ent.trail.length >= 2 && ent.kind !== 'DAIRY_ASSET') {
          const pts3d = ent.trail.map(([tx, tz]) => new THREE.Vector3(tx, 0.035, tz));
          pts3d.push(new THREE.Vector3(ent.curX, 0.035, ent.curZ));
          const existingLine = trailLineMap[ent.id];
          if (existingLine) {
            existingLine.geometry.dispose();
            existingLine.geometry = new THREE.BufferGeometry().setFromPoints(pts3d);
          } else {
            const ln = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(pts3d),
              new THREE.LineBasicMaterial({
                color: ent.fusedChannels.length > 1 ? 0x38bdf8 : ent.color,
                transparent: true,
                opacity: 0.82,
              })
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
      const w = container.clientWidth || 980;
      const h = document.fullscreenElement
        ? Math.max(620, window.innerHeight - 145)
        : Math.max(650, container.clientHeight || 660);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    ro?.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      ro?.disconnect();
      floorTex.dispose();
      disposeObject3D(scene);
      renderer.dispose();
    };
  }, [autoRotate, isFullscreen]);

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
      g.targetX = Math.max(-5.5, Math.min(5.5, g.targetX - dx * 0.016));
      g.targetZ = Math.max(-5.2, Math.min(7.5, g.targetZ - dy * 0.016));
    } else {
      g.theta -= dx * 0.0068;
      g.phi = Math.max(0.1, Math.min(1.36, g.phi - dy * 0.0058));
    }
  };

  const onPointerUp = () => {
    dragInteractionRef.current.isDragging = false;
  };

  const onWheelZoom = (deltaY: number) => {
    const g = orbitGoalRef.current;
    g.radius = Math.max(5.0, Math.min(22, g.radius + deltaY * 0.01));
  };

  const unattendedAlert = liveTelemetry?.unattendedAlert;
  const activeStationKeys = Object.keys(activeStations);
  const humanCount = liveEntities.filter((e) => ['CUSTOMER', 'STAFF', 'PASSERBY'].includes(e.kind)).length;
  const vehicleCount = liveEntities.filter((e) => e.kind === 'BIKE' || e.kind === 'CAR').length;
  const objectCount = liveEntities.filter((e) => e.kind === 'DAIRY_ASSET').length;

  return (
    <div ref={wrapperRef} className={`space-y-2.5 ${isFullscreen ? 'bg-slate-950 p-4 overflow-y-auto' : ''}`}>
      {unattendedAlert?.active && (
        <div className="px-4 py-2.5 rounded-2xl bg-rose-950/85 border border-rose-500/60 flex items-center justify-between gap-3 animate-pulse shadow-lg">
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

      {/* SINGLE UNIFIED MAP HEADER — Clean, Zero Extra Modes, Crisp in both Light & Dark Themes */}
      <div className="px-4 py-3 rounded-2xl bg-slate-950 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
            <Compass className={`w-4 h-4 ${autoRotate ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs sm:text-sm font-extrabold text-white keep-white-text">
                लाइव 3D दुकान व सड़क मैप (Single Unified Live Map)
              </h4>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                ● {edgeTelemetryFresh ? '3-CAM LIVE SYNC' : isVideoTestMode ? 'VIDEO TEST LIVE' : 'LIVE TRACKING'}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 keep-white-text opacity-85">
              तीनों कैमरों से जुड़ा एक सटीक मैप — ग्राहक, स्टाफ, बाइक/कार, सामान और हर दुकान स्टेशन की रियल-टाइम ट्रैकिंग।
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
            {(
              [
                ['DEFAULT_3D', '3D व्यू'],
                ['TOP_MAP', 'टॉप मैप'],
                ['COUNTER', 'काउंटर'],
                ['HALL', 'अंदर हॉल'],
                ['STREET', 'बाहरी सड़क'],
              ] as const
            ).map(([key, lbl]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyCameraPreset(key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                  activePreset === key ? 'bg-cyan-600 text-white keep-white-text' : 'text-slate-400 hover:text-white'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {/* SINGLE Detailing Control (3 Smart Levels: पूरी डिटेल | ज़रूरी ट्रैक | ऑफ — reversible anytime, zero duplicate buttons!) */}
          <div
            className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-700/80 gap-0.5"
            title="मैप की डिटेलिंग नियंत्रित करें: पूरी डिटेल, केवल ज़रूरी लाइव ट्रैक, या क्लीन व्यू"
          >
            <span className="px-1.5 text-[11px] font-semibold text-slate-400 flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
              <span className="hidden sm:inline">डिटेल:</span>
            </span>
            {(
              [
                ['FULL', 'पूरी', Eye],
                ['ESSENTIAL', 'ज़रूरी', Users],
                ['CLEAN', 'ऑफ', EyeOff],
              ] as const
            ).map(([lvl, lbl, IconComp]) => {
              const active = detailLevel === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => updateDetailLevel(lvl)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition ${
                    active
                      ? lvl === 'CLEAN'
                        ? 'bg-slate-700 text-white keep-white-text'
                        : 'bg-emerald-600 text-white keep-white-text'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <IconComp className="w-3 h-3" />
                  <span>{lbl}</span>
                </button>
              );
            })}
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
            <span>{autoRotate ? 'घूम रहा है' : '360°'}</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-[11px] font-semibold"
            title="फुलस्क्रीन मैप"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* THE ONE UNIFIED 3D VIEWPORT — Large, Crisp & Readable Without Needing Fullscreen */}
      <div className="relative rounded-3xl overflow-hidden bg-[#080e1a] border border-cyan-500/30 shadow-2xl select-none">
        <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-20">
          {detailLevel !== 'CLEAN' ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-3 py-1 rounded-full bg-black/85 backdrop-blur-md text-[11px] font-bold text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>👤 लोग: {humanCount}</span>
              </span>
              <span className="px-3 py-1 rounded-full bg-black/85 backdrop-blur-md text-[11px] font-bold text-amber-300 border border-amber-500/40 shadow">
                🏍️/🚗 वाहन: {vehicleCount}
              </span>
              {detailLevel === 'FULL' && (
                <span className="px-3 py-1 rounded-full bg-black/85 backdrop-blur-md text-[11px] font-bold text-teal-300 border border-teal-500/40 flex items-center gap-1 shadow">
                  <Package className="w-3.5 h-3.5" /> सामान: {objectCount}
                </span>
              )}
              <span className="px-3 py-1 rounded-full bg-black/85 backdrop-blur-md text-[11px] font-bold text-cyan-300 border border-cyan-500/40 flex items-center gap-1 shadow">
                <Activity className="w-3.5 h-3.5" /> सक्रिय स्टेशन: {activeStationKeys.length}
              </span>
              {activeSpeechText && (
                <span className="px-3 py-1 rounded-full bg-emerald-950/95 backdrop-blur-md text-[11px] font-bold text-emerald-200 border border-emerald-400/50 flex items-center gap-1 shadow">
                  <Mic className="w-3.5 h-3.5 animate-pulse" /> “{activeSpeechText.slice(0, 36)}”
                </span>
              )}
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={() => applyCameraPreset('DEFAULT_3D')}
              className="px-3 py-1 rounded-xl bg-black/85 hover:bg-slate-800 text-[11px] font-bold text-cyan-300 border border-cyan-500/35 flex items-center gap-1 shadow"
            >
              <RotateCcw className="w-3 h-3" /> रीसेट व्यू
            </button>
          </div>
        </div>

        {detailLevel !== 'CLEAN' && (activeStationKeys.length > 0 || localActiveActions.length > 0) && (
          <div className="absolute top-12 left-3 right-3 flex flex-wrap items-center gap-1.5 z-20 pointer-events-auto">
            {activeStationKeys.map((stId) => {
              const st = activeStations[stId];
              return (
                <button
                  key={stId}
                  type="button"
                  onClick={() => focusOnStation(stId)}
                  className="px-3 py-1 rounded-xl bg-emerald-950/90 backdrop-blur-md text-[11px] font-bold text-emerald-200 border border-emerald-400/50 shadow flex items-center gap-1.5 hover:scale-[1.02] transition"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>⚡ {st.label}</span>
                </button>
              );
            })}
            {localActiveActions.map((la) => (
              <span
                key={la.id}
                className="px-3 py-1 rounded-xl bg-amber-950/90 backdrop-blur-md text-[11px] font-bold text-amber-200 border border-amber-400/50 shadow"
              >
                ⚡ {la.text}
              </span>
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
          className={`w-full ${isFullscreen ? 'h-[calc(100vh-145px)]' : 'h-[660px] xl:h-[710px]'} cursor-grab active:cursor-grabbing`}
        />

        {/* Compact Bottom-Left Live Radar List (shown in FULL mode; hidden in ESSENTIAL & CLEAN modes so map stays spacious) */}
        {detailLevel === 'FULL' && (
          <div className="absolute bottom-3 left-3 w-64 sm:w-72 bg-black/85 backdrop-blur-md border border-white/15 rounded-2xl p-2.5 space-y-1.5 text-xs z-20 shadow-xl">
          <div className="flex items-center justify-between text-[10px] font-bold text-cyan-300 border-b border-white/10 pb-1">
            <span>🎯 लाइव ट्रैकिंग ({liveEntities.length + activeStationKeys.length})</span>
            <span className="font-mono text-emerald-400">
              {todayStats?.customers !== undefined && (
                <span className="inline-flex items-center gap-1 mr-2">
                  <Users className="w-3 h-3" /> {todayStats.customers}
                </span>
              )}
              {todayStats?.gallaOpenings !== undefined && (
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <DoorOpen className="w-3 h-3" /> {todayStats.gallaOpenings}
                </span>
              )}
            </span>
          </div>
          <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
            {liveEntities.length === 0 && activeStationKeys.length === 0 ? (
              <div className="text-[10px] text-slate-400 py-0.5">
                मैप लाइव स्कैन कर रहा है — कोई भी व्यक्ति, वाहन या स्टेशन हलचल तुरंत यहाँ दिखेगी।
              </div>
            ) : (
              <>
                {liveEntities.map((ent) => (
                  <button
                    key={ent.id}
                    type="button"
                    onClick={() => focusOnEntity(ent)}
                    className={`w-full px-2 py-1 rounded-lg flex items-center justify-between gap-2 text-[10px] transition text-left ${
                      focusedEntityId === ent.id ? 'bg-cyan-500/20 border border-cyan-500/40' : 'hover:bg-slate-900'
                    }`}
                  >
                    <span className="text-white keep-white-text font-semibold truncate flex items-center gap-1">
                      <Crosshair className="w-3 h-3 text-cyan-400 shrink-0" />
                      {ent.label}
                    </span>
                    <span className="font-mono text-emerald-400 shrink-0">
                      {ent.fusedChannels.length > 1 ? `Ch#${ent.fusedChannels.join('+')}` : `Ch#${ent.channel}`} • {ent.confidence >= 45 ? `${ent.confidence}%` : 'LIVE'}
                    </span>
                  </button>
                ))}
                {activeStationKeys.map((stId) => (
                  <button
                    key={`st-${stId}`}
                    type="button"
                    onClick={() => focusOnStation(stId)}
                    className="w-full px-2 py-1 rounded-lg flex items-center justify-between gap-2 text-[10px] hover:bg-slate-900 text-left"
                  >
                    <span className="text-emerald-300 font-semibold truncate">⚡ {activeStations[stId].label}</span>
                    <span className="font-mono text-amber-300 shrink-0">ACTIVE</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
};
