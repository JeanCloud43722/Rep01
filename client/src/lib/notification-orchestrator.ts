import { audioManager } from './audio-manager';
import { detectCapabilities, getNotificationStrategy, type DeviceCapabilities, type NotificationStrategy } from './device-capabilities';

export type NotificationEventType = 
  | 'order_ready' 
  | 'message' 
  | 'offer' 
  | 'service_request' 
  | 'status_update'
  | 'new_registration'
  | 'order_completed';

export type NotificationRole = 'customer' | 'staff';

interface NotificationEvent {
  type: NotificationEventType;
  orderId?: string;
  title?: string;
  body?: string;
  data?: Record<string, any>;
}

interface VibrationPattern {
  pattern: number[];
  intensity: 'light' | 'medium' | 'strong';
}

const vibrationPatterns: Record<NotificationEventType, VibrationPattern> = {
  order_ready: { pattern: [100, 50, 100, 50, 200], intensity: 'strong' },
  message: { pattern: [50, 30, 50], intensity: 'light' },
  offer: { pattern: [30, 20, 30, 20, 30, 20, 80], intensity: 'medium' },
  service_request: { pattern: [150, 100, 150], intensity: 'strong' },
  status_update: { pattern: [30], intensity: 'light' },
  new_registration: { pattern: [50, 30, 80], intensity: 'medium' },
  order_completed: { pattern: [80, 50, 120], intensity: 'medium' }
};

const eventToSoundCue: Record<NotificationEventType, { customer?: string; staff?: string }> = {
  order_ready: { customer: 'order-ready' },
  message: { customer: 'message' },
  offer: { customer: 'offer' },
  service_request: { staff: 'service-request' },
  status_update: { customer: 'status-update' },
  new_registration: { staff: 'new-registration' },
  order_completed: { staff: 'order-completed' }
};

class NotificationOrchestrator {
  private static instance: NotificationOrchestrator;
  private capabilities: DeviceCapabilities;
  private strategy: NotificationStrategy;
  private role: NotificationRole = 'customer';
  private isWarmedUp = false;
  private lastNotificationTime: Record<string, number> = {};
  private throttleMs = 500;
  private unseenNotifications: NotificationEvent[] = [];
  private onNotificationCallbacks: ((event: NotificationEvent) => void)[] = [];
  
  private constructor() {
    this.capabilities = detectCapabilities();
    this.strategy = getNotificationStrategy(this.capabilities);
  }
  
  static getInstance(): NotificationOrchestrator {
    if (!NotificationOrchestrator.instance) {
      NotificationOrchestrator.instance = new NotificationOrchestrator();
    }
    return NotificationOrchestrator.instance;
  }
  
  setRole(role: NotificationRole): void {
    this.role = role;
  }
  
  getRole(): NotificationRole {
    return this.role;
  }
  
  getCapabilities(): DeviceCapabilities {
    return this.capabilities;
  }
  
  getStrategy(): NotificationStrategy {
    return this.strategy;
  }
  
  warmUp(): void {
    if (this.isWarmedUp) return;
    audioManager.warmUp();
    this.isWarmedUp = true;
    console.log('Notification Orchestrator: Warmed up for', this.capabilities.deviceType);
  }
  
  onNotification(callback: (event: NotificationEvent) => void): () => void {
    this.onNotificationCallbacks.push(callback);
    return () => {
      const index = this.onNotificationCallbacks.indexOf(callback);
      if (index > -1) {
        this.onNotificationCallbacks.splice(index, 1);
      }
    };
  }
  
  private shouldThrottle(eventType: NotificationEventType): boolean {
    const now = Date.now();
    const lastTime = this.lastNotificationTime[eventType] || 0;
    
    if (now - lastTime < this.throttleMs) {
      return true;
    }
    
    this.lastNotificationTime[eventType] = now;
    return false;
  }
  
  private playSound(eventType: NotificationEventType): void {
    if (!this.strategy.audio) return;
    
    const soundMapping = eventToSoundCue[eventType];
    const soundCue = this.role === 'staff' ? soundMapping.staff : soundMapping.customer;
    
    if (soundCue) {
      audioManager.play(soundCue as any);
    }
  }
  
