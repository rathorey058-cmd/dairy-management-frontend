import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Compass, Play, Pause, Maximize2, Tag, Users,
  DoorOpen, Box, Camera, ShieldCheck, Radio, Sparkles, Eye, Layers, RotateCcw
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
}

// 3D Spatial anchors for each of the 5 DVR camera channels in the shop's 3D world (meters)
const CAM_3D_ANCHORS: Record<number, {
  pos: [number, number, number];
  lookAt: [number, number, number];
  screenPos: [number, number, number];
  screenRotY: number;
  title: string;
  color: number;
  hex: string;
}> = {
  1: {
    pos: [0.5, 4.2, 1.2],
    lookAt: [0.0, 0.8, 4.2],
    screenPos: [0.0, 2.4, 3.3],
    screenRotY: 0,
    title: 'Ch#1: दूध काउंटर व पतीला',
    color: 0x38bdf8,
    hex: '#38bdf8',
  },
  2: {
    pos: [-2.2, 4.2, -0.5],
    lookAt: [0.5, 0.5, -1.2],
    screenPos: [3.2, 2.3, 0.2],
    screenRotY: -Math.PI / 2,
    title: 'Ch#2: गल्ला व डीप फ्रीजर',
    color: 0xf43f5e,
    hex: '#f43f5e',
  },
  3: {
    pos: [2.8, 4.2, -2.5],
    lookAt: [-0.5, 0.5, -2.5],
    screenPos: [0.0, 2.4, -4.3],
    screenRotY: 0,
    title: 'Ch#3: तौल कांटा व आंतरिक रैक',
    color: 0xa855f7,
    hex: '#a855f7',
  },
  4: {
    pos: [4.2, 4.5, 4.8],
    lookAt: [6.5, 0.5, 8.2],
    screenPos: [6.2, 2.4, 5.2],
    screenRotY: -0.35,
    title: 'Ch#4: मुख्य गेट व पूर्वी सड़क',
    color: 0x10b981,
    hex: '#10b981',
  },
  5: {
    pos: [-4.2, 4.5, 4.8],
    lookAt: [-6.5, 0.5, 8.2],
    screenPos: [-6.2, 2.4, 5.2],
    screenRotY: 0.35,
    title: 'Ch#5: बाहरी सड़क व पश्चिमी गली',
    color: 0xf59e0b,
    hex: '#f59e0b',
  },
};

