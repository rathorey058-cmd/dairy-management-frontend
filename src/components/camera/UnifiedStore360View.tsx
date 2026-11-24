import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Compass, Play, Pause, Maximize2, Tag, Users,
  DoorOpen, Box, Camera, ShieldCheck, Radio, Sparkles, Eye, Layers, RotateCcw, Sun, Cpu
} from 'lucide-react';
import { mobileYolo, type DetectedObject } from '../../services/mobileYoloService';

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

interface Tracked3DEntity {
  id: string;
  kind: 'CUSTOMER' | 'STAFF' | 'BIKE' | 'CAR' | 'PASSERBY';
  label: string;
  channel: number;
  confidence: number;
  targetX: number;
  targetZ: number;
  curX: number;
  curZ: number;
  color: number;
  lastSeen: number;
  cropDataUrl?: string;
}

const CAM_3D_ANCHORS: Record<number, {
  pos: [number, number, number];
  lookAt: [number, number, number];
  screenPos: [number, number, number];
  screenRotY: number;
  floorPatchPos: [number, number, number];
  floorPatchSize: [number, number];
  floorPatchRotY: number;
  title: string;
  color: number;
  hex: string;
}> = {
  1: {
    pos: [0.5, 4.2, 1.2],
    lookAt: [0.0, 0.8, 4.2],
    screenPos: [0.0, 2.35, 3.35],
    screenRotY: 0,
    floorPatchPos: [0.0, 0.04, 3.6],
    floorPatchSize: [6.4, 4.2],
    floorPatchRotY: 0,
    title: 'Ch#1: दूध काउंटर व पतीला',
    color: 0x38bdf8,
    hex: '#38bdf8',
  },
  2: {
    pos: [-2.2, 4.2, -0.5],
    lookAt: [0.5, 0.5, -1.2],
    screenPos: [3.3, 2.3, 0.0],
    screenRotY: -Math.PI / 2,
    floorPatchPos: [-0.2, 0.045, -0.4],
    floorPatchSize: [6.8, 5.2],
    floorPatchRotY: 0,
    title: 'Ch#2: गल्ला व डीप फ्रीजर',
    color: 0xf43f5e,
    hex: '#f43f5e',
  },
  3: {
    pos: [2.8, 4.2, -2.5],
    lookAt: [-0.5, 0.5, -2.5],
    screenPos: [0.0, 2.35, -4.4],
    screenRotY: 0,
    floorPatchPos: [0.2, 0.04, -3.2],
    floorPatchSize: [7.2, 3.6],
    floorPatchRotY: 0,
    title: 'Ch#3: तौल कांटा व आंतरिक रैक',
    color: 0xa855f7,
    hex: '#a855f7',
  },
  4: {
    pos: [4.2, 4.5, 4.8],
    lookAt: [6.5, 0.5, 8.2],
    screenPos: [6.2, 2.35, 5.2],
    screenRotY: -0.35,
    floorPatchPos: [5.4, 0.035, 7.6],
    floorPatchSize: [8.5, 5.4],
    floorPatchRotY: 0,
    title: 'Ch#4: मुख्य गेट व पूर्वी सड़क',
    color: 0x10b981,
    hex: '#10b981',
  },
  5: {
    pos: [-4.2, 4.5, 4.8],
    lookAt: [-6.5, 0.5, 8.2],
    screenPos: [-6.2, 2.35, 5.2],
    screenRotY: 0.35,
    floorPatchPos: [-5.4, 0.035, 7.6],
    floorPatchSize: [8.5, 5.4],
    floorPatchRotY: 0,
    title: 'Ch#5: बाहरी सड़क व पश्चिमी गली',
    color: 0xf59e0b,
    hex: '#f59e0b',
  },
};

/** Procedural Marble/Ceramic Dairy Tile Floor Texture */
function createMarbleTileTexture(isRealistic: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = isRealistic ? '#cbd5e1' : '#0f172a';
  ctx.fillRect(0, 0, 512, 512);

  const tiles = 8;
  const step = 512 / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const alt = (x + y) % 2 === 0;
      ctx.fillStyle = isRealistic
        ? alt ? '#e2e8f0' : '#cbd5e1'
        : alt ? '#0f172a' : '#131c31';
      ctx.fillRect(x * step + 2, y * step + 2, step - 4, step - 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Procedural Asphalt Street Texture with Yellow Dashed Divider & Crosswalk */
function createAsphaltRoadTexture(isRealistic: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = isRealistic ? '#1e2430' : '#090d16';
  ctx.fillRect(0, 0, 1024, 256);

  // Subtle asphalt grain
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(Math.random() * 1024, Math.random() * 256, 2, 2);
  }

  // Sidewalk top & bottom edge lines
  ctx.fillStyle = isRealistic ? '#94a3b8' : '#06b6d4';
  ctx.fillRect(0, 8, 1024, 5);
  ctx.fillRect(0, 243, 1024, 5);

  // Center yellow dashed road divider
  ctx.fillStyle = isRealistic ? '#facc15' : '#0ea5e9';
  for (let x = 20; x < 1024; x += 80) {
    ctx.fillRect(x, 124, 44, 8);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Procedural Hindi Shop Signboard Texture */
function createShopSignboardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 192;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.5, '#1e3a8a');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 192);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 1012, 180);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🥛 श्री कृष्णा डेयरी एवं मिल्क पार्लर', 512, 86);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 30px monospace';
  ctx.fillText('LIVE 3D AI DIGITAL TWIN • 5-CAMERA SURVEILLANCE', 512, 144);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build a Floating 3D Overhead Tag + Live Camera Photo Cutout Sprite for a 3D Person/Vehicle */
function buildOverheadCardSprite(ent: Tracked3DEntity, cutImg?: HTMLImageElement): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 340;
  c.height = 140;
  const ctx = c.getContext('2d')!;

  // Rounded glass pill card
  ctx.fillStyle = 'rgba(9, 14, 26, 0.88)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 332, 132, 22);
  ctx.fill();

  const hexCol = '#' + ent.color.toString(16).padStart(6, '0');
  ctx.strokeStyle = hexCol;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Draw live camera cutout thumbnail on left if available
  let textStartX = 20;
  if (cutImg) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(14, 14, 92, 112, 14);
    ctx.clip();
    ctx.drawImage(cutImg, 14, 14, 92, 112);
    ctx.restore();
    textStartX = 120;
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 23px sans-serif';
  ctx.fillText(ent.label.slice(0, 22), textStartX, 52);

  ctx.fillStyle = hexCol;
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`3D: (${ent.targetX.toFixed(1)}m, ${ent.targetZ.toFixed(1)}m)`, textStartX, 88);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`● LIVE YOLO ${ent.confidence}%`, textStartX, 118);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(1.85, 0.76, 1);
  sp.position.set(0, 2.25, 0);
  sp.name = 'overheadCard';
  return sp;
}