  private triggerVibration(eventType: NotificationEventType): void {
    if (!this.strategy.vibration || !this.capabilities.vibration) return;
    
    const vibrationConfig = vibrationPatterns[eventType];
    if (vibrationConfig) {
      try {
        navigator.vibrate(vibrationConfig.pattern);
      } catch (error) {
        console.warn('Vibration failed:', error);
      }
    }
  }
  
  private updateTabBadge(count: number): void {
    if (!this.strategy.visualBadge) return;
    
    if ('setAppBadge' in navigator) {
      try {
        if (count > 0) {
          (navigator as any).setAppBadge(count);
        } else {
          (navigator as any).clearAppBadge();
        }
      } catch {
      }
    }
    
    document.title = count > 0 ? `(${count}) Restaurant Buzzer` : 'Restaurant Buzzer';
  }
  
  async requestWakeLock(): Promise<WakeLockSentinel | null> {
    if (!this.strategy.wakeLock || !this.capabilities.screenWakeLock) return null;
    
    try {
      const wakeLock = await (navigator as any).wakeLock.request('screen');
      console.log('Wake lock acquired');
      return wakeLock;
    } catch (error) {
      console.warn('Wake lock request failed:', error);
      return null;
    }
  }
  
  notify(event: NotificationEvent): void {
    if (this.shouldThrottle(event.type)) {
      console.log('Notification throttled:', event.type);
      return;
    }
    
    console.log('Orchestrator: Processing notification', event.type, 'for role', this.role);
    
    this.playSound(event.type);
    
    this.triggerVibration(event.type);
    
    this.unseenNotifications.push(event);
    this.updateTabBadge(this.unseenNotifications.length);
    
    this.onNotificationCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Notification callback error:', error);
      }
    });
  }
  
  clearUnseenNotifications(): void {
    this.unseenNotifications = [];
    this.updateTabBadge(0);
  }
  
  getUnseenCount(): number {
    return this.unseenNotifications.length;
  }
  
  getDeviceInfo(): string {
    const { deviceType, isIOS, isAndroid, isMobile } = this.capabilities;
    const platformEmoji = isIOS ? '📱' : isAndroid ? '🤖' : isMobile ? '📲' : '💻';
    return `${platformEmoji} ${deviceType}`;
  }
  
  getCapabilitySummary(): string[] {
    const summary: string[] = [];
    
    if (this.capabilities.webAudio) summary.push('Audio');
    if (this.capabilities.pushNotifications) summary.push('Push');
    if (this.capabilities.vibration) summary.push('Vibration');
    if (this.capabilities.screenWakeLock) summary.push('Wake Lock');
    if (this.capabilities.notifications) summary.push('Notifications');
    
    return summary;
  }
}

export const notificationOrchestrator = NotificationOrchestrator.getInstance();

export function useNotificationOrchestrator() {
  return {
    orchestrator: notificationOrchestrator,
    warmUp: () => notificationOrchestrator.warmUp(),
    notify: (event: NotificationEvent) => notificationOrchestrator.notify(event),
    setRole: (role: NotificationRole) => notificationOrchestrator.setRole(role),
    getRole: () => notificationOrchestrator.getRole(),
    clearUnseen: () => notificationOrchestrator.clearUnseenNotifications(),
    getUnseenCount: () => notificationOrchestrator.getUnseenCount(),
    onNotification: (callback: (event: NotificationEvent) => void) => 
      notificationOrchestrator.onNotification(callback),
    getCapabilities: () => notificationOrchestrator.getCapabilities(),
    getStrategy: () => notificationOrchestrator.getStrategy(),
    requestWakeLock: () => notificationOrchestrator.requestWakeLock(),
    getDeviceInfo: () => notificationOrchestrator.getDeviceInfo(),
    getCapabilitySummary: () => notificationOrchestrator.getCapabilitySummary()
  };
}
