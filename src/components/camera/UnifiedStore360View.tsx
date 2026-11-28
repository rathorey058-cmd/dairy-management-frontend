import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Compass, Play, Pause, Maximize2, Minimize2, Tag, Users,
  DoorOpen, Box, Camera, ShieldCheck, Radio, Sparkles, Eye,
  Layers, RotateCcw, Sun, Cpu, Mic, AlertTriangle, Crosshair, GitMerge
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
        worldX?: number;
        worldZ?: number;
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
  fusedChannels: number[];
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

/**
 * Calibrated 3x3 Homography Matrices derived directly from shared physical landmarks across
 * Camera 01 (Front Counter & Street), Camera 02 (Center-to-Back Interior), and Camera 03 (Laptop/West Freezers/Basket Freezer).
 *
 * Unified Shop World Coordinates (meters):
 *   Origin (0, 0) = Tiled Shop Floor Center
 *   +Z = Front Counter & Concrete Street (Z = +1.65..+2.35 Counter, Z = +2.85..+8.0 Street)
 *   -Z = Back Wall (Z = -4.25: Air Cooler, Blue Drum, 3 Ghee Tins, Red Stool)
 *   -X = West Wall (X = -2.95: Owner Chair, Laptop, 2 White Chest Freezers, Weighing Scale)
 *   +X = East Wall (X = +2.95: Glass Visi-Cooler, 2 Milk Cans, Wall TV, Gas Cylinder, Mawa Machine, Sink Platform)
 */
const CAM_HOMOGRAPHY_UV_TO_XZ: Record<number, number[][]> = {
  1: [
    [-7.30621, -3.29968, 6.0902],
    [1.10249, -4.4938, 4.41506],
    [-0.41081, 0.54713, 1.0],
  ],
  2: [
    [21.2371, 1.93397, -9.48888],
    [-3.08491, 22.32953, -10.95798],
    [1.53687, 2.68928, 1.0],
  ],
  3: [
    [2.88326, 4.97103, -5.20327],
    [-4.16806, 6.86921, -1.40924],
    [-0.55917, 0.0881, 1.0],
  ],
};

// Inverse Homography Matrices (World [X, Z, 1] -> Camera Image [u, v, w], row-major) for GPU BEV Floor Stitching
const CAM_HOMOGRAPHY_XZ_TO_UV_MAT3 = {
  1: new THREE.Matrix3().set(
    -0.13152, 0.12624, 0.24365,
    -0.05551, -0.09145, 0.74183,
    -0.02366, 0.10189, 0.69422
  ),
  2: new THREE.Matrix3().set(
    0.03505, -0.01858, 0.12904,
    -0.00931, 0.02424, 0.17728,
    -0.02884, -0.03664, 0.32493
  ),
  3: new THREE.Matrix3().set(
    0.26168, -0.20316, 1.07527,
    0.18544, -0.00098, 0.96354,
    0.12998, -0.11351, 1.51637
  ),
};

// True Physical Ceiling Mount Positions & Viewing Targets of the 3 Cameras in the Real Shop
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
    pos: [-1.75, 3.05, 0.35],
    lookAt: [0.35, 0.65, 3.55],
    screenPos: [0.0, 3.45, 4.1],
    screenRotY: 0,
    zoneBounds: { xCenter: 0.0, zCenter: 2.85, width: 5.8, depth: 3.4 },
    title: 'Ch#1: मुख्य दूध काउंटर, पतीला व बाहरी सड़क',
    color: 0x38bdf8,
    hex: '#38bdf8',
  },
  2: {
    pos: [0.25, 3.05, 2.8],
    lookAt: [0.0, 0.45, -1.85],
    screenPos: [3.15, 3.25, -0.8],
    screenRotY: -Math.PI / 2,
    zoneBounds: { xCenter: 0.15, zCenter: -1.1, width: 5.2, depth: 5.2 },
    title: 'Ch#2: बास्केट फ्रीजर, मावा मशीन व आंतरिक हॉल',
    color: 0x10b981,
    hex: '#10b981',
  },
  3: {
    pos: [2.45, 3.05, 2.35],
    lookAt: [-1.35, 0.6, -0.75],
    screenPos: [-3.15, 3.25, -0.8],
    screenRotY: Math.PI / 2,
    zoneBounds: { xCenter: -1.1, zCenter: -0.5, width: 4.4, depth: 4.8 },
    title: 'Ch#3: लैपटॉप गल्ला कोना, डीप फ्रीजर व तौल कांटा',
    color: 0xa855f7,
    hex: '#a855f7',
  },
  4: {
    pos: [2.8, 3.2, 3.2],
    lookAt: [2.4, 0.5, 5.8],
    screenPos: [3.2, 3.25, 3.6],
    screenRotY: -0.35,
    zoneBounds: { xCenter: 2.2, zCenter: 4.8, width: 4.2, depth: 3.2 },
    title: 'Ch#4: पूर्वी गेट व वाहन लेन',
    color: 0xf59e0b,
    hex: '#f59e0b',
  },
  5: {
    pos: [-2.8, 3.2, 3.2],
    lookAt: [-2.4, 0.5, 5.8],
    screenPos: [-3.2, 3.25, 3.6],
    screenRotY: 0.35,
    zoneBounds: { xCenter: -2.2, zCenter: 4.8, width: 4.2, depth: 3.2 },
    title: 'Ch#5: पश्चिमी सड़क लेन',
    color: 0xf43f5e,
    hex: '#f43f5e',
  },
};

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child: any) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m: any) => {
        if (m.map && !m.userData?.sharedCamTex) m.map.dispose();
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
      if (isVehicle || (ch === 1 && v < 0.45)) {
        return {
          x: Math.max(-5.2, Math.min(5.2, wx)),
          z: Math.max(2.65, Math.min(7.8, wz)),
        };
      }
      return {
        x: Math.max(-2.7, Math.min(2.7, wx)),
        z: Math.max(-4.0, Math.min(6.6, wz)),
      };
    }
  }
  const anchor = CAM_3D_ANCHORS[ch] || CAM_3D_ANCHORS[1];
  return {
    x: anchor.zoneBounds.xCenter + (u - 0.5) * anchor.zoneBounds.width * 0.75,
    z: anchor.zoneBounds.zCenter + (0.5 - v) * anchor.zoneBounds.depth * 0.75,
  };
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
  const isVeh =
    explicitRole === 'BIKE' ||
    explicitRole === 'CAR' ||
    ['motorcycle', 'bicycle', 'car', 'truck', 'bus'].includes(className || '');
  const vFoot = Math.min(0.98, box.y + box.height * (isVeh ? 0.85 : 0.9));

  const pt =
    typeof explicitWorldX === 'number' && typeof explicitWorldZ === 'number'
      ? { x: explicitWorldX, z: explicitWorldZ }
      : projectImageUVToWorldXZ(channel, cx, vFoot, isVeh);

  if (explicitRole === 'CAN') {
    return {
      x: pt.x,
      z: pt.z,
      kind: 'DAIRY_ASSET',
      label: className || 'सीखा गया डेयरी सामान',
      color: 0x14b8a6,
    };
  }

  if (explicitRole === 'BIKE' || className === 'motorcycle' || className === 'bicycle') {
    return {
      x: pt.x,
      z: Math.max(3.1, pt.z),
      kind: 'BIKE',
      label: `🏍️ दोपहिया (${confidence}%)`,
      color: 0xf59e0b,
    };
  }

  if (explicitRole === 'CAR' || className === 'car' || className === 'truck' || className === 'bus') {
    return {
      x: pt.x,
      z: Math.max(3.6, pt.z),
      kind: 'CAR',
      label: `🚗 वाहन (${confidence}%)`,
      color: 0x38bdf8,
    };
  }

  // Determine accurate semantic role in unified shop coordinates
  const role =
    explicitRole ||
    (pt.z > 3.35
      ? 'PASSERBY'
      : pt.z >= 2.05 && pt.z <= 3.35 && pt.x >= -2.4 && pt.x <= 2.3
      ? 'CUSTOMER'
      : 'STAFF');

  if (role === 'PASSERBY') {
    return {
      x: pt.x,
      z: pt.z,
      kind: 'PASSERBY',
      label: '🚶 सड़क राहगीर',
      color: 0x94a3b8,
    };
  }

  if (role === 'CUSTOMER') {
    return {
      x: pt.x,
      z: pt.z,
      kind: 'CUSTOMER',
      label: '👤 ग्राहक @ काउंटर',
      color: 0x10b981,
    };
  }

  const subZone =
    pt.x < -1.2 && pt.z > 0.3
      ? '👨‍💼 स्टाफ @ लैपटॉप/गल्ला'
      : pt.x < -1.1
      ? '👨‍💼 स्टाफ @ डीप फ्रीजर'
      : pt.x > 1.1
      ? '👨‍💼 स्टाफ @ मावा मशीन/कैन'
      : '👨‍💼 दुकान स्टाफ';

  return {
    x: pt.x,
    z: pt.z,
    kind: 'STAFF',
    label: subZone,
    color: 0x3b82f6,
  };
}