/** Build a Live 3D Colored Volumetric Point-Cloud Splat from a Camera Frame (Gaussian / LiDAR style 3D points) */
function createPointCloudFromImage(
  img: HTMLImageElement,
  cfg: typeof CAM_3D_ANCHORS[number]
): THREE.Points {
  const cols = 64;
  const rows = 44;
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, cols, rows);
  const data = ctx.getImageData(0, 0, cols, rows).data;

  const numPts = cols * rows;
  const positions = new Float32Array(numPts * 3);
  const colors = new Float32Array(numPts * 3);

  const [px, , pz] = cfg.floorPatchPos;
  const [sw, sh] = cfg.floorPatchSize;

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

      // Project into 3D volumetric space (floor + vertical depth relief up to 1.85m)
      positions[k * 3] = px + u * sw;
      positions[k * 3 + 1] = 0.08 + lum * 1.45 * (1 - Math.abs(v) * 0.4);
      positions[k * 3 + 2] = pz + v * sh;

      colors[k * 3] = Math.min(1, cr * 1.15);
      colors[k * 3 + 1] = Math.min(1, cg * 1.15);
      colors[k * 3 + 2] = Math.min(1, cb * 1.15);
      k++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.14,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
  });
  return new THREE.Points(geo, mat);
}

function project2DDetectionTo3DWorld(det: DetectedObject, channel: number): {
  x: number;
  z: number;
  kind: Tracked3DEntity['kind'];
  label: string;
  color: number;
} {
  const cx = det.box.x + det.box.width / 2;
  const cy = det.box.y + det.box.height / 2;
  const ny2 = det.box.y + det.box.height;

  if (det.className === 'motorcycle' || det.className === 'bicycle') {
    const sideOffset = channel === 5 ? -5.0 : channel === 4 ? 4.5 : 0;
    return {
      x: sideOffset + (cx - 0.5) * 7.0,
      z: 7.2 + (1 - cy) * 3.0,
      kind: 'BIKE',
      label: `🏍️ बाइक (${det.confidence}%)`,
      color: 0xf59e0b,
    };
  }

  if (det.className === 'car' || det.className === 'truck' || det.className === 'bus') {
    const sideOffset = channel === 5 ? -5.5 : 4.5;
    return {
      x: sideOffset + (cx - 0.5) * 8.0,
      z: 8.5 + (1 - cy) * 2.5,
      kind: 'CAR',
      label: `🚗 वाहन (${det.confidence}%)`,
      color: 0x3b82f6,
    };
  }

  if (channel === 1) {
    if (cy > 0.45 || (cx > 0.45 && cy > 0.30)) {
      return {
        x: 0.5 + (cx - 0.5) * 4.5,
        z: 1.5 + (cy - 0.5) * 1.8,
        kind: 'STAFF',
        label: `👨‍💼 काउंटर स्टाफ`,
        color: 0x6366f1,
      };
    }
    if (ny2 < 0.37) {
      return {
        x: (cx - 0.5) * 8.0,
        z: 6.8 + (0.4 - ny2) * 4.0,
        kind: 'PASSERBY',
        label: `🚶 राहगीर`,
        color: 0x94a3b8,
      };
    }
    return {
      x: (cx - 0.5) * 4.8,
      z: 4.3 + (0.5 - ny2) * 1.6,
      kind: 'CUSTOMER',
      label: `👤 ग्राहक @ काउंटर`,
      color: 0x10b981,
    };
  }

  if (channel === 2) {
    return {
      x: -2.5 + cx * 5.0,
      z: -2.2 + cy * 3.2,
      kind: 'STAFF',
      label: `👨‍💼 गल्ला/फ्रीजर ज़ोन`,
      color: 0xf43f5e,
    };
  }

  if (channel === 3) {
    return {
      x: -2.2 + cx * 4.8,
      z: -3.5 + cy * 2.8,
      kind: 'STAFF',
      label: `👤 आंतरिक रैक ज़ोन`,
      color: 0x38bdf8,
    };
  }

  if (channel === 4) {
    return {
      x: 3.2 + (cx - 0.5) * 6.0,
      z: 6.2 + (1 - cy) * 3.5,
      kind: ny2 > 0.48 ? 'CUSTOMER' : 'PASSERBY',
      label: ny2 > 0.48 ? `🚶 गेट प्रवेश` : `🚶 सड़क राहगीर`,
      color: ny2 > 0.48 ? 0x10b981 : 0x94a3b8,
    };
  }

  return {
    x: -4.2 + (cx - 0.5) * 6.0,
    z: 6.5 + (1 - cy) * 3.5,
    kind: 'PASSERBY',
    label: `🚶 गली/सड़क`,
    color: 0xf59e0b,
  };
}

function cropDetectionToDataUrl(img: HTMLImageElement, det: DetectedObject): string | undefined {
  try {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 128;
    const ctx = c.getContext('2d');
    if (!ctx) return undefined;
    const sx = Math.max(0, det.box.x * img.naturalWidth);
    const sy = Math.max(0, det.box.y * img.naturalHeight);
    const sw = Math.max(16, Math.min(img.naturalWidth - sx, det.box.width * img.naturalWidth));
    const sh = Math.max(16, Math.min(img.naturalHeight - sy, det.box.height * img.naturalHeight));
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 96, 128);
    return c.toDataURL('image/jpeg', 0.82);
  } catch {
    return undefined;
  }
}

function displaceMeshFromImage(mesh: THREE.Mesh, img: HTMLImageElement, maxHeight = 0.65) {
  try {
    const geo = mesh.geometry as THREE.PlaneGeometry;
    const posAttr = geo.attributes.position;
    if (!posAttr) return;
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = 48;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, 48, 48);
    const pixels = ctx.getImageData(0, 0, 48, 48).data;

    for (let i = 0; i < posAttr.count; i++) {
      const u = Math.min(47, Math.max(0, Math.floor(((posAttr.getX(i) / geo.parameters.width) + 0.5) * 47)));
      const v = Math.min(47, Math.max(0, Math.floor((0.5 - (posAttr.getY(i) / geo.parameters.height)) * 47)));
      const pIdx = (v * 48 + u) * 4;
      const lum = (pixels[pIdx] * 0.299 + pixels[pIdx + 1] * 0.587 + pixels[pIdx + 2] * 0.114) / 255;
      const edgeFade = Math.sin((u / 47) * Math.PI) * Math.sin((v / 47) * Math.PI);
      posAttr.setZ(i, lum * maxHeight * edgeFade);
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
  } catch {
    // ignore
  }
}

