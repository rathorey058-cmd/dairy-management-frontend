import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime Web safely (uses Vite/Capacitor bundled 1.31.1 WASM first, zero version mismatch)
try {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
} catch (e) {
  console.warn('WASM config warning:', e);
}

// 80 COCO Classes used by YOLOv8
const COCO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
  'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote',
  'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book',
  'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
];

export interface DetectedObject {
  className: string;
  confidence: number;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface LetterboxMeta {
  tensor: ort.Tensor;
  scale: number;
  padX: number;
  padY: number;
  srcW: number;
  srcH: number;
}

class MobileYoloEngine {
  private session: ort.InferenceSession | null = null;
  private initPromise: Promise<boolean> | null = null;
  private isModelLoading = false;
  private isModelReady = false;
  private lastError: string | null = null;
  private isRunning = false;
  private lastPersonCount = 0;
  private totalFootfallToday = 0;
  private detectionInterval: any = null;
  private prepCanvas: HTMLCanvasElement | null = null;
  private floatBuffer: Float32Array = new Float32Array(3 * 640 * 640);

  /**
   * Initialize and warm-up YOLOv8 Nano model on browser/mobile CPU with safe CDN fallback
   */
  public async initModel(): Promise<boolean> {
    if (this.isModelReady && this.session) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.isModelLoading = true;
      const modelUrl = '/models/yolov8n.onnx';

      try {
        this.session = await ort.InferenceSession.create(modelUrl, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        this.isModelReady = true;
        this.lastError = null;
        return true;
      } catch (primaryErr: any) {
        try {
          // Fallback to matching 1.31.1 CDN WASM path if dev server did not serve .wasm mime cleanly
          ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
          this.session = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all',
          });
          this.isModelReady = true;
          this.lastError = null;
          return true;
        } catch (fallbackErr: any) {
          this.lastError = fallbackErr?.message || primaryErr?.message || 'ONNX init failed';
          console.warn('[Mobile YOLO] Model init notice:', this.lastError);
          this.isModelReady = false;
          return false;
        }
      } finally {
        this.isModelLoading = false;
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  private getSourceDimensions(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): { w: number; h: number } {
    if (source instanceof HTMLVideoElement) {
      return { w: source.videoWidth || 640, h: source.videoHeight || 360 };
    }
    if (source instanceof HTMLImageElement) {
      return { w: source.naturalWidth || source.width || 640, h: source.naturalHeight || source.height || 360 };
    }
    return { w: source.width || 640, h: source.height || 360 };
  }

  /**
   * Letterbox-preserving 640x640 preprocessing (reuses single canvas & Float32Array for 0 memory leak)
   */
  private preprocess(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): LetterboxMeta {
    if (!this.prepCanvas) {
      this.prepCanvas = document.createElement('canvas');
      this.prepCanvas.width = 640;
      this.prepCanvas.height = 640;
    }
    const ctx = this.prepCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get 2d context');

    const { w: srcW, h: srcH } = this.getSourceDimensions(source);
    const scale = Math.min(640 / Math.max(1, srcW), 640 / Math.max(1, srcH));
    const newW = Math.round(srcW * scale);
    const newH = Math.round(srcH * scale);
    const padX = Math.floor((640 - newW) / 2);
    const padY = Math.floor((640 - newH) / 2);

    ctx.fillStyle = '#727272';
    ctx.fillRect(0, 0, 640, 640);
    ctx.drawImage(source, 0, 0, srcW, srcH, padX, padY, newW, newH);

    const { data } = ctx.getImageData(0, 0, 640, 640);
    const float32Data = this.floatBuffer;
    const totalPixels = 640 * 640;

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      float32Data[i] = data[idx] / 255.0;
      float32Data[totalPixels + i] = data[idx + 1] / 255.0;
      float32Data[2 * totalPixels + i] = data[idx + 2] / 255.0;
    }

    return {
      tensor: new ort.Tensor('float32', float32Data, [1, 3, 640, 640]),
      scale,
      padX,
      padY,
      srcW,
      srcH,
    };
  }