/**
 * Cross-Camera 3D Spatial Fusion Engine (Tesla Multi-Camera Vector Space Fusion):
 * Merges simultaneous detections of the SAME physical person/vehicle across Ch#1, Ch#2, and Ch#3
 * when their homography-projected (X, Z) floor coordinates fall within the fusion radius (1.35m).
 */
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
    let bestDist = 1.42; // 1.42m cross-camera fusion radius
    for (const cl of clusters) {
      // Only fuse across DIFFERENT cameras (same camera already ran NMS)
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
    if (joined) {
      joined.push(cand);
    } else {
      clusters.push([cand]);
    }
  }

  const usedPrevIds = new Set<string>();
  return clusters.map((cl, idx) => {
    const totalWeight = cl.reduce((s, m) => s + Math.max(20, m.confidence), 0);
    const fusedX = cl.reduce((s, m) => s + m.x * Math.max(20, m.confidence), 0) / totalWeight;
    const fusedZ = cl.reduce((s, m) => s + m.z * Math.max(20, m.confidence), 0) / totalWeight;
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

    // Match against existing 3D tracks in unified world coordinates for seamless cross-camera handoff!
    let bestPrev: Tracked3DEntity | undefined;
    let bestPrevDist = 1.75;
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
      trail,
      color: finalColor,
      firstSeen,
      lastSeen: now,
      cropDataUrl: bestCrop || bestPrev?.cropDataUrl,
      source: primary.source,
    };
  });
}

/**
 * GPU Custom GLSL Multi-Camera Inverse Perspective Mapping (IPM) Shader:
 * Warps and feather-stitches live video textures from Camera 1, Camera 2, and Camera 3
 * onto ONE seamless Bird's-Eye-View (BEV) Shop + Street floor in real time at 60 FPS!
 */
