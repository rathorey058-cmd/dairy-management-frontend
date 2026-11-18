import { io, Socket } from 'socket.io-client';

class DeliveryTrackerService {
  private socket: Socket | null = null;
  private watchId: number | null = null;
  private isTrackingActive: boolean = false;
  private lastPingTime: number = 0;
  private PING_INTERVAL_MS = 20000; // 20 seconds interval

  public initSocket(serverUrl?: string): Socket {
    if (this.socket) return this.socket;

    const defaultBackendUrl = 'https://dairy-management-backendd.onrender.com';
    const baseBackendUrl = serverUrl || (import.meta as any).env?.VITE_API_URL?.replace(/\/api\/?$/, '') || defaultBackendUrl;
    this.socket = io(baseBackendUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });

    this.socket.on('connect', () => {
      console.log('⚡ Connected to Delivery Tracking Socket:', this.socket?.id);
    });

    return this.socket;
  }

  public startDuty(staff: { tenantId: string; staffId: string; staffName: string }, onPositionUpdate?: (pos: { lat: number; lng: number }) => void) {
    if (this.isTrackingActive) return;
    this.isTrackingActive = true;

    const socket = this.initSocket();
    socket.emit('delivery:join', staff);

    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this device.');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        const { latitude, longitude, speed } = position.coords;

        if (onPositionUpdate) {
          onPositionUpdate({ lat: latitude, lng: longitude });
        }

        // Throttle pings to every 20 seconds to save phone battery & data
        if (now - this.lastPingTime >= this.PING_INTERVAL_MS) {
          this.lastPingTime = now;
          socket.emit('delivery:location_ping', {
            tenantId: staff.tenantId,
            staffId: staff.staffId,
            staffName: staff.staffName,
            lat: latitude,
            lng: longitude,
            speed: speed || 0,
            timestamp: now
          });
          console.log(`📍 Live Delivery Ping sent [${staff.staffName}]: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        }
      },
      (error) => {
        console.warn('Geolocation tracking error:', error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000
      }
    );
  }

  public stopDuty() {
    this.isTrackingActive = false;
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    console.log('🛑 Delivery Duty Stopped.');
  }

  public isDutyOn(): boolean {
    return this.isTrackingActive;
  }
}

export const deliveryTracker = new DeliveryTrackerService();
