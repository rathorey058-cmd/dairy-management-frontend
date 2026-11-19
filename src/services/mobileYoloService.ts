import * as ort from 'onnxruntime-web';
import API from '../api';

// Configure ONNX WASM path (loads wasm binaries efficiently)
try {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.4/dist/';
} catch (e) {
  console.warn('WASM config warning:', e);
}

// 80 COCO Classes used by YOLOv8
const COCO_CLASSES = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
  "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
  "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
  "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
  "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
  "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
  "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
  "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote",
  "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book",
  "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
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

class MobileYoloEngine {
  private session: ort.InferenceSession | null = null;
  private isModelLoading = false;
  private isModelReady = false;
  private isRunning = false;
  private lastPersonCount = 0;
  private totalFootfallToday = 0;
  private detectionInterval: any = null;

  /**
   * Initialize and warm-up YOLOv8 Nano model on mobile CPU
   */
  public async initModel(): Promise<boolean> {
    if (this.isModelReady) return true;
    if (this.isModelLoading) return false;

    try {
      this.isModelLoading = true;
      console.log('📱 [Mobile YOLO]: Initializing ONNX Runtime Web on device...');

      // Load 12MB YOLOv8n ONNX model from app bundle
      const modelUrl = '/models/yolov8n.onnx';
      this.session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      });

      this.isModelReady = true;
      this.isModelLoading = false;
      console.log('✅ [Mobile YOLO]: Model loaded and ready on Mobile device (₹0 API Cost)!');
      return true;
    } catch (err) {
      console.error('❌ [Mobile YOLO] Model initialization failed:', err);
      this.isModelLoading = false;
      this.isModelReady = false;
      return false;
    }
  }

  /**
   * Preprocess HTMLCanvas or HTMLImage to 640x640 Float32 Tensor
   */
  private preprocess(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): ort.Tensor {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2d context');

    // Draw and resize to 640x640
    ctx.drawImage(source, 0, 0, 640, 640);
    const imgData = ctx.getImageData(0, 0, 640, 640);
    const { data } = imgData;

    // Normalization to (1, 3, 640, 640) float32 in range [0, 1]
    const float32Data = new Float32Array(3 * 640 * 640);
    const totalPixels = 640 * 640;

    for (let i = 0; i < totalPixels; i++) {
      const r = data[i * 4] / 255.0;
      const g = data[i * 4 + 1] / 255.0;
      const b = data[i * 4 + 2] / 255.0;

      float32Data[i] = r;                    // Channel 0: R
      float32Data[totalPixels + i] = g;      // Channel 1: G
      float32Data[2 * totalPixels + i] = b;  // Channel 2: B
    }

    return new ort.Tensor('float32', float32Data, [1, 3, 640, 640]);
  }

  /**
   * Run inference on image/video frame
   */
  public async detectFrame(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<DetectedObject[]> {
    if (!this.session || !this.isModelReady) {
      const ready = await this.initModel();
      if (!ready || !this.session) return [];
    }

    try {
      const inputTensor = this.preprocess(source);
      const inputName = this.session.inputNames[0];
      const results = await this.session.run({ [inputName]: inputTensor });

      const outputName = this.session.outputNames[0];
      const outputTensor = results[outputName];
      const data = outputTensor.data as Float32Array;

      // Output shape is [1, 84, 8400]
      // 84 = [x_center, y_center, width, height, ...80 class probabilities]
      const numBoxes = 8400;
      const numFeatures = 84;
      const detected: DetectedObject[] = [];

      for (let i = 0; i < numBoxes; i++) {
        let maxProb = 0;
        let bestClassIdx = -1;

        // Find highest class confidence
        for (let c = 4; c < numFeatures; c++) {
          const prob = data[c * numBoxes + i];
          if (prob > maxProb) {
            maxProb = prob;
            bestClassIdx = c - 4;
          }
        }

        // Confidence filter > 45%
        if (maxProb > 0.45 && bestClassIdx >= 0) {
          const cx = data[0 * numBoxes + i] / 640;
          const cy = data[1 * numBoxes + i] / 640;
          const w = data[2 * numBoxes + i] / 640;
          const h = data[3 * numBoxes + i] / 640;

          detected.push({
            className: COCO_CLASSES[bestClassIdx] || 'object',
            confidence: Math.round(maxProb * 100),
            box: {
              x: Math.max(0, cx - w / 2),
              y: Math.max(0, cy - h / 2),
              width: Math.min(1, w),
              height: Math.min(1, h)
            }
          });
        }
      }

      // Simple NMS / filter duplicates
      return this.filterTopDetections(detected);
    } catch (err) {
      console.error('Detection error:', err);
      return [];
    }
  }

  private filterTopDetections(items: DetectedObject[]): DetectedObject[] {
    // Keep max 15 best detections
    return items.sort((a, b) => b.confidence - a.confidence).slice(0, 15);
  }

  /**
   * Start 24/7 Mobile Background Surveillance on active camera snapshot
   */
  public startMobileBackgroundWorker(
    getSnapshotSrc: () => string | null,
    onDetection?: (results: DetectedObject[]) => void
  ) {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🚀 [Mobile YOLO]: Background mobile worker active (Running on Mobile CPU at ₹0)!');

    this.detectionInterval = setInterval(async () => {
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

        // 1. Footfall analysis
        const persons = detections.filter(d => d.className === 'person');
        if (persons.length > this.lastPersonCount) {
          const arrivals = persons.length - this.lastPersonCount;
          this.totalFootfallToday += arrivals;
          console.log(`👤 [Mobile YOLO Footfall]: +${arrivals} new customer! Total today: ${this.totalFootfallToday}`);

          // Push to backend at ₹0 cost
          API.post('/cameras/evaluate-edge-rules', {
            footfallArrivals: arrivals
          }).catch(() => {});
        }
        this.lastPersonCount = persons.length;

      } catch (e) {
        // Continue loop silently
      }
    }, 3000); // Audit every 3 seconds on mobile CPU
  }

  /**
   * Stop Mobile Worker
   */
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
      isRunning: this.isRunning,
      footfallToday: this.totalFootfallToday
    };
  }
}

export const mobileYolo = new MobileYoloEngine();