function createMultiCamBevFloorMaterial(
  blankTex: THREE.Texture,
  bevOpacity: number,
  isDarkVector: boolean
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTex1: { value: blankTex },
      uTex2: { value: blankTex },
      uTex3: { value: blankTex },
      uHas1: { value: 0.0 },
      uHas2: { value: 0.0 },
      uHas3: { value: 0.0 },
      uHInv1: { value: CAM_HOMOGRAPHY_XZ_TO_UV_MAT3[1] },
      uHInv2: { value: CAM_HOMOGRAPHY_XZ_TO_UV_MAT3[2] },
      uHInv3: { value: CAM_HOMOGRAPHY_XZ_TO_UV_MAT3[3] },
      uBevOpacity: { value: bevOpacity },
      uDarkMode: { value: isDarkVector ? 1.0 : 0.0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform sampler2D uTex1;
      uniform sampler2D uTex2;
      uniform sampler2D uTex3;
      uniform float uHas1;
      uniform float uHas2;
      uniform float uHas3;
      uniform mat3 uHInv1;
      uniform mat3 uHInv2;
      uniform mat3 uHInv3;
      uniform float uBevOpacity;
      uniform float uDarkMode;
      varying vec3 vWorldPos;

      void sampleCam(
        sampler2D tex,
        float enabled,
        mat3 Hinv,
        vec3 p,
        float zMin,
        float zMax,
        float pref,
        inout vec3 accCol,
        inout float accW
      ) {
        if (enabled < 0.5) return;
        if (p.y < zMin || p.y > zMax) return;
        vec3 q = Hinv * p;
        if (q.z <= 0.06) return;
        float u = q.x / q.z;
        float v = q.y / q.z;
        if (u < 0.015 || u > 0.985 || v < 0.015 || v > 0.985) return;

        float edgeDist = min(min(u, 1.0 - u), min(v, 1.0 - v));
        float zFade = clamp(min(p.y - zMin, zMax - p.y) * 2.4, 0.04, 1.0);
        float w = clamp(edgeDist * 5.2, 0.04, 1.0) * zFade * pref;

        // Three.js Texture has flipY = true, so image top (v=0) corresponds to uv.y = 1.0
        vec3 c = texture2D(tex, vec2(u, 1.0 - v)).rgb;
        accCol += c * w;
        accW += w;
      }

      void main() {
        float wx = vWorldPos.x;
        float wz = vWorldPos.z;
        vec3 p = vec3(wx, wz, 1.0);

        // Base architectural floor (Inside shop beige tile vs Outside street concrete)
        bool insideShop = (abs(wx) <= 2.98 && wz >= -4.30 && wz <= 2.85);
        vec3 baseTile;
        if (uDarkMode > 0.5) {
          baseTile = insideShop ? vec3(0.055, 0.09, 0.16) : vec3(0.03, 0.05, 0.09);
        } else {
          float gx = step(0.96, fract((wx + 3.0) * 1.65));
          float gz = step(0.96, fract((wz + 4.3) * 1.65));
          float grout = clamp(gx + gz, 0.0, 1.0);
          baseTile = insideShop
            ? mix(vec3(0.68, 0.64, 0.57), vec3(0.52, 0.49, 0.44), grout * 0.65)
            : vec3(0.24, 0.27, 0.32);
        }

        // Subtle Tesla 1-meter vector grid lines
        float mLineX = 1.0 - smoothstep(0.0, 0.025, abs(fract(wx + 0.5) - 0.5));
        float mLineZ = 1.0 - smoothstep(0.0, 0.025, abs(fract(wz + 0.5) - 0.5));
        float gridPulse = max(mLineX, mLineZ);
        vec3 gridCol = insideShop ? vec3(0.06, 0.72, 0.51) : vec3(0.22, 0.74, 0.97);
        baseTile = mix(baseTile, gridCol, gridPulse * (uDarkMode > 0.5 ? 0.24 : 0.10));

        vec3 accCol = vec3(0.0);
        float accW = 0.0;

        // Feather-blend all 3 calibrated cameras into one unified BEV canvas
        sampleCam(uTex1, uHas1, uHInv1, p, 1.40, 7.95, 1.45, accCol, accW);
        sampleCam(uTex2, uHas2, uHInv2, p, -4.35, 1.88, 1.55, accCol, accW);
        sampleCam(uTex3, uHas3, uHInv3, p, -4.20, 1.88, 0.90, accCol, accW);

        vec3 outCol = baseTile;
        if (accW > 0.001) {
          vec3 bevRgb = accCol / accW;
          // Boost contrast slightly for crisp ground clarity
          bevRgb = clamp((bevRgb - 0.5) * 1.12 + 0.52, 0.0, 1.0);
          outCol = mix(baseTile, bevRgb, uBevOpacity);
        }

        gl_FragColor = vec4(outCol, 1.0);
      }
    `,
  });
}

function createShopSignboardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#09111e');
  grad.addColorStop(0.5, '#0f2942');
  grad.addColorStop(1, '#09111e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 160);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 5;
  ctx.strokeRect(5, 5, 1014, 150);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🛸 TESLA 3-CAM FUSED SHOP DIGITAL TWIN', 512, 72);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 24px monospace';
  ctx.fillText('CH#1 COUNTER/STREET  +  CH#2 HALL/BHATTI  +  CH#3 FREEZER/GALLA', 512, 122);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildOverheadCardSprite(ent: Tracked3DEntity, cutImg?: HTMLImageElement): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 408;
  c.height = 132;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = 'rgba(9, 14, 26, 0.93)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 400, 124, 20);
  ctx.fill();

  const hexCol = '#' + ent.color.toString(16).padStart(6, '0');
  ctx.strokeStyle = ent.fusedChannels.length > 1 ? '#38bdf8' : hexCol;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  let tx = 18;
  if (cutImg) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(12, 12, 84, 108, 12);
    ctx.clip();
    ctx.drawImage(cutImg, 12, 12, 84, 108);
    ctx.restore();
    tx = 108;
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillText(ent.label.slice(0, 23), tx, 38);

  if (ent.actionText) {
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(`⚡ ${ent.actionText.slice(0, 26)}`, tx, 68);
  }

  const mins = Math.floor(ent.dwellSec / 60);
  const secs = ent.dwellSec % 60;
  const dwellTxt = ent.dwellSec > 0 ? `${mins}:${String(secs).padStart(2, '0')}s` : 'LIVE';
  const chBadge =
    ent.fusedChannels.length > 1
      ? `Ch#${ent.fusedChannels.join('+')} FUSED`
      : `Ch#${ent.channel}`;

  ctx.fillStyle = ent.fusedChannels.length > 1 ? '#38bdf8' : hexCol;
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`${chBadge} • ${dwellTxt} • ${ent.confidence}%`, tx, ent.actionText ? 102 : 82);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(1.86, 0.6, 1);
  sp.position.set(0, ent.kind === 'CAR' ? 1.65 : ent.kind === 'BIKE' ? 1.45 : 2.18, 0);
  sp.name = 'overheadCard';
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
  sp.position.set(-1.15, 2.75, 2.25);
  sp.name = 'liveSpeechSprite';
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

  // 3 Calibrated Tesla Modes:
  //   TESLA_HYBRID:  Live 3-Cam Stitched BEV Floor + Exact 1:1 3D Shop Digital Twin + Fused 3D Agents (Default!)
  //   TESLA_VECTOR:  Pure Tesla Car Touchscreen Dark Vector Space + Occupancy Pillars + Wireframe Shop
  //   BEV_STITCH_360: Unobstructed 100% Live Stitched 3-Camera Bird's-Eye Floor Map
  const [visualStyle, setVisualStyle] = useState<'TESLA_HYBRID' | 'TESLA_VECTOR' | 'BEV_STITCH_360'>('TESLA_HYBRID');
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [show3DVideoWalls, setShow3DVideoWalls] = useState<boolean>(false);
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
    theta: 0.18,
    phi: 0.62,
    radius: 11.8,
    targetX: 0,
    targetY: 0.45,
    targetZ: 0.55,
  });
  const orbitGoalRef = useRef({
    theta: 0.18,
    phi: 0.62,
    radius: 11.8,
    targetX: 0,
    targetY: 0.45,
    targetZ: 0.55,
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
  const bevFloorMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const prevBevGrayRef = useRef<Record<number, Uint8Array>>({});
  const occupancyDataRef = useRef<Float32Array>(new Float32Array(24 * 32)); // 24 cols (X) x 32 rows (Z) live motion occupancy grid
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
      g.phi = 0.12;
      g.radius = 13.8;
      g.targetX = 0;
      g.targetZ = 0.85;
    } else if (preset === 'TESLA_ISO') {
      g.theta = 0.18;
      g.phi = 0.62;
      g.radius = 11.8;
      g.targetX = 0;
      g.targetZ = 0.55;
    } else if (preset === 'COUNTER') {
      g.theta = 0.08;
      g.phi = 0.72;
      g.radius = 7.4;
      g.targetX = -0.5;
      g.targetZ = 2.05;
    } else if (preset === 'GALLA') {
      g.theta = 0.48;
      g.phi = 0.68;
      g.radius = 7.2;
      g.targetX = -1.65;
      g.targetZ = 0.55;
    } else if (preset === 'STREET') {
      g.theta = -0.22;
      g.phi = 0.68;
      g.radius = 12.6;
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
    g.radius = 6.8;
    g.phi = 0.7;
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

  // 1. Primary Source: Python Edge AI Live Telemetry + Multi-Camera 3D Spatial Fusion
  const edgeTelemetryAgeMs = liveTelemetry?.updatedAt ? Date.now() - Number(liveTelemetry.updatedAt) : 999999;
  const edgeTelemetryFresh = Boolean(liveTelemetry?.updatedAt && edgeTelemetryAgeMs >= -15000 && edgeTelemetryAgeMs < 18000);

  const deriveHindiActionText = useCallback((kind: Tracked3DEntity['kind'], wx: number, wz: number, dwellSec: number) => {
    if (kind === 'DAIRY_ASSET') return 'सीखा गया डेयरी सामान दिखा';
    if (kind === 'CAR') return 'दुकान के सामने कार खड़ी/सक्रिय';
    if (kind === 'BIKE') return 'दुकान के बाहर दोपहिया वाहन';
    if (kind === 'CUSTOMER') {
      return dwellSec >= 4 ? `दूध काउंटर पर ग्राहक खड़ा है (${dwellSec}s)` : 'दूध काउंटर पर ग्राहक आया';
    }
    if (kind === 'PASSERBY') return 'दुकान के बाहर सड़क पर हलचल';
    if (wx < -1.2 && wz > 0.3) return 'लैपटॉप गल्ला कोने में स्टाफ सक्रिय';
    if (wx < -1.1 && wz <= 0.3) return 'डीप फ्रीजर / कांटा ज़ोन में सक्रिय';
    if (wx > 1.1 && wz < 0.8) return 'मावा मशीन / मिल्क कैन ज़ोन में सक्रिय';
    return 'दुकान के अंदर स्टाफ सक्रिय';
  }, []);

  useEffect(() => {
    if (!edgeTelemetryFresh && localActiveActions.length === 0) return;
    const now = Date.now();
    const rawCandidates: RawWorldCandidate[] = [];

    if (liveTelemetry?.channels && edgeTelemetryFresh) {
      Object.entries(liveTelemetry.channels).forEach(([chStr, chData]) => {
        const ch = Number(chStr) || 1;
        const texImg = videoTexturesRef.current[ch]?.image;
        (chData?.detections || []).forEach((d) => {
          const p3 = mapDetectionToWorld(
            d.box,
            ch,
            d.role,
            d.className,
            d.confidence,
            d.worldX,
            d.worldZ
          );
          let liveCrop = d.cropDataUrl;
          if (!liveCrop && texImg instanceof HTMLImageElement && texImg.naturalWidth > 0) {
            liveCrop = cropDetectionToDataUrl(texImg, {
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
          now - old.lastSeen < 3500
      );
      const merged = [...fusedNow, ...graceEntities];
      entitiesRef.current = merged;
      setLiveEntities(merged);
    }
  }, [liveTelemetry, edgeTelemetryFresh, localActiveActions, deriveHindiActionText]);

  // 2. Sync Galla / Laptop Counter Pulse
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

  // 4. Smart Multi-Camera Browser YOLO Fallback (when Edge AI is off or in Video Test Mode)
  const shouldRunBrowserYolo = isVideoTestMode || (browserYoloFallback && mountGracePassed);
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

        setYoloScanChannel(ch);
        const scanTs = Date.now();
        const relevant = dets.filter((d) =>
          ['person', 'motorcycle', 'bicycle', 'car', 'truck', 'bus'].includes(d.className)
        );

        const chCands: RawWorldCandidate[] = relevant.slice(0, 6).map((det, idx) => {
          const p3 = mapDetectionToWorld(det.box, ch, undefined, det.className, det.confidence);
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
            cropDataUrl: cropDetectionToDataUrl(img, det),
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
            actionText: 'सीखा गया डेयरी सामान दिखा',
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

        // Fuse across ALL active cameras scanned within the last 7 seconds!
        const allRecentCands: RawWorldCandidate[] = [];
        Object.values(perCamDeviceCandsRef.current).forEach((entry) => {
          if (scanTs - entry.ts < 7500) {
            allRecentCands.push(...entry.list);
          }
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

    const iv = setInterval(runDeviceScan, isVideoTestMode ? 1700 : 3200);
    runDeviceScan();
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [cameras, gridSnapshots, edgeTelemetryFresh, shouldRunBrowserYolo, isVideoTestMode, deriveHindiActionText]);

  // 5. Feed Live Camera Textures into GPU Multi-Cam BEV Shader + Compute Live 3D Motion Occupancy Grid!
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const miniCanvas = document.createElement('canvas');
    miniCanvas.width = 32;
    miniCanvas.height = 24;
    const miniCtx = miniCanvas.getContext('2d', { willReadFrequently: true });

    cameras.forEach((cam, idx) => {
      const ch = cam.channel || idx + 1;
      const snapUrl = gridSnapshots[cam._id];
      if (!snapUrl) return;

      loader.load(
        snapUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.needsUpdate = true;

          const old = videoTexturesRef.current[ch];
          videoTexturesRef.current[ch] = tex;

          // Bind live camera texture directly into GPU Multi-Camera BEV Floor Shader!
          const bevMat = bevFloorMatRef.current;
          if (bevMat) {
            if (ch === 1) {
              bevMat.uniforms.uTex1.value = tex;
              bevMat.uniforms.uHas1.value = 1.0;
            } else if (ch === 2) {
              bevMat.uniforms.uTex2.value = tex;
              bevMat.uniforms.uHas2.value = 1.0;
            } else if (ch === 3) {
              bevMat.uniforms.uTex3.value = tex;
              bevMat.uniforms.uHas3.value = 1.0;
            }
          }

          // Update optional ceiling monitor screen
          const wallMesh = videoMeshesRef.current[ch];
          if (wallMesh && wallMesh.material instanceof THREE.MeshBasicMaterial) {
            wallMesh.material.map = tex;
            wallMesh.material.userData = { sharedCamTex: true };
            wallMesh.material.color.setHex(0xffffff);
            wallMesh.material.opacity = 0.96;
            wallMesh.material.needsUpdate = true;
          }

          // Project real-time pixel motion from this camera into the unified 24x32 3D Occupancy Grid!
          if (miniCtx && tex.image instanceof HTMLImageElement && CAM_HOMOGRAPHY_UV_TO_XZ[ch]) {
            miniCtx.drawImage(tex.image, 0, 0, 32, 24);
            const rgba = miniCtx.getImageData(0, 0, 32, 24).data;
            const curGray = new Uint8Array(32 * 24);
            const prevGray = prevBevGrayRef.current[ch];
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
                    const wpt = projectImageUVToWorldXZ(ch, u, v, ch === 1 && v < 0.42);
                    const gx = Math.floor(((wpt.x + 3.4) / 6.8) * 24);
                    const gz = Math.floor(((wpt.z + 4.4) / 12.2) * 32);
                    if (gx >= 0 && gx < 24 && gz >= 0 && gz < 32) {
                      const cellIdx = gz * 24 + gx;
                      occ[cellIdx] = Math.min(1.0, occ[cellIdx] + diff / 140);
                    }
                  }
                }
              }
            }
            prevBevGrayRef.current[ch] = curGray;
          }

          if (old && old !== tex) old.dispose();
        },
        undefined,
        () => {}
      );
    });
  }, [gridSnapshots, cameras]);

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

  // 6. Project Calibrated VisualPairingBlocks onto True Homography Coordinates
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

      const boxGeo = new THREE.BoxGeometry(1.15, isActiveNow ? 1.25 : 0.85, 1.05);
      const boxMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: isActiveNow ? 0.26 : 0.09,
        depthWrite: false,
      });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.position.set(wpt.x, isActiveNow ? 0.63 : 0.43, wpt.z);
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

  // 7. Build Exact 1:1 3D Digital Twin of the User's Real 3-Camera Dairy Shop + Live Stitched BEV Floor
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isHybrid = visualStyle === 'TESLA_HYBRID';
    const isVector = visualStyle === 'TESLA_VECTOR';
    const isPureBev = visualStyle === 'BEV_STITCH_360';

    const width = container.clientWidth || 920;
    const height = isFullscreen ? Math.max(580, window.innerHeight - 160) : 500;

    const scene = new THREE.Scene();
    const bgHex = isVector ? 0x060b14 : 0x0b1220;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.013);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 130);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isVector ? 1.15 : 1.25;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Balanced Showroom & Tesla Ambient Lighting
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1e293b, isVector ? 1.4 : 2.1));
    const sunLight = new THREE.DirectionalLight(isVector ? 0x7dd3fc : 0xfffbeb, isVector ? 1.6 : 2.2);
    sunLight.position.set(10, 22, 14);
    sunLight.castShadow = true;
    scene.add(sunLight);

    const bhattiGlow = new THREE.PointLight(0xf97316, isPureBev ? 0.6 : 2.0, 6.5);
    bhattiGlow.position.set(2.1, 0.9, -0.95);
    scene.add(bhattiGlow);

    // Outer reference radar grid
    const outerGrid = new THREE.GridHelper(32, 32, 0x1e3a5f, 0x0f172a);
    outerGrid.position.y = 0.002;
    scene.add(outerGrid);

    // 1. MULTI-CAMERA STITCHED BEV GROUND PLANE (Covers Shop [-3.6..+3.6, -4.5..+2.85] + Street [+2.85..+8.0])
    const blankCanvas = document.createElement('canvas');
    blankCanvas.width = 4;
    blankCanvas.height = 4;
    const blankTex = new THREE.CanvasTexture(blankCanvas);

    const bevOpacity = isPureBev ? 0.97 : isHybrid ? 0.78 : 0.22;
    const bevMat = createMultiCamBevFloorMaterial(blankTex, bevOpacity, isVector);
    // Hydrate already-loaded live camera textures immediately
    if (videoTexturesRef.current[1]) {
      bevMat.uniforms.uTex1.value = videoTexturesRef.current[1];
      bevMat.uniforms.uHas1.value = 1.0;
    }
    if (videoTexturesRef.current[2]) {
      bevMat.uniforms.uTex2.value = videoTexturesRef.current[2];
      bevMat.uniforms.uHas2.value = 1.0;
    }
    if (videoTexturesRef.current[3]) {
      bevMat.uniforms.uTex3.value = videoTexturesRef.current[3];
      bevMat.uniforms.uHas3.value = 1.0;
    }
    bevFloorMatRef.current = bevMat;

    const bevFloor = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 12.6, 1, 1), bevMat);
    bevFloor.rotation.x = -Math.PI / 2;
    bevFloor.position.set(0, 0.015, 1.75); // Spans Z = -4.55 to +8.05!
    scene.add(bevFloor);

    // Shop Front Threshold Curb Line (Z = +2.85) + Tesla Street Lane Dividers (Z = +5.4)
    const curbLine = new THREE.Mesh(
      new THREE.BoxGeometry(6.0, 0.06, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 })
    );
    curbLine.position.set(0, 0.04, 2.85);
    scene.add(curbLine);

    for (let lx = -4.5; lx <= 4.5; lx += 1.6) {
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, 0.1),
        new THREE.MeshBasicMaterial({ color: isVector ? 0x38bdf8 : 0xfacc15, transparent: true, opacity: 0.65 })
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(lx, 0.022, 5.45);
      scene.add(dash);
    }

    // 2. LIVE 3D TESLA OCCUPANCY VOXEL HEATMAP PILLARS (24 x 32 InstancedMesh)
    const voxelGeo = new THREE.BoxGeometry(0.22, 1.0, 0.28);
    const voxelMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: isVector ? 0.55 : 0.38,
    });
    const occupancyMesh = new THREE.InstancedMesh(voxelGeo, voxelMat, 24 * 32);
    occupancyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(occupancyMesh);
    const dummyObj = new THREE.Object3D();

    // 3. EXACT 1:1 REAL SHOP ARCHITECTURE & EQUIPMENT (Matched to Cam 01 + Cam 02 + Cam 03!)
    const solidOpacity = isPureBev ? 0.16 : isVector ? 0.28 : 0.88;
    const makeApplianceMat = (hex: number, metal = 0.25, rough = 0.35) =>
      new THREE.MeshStandardMaterial({
        color: isVector ? 0x0f2942 : hex,
        metalness: metal,
        roughness: rough,
        transparent: solidOpacity < 0.99,
        opacity: solidOpacity,
      });

    const addFixture = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
      edgeHex: number
    ) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      scene.add(m);
      const edges = new THREE.EdgesGeometry(geo);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({
          color: edgeHex,
          transparent: true,
          opacity: isPureBev ? 0.55 : 0.9,
        })
      );
      line.position.copy(m.position);
      scene.add(line);
      return m;
    };

    // Mint-Green Shop Walls (West X=-2.95, Back Z=-4.25, East X=+2.95)
    const mintWallMat = new THREE.MeshStandardMaterial({
      color: isVector ? 0x0c1e35 : 0x6f9981,
      transparent: true,
      opacity: isPureBev ? 0.12 : isVector ? 0.22 : 0.38,
      roughness: 0.5,
    });
    addFixture(0.12, 2.8, 7.15, -2.95, 1.4, -0.7, mintWallMat, 0x34d399);
    addFixture(6.02, 2.8, 0.12, 0, 1.4, -4.25, mintWallMat, 0x34d399);
    addFixture(0.12, 2.8, 7.15, 2.95, 1.4, -0.7, mintWallMat, 0x34d399);

    if (!isPureBev) {
      const signBoard = new THREE.Mesh(
        new THREE.BoxGeometry(5.8, 0.68, 0.12),
        new THREE.MeshBasicMaterial({ map: createShopSignboardTexture() })
      );
      signBoard.position.set(0, 3.18, -4.22);
      scene.add(signBoard);
    }

    // --- FRONT COUNTER ROW (Z = +1.65 .. +2.30) ---
    const blackGraniteMat = makeApplianceMat(0x1e293b, 0.45, 0.2);
    const steelMat = makeApplianceMat(0xe2e8f0, 0.88, 0.14);
    const whiteBodyMat = makeApplianceMat(0xf8fafc, 0.15, 0.22);
    const redCrateMat = makeApplianceMat(0xef4444, 0.1, 0.35);

    // A. West Milk Counter (-2.60..-0.85, Z = +2.20) + Big Aluminium Milk Patila + Steel Drum + Blue Bag
    addFixture(1.78, 0.92, 0.88, -1.72, 0.46, 2.2, blackGraniteMat, 0x38bdf8);
    if (!isPureBev) {
      const patila = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.46, 28), steelMat);
      patila.position.set(-1.18, 1.15, 2.2);
      scene.add(patila);

      const westCan = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.62, 22), steelMat);
      westCan.position.set(-2.38, 1.22, 2.25);
      scene.add(westCan);

      addFixture(0.36, 0.28, 0.3, -1.82, 1.06, 2.18, makeApplianceMat(0x1e3a8a, 0.1, 0.6), 0x60a5fa);
    }

    // B. Owner Laptop & Galla Corner (West-Front: Desk at [-1.92, +1.42], Chair at [-2.38, +0.98])
    const laptopDesk = addFixture(0.75, 0.78, 0.58, -1.92, 0.39, 1.42, makeApplianceMat(0x334155, 0.3, 0.35), 0xf43f5e);
    void laptopDesk;
    const gallaDrawerGroup = new THREE.Group();
    gallaDrawerGroup.position.set(-1.92, 0.65, 1.42);
    const drawerBox = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.46), makeApplianceMat(0x475569, 0.5, 0.25));
    gallaDrawerGroup.add(drawerBox);
    const drawerEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(drawerBox.geometry),
      new THREE.LineBasicMaterial({ color: 0x10b981 })
    );
    gallaDrawerGroup.add(drawerEdges);
    scene.add(gallaDrawerGroup);

    const gallaPulseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.78, 32),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0 })
    );
    gallaPulseRing.rotation.x = -Math.PI / 2;
    gallaPulseRing.position.set(-1.92, 0.04, 1.42);
    scene.add(gallaPulseRing);

    if (!isPureBev) {
      // Open Black Laptop on desk
      addFixture(0.38, 0.03, 0.28, -1.88, 0.81, 1.42, makeApplianceMat(0x0f172a, 0.7, 0.2), 0x38bdf8);
      const lapScreen = addFixture(0.38, 0.25, 0.02, -1.88, 0.94, 1.54, makeApplianceMat(0x0f172a, 0.7, 0.2), 0x10b981);
      lapScreen.rotation.x = -0.2;
      // Operator Chair
      addFixture(0.52, 0.46, 0.52, -2.42, 0.23, 0.98, makeApplianceMat(0x475569, 0.2, 0.5), 0x94a3b8);
    }

    // C. Center Red Crates Table (-0.80..+0.02, Z = +1.65) — Shared Tie-Point A across ALL 3 Cameras!
    addFixture(0.84, 0.84, 0.92, -0.4, 0.42, 1.65, blackGraniteMat, 0xf87171);
    addFixture(0.66, 0.18, 0.44, -0.42, 0.93, 1.82, redCrateMat, 0xfca5a5);
    addFixture(0.54, 0.16, 0.38, -0.42, 0.92, 1.36, redCrateMat, 0xfca5a5);

    // D. Center-East Glass-Top Sliding Freezer with 3 White Wire Baskets (+0.05..+1.35, Z = +1.62)
    addFixture(1.28, 0.88, 0.98, 0.7, 0.44, 1.62, whiteBodyMat, 0x38bdf8);
    const basketGlassMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: isPureBev ? 0.15 : 0.42,
      roughness: 0.08,
      metalness: 0.5,
    });
    addFixture(1.2, 0.04, 0.9, 0.7, 0.9, 1.62, basketGlassMat, 0x7dd3fc);
    if (!isPureBev) {
      for (const bz of [1.32, 1.62, 1.92]) {
        addFixture(0.96, 0.12, 0.24, 0.7, 0.78, bz, whiteBodyMat, 0xcbd5e1);
      }
    }

    // E. Front-East Tall Vertical Glass Visi-Cooler (+2.35, Z = +2.52)
    addFixture(0.76, 1.92, 0.74, 2.38, 0.96, 2.52, whiteBodyMat, 0x38bdf8);

    // --- WEST WALL EQUIPMENT (X = -2.42: 2 White Chest Deep Freezers + Scale + Air Cooler) ---
    addFixture(0.86, 0.88, 1.62, -2.42, 0.44, -0.25, whiteBodyMat, 0xa855f7);
    if (!isPureBev) {
      // Electronic Weighing Scale + Bowl on top of Chest Freezer #1
      addFixture(0.34, 0.1, 0.34, -2.38, 0.93, -0.68, steelMat, 0x10b981);
    }
    addFixture(0.86, 0.88, 1.62, -2.42, 0.44, -2.02, whiteBodyMat, 0xa855f7);
    // White Desert Air Cooler in Back-West corner
    addFixture(0.76, 1.18, 0.72, -2.38, 0.59, -3.58, whiteBodyMat, 0x38bdf8);

    // --- BACK WALL ITEMS (Z = -3.88: Blue Drum, 3 Silver Ghee Tins, Red Stool) ---
    if (!isPureBev) {
      const blueDrum = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.78, 20),
        makeApplianceMat(0x2563eb, 0.15, 0.4)
      );
      blueDrum.position.set(-1.35, 0.39, -3.85);
      scene.add(blueDrum);

      for (const tx of [-0.52, -0.14, 0.24]) {
        addFixture(0.32, 0.54, 0.32, tx, 0.27, -3.92, steelMat, 0x94a3b8);
      }
      addFixture(0.42, 0.46, 0.42, 0.92, 0.23, -3.82, redCrateMat, 0xf87171);
    }

    // --- EAST WALL EQUIPMENT (X = +2.25: 2 Milk Cans, Wall TV, Red Gas Cylinder, Mawa Machine, Sink) ---
    if (!isPureBev) {
      for (const [cx, cz] of [
        [2.38, 1.48],
        [2.52, 1.08],
      ]) {
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.72, 22), steelMat);
        can.position.set(cx, 0.36, cz);
        scene.add(can);
      }
      // Wall Black TV
      addFixture(0.08, 0.62, 0.98, 2.86, 2.02, 1.05, makeApplianceMat(0x090d16, 0.6, 0.2), 0x38bdf8);
      // Red LPG Gas Cylinder
      const lpg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.64, 20),
        makeApplianceMat(0xdc2626, 0.3, 0.35)
      );
      lpg.position.set(2.35, 0.32, 0.42);
      scene.add(lpg);
    }

    // Stainless Steel Mawa / Khoa Boiling Machine (X = +2.12, Z = -0.95)
    addFixture(0.92, 0.76, 1.28, 2.12, 0.38, -0.95, steelMat, 0xf97316);
    if (!isPureBev) {
      const kadhai = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.28, 0.36, 26), steelMat);
      kadhai.position.set(2.12, 0.94, -0.85);
      scene.add(kadhai);
    }
    // Concrete Washing Platform (Back-East)
    addFixture(1.05, 0.72, 1.45, 2.1, 0.36, -2.92, makeApplianceMat(0x64748b, 0.1, 0.75), 0x94a3b8);

    // 4. TRUE CEILING CAMERA MOUNTS + DIRECTIONAL LASER FOV CONES
    videoMeshesRef.current = {};
    coneMeshesRef.current = {};

    Object.entries(CAM_3D_ANCHORS).forEach(([chStr, cfg]) => {
      const ch = Number(chStr);
      const hasCam = cameras.some((c, idx) => (c.channel || idx + 1) === ch);
      if (!hasCam && ch > 3) return;

      // Small physical CCTV camera housing at true ceiling coordinate
      const camHousing = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 14, 14),
        new THREE.MeshBasicMaterial({ color: cfg.color })
      );
      camHousing.position.set(...cfg.pos);
      scene.add(camHousing);

      // Directional sight ray + FOV frustum cone pointing at exact physical target
      const coneGeo = new THREE.ConeGeometry(1.15, 2.8, 4, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        wireframe: true,
        transparent: true,
        opacity: isPureBev ? 0.1 : 0.2,
      });
      const coneMesh = new THREE.Mesh(coneGeo, coneMat);
      const pVec = new THREE.Vector3(...cfg.pos);
      const lVec = new THREE.Vector3(...cfg.lookAt);
      const mid = pVec.clone().lerp(lVec, 0.38);
      coneMesh.position.copy(mid);
      coneMesh.lookAt(lVec);
      coneMesh.rotateX(Math.PI / 2);
      coneMesh.visible = showLaserCones && (hasCam || cameras.length === 0);
      scene.add(coneMesh);
      coneMeshesRef.current[ch] = coneMesh;

      // Optional non-blocking elevated floating monitor above perimeter wall
      const screenGeo = new THREE.PlaneGeometry(2.1, 1.22);
      const screenMat = new THREE.MeshBasicMaterial({
        color: videoTexturesRef.current[ch] ? 0xffffff : 0x1e293b,
        map: videoTexturesRef.current[ch] || null,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      });
      screenMat.userData = { sharedCamTex: true };
      const screenMesh = new THREE.Mesh(screenGeo, screenMat);
      screenMesh.position.set(...cfg.screenPos);
      screenMesh.rotation.y = cfg.screenRotY;
      screenMesh.visible = show3DVideoWalls && (hasCam || cameras.length === 0);
      scene.add(screenMesh);
      videoMeshesRef.current[ch] = screenMesh;

      const borderEdges = new THREE.EdgesGeometry(screenGeo);
      screenMesh.add(new THREE.LineSegments(borderEdges, new THREE.LineBasicMaterial({ color: cfg.color })));
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
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.82, 24), canMat);
        cyl.position.y = 0.41;
        g.add(cyl);
      } else if (ent.kind === 'BIKE') {
        const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.11, 18);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65 });
        for (const wz of [0.48, -0.48]) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(0, 0.26, wz);
          g.add(w);
        }
        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.19, 0.82, 8, 16),
          new THREE.MeshStandardMaterial({ color: isVector ? 0xfbbf24 : 0xdc2626, metalness: 0.6, roughness: 0.22 })
        );
        body.rotation.x = Math.PI / 2;
        body.position.set(0, 0.54, 0);
        g.add(body);
      } else if (ent.kind === 'CAR') {
        const carMat = new THREE.MeshStandardMaterial({
          color: isVector ? 0x38bdf8 : 0xf8fafc,
          metalness: 0.68,
          roughness: 0.22,
          transparent: isVector,
          opacity: isVector ? 0.72 : 0.95,
        });
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.5, 3.15), carMat);
        chassis.position.y = 0.38;
        g.add(chassis);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.42, 1.65), carMat);
        cabin.position.set(0, 0.82, -0.06);
        g.add(cabin);
      } else {
        const shirtHex =
          ent.kind === 'CUSTOMER' ? 0x10b981 : ent.kind === 'STAFF' ? 0x3b82f6 : 0x94a3b8;
        const shirtMat = new THREE.MeshStandardMaterial({
          color: shirtHex,
          roughness: 0.32,
          emissive: new THREE.Color(shirtHex),
          emissiveIntensity: isVector ? 0.28 : 0.08,
        });
        const pantsMat = new THREE.MeshStandardMaterial({
          color: isVector ? shirtHex : 0x1e293b,
          roughness: 0.5,
        });
        const skinMat = new THREE.MeshStandardMaterial({
          color: isVector ? shirtHex : 0xf1c27d,
          roughness: 0.4,
        });

        const legGeo = new THREE.CapsuleGeometry(0.08, 0.52, 6, 12);
        const leftLeg = new THREE.Mesh(legGeo, pantsMat);
        leftLeg.position.set(-0.11, 0.36, 0);
        leftLeg.name = 'leftLeg';
        g.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeo, pantsMat);
        rightLeg.position.set(0.11, 0.36, 0);
        rightLeg.name = 'rightLeg';
        g.add(rightLeg);

        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 8, 16), shirtMat);
        torso.position.set(0, 1.0, 0);
        torso.scale.set(1.12, 1, 0.78);
        g.add(torso);

        const armGeo = new THREE.CapsuleGeometry(0.055, 0.4, 6, 10);
        const leftArm = new THREE.Mesh(armGeo, shirtMat);
        leftArm.position.set(-0.27, 0.99, 0);
        leftArm.name = 'leftArm';
        g.add(leftArm);

        const rightArm = new THREE.Mesh(armGeo, shirtMat);
        rightArm.position.set(0.27, 0.99, 0);
        rightArm.name = 'rightArm';
        g.add(rightArm);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 18), skinMat);
        head.position.set(0, 1.5, 0);
        g.add(head);
      }

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.38, 0.52, 32),
        new THREE.MeshBasicMaterial({
          color: ent.fusedChannels.length > 1 ? 0x38bdf8 : ent.color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.88,
        })
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

      // Animate Galla Drawer & Shockwave Ring
      const ga = gallaAnimRef.current;
      ga.openRatio += (ga.targetOpen - ga.openRatio) * 0.14;
      gallaDrawerGroup.position.z = 1.42 - ga.openRatio * 0.35;
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
        speechGroup.children[0].position.y = 2.75 + Math.sin(clock * 2.2) * 0.05;
      }

      // Decay & render Live 3D Occupancy Voxels across the fused floor
      const occ = occupancyDataRef.current;
      let instIdx = 0;
      for (let gz = 0; gz < 32; gz++) {
        for (let gx = 0; gx < 24; gx++) {
          const val = occ[instIdx];
          if (val > 0.03) {
            occ[instIdx] = val * 0.965;
            const wx = -3.4 + ((gx + 0.5) / 24) * 6.8;
            const wz = -4.4 + ((gz + 0.5) / 32) * 12.2;
            const vh = 0.06 + val * 0.72;
            dummyObj.position.set(wx, vh / 2 + 0.02, wz);
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

      // Animate Fused 3D Entities & Trajectory Trails
      const activeIds = new Set<string>();
      const nowMs = Date.now();

      entitiesRef.current.forEach((ent, idx) => {
        activeIds.add(ent.id);
        const dx = ent.targetX - ent.curX;
        const dz = ent.targetZ - ent.curZ;
        const speed = Math.hypot(dx, dz);
        ent.curX += dx * 0.14;
        ent.curZ += dz * 0.14;

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
        meshGrp.position.set(ent.curX, 0, ent.curZ);

        const silenceMs = nowMs - ent.lastSeen;
        const fadeFactor = silenceMs > 2000 ? Math.max(0.2, 1 - (silenceMs - 2000) / 2500) : 1.0;

        if (speed > 0.025) {
          meshGrp.rotation.y = Math.atan2(dx, dz);
        } else if (ent.kind === 'CUSTOMER') {
          meshGrp.rotation.y = Math.PI;
        } else if (ent.kind === 'CAR' || ent.kind === 'BIKE') {
          meshGrp.rotation.y = Math.PI / 2;
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
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * fadeFactor;
        }

        if (ent.trail.length >= 2) {
          const pts3d = ent.trail.map(([tx, tz]) => new THREE.Vector3(tx, 0.038, tz));
          pts3d.push(new THREE.Vector3(ent.curX, 0.038, ent.curZ));
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
                opacity: 0.85,
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
      const w = container.clientWidth || 920;
      const h = document.fullscreenElement ? Math.max(580, window.innerHeight - 160) : 500;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      bevFloorMatRef.current = null;
      blankTex.dispose();
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
      g.targetX = Math.max(-6, Math.min(6, g.targetX - dx * 0.016));
      g.targetZ = Math.max(-5, Math.min(8, g.targetZ - dy * 0.016));
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
    g.radius = Math.max(5.2, Math.min(22, g.radius + deltaY * 0.01));
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
  const fusedMultiCamCount = liveEntities.filter((e) => e.fusedChannels.length > 1).length;
  const liveSyncedCamFeeds = Object.keys(gridSnapshots).length;

  // Unified Live Shop Actions Feed
  const liveActionItems = (() => {
    const items: Array<{ id: string; channel: number; text: string; tone: 'emerald' | 'amber' | 'rose' | 'cyan'; entity?: Tracked3DEntity }> = [];
    const seenTexts = new Set<string>();

    if (liveTelemetry?.galla?.state === 'OPEN' || (localGallaPulseAt && Date.now() - localGallaPulseAt < 7000)) {
      const gTxt = '💸 गल्ला दराज खुला (लाइव हलचल)!';
      seenTexts.add(gTxt);
      items.push({ id: 'act-galla', channel: 3, text: gTxt, tone: 'amber' });
    }

    liveEntities.forEach((ent) => {
      const chTag = ent.fusedChannels.length > 1 ? `Ch#${ent.fusedChannels.join('+')} Fused` : `Ch#${ent.channel}`;
      const txt = `${chTag}: ${ent.actionText || ent.label}`;
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
      sp.position.set(anchor.zoneBounds.xCenter, 2.45, anchor.zoneBounds.zCenter);
      grp.add(sp);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.75, 0.98, 36),
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

      {/* Top 3D Multi-Camera Fusion Header */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950/60 to-emerald-950/40 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
            <Compass className={`w-4.5 h-4.5 ${autoRotate ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs sm:text-sm font-black text-white tracking-wide">
                {visualStyle === 'TESLA_HYBRID'
                  ? '🛸 3-CAMERA FUSED TESLA 3D DIGITAL TWIN (HOMOGRAPHY STITCHED)'
                  : visualStyle === 'TESLA_VECTOR'
                  ? '⚡ TESLA FSD PURE VECTOR RADAR & OCCUPANCY'
                  : '🛰️ 360° LIVE STITCHED MULTI-CAMERA FLOOR MAP'}
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border bg-emerald-500/20 text-emerald-300 border-emerald-400/40 flex items-center gap-1">
                <GitMerge className="w-3 h-3" />
                <span>
                  {Math.min(3, Math.max(1, liveSyncedCamFeeds))}/3 CAM BEV STITCHED
                  {fusedMultiCamCount > 0 ? ` • ${fusedMultiCamCount} CROSS-CAM FUSED` : ''}
                </span>
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                  edgeTelemetryFresh
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                    : 'bg-sky-500/20 text-sky-300 border-sky-400/40'
                }`}
              >
                {edgeTelemetryFresh
                  ? '● EDGE AI + HOMOGRAPHY LIVE'
                  : isVideoTestMode
                  ? `● TEST VIDEO 3D Ch#${yoloScanChannel}`
                  : `● AUTO YOLO Ch#${yoloScanChannel}`}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Ch#1 (काउंटर/सड़क) + Ch#2 (हॉल/भट्टी) + Ch#3 (लैपटॉप/डीप फ्रीजर) को 3×3 Homography से जोड़कर आपकी असली दुकान का एक सटीक 3D मैप।
            </p>
          </div>
        </div>

        {/* Mode & Camera Angle Controls */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-emerald-500/35">
            <button
              type="button"
              onClick={() => setVisualStyle('TESLA_HYBRID')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                visualStyle === 'TESLA_HYBRID'
                  ? 'bg-emerald-600 text-white keep-white-text shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>3-Cam फ्यूज़न 3D</span>
            </button>
            <button
              type="button"
              onClick={() => setVisualStyle('TESLA_VECTOR')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                visualStyle === 'TESLA_VECTOR'
                  ? 'bg-cyan-600 text-white keep-white-text shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Tesla वेक्टर रडार</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setVisualStyle('BEV_STITCH_360');
                applyCameraPreset('DRONE_TOP');
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                visualStyle === 'BEV_STITCH_360'
                  ? 'bg-purple-600 text-white keep-white-text shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>लाइव स्टिच्ड फ्लोर</span>
            </button>
          </div>

          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(
              [
                ['TESLA_ISO', '3D एंगल'],
                ['DRONE_TOP', 'टॉप स्टिच व्यू'],
                ['COUNTER', 'काउंटर'],
                ['GALLA', 'लैपटॉप/गल्ला'],
                ['STREET', 'बाहरी सड़क'],
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
            title="छत पर लगे कैमरों की फ्लोटिंग टीवी स्क्रीन दिखाएँ/छुपाएँ"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>कैमरा टीवी</span>
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
            <span>कैमरा किरणें</span>
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
            >
              ब्राउज़र YOLO {browserYoloFallback ? 'ON' : 'OFF'}
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
              <span>FUSED 3D OBJECTS: {liveEntities.length}</span>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-bold text-white border border-white/10">
              🟢 ग्राहक • 🔵 स्टाफ • ⚪/🔵 कार/बाइक • 🔷 क्रॉस-कैमरा मर्ज्ड
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
                  else if (act.channel === 3) applyCameraPreset('GALLA');
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
          className={`w-full ${isFullscreen ? 'h-[calc(100vh-170px)]' : 'h-[500px]'} cursor-grab active:cursor-grabbing`}
        />

        {/* Bottom-Left Fused 3D Tracked Objects Inspector */}
        <div className="absolute bottom-3 left-3 w-64 sm:w-76 bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl p-2.5 space-y-1.5 text-[11px] z-20">
          <div className="flex items-center justify-between text-[10px] font-bold text-cyan-300 border-b border-white/10 pb-1">
            <span>🎯 मल्टी-कैमरा फ्यूज़्ड ट्रैक ({liveEntities.length})</span>
            <span className="font-mono text-emerald-400">{edgeTelemetryFresh ? 'BEV SYNC' : '60FPS'}</span>
          </div>
          <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
            {liveEntities.length === 0 ? (
              <div className="text-[10px] text-slate-400 py-0.5">
                तीनों कैमरों का लाइव फ्लोर मैप जुड़ा हुआ है — हलचल होते ही सटीक जगह पर 3D अवतार दिखेगा।
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
                    {ent.fusedChannels.length > 1 ? `Ch#${ent.fusedChannels.join('+')}` : `Ch#${ent.channel}`} • {ent.confidence}%
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
          const chDetCount = liveEntities.filter((e) => e.fusedChannels.includes(ch)).length;
          const isSel = selectedZoneCh === ch;

          return (
            <button
              key={ch}
              type="button"
              onClick={() => {
                setSelectedZoneCh(ch);
                if (ch === 1) applyCameraPreset('COUNTER');
                else if (ch === 3) applyCameraPreset('GALLA');
                else if (ch >= 4) applyCameraPreset('STREET');
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
                  CAM #{ch} HOMOGRAPHY • {chDetCount} लाइव
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                  {camBlocks.length} AI ब्लॉक
                </span>
              </div>
              <div className="text-xs font-extrabold text-white truncate">{camObj ? camObj.name : cfg.title}</div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <Eye className="w-3 h-3" /> 3D ज़ोन फ़ोकस
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
            माउस ड्रैग: 360° घुमाएँ • Right-Click ड्रैग: पैन • Scroll: ज़ूम • “टॉप स्टिच व्यू” से तीनों कैमरों का जुड़ा हुआ फ्लोर देखें
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