  /**
   * Run YOLOv8 inference on image/video frame and dispose WASM output tensors cleanly
   */
  public async detectFrame(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<DetectedObject[]> {
    if (!this.session || !this.isModelReady) {
      const ready = await this.initModel();
      if (!ready || !this.session) return [];
    }

    let meta: LetterboxMeta | null = null;
    let results: ort.InferenceSession.OnnxValueMapType | null = null;

    try {
      meta = this.preprocess(source);
      const inputName = this.session.inputNames[0];
      results = await this.session.run({ [inputName]: meta.tensor });

      const outputName = this.session.outputNames[0];
      const outputTensor = results[outputName];
      const data = outputTensor.data as Float32Array;

      const numBoxes = 8400;
      const numFeatures = 84;
      const detected: DetectedObject[] = [];

      for (let i = 0; i < numBoxes; i++) {
        let maxProb = 0;
        let bestClassIdx = -1;

        for (let c = 4; c < numFeatures; c++) {
          const prob = data[c * numBoxes + i];
          if (prob > maxProb) {
            maxProb = prob;
            bestClassIdx = c - 4;
          }
        }

        if (maxProb > 0.42 && bestClassIdx >= 0) {
          const cx640 = data[0 * numBoxes + i];
          const cy640 = data[1 * numBoxes + i];
          const w640 = data[2 * numBoxes + i];
          const h640 = data[3 * numBoxes + i];

          // Map unpadded letterbox coordinates back to [0..1] original image space
          const x1 = Math.max(0, (cx640 - w640 / 2 - meta.padX) / (meta.scale * meta.srcW));
          const y1 = Math.max(0, (cy640 - h640 / 2 - meta.padY) / (meta.scale * meta.srcH));
          const x2 = Math.min(1, (cx640 + w640 / 2 - meta.padX) / (meta.scale * meta.srcW));
          const y2 = Math.min(1, (cy640 + h640 / 2 - meta.padY) / (meta.scale * meta.srcH));

          const bw = x2 - x1;
          const bh = y2 - y1;
          if (bw <= 0.015 || bh <= 0.015) continue;

          detected.push({
            className: COCO_CLASSES[bestClassIdx] || 'object',
            confidence: Math.round(maxProb * 100),
            box: {
              x: x1,
              y: y1,
              width: bw,
              height: bh,
            },
          });
        }
      }

      return this.filterTopDetections(detected);
    } catch (err: any) {
      this.lastError = err?.message || 'Inference error';
      return [];
    } finally {
      if (results) {
        Object.values(results).forEach((t: any) => {
          try {
            t?.dispose?.();
          } catch {
            // ignore
          }
        });
      }
    }
  }

  private filterTopDetections(items: DetectedObject[]): DetectedObject[] {
    const sorted = [...items].sort((a, b) => b.confidence - a.confidence);
    const kept: DetectedObject[] = [];
    const iou = (a: DetectedObject, b: DetectedObject) => {
      const x1 = Math.max(a.box.x, b.box.x);
      const y1 = Math.max(a.box.y, b.box.y);
      const x2 = Math.min(a.box.x + a.box.width, b.box.x + b.box.width);
      const y2 = Math.min(a.box.y + a.box.height, b.box.y + b.box.height);
      const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
      const uni = a.box.width * a.box.height + b.box.width * b.box.height - inter;
      return uni > 0 ? inter / uni : 0;
    };
    for (const d of sorted) {
      if (kept.every((k) => k.className !== d.className || iou(k, d) < 0.45)) kept.push(d);
      if (kept.length >= 16) break;
    }
    return kept;
  }

  public startMobileBackgroundWorker(
    getSnapshotSrc: () => string | null,
    onDetection?: (results: DetectedObject[]) => void
  ) {
    if (this.isRunning) return;
    this.isRunning = true;
    let busy = false;

    this.detectionInterval = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const src = getSnapshotSrc();
        if (!src) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = src;

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const detections = await this.detectFrame(img);
        if (onDetection) onDetection(detections);

        const counterCustomers = detections.filter((d) => {
          if (d.className !== 'person' || d.confidence < 52) return false;
          const cx = d.box.x + d.box.width / 2;
          const cy = d.box.y + d.box.height / 2;
          const ny2 = d.box.y + d.box.height;
          if (cy > 0.62) return false;
          if (ny2 < 0.32 || d.box.height < 0.18) return false;
          return cx >= 0.14 && cx <= 0.78 && ny2 >= 0.32 && ny2 <= 0.78;
        });
        if (counterCustomers.length > this.lastPersonCount) {
          this.totalFootfallToday += counterCustomers.length - this.lastPersonCount;
        }
        this.lastPersonCount = counterCustomers.length;
      } catch {
        // Ignore single frame failure
      } finally {
        busy = false;
      }
    }, 2500);
  }

  public stopMobileBackgroundWorker() {
    this.isRunning = false;
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
  }

  public getStatus() {
    return {
      isReady: this.isModelReady,
      isLoading: this.isModelLoading,
      lastError: this.lastError,
      isRunning: this.isRunning,
      footfallToday: this.totalFootfallToday,
    };
  }
}

export const mobileYolo = new MobileYoloEngine();
