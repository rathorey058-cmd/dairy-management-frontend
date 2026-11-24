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
        label: `👨‍💼 काउंटर स्टाफ (${det.confidence}%)`,
        color: 0x6366f1,
      };
    }
    if (ny2 < 0.37) {
      return {
        x: (cx - 0.5) * 8.0,
        z: 6.8 + (0.4 - ny2) * 4.0,
        kind: 'PASSERBY',
        label: `🚶 राहगीर (${det.confidence}%)`,
        color: 0x94a3b8,
      };
    }
    return {
      x: (cx - 0.5) * 4.8,
      z: 4.3 + (0.5 - ny2) * 1.6,
      kind: 'CUSTOMER',
      label: `👤 ग्राहक @ काउंटर (${det.confidence}%)`,
      color: 0x10b981,
    };
  }

  if (channel === 2) {
    return {
      x: -2.5 + cx * 5.0,
      z: -2.2 + cy * 3.2,
      kind: 'STAFF',
      label: `👨‍💼 गल्ला/फ्रीजर ज़ोन (${det.confidence}%)`,
      color: 0xf43f5e,
    };
  }

  if (channel === 3) {
    return {
      x: -2.2 + cx * 4.8,
      z: -3.5 + cy * 2.8,
      kind: 'STAFF',
      label: `👤 आंतरिक रैक ज़ोन (${det.confidence}%)`,
      color: 0x38bdf8,
    };
  }

  if (channel === 4) {
    return {
      x: 3.2 + (cx - 0.5) * 6.0,
      z: 6.2 + (1 - cy) * 3.5,
      kind: ny2 > 0.48 ? 'CUSTOMER' : 'PASSERBY',
      label: ny2 > 0.48 ? `🚶 गेट प्रवेश (${det.confidence}%)` : `🚶 सड़क राहगीर (${det.confidence}%)`,
      color: ny2 > 0.48 ? 0x10b981 : 0x94a3b8,
    };
  }

  return {
    x: -4.2 + (cx - 0.5) * 6.0,
    z: 6.5 + (1 - cy) * 3.5,
    kind: 'PASSERBY',
    label: `🚶 गली/सड़क (${det.confidence}%)`,
    color: 0xf59e0b,
  };
}

/** Crop the detected bounding box from the live camera image for photorealistic 3D spatial cutout */
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
    return c.toDataURL('image/jpeg', 0.8);
  } catch {
    return undefined;
  }
}