export const UnifiedStore360View: React.FC<Props> = ({
  cameras,
  gridSnapshots,
  pairingBlocks,
  onSelectSingleCamera,
  onOpenVisualPairingForChannel,
  todayStats,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // 3 Selectable 3D Realism Modes:
  // 1. 'REALISTIC_3D': Ultra-Realistic Architectural PBR Dairy + Live Ground Depth Mesh + Animated Humans with Live Photo Cards
  // 2. 'POINT_CLOUD_3D': Live 3D Volumetric Point-Cloud / Gaussian-Style Depth Splat reconstructed from all 5 DVR cameras
  // 3. 'CYBER_RADAR': Classic Tesla FSD Dark Neon Radar View
  const [visualStyle, setVisualStyle] = useState<'REALISTIC_3D' | 'POINT_CLOUD_3D' | 'CYBER_RADAR'>('REALISTIC_3D');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [show3DVideoWalls, setShow3DVideoWalls] = useState<boolean>(true);
  const [showLaserCones, setShowLaserCones] = useState<boolean>(true);
  const [selectedZoneCh, setSelectedZoneCh] = useState<number>(1);
  const [activePreset, setActivePreset] = useState<'DRONE_TOP' | 'TESLA_ISO' | 'COUNTER' | 'STREET'>('TESLA_ISO');
  const [liveEntities, setLiveEntities] = useState<Tracked3DEntity[]>([]);
  const [yoloScanChannel, setYoloScanChannel] = useState<number>(1);

  const orbitRef = useRef({
    theta: 0.22,
    phi: 0.65,
    radius: 14.5,
    targetX: 0,
    targetY: 0.65,
    targetZ: 1.4,
    isDragging: false,
    lastX: 0,
    lastY: 0,
  });

  const entitiesRef = useRef<Tracked3DEntity[]>([
    {
      id: 'init-counter-staff',
      kind: 'STAFF',
      label: '👨‍💼 काउंटर डेस्क [Ch#1]',
      channel: 1,
      confidence: 95,
      targetX: 1.7,
      targetZ: 2.0,
      curX: 1.7,
      curZ: 2.0,
      color: 0x6366f1,
      lastSeen: Date.now(),
    },
    {
      id: 'init-customer-1',
      kind: 'CUSTOMER',
      label: '👤 ग्राहक @ दूध पतीला [Ch#1]',
      channel: 1,
      confidence: 92,
      targetX: 0.2,
      targetZ: 4.3,
      curX: 0.2,
      curZ: 4.3,
      color: 0x10b981,
      lastSeen: Date.now(),
    },
    {
      id: 'init-staff-2',
      kind: 'STAFF',
      label: '👨‍🔧 स्टाफ @ डीप फ्रीजर [Ch#2]',
      channel: 2,
      confidence: 89,
      targetX: -2.6,
      targetZ: -0.6,
      curX: -2.6,
      curZ: -0.6,
      color: 0xf43f5e,
      lastSeen: Date.now(),
    },
  ]);

  const videoTexturesRef = useRef<Record<number, THREE.Texture>>({});
  const videoMeshesRef = useRef<Record<number, THREE.Mesh>>({});
  const floorPatchMeshesRef = useRef<Record<number, THREE.Mesh>>({});
  const pointCloudGroupRef = useRef<THREE.Group | null>(null);
  const coneMeshesRef = useRef<Record<number, THREE.Mesh>>({});
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const blocksGroupRef = useRef<THREE.Group | null>(null);

  const applyCameraPreset = useCallback((preset: 'DRONE_TOP' | 'TESLA_ISO' | 'COUNTER' | 'STREET') => {
    setActivePreset(preset);
    const o = orbitRef.current;
    if (preset === 'DRONE_TOP') {
      o.theta = 0;
      o.phi = 0.20;
      o.radius = 16.5;
      o.targetX = 0;
      o.targetZ = 1.2;
    } else if (preset === 'TESLA_ISO') {
      o.theta = 0.24;
      o.phi = 0.66;
      o.radius = 14.5;
      o.targetX = 0;
      o.targetZ = 1.4;
    } else if (preset === 'COUNTER') {
      o.theta = 0.05;
      o.phi = 0.80;
      o.radius = 8.6;
      o.targetX = 0.2;
      o.targetZ = 2.8;
    } else if (preset === 'STREET') {
      o.theta = -0.32;
      o.phi = 0.72;
      o.radius = 16.0;
      o.targetX = 0;
      o.targetZ = 4.5;
    }
  }, []);

  // Load Live DVR Camera Textures into 3D Wall Screens, 3D Ground Relief Meshes, AND 3D Volumetric Point-Cloud Splats
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
            wallMesh.material.needsUpdate = true;
          }

          const floorPatch = floorPatchMeshesRef.current[ch];
          if (floorPatch && floorPatch.material instanceof THREE.MeshStandardMaterial) {
            floorPatch.material.map = tex;
            floorPatch.material.color.setHex(0xffffff);
            floorPatch.material.needsUpdate = true;
            if (tex.image instanceof HTMLImageElement) {
              displaceMeshFromImage(floorPatch, tex.image, visualStyle === 'REALISTIC_3D' ? 0.65 : 0.18);
            }
          }

          // Update 3D Volumetric Point Cloud if in POINT_CLOUD_3D mode
          if (visualStyle === 'POINT_CLOUD_3D' && pointCloudGroupRef.current && tex.image instanceof HTMLImageElement) {
            const pcGrp = pointCloudGroupRef.current;
            const prevPc = pcGrp.getObjectByName(`pc-ch-${ch}`);
            if (prevPc) pcGrp.remove(prevPc);
            const cfg = CAM_3D_ANCHORS[ch];
            if (cfg) {
              const pts = createPointCloudFromImage(tex.image, cfg);
              pts.name = `pc-ch-${ch}`;
              pcGrp.add(pts);
            }
          }

          if (old) old.dispose();
        },
        undefined,
        () => {}
      );
    });
  }, [gridSnapshots, cameras, visualStyle]);

  useEffect(() => {
    Object.values(videoMeshesRef.current).forEach((m) => {
      m.visible = show3DVideoWalls;
    });
    Object.values(coneMeshesRef.current).forEach((m) => {
      m.visible = showLaserCones;
    });
  }, [show3DVideoWalls, showLaserCones]);

  useEffect(() => {
    const grp = blocksGroupRef.current;
    if (!grp) return;
    while (grp.children.length > 0) {
      grp.remove(grp.children[0]);
    }

    const zoneCenters: Record<number, [number, number]> = {
      1: [0.4, 3.4],
      2: [2.3, 1.8],
      3: [0.2, -1.8],
      4: [4.2, 5.2],
      5: [-3.5, -2.5],
    };

    pairingBlocks.forEach((b, idx) => {
      const ch = Number(b.cameraChannel) || 1;
      const base = zoneCenters[ch] || [0, 0];
      const offsetX = ((idx % 2) - 0.5) * 0.6;
      const bx = base[0] + offsetX;
      const bz = base[1];
      const col = new THREE.Color(b.color || '#10b981');

      const boxGeo = new THREE.BoxGeometry(1.7, 1.15, 1.3);
      const boxMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: visualStyle === 'REALISTIC_3D' ? 0.12 : 0.18,
        depthWrite: false,
      });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.position.set(bx, 0.6, bz);
      grp.add(boxMesh);

      const edges = new THREE.EdgesGeometry(boxGeo);
      const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: col }));
      wire.position.copy(boxMesh.position);
      grp.add(wire);
    });
  }, [pairingBlocks, visualStyle]);

  // Multi-Camera Live YOLOv8 3D Reconstruction + Photo-Cutout Extraction
  useEffect(() => {
    let cancelled = false;
    let step = 0;

    const runMultiCam3DScan = async () => {
      if (cancelled || cameras.length === 0) return;
      const cam = cameras[step % cameras.length];
      const ch = cam.channel || (step % cameras.length) + 1;
      step += 1;

      const snapUrl = gridSnapshots[cam._id];
      if (!snapUrl) return;

      try {
        await mobileYolo.initModel();
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = snapUrl;
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
        });
        const dets = await mobileYolo.detectFrame(img);
        if (cancelled) return;

        setYoloScanChannel(ch);
        const now = Date.now();
        const relevante = dets.filter((d) =>
          ['person', 'motorcycle', 'bicycle', 'car', 'truck'].includes(d.className)
        );

        const otherEntities = entitiesRef.current.filter(
          (e) => e.channel !== ch && now - e.lastSeen < 18000
        );

        const newForCh: Tracked3DEntity[] = relevante.slice(0, 4).map((det, i) => {
          const p3 = project2DDetectionTo3DWorld(det, ch);
          const id = `ch${ch}-${p3.kind}-${i}`;
          const prev = entitiesRef.current.find((e) => e.id === id);
          const cropUrl = cropDetectionToDataUrl(img, det);
          return {
            id,
            kind: p3.kind,
            label: `${p3.label} [Ch#${ch}]`,
            channel: ch,
            confidence: det.confidence,
            targetX: p3.x,
            targetZ: p3.z,
            curX: prev ? prev.curX : p3.x,
            curZ: prev ? prev.curZ : p3.z,
            color: p3.color,
            lastSeen: now,
            cropDataUrl: cropUrl,
          };
        });

        const merged = [...otherEntities, ...newForCh];
        if (merged.length > 0) {
          entitiesRef.current = merged;
          setLiveEntities([...merged]);
        }
      } catch {
        // Ignore single frame error
      }
    };

    const iv = setInterval(runMultiCam3DScan, 2000);
    runMultiCam3DScan();
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [cameras, gridSnapshots]);

  // Initialize Three.js WebGL 3D Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isRealistic = visualStyle === 'REALISTIC_3D';
    const isPointCloud = visualStyle === 'POINT_CLOUD_3D';
    const width = container.clientWidth || 900;
    const height = 470;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isRealistic ? 0x0f172a : 0x050811);
    scene.fog = new THREE.FogExp2(isRealistic ? 0x0f172a : 0x050811, isRealistic ? 0.012 : 0.02);

    const camera = new THREE.PerspectiveCamera(43, width / height, 0.1, 130);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isRealistic ? 1.25 : 1.05;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Rich Multi-Point Lighting (Warm Showroom + Daylight Sun)
    const hemiLight = new THREE.HemisphereLight(
      isRealistic ? 0xffffff : 0xdbeafe,
      isRealistic ? 0x334155 : 0x0f172a,
      isRealistic ? 1.9 : 1.35
    );
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(isRealistic ? 0xfffbeb : 0x38bdf8, isRealistic ? 2.4 : 1.8);
    sunLight.position.set(14, 24, 16);
    sunLight.castShadow = true;
    scene.add(sunLight);

    const counterSpot = new THREE.PointLight(isRealistic ? 0xfef3c7 : 0x10b981, isRealistic ? 2.8 : 2.2, 18);
    counterSpot.position.set(0, 4.2, 2.8);
    scene.add(counterSpot);

    const bhattiGlow = new THREE.PointLight(0xf97316, isRealistic ? 2.2 : 1.0, 7);
    bhattiGlow.position.set(4.1, 0.8, -1.2);
    scene.add(bhattiGlow);

    // 1. PROCEDURAL MARBLE TILE FLOOR & ASPHALT STREET
    const gridHelper = new THREE.GridHelper(38, 38, isRealistic ? 0x334155 : 0x0ea5e9, 0x1e293b);
    gridHelper.position.y = 0.005;
    scene.add(gridHelper);

    const tileTex = createMarbleTileTexture(isRealistic);
    const shopFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(12.2, 9.8),
      new THREE.MeshStandardMaterial({
        map: tileTex,
        roughness: isRealistic ? 0.22 : 0.45,
        metalness: 0.15,
      })
    );
    shopFloor.rotation.x = -Math.PI / 2;
    shopFloor.position.set(0, 0.015, -0.4);
    shopFloor.receiveShadow = true;
    scene.add(shopFloor);

    // Concrete Sidewalk Curb between Shop and Street
    const curbMat = new THREE.MeshStandardMaterial({ color: isRealistic ? 0x94a3b8 : 0x1e293b, roughness: 0.6 });
    const curb = new THREE.Mesh(new THREE.BoxGeometry(36, 0.14, 0.65), curbMat);
    curb.position.set(0, 0.07, 4.75);
    scene.add(curb);

    // Realistic Textured Asphalt Street (Z = +5.1 to +11.6)
    const roadTex = createAsphaltRoadTexture(isRealistic);
    const roadMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 6.5),
      new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.82 })
    );
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(0, 0.012, 8.35);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    // Street Lamp Posts on Sidewalk
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2 });
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

    // 2. PHOTOGRAMMETRIC 3D GROUND-PROJECTED LIVE CAMERA PATCHES
    floorPatchMeshesRef.current = {};
    const pcGroup = new THREE.Group();
    scene.add(pcGroup);
    pointCloudGroupRef.current = pcGroup;

    Object.entries(CAM_3D_ANCHORS).forEach(([chStr, cfg]) => {
      const ch = Number(chStr);
      const patchGeo = new THREE.PlaneGeometry(cfg.floorPatchSize[0], cfg.floorPatchSize[1], 47, 47);
      const patchMat = new THREE.MeshStandardMaterial({
        color: isRealistic ? 0xcbd5e1 : 0x1e293b,
        roughness: 0.38,
        metalness: 0.1,
        transparent: true,
        opacity: isRealistic ? 0.94 : isPointCloud ? 0.45 : 0.38,
        side: THREE.DoubleSide,
      });
      if (videoTexturesRef.current[ch]) {
        patchMat.map = videoTexturesRef.current[ch];
        patchMat.color.setHex(0xffffff);
      }
      const patchMesh = new THREE.Mesh(patchGeo, patchMat);
      patchMesh.rotation.x = -Math.PI / 2;
      patchMesh.position.set(...cfg.floorPatchPos);
      scene.add(patchMesh);
      floorPatchMeshesRef.current[ch] = patchMesh;

      if (videoTexturesRef.current[ch]?.image instanceof HTMLImageElement) {
        const imgEl = videoTexturesRef.current[ch].image as HTMLImageElement;
        displaceMeshFromImage(patchMesh, imgEl, isRealistic ? 0.65 : 0.18);
        if (isPointCloud) {
          const pts = createPointCloudFromImage(imgEl, cfg);
          pts.name = `pc-ch-${ch}`;
          pcGroup.add(pts);
        }
      }
    });

    // 3. DETAILED 3D DAIRY SHOP ARCHITECTURE, SIGNBOARD, STOCKED RACKS & EQUIPMENT
    const add3DBox = (
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

    // Shop Pillars & Glass Walls
    const pillarMat = new THREE.MeshStandardMaterial({ color: isRealistic ? 0xe2e8f0 : 0x1e293b, roughness: 0.3 });
    for (const [px, pz] of [[-5.9, 4.4], [5.9, 4.4], [-5.9, -4.9], [5.9, -4.9]]) {
      add3DBox(0.38, 3.6, 0.38, px, 1.8, pz, pillarMat, 0x38bdf8);
    }

    // Glowing Hindi Shop Fascia Signboard above the Front Entrance
    const signTex = createShopSignboardTexture();
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 1.05, 0.22),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    signBoard.position.set(0, 3.65, 4.4);
    scene.add(signBoard);

    const wallMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0x94a3b8 : 0x1e293b,
      transparent: true,
      opacity: isRealistic ? 0.32 : 0.4,
      roughness: 0.35,
    });
    add3DBox(12.0, 3.2, 0.18, 0, 1.6, -5.0, wallMat, 0x475569);
    add3DBox(0.18, 3.2, 9.6, -5.9, 1.6, -0.2, wallMat, 0x475569);
    add3DBox(0.18, 3.2, 9.6, 5.9, 1.6, -0.2, wallMat, 0x475569);

    // Main Dairy Counter with Granite Top & Glass Sweet/Paneer Display Front (Ch#1)
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
    add3DBox(6.4, 0.98, 1.15, 0, 0.49, 3.3, counterBaseMat, isRealistic ? 0x64748b : 0x0ea5e9);
    add3DBox(6.55, 0.09, 1.26, 0, 1.02, 3.3, graniteTopMat, 0x38bdf8);

    // Digital Electronic Weighing Scale on Counter (with glowing green LED display)
    const scaleMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8, roughness: 0.2 });
    add3DBox(0.48, 0.14, 0.44, -0.35, 1.13, 3.35, scaleMat, 0x10b981);

    // Shiny Stainless Steel Milk Patila + White Milk + Ladle (Ch#1)
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.94,
      roughness: 0.1,
    });
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

    // Two Red Milk/Snack Trays Filled with Colorful Packets (Ch#1 left)
    const trayMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35 });
    for (const tx of [-1.2, -2.15]) {
      add3DBox(0.82, 0.24, 0.72, tx, 1.18, 3.3, trayMat, 0xf87171);
      // Milk/snack packets inside tray
      for (let p = 0; p < 3; p++) {
        const pktMat = new THREE.MeshStandardMaterial({
          color: p === 0 ? 0xfacc15 : p === 1 ? 0x38bdf8 : 0xf8fafc,
          roughness: 0.3,
        });
        add3DBox(0.22, 0.18, 0.48, tx - 0.22 + p * 0.22, 1.32, 3.3, pktMat);
      }
    }

    // Laptop on Counter Right (Ch#1)
    const laptopMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.2 });
    add3DBox(0.48, 0.04, 0.34, 1.85, 1.09, 3.1, laptopMat, 0x38bdf8);
    const laptopScreen = add3DBox(0.48, 0.32, 0.03, 1.85, 1.26, 3.25, laptopMat, 0x38bdf8);
    laptopScreen.rotation.x = -0.18;

    // Cash Galla Drawer Desk (Ch#2)
    const gallaMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0x78350f : 0x3b0764,
      roughness: 0.35,
    });
    add3DBox(1.55, 1.02, 1.15, 2.35, 0.51, 1.85, gallaMat, 0xf43f5e);

    // Two White Glass-Top Sliding Deep Freezers with Visible Inner Dairy Trays (Ch#2 & Ch#3)
    const whiteFreezerMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0xf1f5f9 : 0x1e3a5f,
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
      add3DBox(2.15, 0.94, 1.18, fx, 0.47, -1.2, whiteFreezerMat, 0x38bdf8);
      add3DBox(2.0, 0.05, 1.05, fx, 0.96, -1.2, glassLidMat);
    }

    // Orange Staff Chair on Left of Ch#2
    const chairMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.35 });
    add3DBox(0.68, 0.48, 0.68, -3.4, 0.24, -0.5, chairMat);
    add3DBox(0.12, 0.58, 0.68, -3.7, 0.75, -0.5, chairMat);

    // Right-Side Milk Boiling Bhatti / Kadhai + 4 Shiny 50L Stainless Steel Milk Cans (Ch#2 right)
    const bhattiMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    add3DBox(1.15, 0.78, 1.15, 4.1, 0.39, -1.2, bhattiMat, 0xf97316);
    const kadhai = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 0.32, 24), steelMat);
    kadhai.position.set(4.1, 0.92, -1.2);
    scene.add(kadhai);

    for (const [cx, cz] of [[3.8, 0.35], [4.45, 0.35], [3.8, -0.25], [4.45, -0.25]]) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.25, 0.78, 22), steelMat);
      can.position.set(cx, 0.39, cz);
      can.castShadow = true;
      scene.add(can);
    }

    // 4-Tier Stocked Kirana & Dairy Back Wall Shelf Rack (Ch#3)
    const rackFrameMat = new THREE.MeshStandardMaterial({ color: isRealistic ? 0x334155 : 0x1e293b, metalness: 0.5 });
    add3DBox(7.4, 2.35, 0.85, 0.2, 1.18, -4.25, rackFrameMat, isRealistic ? 0x94a3b8 : 0xa855f7);
    const itemColors = [0xef4444, 0xf59e0b, 0x10b981, 0x3b82f6, 0xec4899, 0xf8fafc];
    for (let tier = 0; tier < 3; tier++) {
      const sy = 0.55 + tier * 0.65;
      for (let slot = 0; slot < 8; slot++) {
        const sx = -2.6 + slot * 0.78;
        const pMat = new THREE.MeshStandardMaterial({
          color: itemColors[(tier * 8 + slot) % itemColors.length],
          roughness: 0.3,
        });
        add3DBox(0.45, 0.38, 0.45, sx, sy, -4.05, pMat);
      }
    }

    // 4. 3D LIVE CAMERA SCREENS & VISION CONES
    videoMeshesRef.current = {};
    coneMeshesRef.current = {};

    Object.entries(CAM_3D_ANCHORS).forEach(([chStr, cfg]) => {
      const ch = Number(chStr);
      const screenGeo = new THREE.PlaneGeometry(3.15, 1.88);
      const screenMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
      });
      if (videoTexturesRef.current[ch]) {
        screenMat.map = videoTexturesRef.current[ch];
      } else {
        screenMat.color.setHex(0x1e293b);
      }
      const screenMesh = new THREE.Mesh(screenGeo, screenMat);
      screenMesh.position.set(...cfg.screenPos);
      screenMesh.rotation.y = cfg.screenRotY;
      screenMesh.visible = show3DVideoWalls;
      scene.add(screenMesh);
      videoMeshesRef.current[ch] = screenMesh;

      const borderEdges = new THREE.EdgesGeometry(screenGeo);
      screenMesh.add(new THREE.LineSegments(borderEdges, new THREE.LineBasicMaterial({ color: cfg.color })));

      const coneGeo = new THREE.ConeGeometry(1.5, 3.6, 4, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        wireframe: true,
        transparent: true,
        opacity: isRealistic ? 0.12 : 0.24,
      });
      const coneMesh = new THREE.Mesh(coneGeo, coneMat);
      coneMesh.position.set(cfg.pos[0], cfg.pos[1] - 1.1, cfg.pos[2]);
      coneMesh.lookAt(...cfg.lookAt);
      coneMesh.visible = showLaserCones;
      scene.add(coneMesh);
      coneMeshesRef.current[ch] = coneMesh;
    });

    const blocksGroup = new THREE.Group();
    scene.add(blocksGroup);
    blocksGroupRef.current = blocksGroup;

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);
    dynamicGroupRef.current = dynamicGroup;

    const entityMeshMap: Record<string, THREE.Group> = {};

    const create3DEntityGroup = (ent: Tracked3DEntity): THREE.Group => {
      const g = new THREE.Group();

      if (ent.kind === 'BIKE') {
        const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.14, 18);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });
        const wFront = new THREE.Mesh(wheelGeo, wheelMat);
        wFront.rotation.z = Math.PI / 2;
        wFront.position.set(0, 0.3, 0.55);
        g.add(wFront);

        const wBack = new THREE.Mesh(wheelGeo, wheelMat);
        wBack.rotation.z = Math.PI / 2;
        wBack.position.set(0, 0.3, -0.55);
        g.add(wBack);

        const bodyMat = new THREE.MeshStandardMaterial({
          color: isRealistic ? 0xdc2626 : ent.color,
          metalness: 0.65,
          roughness: 0.2,
        });
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 1.28), bodyMat);
        frame.position.set(0, 0.58, 0);
        g.add(frame);
      } else if (ent.kind === 'CAR') {
        const carMat = new THREE.MeshStandardMaterial({
          color: isRealistic ? 0xf8fafc : ent.color,
          metalness: 0.75,
          roughness: 0.18,
        });
        const lower = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 3.3), carMat);
        lower.position.y = 0.42;
        g.add(lower);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.45, 1.75), carMat);
        cabin.position.set(0, 0.88, -0.1);
        g.add(cabin);
      } else {
        // Articulated Animated 3D Human (Legs, Shoes, Torso, Arms, Neck, Head, Hair, Milk Bag)
        const pantsMat = new THREE.MeshStandardMaterial({
          color: isRealistic ? 0x1e293b : ent.color,
          roughness: 0.55,
        });
        const shirtColor =
          ent.kind === 'CUSTOMER'
            ? isRealistic ? 0x059669 : ent.color
            : isRealistic ? 0x2563eb : ent.color;
        const shirtMat = new THREE.MeshStandardMaterial({
          color: shirtColor,
          roughness: 0.35,
        });
        const skinMat = new THREE.MeshStandardMaterial({
          color: isRealistic ? 0xf1c27d : ent.color,
          roughness: 0.4,
        });
        const hairMat = new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.6,
        });

        const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.72, 12);
        const leftLeg = new THREE.Mesh(legGeo, pantsMat);
        leftLeg.position.set(-0.12, 0.36, 0);
        leftLeg.name = 'leftLeg';
        g.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeo, pantsMat);
        rightLeg.position.set(0.12, 0.36, 0);
        rightLeg.name = 'rightLeg';
        g.add(rightLeg);

        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.64, 0.28), shirtMat);
        torso.position.set(0, 1.03, 0);
        torso.castShadow = true;
        torso.name = 'torso';
        g.add(torso);

        const armGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.56, 10);
        const leftArm = new THREE.Mesh(armGeo, shirtMat);
        leftArm.position.set(-0.31, 1.01, 0);
        leftArm.name = 'leftArm';
        g.add(leftArm);

        const rightArm = new THREE.Mesh(armGeo, shirtMat);
        rightArm.position.set(0.31, 1.01, 0);
        rightArm.name = 'rightArm';
        g.add(rightArm);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 18, 18), skinMat);
        head.position.set(0, 1.54, 0);
        g.add(head);

        const hairCap = new THREE.Mesh(
          new THREE.SphereGeometry(0.192, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
          hairMat
        );
        hairCap.position.set(0, 1.56, -0.01);
        g.add(hairCap);
      }

      // Floating High-DPI 3D Overhead Photo + Name Card Sprite
      if (ent.cropDataUrl) {
        const img = new Image();
        img.onload = () => {
          const oldCard = g.getObjectByName('overheadCard');
          if (oldCard) g.remove(oldCard);
          g.add(buildOverheadCardSprite(ent, img));
        };
        img.src = ent.cropDataUrl;
      } else {
        g.add(buildOverheadCardSprite(ent));
      }

      // Ground Target Ring
      const ringGeo = new THREE.RingGeometry(0.42, 0.58, 28);
      const ringMat = new THREE.MeshBasicMaterial({
        color: ent.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      ring.name = 'pulseRing';
      g.add(ring);

      return g;
    };

    let animId = 0;
    let clock = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      clock += 0.035;

      const o = orbitRef.current;
      if (!o.isDragging && autoRotate) {
        o.theta += 0.0028;
      }

      const sinPhi = Math.sin(o.phi);
      camera.position.x = o.targetX + o.radius * sinPhi * Math.sin(o.theta);
      camera.position.y = o.targetY + o.radius * Math.cos(o.phi);
      camera.position.z = o.targetZ + o.radius * sinPhi * Math.cos(o.theta);
      camera.lookAt(o.targetX, o.targetY, o.targetZ);

      const activeIds = new Set<string>();
      entitiesRef.current.forEach((ent, idx) => {
        activeIds.add(ent.id);
        const dx = ent.targetX - ent.curX;
        const dz = ent.targetZ - ent.curZ;
        const speed = Math.hypot(dx, dz);
        ent.curX += dx * 0.08;
        ent.curZ += dz * 0.08;

        let meshGrp = entityMeshMap[ent.id];
        if (!meshGrp) {
          meshGrp = create3DEntityGroup(ent);
          entityMeshMap[ent.id] = meshGrp;
          dynamicGroup.add(meshGrp);
        }
        meshGrp.position.set(ent.curX, 0, ent.curZ);

        // Face towards the counter or movement direction
        if (speed > 0.03) {
          meshGrp.rotation.y = Math.atan2(dx, dz);
        } else if (ent.kind === 'CUSTOMER') {
          meshGrp.rotation.y = Math.PI; // face the counter patila
        }

        // Natural limb swing & idle breathing animation
        const swing = speed > 0.02 ? Math.sin(clock * 4.5 + idx) * 0.45 : Math.sin(clock * 1.5 + idx) * 0.06;
        const lLeg = meshGrp.getObjectByName('leftLeg');
        const rLeg = meshGrp.getObjectByName('rightLeg');
        const lArm = meshGrp.getObjectByName('leftArm');
        const rArm = meshGrp.getObjectByName('rightArm');
        if (lLeg && rLeg && lArm && rArm) {
          lLeg.rotation.x = swing;
          rLeg.rotation.x = -swing;
          lArm.rotation.x = -swing * 0.8;
          rArm.rotation.x = swing * 0.8;
        }

        const ring = meshGrp.getObjectByName('pulseRing');
        if (ring) {
          const s = 1 + Math.sin(clock * 2.5 + idx) * 0.16;
          ring.scale.set(s, s, 1);
        }
      });

      Object.keys(entityMeshMap).forEach((id) => {
        if (!activeIds.has(id)) {
          dynamicGroup.remove(entityMeshMap[id]);
          delete entityMeshMap[id];
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 900;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [autoRotate, visualStyle]);

  const onPointerDown = (clientX: number, clientY: number) => {
    orbitRef.current.isDragging = true;
    orbitRef.current.lastX = clientX;
    orbitRef.current.lastY = clientY;
  };

  const onPointerMove = (clientX: number, clientY: number) => {
    const o = orbitRef.current;
    if (!o.isDragging) return;
    const dx = clientX - o.lastX;
    const dy = clientY - o.lastY;
    o.lastX = clientX;
    o.lastY = clientY;
    o.theta -= dx * 0.007;
    o.phi = Math.max(0.18, Math.min(1.38, o.phi - dy * 0.006));
  };

  const onPointerUp = () => {
    orbitRef.current.isDragging = false;
  };

  const onWheelZoom = (deltaY: number) => {
    const o = orbitRef.current;
    o.radius = Math.max(6.5, Math.min(26, o.radius + deltaY * 0.01));
  };

  const selectedCam =
    cameras.find((c) => Number(c.channel || 1) === Number(selectedZoneCh)) || cameras[0];
  const selectedSnap = selectedCam ? gridSnapshots[selectedCam._id] : null;
  const totalPicksAcrossShop = pairingBlocks.reduce(
    (sum, b) => sum + (b.shelfConfig?.pickCount || b.totalPicks || 0),
    0
  );

  return (
    <div className="space-y-4">
      {/* Top Control Header with 3-Mode Realism Switcher */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950/70 to-emerald-950/50 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-inner">
            <Compass className={`w-5 h-5 ${autoRotate ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs sm:text-sm font-black text-white tracking-wide">
                {visualStyle === 'REALISTIC_3D'
                  ? '🌍 ULTRA-REALISTIC 3D DAIRY REALITY VIEW (लाइव 3D फोटोरियलिस्टिक दुकान)'
                  : visualStyle === 'POINT_CLOUD_3D'
                  ? '✨ 3D VOLUMETRIC LIDAR / POINT-CLOUD VIEW (लाइव 3D डेप्थ पॉइंट-क्लाउड)'
                  : '🛸 TESLA CYBER RADAR 3D VIEW (साइबर होलोग्राफिक 3D व्यू)'}
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-mono font-bold">
                LIVE 3D • Ch#{yoloScanChannel}
              </span>
            </div>
            <p className="text-[11px] text-dark-300">
              {visualStyle === 'REALISTIC_3D'
                ? 'रियलिस्टिक मार्बल टाइल्स, साइनबोर्ड, भरा हुआ रैक, भट्टी, 3D कैमरा डेप्थ-फर्श और चलते हुए 3D इंसान + असली फोटो कार्ड'
                : visualStyle === 'POINT_CLOUD_3D'
                ? 'पाँचों कैमरों के पिक्सल्स से बनी 14,000+ 3D पॉइंट्स की लाइव होलोग्राफिक डेप्थ जाली (Gaussian/LiDAR Splat)'
                : 'Tesla FSD स्टाइल डार्क रडार ग्रिड, 3D अवतार, लेज़र कोन्स व लाइव वीडियो वॉल्स'}
            </p>
          </div>
        </div>

        {/* 3-Way 3D Engine Switcher + Angle Presets */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className="flex items-center bg-dark-950 p-1 rounded-xl border border-emerald-500/40 shadow">
            <button
              type="button"
              onClick={() => setVisualStyle('REALISTIC_3D')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition ${
                visualStyle === 'REALISTIC_3D'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white keep-white-text shadow'
                  : 'text-dark-300 hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>🌍 अल्ट्रा-रियलिस्टिक 3D</span>
            </button>
            <button
              type="button"
              onClick={() => setVisualStyle('POINT_CLOUD_3D')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition ${
                visualStyle === 'POINT_CLOUD_3D'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white keep-white-text shadow'
                  : 'text-dark-300 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>✨ 3D पॉइंट-क्लाउड</span>
            </button>
            <button
              type="button"
              onClick={() => setVisualStyle('CYBER_RADAR')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition ${
                visualStyle === 'CYBER_RADAR'
                  ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white keep-white-text shadow'
                  : 'text-dark-300 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>🛸 साइबर रडार 3D</span>
            </button>
          </div>

          <div className="flex items-center bg-dark-950 p-1 rounded-xl border border-dark-800">
            <button
              type="button"
              onClick={() => applyCameraPreset('TESLA_ISO')}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                activePreset === 'TESLA_ISO' ? 'bg-cyan-600 text-white keep-white-text' : 'text-dark-400 hover:text-white'
              }`}
            >
              3D एंगल
            </button>
            <button
              type="button"
              onClick={() => applyCameraPreset('DRONE_TOP')}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                activePreset === 'DRONE_TOP' ? 'bg-cyan-600 text-white keep-white-text' : 'text-dark-400 hover:text-white'
              }`}
            >
              🦅 ड्रोन टॉप
            </button>
            <button
              type="button"
              onClick={() => applyCameraPreset('COUNTER')}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                activePreset === 'COUNTER' ? 'bg-cyan-600 text-white keep-white-text' : 'text-dark-400 hover:text-white'
              }`}
            >
              🥛 काउंटर
            </button>
            <button
              type="button"
              onClick={() => applyCameraPreset('STREET')}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                activePreset === 'STREET' ? 'bg-cyan-600 text-white keep-white-text' : 'text-dark-400 hover:text-white'
              }`}
            >
              🛣️ सड़क
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
            <span>{autoRotate ? '360° घूम रहा है' : 'रोका'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShow3DVideoWalls(!show3DVideoWalls)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 transition ${
              show3DVideoWalls
                ? 'bg-indigo-600/25 border-indigo-500/50 text-indigo-300'
                : 'bg-dark-950 border-dark-800 text-dark-400'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3D स्क्रीन</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLaserCones(!showLaserCones)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 transition ${
              showLaserCones
                ? 'bg-cyan-600/25 border-cyan-500/50 text-cyan-300'
                : 'bg-dark-950 border-dark-800 text-dark-400'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>लेज़र</span>
          </button>
        </div>
      </div>

      {/* MAIN 3D WEBGL VIEWPORT */}
      <div className="relative rounded-3xl overflow-hidden bg-[#0b111e] border-2 border-cyan-500/30 shadow-2xl select-none">
        <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-20">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-mono font-bold text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>
                {visualStyle === 'REALISTIC_3D'
                  ? 'PBR REALISTIC 3D ARCHITECTURE + ANIMATED HUMANS & PHOTO CARDS'
                  : visualStyle === 'POINT_CLOUD_3D'
                  ? '14,000+ LIVE 3D DEPTH POINT-CLOUD SPLATS'
                  : 'CYBER HOLOGRAPHIC 3D RADAR'}
              </span>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-bold text-white border border-white/10">
              🟢 ग्राहक • 🔵 स्टाफ • 🔴 बाइक/वाहन
            </span>
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => applyCameraPreset('TESLA_ISO')}
              className="px-2.5 py-1 rounded-xl bg-black/75 hover:bg-dark-800 text-[10px] font-bold text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> रीसेट एंगल
            </button>
          </div>
        </div>

        <div
          ref={mountRef}
          onMouseDown={(e) => onPointerDown(e.clientX, e.clientY)}
          onMouseMove={(e) => onPointerMove(e.clientX, e.clientY)}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerUp}
          onTouchStart={(e) => e.touches[0] && onPointerDown(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => e.touches[0] && onPointerMove(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={onPointerUp}
          onWheel={(e) => onWheelZoom(e.deltaY)}
          className="w-full h-[470px] cursor-grab active:cursor-grabbing"
        />

        {/* Bottom-Left Floating Live 3D Object Radar List */}
        <div className="absolute bottom-3 left-3 max-w-xs bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl p-2.5 space-y-1.5 text-[11px] z-20">
          <div className="flex items-center justify-between text-[10px] font-bold text-cyan-300 border-b border-white/10 pb-1">
            <span>🎯 3D स्पेस में लाइव डिटेक्टेड ऑब्जेक्ट्स ({liveEntities.length})</span>
            <span className="font-mono text-emerald-400">LIVE YOLO</span>
          </div>
          <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
            {liveEntities.length === 0 ? (
              <div className="text-[10px] text-dark-400">पाँचों कैमरों को स्कैन किया जा रहा है...</div>
            ) : (
              liveEntities.map((ent) => (
                <div key={ent.id} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-white font-semibold truncate">{ent.label}</span>
                  <span className="font-mono text-cyan-400 shrink-0">
                    ({ent.targetX.toFixed(1)}m, {ent.targetZ.toFixed(1)}m)
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bottom-Right Floating Picture-in-Picture (PiP) Camera Inspector */}
        {selectedCam && (
          <div className="absolute bottom-3 right-3 w-56 sm:w-64 bg-black/85 backdrop-blur-md border border-cyan-500/40 rounded-2xl overflow-hidden shadow-2xl z-20">
            <div className="px-2.5 py-1.5 bg-dark-950/90 border-b border-white/10 flex items-center justify-between text-[10px]">
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
                    +AI ज़ोन
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelectSingleCamera(selectedCam._id)}
                  className="p-1 rounded bg-dark-800 text-white hover:bg-dark-700"
                  title="फुल स्क्रीन"
                >
                  <Maximize2 className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
            <div className="relative aspect-video bg-dark-950">
              {selectedSnap ? (
                <img src={selectedSnap} alt={selectedCam.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-dark-400">
                  <Camera className="w-4 h-4 mr-1 animate-pulse" /> लाइव फ्रेम लोड हो रहा है...
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Camera Zone Selector Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((ch) => {
          const cfg = CAM_3D_ANCHORS[ch];
          const camObj = cameras.find((c) => Number(c.channel || 1) === ch);
          const camBlocks = pairingBlocks.filter((b) => Number(b.cameraChannel) === ch);
          const isSel = selectedZoneCh === ch;

          return (
            <button
              key={ch}
              type="button"
              onClick={() => {
                setSelectedZoneCh(ch);
                if (ch === 1) applyCameraPreset('COUNTER');
                else if (ch === 4 || ch === 5) applyCameraPreset('STREET');
                else applyCameraPreset('TESLA_ISO');
              }}
              className={`p-2.5 rounded-2xl border text-left transition flex flex-col justify-between space-y-1.5 ${
                isSel
                  ? 'bg-cyan-950/40 border-cyan-400 ring-1 ring-cyan-400/40'
                  : 'bg-dark-900/90 border-dark-800 hover:border-dark-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold" style={{ color: cfg.hex }}>
                  3D ZONE #{ch}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-dark-950 text-dark-300 border border-dark-800">
                  {camBlocks.length} AI ब्लॉक
                </span>
              </div>
              <div className="text-xs font-extrabold text-white truncate">
                {camObj ? camObj.name : cfg.title}
              </div>
              <div className="flex items-center justify-between text-[10px] text-dark-400 pt-0.5">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <Eye className="w-3 h-3" /> 3D फोकस
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
      <div className="px-4 py-2.5 rounded-2xl bg-dark-950 border border-dark-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-dark-300">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span>
            <strong>Triple 3D Engine:</strong> ऊपर से <strong>🌍 अल्ट्रा-रियलिस्टिक 3D</strong>, <strong>✨ 3D पॉइंट-क्लाउड</strong> और <strong>🛸 साइबर रडार 3D</strong> में कभी भी स्विच करें।
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