/**
 * Project a 2D normalized bounding box (x, y, width, height in 0..1) from camera `channel`
 * into the shop's unified 3D floor coordinate system (X, Z).
 */
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

  // Person mapping by camera channel & counter zone
  if (channel === 1) {
    // Behind counter (owner/staff) vs Front of counter (customer) vs Street (passerby)
    if (cy > 0.45 || (cx > 0.45 && cy > 0.30)) {
      return {
        x: 0.5 + (cx - 0.5) * 4.5,
        z: 1.5 + (cy - 0.5) * 1.8,
        kind: 'STAFF',
        label: `👨‍💼 काउंटर स्टाफ (${det.confidence}%)`,
        color: 0x818cf8,
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

  // Channel 5 (West street)
  return {
    x: -4.2 + (cx - 0.5) * 6.0,
    z: 6.5 + (1 - cy) * 3.5,
    kind: 'PASSERBY',
    label: `🚶 गली/सड़क (${det.confidence}%)`,
    color: 0xf59e0b,
  };
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

  // Camera Orbit State (Spherical coordinates around the 3D shop center)
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [show3DVideoWalls, setShow3DVideoWalls] = useState<boolean>(true);
  const [showLaserCones, setShowLaserCones] = useState<boolean>(true);
  const [selectedZoneCh, setSelectedZoneCh] = useState<number>(1);
  const [activePreset, setActivePreset] = useState<'DRONE_TOP' | 'TESLA_ISO' | 'COUNTER' | 'STREET'>('TESLA_ISO');
  const [liveEntities, setLiveEntities] = useState<Tracked3DEntity[]>([]);
  const [yoloScanChannel, setYoloScanChannel] = useState<number>(1);

  const orbitRef = useRef({
    theta: 0.28,       // horizontal azimuth angle (radians)
    phi: 0.72,         // vertical elevation angle (radians from Y axis; smaller = higher drone)
    radius: 15.5,      // distance from target
    targetX: 0,
    targetY: 0.6,
    targetZ: 1.5,
    isDragging: false,
    lastX: 0,
    lastY: 0,
  });

  const entitiesRef = useRef<Tracked3DEntity[]>([
    // Initial realistic shop presence until first YOLO cycle completes (1.5s)
    {
      id: 'init-counter-staff',
      kind: 'STAFF',
      label: '👨‍💼 काउंटर डेस्क (Ch#1)',
      channel: 1,
      confidence: 92,
      targetX: 1.8,
      targetZ: 2.0,
      curX: 1.8,
      curZ: 2.0,
      color: 0x818cf8,
      lastSeen: Date.now(),
    },
    {
      id: 'init-customer-1',
      kind: 'CUSTOMER',
      label: '👤 ग्राहक @ दूध पतीला (Ch#1)',
      channel: 1,
      confidence: 89,
      targetX: 0.2,
      targetZ: 4.3,
      curX: 0.2,
      curZ: 4.3,
      color: 0x10b981,
      lastSeen: Date.now(),
    },
  ]);

  const videoTexturesRef = useRef<Record<number, THREE.Texture>>({});
  const videoMeshesRef = useRef<Record<number, THREE.Mesh>>({});
  const coneMeshesRef = useRef<Record<number, THREE.Mesh>>({});
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const blocksGroupRef = useRef<THREE.Group | null>(null);

  // Apply Camera View Presets (like Tesla FSD views)
  const applyCameraPreset = useCallback((preset: 'DRONE_TOP' | 'TESLA_ISO' | 'COUNTER' | 'STREET') => {
    setActivePreset(preset);
    const o = orbitRef.current;
    if (preset === 'DRONE_TOP') {
      o.theta = 0;
      o.phi = 0.22; // Nearly straight down 90-degree drone bird's-eye view
      o.radius = 17.5;
      o.targetX = 0;
      o.targetZ = 1.2;
    } else if (preset === 'TESLA_ISO') {
      o.theta = 0.32;
      o.phi = 0.74;
      o.radius = 15.0;
      o.targetX = 0;
      o.targetZ = 1.5;
    } else if (preset === 'COUNTER') {
      o.theta = 0.05;
      o.phi = 0.88;
      o.radius = 9.2;
      o.targetX = 0.2;
      o.targetZ = 2.8;
    } else if (preset === 'STREET') {
      o.theta = -0.35;
      o.phi = 0.78;
      o.radius = 16.5;
      o.targetX = 0;
      o.targetZ = 4.5;
    }
  }, []);

  // Update 3D Video Wall Textures whenever live gridSnapshots arrive from DVR
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
          const mesh = videoMeshesRef.current[ch];
          if (mesh && mesh.material instanceof THREE.MeshBasicMaterial) {
            mesh.material.map = tex;
            mesh.material.color.setHex(0xffffff);
            mesh.material.needsUpdate = true;
          }
          if (old) old.dispose();
        },
        undefined,
        () => {}
      );
    });
  }, [gridSnapshots, cameras]);

  // Toggle visibility of 3D Video Walls & Vision Cones
  useEffect(() => {
    Object.values(videoMeshesRef.current).forEach((m) => {
      m.visible = show3DVideoWalls;
    });
    Object.values(coneMeshesRef.current).forEach((m) => {
      m.visible = showLaserCones;
    });
  }, [show3DVideoWalls, showLaserCones]);

  // Rebuild 3D Volumetric AI Pairing Zones whenever pairingBlocks change
  useEffect(() => {
    const grp = blocksGroupRef.current;
    if (!grp) return;
    while (grp.children.length > 0) {
      grp.remove(grp.children[0]);
    }

    const zoneCenters: Record<number, [number, number]> = {
      1: [0.4, 3.4],    // Milk Counter & Scale
      2: [2.3, 1.8],    // Cash Galla & Freezer
      3: [0.2, -1.8],   // Deep Freezer & Inner Rack
      4: [4.2, 5.2],    // Main Gate Tripwire
      5: [-3.5, -2.5],  // Inner Chiller / Shed
    };

    pairingBlocks.forEach((b, idx) => {
      const ch = Number(b.cameraChannel) || 1;
      const base = zoneCenters[ch] || [0, 0];
      const offsetX = ((idx % 2) - 0.5) * 0.6;
      const bx = base[0] + offsetX;
      const bz = base[1];
      const col = new THREE.Color(b.color || '#10b981');

      // Glowing 3D Zone Pillar / Box
      const boxGeo = new THREE.BoxGeometry(1.7, 1.25, 1.3);
      const boxMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.position.set(bx, 0.65, bz);
      grp.add(boxMesh);

      const edges = new THREE.EdgesGeometry(boxGeo);
      const lineMat = new THREE.LineBasicMaterial({ color: col });
      const wire = new THREE.LineSegments(edges, lineMat);
      wire.position.copy(boxMesh.position);
      grp.add(wire);
    });
  }, [pairingBlocks]);

  // Multi-Camera Live YOLOv8 3D Reconstruction Worker (Cycles through all 5 cameras and projects detections into 3D)
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

        // Keep entities from other channels (< 18s old) and replace current channel's entities
        const otherEntities = entitiesRef.current.filter(
          (e) => e.channel !== ch && now - e.lastSeen < 18000
        );

        const newForCh: Tracked3DEntity[] = relevante.slice(0, 4).map((det, i) => {
          const p3 = project2DDetectionTo3DWorld(det, ch);
          const id = `ch${ch}-${p3.kind}-${i}`;
          const prev = entitiesRef.current.find((e) => e.id === id);
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

    const iv = setInterval(runMultiCam3DScan, 2200);
    runMultiCam3DScan();
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [cameras, gridSnapshots]);

  // Initialize Three.js WebGL 3D Tesla FSD Reality View Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 900;
    const height = 430;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060a12);
    scene.fog = new THREE.FogExp2(0x060a12, 0.022);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 120);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xdbeafe, 1.35);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    dirLight.position.set(10, 18, 12);
    scene.add(dirLight);
    const pointCounter = new THREE.PointLight(0x10b981, 2.2, 14);
    pointCounter.position.set(0, 3.5, 3.5);
    scene.add(pointCounter);

    // 1. TESLA FSD CYAN RADAR GROUND GRID & SHOP FLOOR
    const gridHelper = new THREE.GridHelper(36, 36, 0x0ea5e9, 0x1e293b);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // Interior Dairy Tile Floor (-5 to +4 Z, -5.5 to +5.5 X)
    const shopFloorGeo = new THREE.PlaneGeometry(11.5, 9.2);
    const shopFloorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.4,
      metalness: 0.2,
    });
    const shopFloor = new THREE.Mesh(shopFloorGeo, shopFloorMat);
    shopFloor.rotation.x = -Math.PI / 2;
    shopFloor.position.set(0, 0.02, -0.4);
    scene.add(shopFloor);

    // Exterior Public Road (Z = +5.2 to +11.5)
    const roadGeo = new THREE.PlaneGeometry(34, 6.2);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.8 });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(0, 0.015, 8.2);
    scene.add(roadMesh);

    // Glowing Tesla FSD Road Lane Lines
    const laneMat = new THREE.LineBasicMaterial({ color: 0x06b6d4 });
    for (const zLine of [5.2, 8.2, 11.1]) {
      const pts = [new THREE.Vector3(-16, 0.03, zLine), new THREE.Vector3(16, 0.03, zLine)];
      const laneGeo = new THREE.BufferGeometry().setFromPoints(pts);
      scene.add(new THREE.Line(laneGeo, laneMat));
    }

    // 2. 3D DAIRY SHOP ARCHITECTURE (Walls, Counter, Milk Patila, Deep Freezers, Galla, Scale)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.42,
      roughness: 0.3,
    });

    const add3DBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, edgeCol = 0x38bdf8) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      scene.add(m);
      const edges = new THREE.EdgesGeometry(geo);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: edgeCol }));
      line.position.copy(m.position);
      scene.add(line);
      return m;
    };

    // Back wall & side walls (semi-transparent glass holographic walls)
    add3DBox(11.5, 2.8, 0.15, 0, 1.4, -4.8, wallMat, 0x334155);
    add3DBox(0.15, 2.8, 9.2, -5.7, 1.4, -0.2, wallMat, 0x334155);
    add3DBox(0.15, 2.8, 9.2, 5.7, 1.4, -0.2, wallMat, 0x334155);

    // Main Front Milk Counter (Ch#1)
    const counterMat = new THREE.MeshStandardMaterial({ color: 0x0f2942, roughness: 0.3, metalness: 0.4 });
    add3DBox(6.2, 1.05, 1.15, 0, 0.525, 3.3, counterMat, 0x0ea5e9);

    // Silver Steel Milk Patila on Counter (Ch#1 center)
    const patilaGeo = new THREE.CylinderGeometry(0.48, 0.44, 0.55, 24);
    const patilaMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.15 });
    const patilaMesh = new THREE.Mesh(patilaGeo, patilaMat);
    patilaMesh.position.set(0.45, 1.32, 3.3);
    scene.add(patilaMesh);

    // Two Red Snack/Packet Trays on Counter (Ch#1 left)
    const trayMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
    add3DBox(0.75, 0.22, 0.65, -1.1, 1.16, 3.3, trayMat, 0xf87171);
    add3DBox(0.75, 0.22, 0.65, -2.0, 1.16, 3.3, trayMat, 0xf87171);

    // Cash Galla & Laptop Billing Desk (Ch#2 / Ch#1 right)
    const gallaMat = new THREE.MeshStandardMaterial({ color: 0x3b0764, roughness: 0.3 });
    add3DBox(1.5, 1.0, 1.1, 2.3, 0.5, 1.9, gallaMat, 0xf43f5e);

    // Two White Glass-Top Deep Freezers (Ch#2 & Ch#3 center-back)
    const freezerMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.2, metalness: 0.3 });
    add3DBox(2.1, 0.95, 1.15, -0.8, 0.475, -1.2, freezerMat, 0x38bdf8);
    add3DBox(2.1, 0.95, 1.15, 1.6, 0.475, -1.2, freezerMat, 0x38bdf8);

    // Back Wall Chest Freezers & Electronic Scale Rack (Ch#3)
    add3DBox(6.8, 1.1, 1.0, 0.2, 0.55, -3.9, freezerMat, 0xa855f7);

    // 3. 5 HOLOGRAPHIC 3D LIVE CAMERA SCREENS & LASER VISION CONES
    videoMeshesRef.current = {};
    coneMeshesRef.current = {};

    Object.entries(CAM_3D_ANCHORS).forEach(([chStr, cfg]) => {
      const ch = Number(chStr);

      // 3D Live Video Projection Screen for this Camera
      const screenGeo = new THREE.PlaneGeometry(3.1, 1.85);
      const screenMat = new THREE.MeshBasicMaterial({
        color: 0x1e293b,
        side: THREE.DoubleSide,
      });
      if (videoTexturesRef.current[ch]) {
        screenMat.map = videoTexturesRef.current[ch];
        screenMat.color.setHex(0xffffff);
      }
      const screenMesh = new THREE.Mesh(screenGeo, screenMat);
      screenMesh.position.set(...cfg.screenPos);
      screenMesh.rotation.y = cfg.screenRotY;
      scene.add(screenMesh);
      videoMeshesRef.current[ch] = screenMesh;

      // Glowing Neon Border around each 3D Camera Screen
      const borderEdges = new THREE.EdgesGeometry(screenGeo);
      const borderLine = new THREE.LineSegments(
        borderEdges,
        new THREE.LineBasicMaterial({ color: cfg.color })
      );
      screenMesh.add(borderLine);

      // Camera Vision Frustum Cone (Tesla Radar Beam)
      const coneGeo = new THREE.ConeGeometry(1.6, 3.8, 4, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        wireframe: true,
        transparent: true,
        opacity: 0.22,
      });
      const coneMesh = new THREE.Mesh(coneGeo, coneMat);
      coneMesh.position.set(cfg.pos[0], cfg.pos[1] - 1.1, cfg.pos[2]);
      coneMesh.lookAt(...cfg.lookAt);
      scene.add(coneMesh);
      coneMeshesRef.current[ch] = coneMesh;
    });

    // Groups for Dynamic AI Blocks and Live 3D Humans/Vehicles
    const blocksGroup = new THREE.Group();
    scene.add(blocksGroup);
    blocksGroupRef.current = blocksGroup;

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);
    dynamicGroupRef.current = dynamicGroup;

    // Build reusable 3D Avatar / Vehicle meshes inside dynamicGroup on each animation tick
    const entityMeshMap: Record<string, THREE.Group> = {};

    const create3DEntityGroup = (ent: Tracked3DEntity): THREE.Group => {
      const g = new THREE.Group();
      if (ent.kind === 'BIKE') {
        // 3D Motorcycle mesh
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.75, 1.45),
          new THREE.MeshStandardMaterial({ color: ent.color, emissive: ent.color, emissiveIntensity: 0.35 })
        );
        body.position.y = 0.45;
        g.add(body);
      } else if (ent.kind === 'CAR') {
        // 3D Car mesh (Tesla FSD style smooth glowing vehicle)
        const carBody = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.9, 3.2),
          new THREE.MeshStandardMaterial({ color: ent.color, emissive: ent.color, emissiveIntensity: 0.3 })
        );
        carBody.position.y = 0.5;
        g.add(carBody);
      } else {
        // 3D Human Avatar (Torso cylinder + Glowing Head sphere + Tesla Floor Radar Ring)
        const mat = new THREE.MeshStandardMaterial({
          color: ent.color,
          emissive: ent.color,
          emissiveIntensity: 0.45,
          roughness: 0.2,
        });
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.15, 16), mat);
        torso.position.y = 0.62;
        g.add(torso);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), mat);
        head.position.y = 1.42;
        g.add(head);
      }

      // Glowing Tesla Target Floor Ring under every tracked person/vehicle
      const ringGeo = new THREE.RingGeometry(0.42, 0.56, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: ent.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
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
        o.theta += 0.0035;
      }

      // Compute 3D Camera Position from spherical orbit
      const sinPhi = Math.sin(o.phi);
      camera.position.x = o.targetX + o.radius * sinPhi * Math.sin(o.theta);
      camera.position.y = o.targetY + o.radius * Math.cos(o.phi);
      camera.position.z = o.targetZ + o.radius * sinPhi * Math.cos(o.theta);
      camera.lookAt(o.targetX, o.targetY, o.targetZ);

      // Smoothly interpolate & render live 3D YOLO entities (Customers, Staff, Bikes, Cars)
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
          const s = 1 + Math.sin(clock * 2.5) * 0.18;
          ring.scale.set(s, s, 1);
        }
      });

      // Remove expired entity meshes
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
  }, [autoRotate]);

  // Pointer Orbit & Zoom Handlers on the 3D Canvas
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
      {/* Top Tesla FSD Reality View Control Bar */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950/70 to-emerald-950/50 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-inner">
            <Compass className={`w-5 h-5 ${autoRotate ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-black text-white tracking-wide">
                🛸 TESLA FSD 3D REALITY VIEW (5-Camera 3D Spatial Digital Twin)
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-mono font-bold">
                WebGL 3D • YOLO Ch#{yoloScanChannel}
              </span>
            </div>
            <p className="text-[11px] text-dark-300">
              पाँचों कैमरों के लाइव YOLO डेटा से ऊपर से ड्रोन जैसा 3D शॉप मॉडल — माउस या उंगली से 360° घुमाएँ व ज़ूम करें
            </p>
          </div>
        </div>

        {/* 3D Camera Angle Presets & Layer Toggles */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className="flex items-center bg-dark-950 p-1 rounded-xl border border-dark-800">
            <button
              type="button"
              onClick={() => applyCameraPreset('TESLA_ISO')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                activePreset === 'TESLA_ISO' ? 'bg-cyan-600 text-white' : 'text-dark-400 hover:text-white'
              }`}
            >
              🛸 3D Tesla व्यू
            </button>
            <button
              type="button"
              onClick={() => applyCameraPreset('DRONE_TOP')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                activePreset === 'DRONE_TOP' ? 'bg-cyan-600 text-white' : 'text-dark-400 hover:text-white'
              }`}
            >
              🦅 ड्रोन टॉप-व्यू
            </button>
            <button
              type="button"
              onClick={() => applyCameraPreset('COUNTER')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                activePreset === 'COUNTER' ? 'bg-cyan-600 text-white' : 'text-dark-400 hover:text-white'
              }`}
            >
              🥛 काउंटर 3D
            </button>
            <button
              type="button"
              onClick={() => applyCameraPreset('STREET')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                activePreset === 'STREET' ? 'bg-cyan-600 text-white' : 'text-dark-400 hover:text-white'
              }`}
            >
              🛣️ सड़क व गेट
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
            <span>{autoRotate ? '360° ऑर्बिट ON' : 'ऑर्बिट रोका'}</span>
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
            <span>3D वीडियो वॉल्स</span>
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
            <span>लेज़र कोन</span>
          </button>
        </div>
      </div>

      {/* MAIN 3D WEBGL TESLA REALITY VIEWPORT + FLOATING HUD */}
      <div className="relative rounded-3xl overflow-hidden bg-[#060a12] border-2 border-cyan-500/30 shadow-2xl select-none">
        {/* Top Floating Telemetry Bar */}
        <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-20">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-mono font-bold text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>3D SPATIAL RECONSTRUCTION • 60 FPS</span>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-bold text-white border border-white/10">
              🟢 ग्राहक (हरा) • 🟣 स्टाफ (नीला) • 🟠 बाइक/वाहन (नारंगी)
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

        {/* Three.js WebGL Mount Container */}
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
          className="w-full h-[430px] cursor-grab active:cursor-grabbing"
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
                    className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-bold"
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

      {/* Camera Zone Selector Pills (Click any of the 5 zones to focus PiP & 3D Camera) */}
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
            <strong>Tesla 3D Spatial Engine:</strong> उंगली/माउस से 3D दुकान को घुमाएँ • स्क्रॉल से ज़ूम करें • हर 2 सेकंड में पाँचों कैमरों के ग्राहक व वाहन 3D में अपडेट होते हैं।
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