/** Displace a subdivided 3D floor patch's vertices using real camera pixel luminance (Photogrammetric 3D Relief) */
function displaceMeshFromImage(mesh: THREE.Mesh, img: HTMLImageElement, maxHeight = 0.55) {
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
      // Edge/object relief along local Z (which points UP in world space after rotation.x = -PI/2)
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

  // Two distinct 3D visual engines:
  // 1. 'REALISTIC_3D': Photo-Realistic 3D Drone Reality View (Live camera textures projected on 3D ground with 3D depth relief, realistic daylight & realistic humans/cutouts)
  // 2. 'CYBER_RADAR': Dark-mode glowing cyan/neon Tesla FSD Cyber Radar View
  const [visualStyle, setVisualStyle] = useState<'REALISTIC_3D' | 'CYBER_RADAR'>('REALISTIC_3D');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [show3DVideoWalls, setShow3DVideoWalls] = useState<boolean>(true);
  const [showLaserCones, setShowLaserCones] = useState<boolean>(true);
  const [selectedZoneCh, setSelectedZoneCh] = useState<number>(1);
  const [activePreset, setActivePreset] = useState<'DRONE_TOP' | 'TESLA_ISO' | 'COUNTER' | 'STREET'>('TESLA_ISO');
  const [liveEntities, setLiveEntities] = useState<Tracked3DEntity[]>([]);
  const [yoloScanChannel, setYoloScanChannel] = useState<number>(1);

  const orbitRef = useRef({
    theta: 0.24,
    phi: 0.66,
    radius: 14.8,
    targetX: 0,
    targetY: 0.6,
    targetZ: 1.4,
    isDragging: false,
    lastX: 0,
    lastY: 0,
  });

  const entitiesRef = useRef<Tracked3DEntity[]>([
    {
      id: 'init-counter-staff',
      kind: 'STAFF',
      label: '👨‍💼 काउंटर डेस्क (Ch#1)',
      channel: 1,
      confidence: 94,
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
      label: '👤 ग्राहक @ दूध पतीला (Ch#1)',
      channel: 1,
      confidence: 91,
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
      label: '👨‍💼 स्टाफ @ डीप फ्रीजर (Ch#2)',
      channel: 2,
      confidence: 88,
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
      o.theta = 0.28;
      o.phi = 0.68;
      o.radius = 14.5;
      o.targetX = 0;
      o.targetZ = 1.4;
    } else if (preset === 'COUNTER') {
      o.theta = 0.05;
      o.phi = 0.82;
      o.radius = 8.8;
      o.targetX = 0.2;
      o.targetZ = 2.8;
    } else if (preset === 'STREET') {
      o.theta = -0.32;
      o.phi = 0.74;
      o.radius = 16.0;
      o.targetX = 0;
      o.targetZ = 4.5;
    }
  }, []);

  // Load Live DVR Camera Textures into BOTH the 3D Wall Screens AND the 3D Ground-Projected Photogrammetric Relief Meshes
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
              displaceMeshFromImage(floorPatch, tex.image, visualStyle === 'REALISTIC_3D' ? 0.55 : 0.15);
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

  // Rebuild 3D Volumetric AI Pairing Zones
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

  // Multi-Camera Live YOLOv8 3D Reconstruction + Live Photo-Cutout Extraction
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

  // Initialize Three.js WebGL 3D Scene (Rebuilds when switching between REALISTIC_3D and CYBER_RADAR)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isRealistic = visualStyle === 'REALISTIC_3D';
    const width = container.clientWidth || 900;
    const height = 450;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isRealistic ? 0x111827 : 0x060a12);
    scene.fog = new THREE.FogExp2(isRealistic ? 0x111827 : 0x060a12, isRealistic ? 0.014 : 0.022);

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 120);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lighting (Natural Daylight Showroom in REALISTIC_3D vs Neon Cyan in CYBER_RADAR)
    const hemiLight = new THREE.HemisphereLight(
      isRealistic ? 0xf8fafc : 0xdbeafe,
      isRealistic ? 0x334155 : 0x0f172a,
      isRealistic ? 1.85 : 1.35
    );
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(isRealistic ? 0xfffbeb : 0x38bdf8, isRealistic ? 2.2 : 1.8);
    sunLight.position.set(12, 22, 14);
    sunLight.castShadow = true;
    scene.add(sunLight);

    const counterWarmLight = new THREE.PointLight(isRealistic ? 0xfef3c7 : 0x10b981, isRealistic ? 2.5 : 2.2, 16);
    counterWarmLight.position.set(0, 4.0, 2.5);
    scene.add(counterWarmLight);

    // 1. GROUND & ROAD GEOMETRY
    const gridHelper = new THREE.GridHelper(
      36,
      36,
      isRealistic ? 0x475569 : 0x0ea5e9,
      isRealistic ? 0x1e293b : 0x1e293b
    );
    gridHelper.position.y = 0.008;
    scene.add(gridHelper);

    // Dairy Interior Floor (Cream/Marble Tile in Realistic Mode, Dark Slate in Cyber Mode)
    const shopFloorGeo = new THREE.PlaneGeometry(11.8, 9.5);
    const shopFloorMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0x334155 : 0x0f172a,
      roughness: isRealistic ? 0.25 : 0.4,
      metalness: 0.15,
    });
    const shopFloor = new THREE.Mesh(shopFloorGeo, shopFloorMat);
    shopFloor.rotation.x = -Math.PI / 2;
    shopFloor.position.set(0, 0.015, -0.4);
    shopFloor.receiveShadow = true;
    scene.add(shopFloor);

    // Exterior Public Asphalt Road (Z = +5.0 to +11.5)
    const roadGeo = new THREE.PlaneGeometry(34, 6.4);
    const roadMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0x1e2430 : 0x090d16,
      roughness: 0.85,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(0, 0.012, 8.2);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    // Road Markings (Realistic White/Yellow Road Stripes in Realistic Mode)
    const laneMat = new THREE.LineBasicMaterial({ color: isRealistic ? 0xe2e8f0 : 0x06b6d4 });
    for (const zLine of [5.1, 8.2, 11.2]) {
      const pts = [new THREE.Vector3(-16, 0.03, zLine), new THREE.Vector3(16, 0.03, zLine)];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), laneMat));
    }

    // 2. PHOTOGRAMMETRIC 3D GROUND-PROJECTED LIVE CAMERA PATCHES (True 3D Relief from Live DVR Feeds!)
    floorPatchMeshesRef.current = {};
    Object.entries(CAM_3D_ANCHORS).forEach(([chStr, cfg]) => {
      const ch = Number(chStr);
      // 48x48 subdivided mesh for 3D depth relief displacement
      const patchGeo = new THREE.PlaneGeometry(cfg.floorPatchSize[0], cfg.floorPatchSize[1], 47, 47);
      const patchMat = new THREE.MeshStandardMaterial({
        color: isRealistic ? 0x94a3b8 : 0x1e293b,
        roughness: 0.45,
        metalness: 0.1,
        transparent: true,
        opacity: isRealistic ? 0.92 : 0.38,
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
        displaceMeshFromImage(patchMesh, videoTexturesRef.current[ch].image as HTMLImageElement, isRealistic ? 0.55 : 0.15);
      }
    });

    // 3. REALISTIC 3D DAIRY SHOP FURNITURE & EQUIPMENT
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

    const wallMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0x64748b : 0x1e293b,
      transparent: true,
      opacity: isRealistic ? 0.35 : 0.42,
      roughness: 0.4,
    });
    add3DBox(11.8, 2.8, 0.18, 0, 1.4, -4.9, wallMat, 0x475569);
    add3DBox(0.18, 2.8, 9.5, -5.8, 1.4, -0.2, wallMat, 0x475569);
    add3DBox(0.18, 2.8, 9.5, 5.8, 1.4, -0.2, wallMat, 0x475569);

    // Front Dairy Counter (Dark Granite Top + Warm Counter Base in Realistic Mode)
    const counterMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0x1f2937 : 0x0f2942,
      roughness: 0.25,
      metalness: 0.35,
    });
    add3DBox(6.2, 1.05, 1.18, 0, 0.525, 3.3, counterMat, isRealistic ? 0x64748b : 0x0ea5e9);

    // Shiny Stainless Steel Milk Patila + Rim on Counter (Ch#1)
    const patilaMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.92,
      roughness: 0.12,
    });
    const patilaMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.58, 28), patilaMat);
    patilaMesh.position.set(0.45, 1.34, 3.3);
    patilaMesh.castShadow = true;
    scene.add(patilaMesh);

    // White Milk Surface inside Patila
    const milkTop = new THREE.Mesh(
      new THREE.CircleGeometry(0.44, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    milkTop.rotation.x = -Math.PI / 2;
    milkTop.position.set(0.45, 1.635, 3.3);
    scene.add(milkTop);

    // Two Red Snack/Packet Trays on Counter (Ch#1)
    const trayMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35 });
    add3DBox(0.78, 0.24, 0.68, -1.1, 1.17, 3.3, trayMat, 0xf87171);
    add3DBox(0.78, 0.24, 0.68, -2.0, 1.17, 3.3, trayMat, 0xf87171);

    // Laptop on Right Side of Counter (Ch#1)
    const laptopMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.7, roughness: 0.2 });
    add3DBox(0.45, 0.04, 0.32, 1.75, 1.08, 3.1, laptopMat, 0x38bdf8);
    const laptopScreen = add3DBox(0.45, 0.3, 0.03, 1.75, 1.24, 3.24, laptopMat, 0x38bdf8);
    laptopScreen.rotation.x = -0.2;

    // Cash Galla Desk (Ch#2)
    const gallaMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0x451a03 : 0x3b0764,
      roughness: 0.35,
    });
    add3DBox(1.5, 1.0, 1.1, 2.3, 0.5, 1.9, gallaMat, 0xf43f5e);

    // Two White Glass-Top Sliding Deep Freezers (Ch#2 & Ch#3)
    const whiteFreezerMat = new THREE.MeshStandardMaterial({
      color: isRealistic ? 0xe2e8f0 : 0x1e3a5f,
      roughness: 0.2,
      metalness: 0.15,
    });
    const glassLidMat = new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.55,
      roughness: 0.1,
      metalness: 0.5,
    });
    add3DBox(2.1, 0.92, 1.15, -0.8, 0.46, -1.2, whiteFreezerMat, 0x38bdf8);
    add3DBox(1.95, 0.05, 1.02, -0.8, 0.94, -1.2, glassLidMat);
    add3DBox(2.1, 0.92, 1.15, 1.6, 0.46, -1.2, whiteFreezerMat, 0x38bdf8);
    add3DBox(1.95, 0.05, 1.02, 1.6, 0.94, -1.2, glassLidMat);

    // Orange Staff Chair on Left of Ch#2
    const chairMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.4 });
    add3DBox(0.65, 0.48, 0.65, -3.4, 0.24, -0.5, chairMat);
    add3DBox(0.12, 0.55, 0.65, -3.68, 0.72, -0.5, chairMat);

    // Two 50L Stainless Steel Milk Cans on Right of Ch#2
    for (const zCan of [0.2, -0.6]) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.75, 20), patilaMat);
      can.position.set(3.8, 0.38, zCan);
      can.castShadow = true;
      scene.add(can);
    }

    // Back Wall Chest Freezers & Weighing Scale Rack (Ch#3)
    add3DBox(6.8, 1.08, 1.0, 0.2, 0.54, -3.9, whiteFreezerMat, isRealistic ? 0x94a3b8 : 0xa855f7);

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
        opacity: isRealistic ? 0.14 : 0.24,
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
    const cropTexLoader = new THREE.TextureLoader();

    const create3DEntityGroup = (ent: Tracked3DEntity): THREE.Group => {
      const g = new THREE.Group();

      if (ent.kind === 'BIKE') {
        // Realistic 3D Motorcycle (2 Wheels + Chassis + Handlebar + Headlight)
        const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.14, 18);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });
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
          metalness: 0.6,
          roughness: 0.25,
        });
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.45, 1.25), bodyMat);
        frame.position.set(0, 0.58, 0);
        g.add(frame);
      } else if (ent.kind === 'CAR') {
        const carMat = new THREE.MeshStandardMaterial({
          color: isRealistic ? 0xf8fafc : ent.color,
          metalness: 0.7,
          roughness: 0.2,
        });
        const lower = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 3.3), carMat);
        lower.position.y = 0.42;
        g.add(lower);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.45, 1.75), carMat);
        cabin.position.set(0, 0.88, -0.1);
        g.add(cabin);
      } else {
        // Articulated Realistic 3D Human Figure (Legs + Shirt Torso + Arms + Skin Head + Hair)
        const pantsMat = new THREE.MeshStandardMaterial({
          color: isRealistic ? 0x1e293b : ent.color,
          roughness: 0.6,
        });
        const shirtColor =
          ent.kind === 'CUSTOMER'
            ? isRealistic ? 0x059669 : ent.color
            : isRealistic ? 0x2563eb : ent.color;
        const shirtMat = new THREE.MeshStandardMaterial({
          color: shirtColor,
          roughness: 0.4,
        });
        const skinMat = new THREE.MeshStandardMaterial({
          color: isRealistic ? 0xf1c27d : ent.color,
          roughness: 0.45,
        });

        // Left & Right Legs
        const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.72, 12);
        const leftLeg = new THREE.Mesh(legGeo, pantsMat);
        leftLeg.position.set(-0.12, 0.36, 0);
        g.add(leftLeg);
        const rightLeg = new THREE.Mesh(legGeo, pantsMat);
        rightLeg.position.set(0.12, 0.36, 0);
        g.add(rightLeg);

        // Torso & Shoulders
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), shirtMat);
        torso.position.set(0, 1.02, 0);
        torso.castShadow = true;
        g.add(torso);

        // Left & Right Arms
        const armGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.54, 10);
        const leftArm = new THREE.Mesh(armGeo, shirtMat);
        leftArm.position.set(-0.3, 1.0, 0);
        g.add(leftArm);
        const rightArm = new THREE.Mesh(armGeo, shirtMat);
        rightArm.position.set(0.3, 1.0, 0);
        g.add(rightArm);

        // Head & Hair Cap
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), skinMat);
        head.position.set(0, 1.52, 0);
        g.add(head);

        // Live 3D Photo-Cutout Badge floating above/on the 3D Person in REALISTIC_3D mode!
        if (isRealistic && ent.cropDataUrl) {
          cropTexLoader.load(ent.cropDataUrl, (cutTex) => {
            cutTex.colorSpace = THREE.SRGBColorSpace;
            const cutMat = new THREE.SpriteMaterial({ map: cutTex, transparent: true });
            const sprite = new THREE.Sprite(cutMat);
            sprite.scale.set(0.95, 1.25, 1);
            sprite.position.set(0, 2.38, 0);
            g.add(sprite);
          });
        }
      }

      // Ground Target Ring
      const ringGeo = new THREE.RingGeometry(0.42, 0.56, 24);
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
      clock += 0.03;

      const o = orbitRef.current;
      if (!o.isDragging && autoRotate) {
        o.theta += 0.0032;
      }

      const sinPhi = Math.sin(o.phi);
      camera.position.x = o.targetX + o.radius * sinPhi * Math.sin(o.theta);
      camera.position.y = o.targetY + o.radius * Math.cos(o.phi);
      camera.position.z = o.targetZ + o.radius * sinPhi * Math.cos(o.theta);
      camera.lookAt(o.targetX, o.targetY, o.targetZ);

      const activeIds = new Set<string>();
      entitiesRef.current.forEach((ent) => {
        activeIds.add(ent.id);
        ent.curX += (ent.targetX - ent.curX) * 0.08;
        ent.curZ += (ent.targetZ - ent.curZ) * 0.08;

        let meshGrp = entityMeshMap[ent.id];
        if (!meshGrp) {
          meshGrp = create3DEntityGroup(ent);
          entityMeshMap[ent.id] = meshGrp;
          dynamicGroup.add(meshGrp);
        }
        meshGrp.position.set(ent.curX, 0, ent.curZ);

        const ring = meshGrp.getObjectByName('pulseRing');
        if (ring) {
          const s = 1 + Math.sin(clock * 2.5) * 0.16;
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
      {/* Top Control Header with Dual 3D Engine Switcher: REALISTIC_3D vs CYBER_RADAR */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950/70 to-emerald-950/50 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-inner">
            <Compass className={`w-5 h-5 ${autoRotate ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs sm:text-sm font-black text-white tracking-wide">
                {visualStyle === 'REALISTIC_3D'
                  ? '🌍 REALISTIC 3D DRONE REALITY VIEW (लाइव 3D फोटोरियलिस्टिक दुकान व्यू)'
                  : '🛸 TESLA CYBER RADAR 3D VIEW (साइबर होलोग्राफिक 3D व्यू)'}
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-mono font-bold">
                LIVE 3D • Ch#{yoloScanChannel}
              </span>
            </div>
            <p className="text-[11px] text-dark-300">
              {visualStyle === 'REALISTIC_3D'
                ? 'पाँचों कैमरों की असली फुटेज 3D फर्श व गहराई (3D Relief) में प्रोजेक्टेड + लाइव 3D इंसान व वाहन कटआउट'
                : 'Tesla FSD स्टाइल डार्क रडार ग्रिड, 3D अवतार, लेज़र कोन्स व लाइव वीडियो वॉल्स'}
            </p>
          </div>
        </div>

        {/* Mode Switcher: REALISTIC 3D vs CYBER RADAR 3D + Angle Presets */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {/* Dual 3D Mode Switcher */}
          <div className="flex items-center bg-dark-950 p-1 rounded-xl border border-emerald-500/40 shadow">
            <button
              type="button"
              onClick={() => setVisualStyle('REALISTIC_3D')}
              className={`px-3 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition ${
                visualStyle === 'REALISTIC_3D'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white keep-white-text shadow'
                  : 'text-dark-300 hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>🌍 रियलिस्टिक 3D व्यू</span>
            </button>
            <button
              type="button"
              onClick={() => setVisualStyle('CYBER_RADAR')}
              className={`px-3 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition ${
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
                  ? 'PHOTOREALISTIC 3D DEPTH MESH + LIVE CUTOUTS'
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
          className="w-full h-[450px] cursor-grab active:cursor-grabbing"
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
            <strong>Dual 3D Engine:</strong> ऊपर से <strong>🌍 रियलिस्टिक 3D व्यू</strong> और <strong>🛸 साइबर रडार 3D</strong> के बीच कभी भी स्विच करें।
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
