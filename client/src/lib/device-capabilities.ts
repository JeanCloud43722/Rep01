export type DeviceType = 'ios-safari' | 'android-chrome' | 'desktop-chrome' | 'desktop-firefox' | 'desktop-other' | 'mobile-other';

export interface DeviceCapabilities {
  deviceType: DeviceType;
  webAudio: boolean;
  pushNotifications: boolean;
  serviceWorker: boolean;
  notifications: boolean;
  vibration: boolean;
  screenWakeLock: boolean;
  reducedMotion: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isDesktop: boolean;
}

export interface NotificationStrategy {
  primary: 'websocket' | 'push';
  audio: boolean;
  vibration: boolean;
  visualBadge: boolean;
  inAppBanner: boolean;
  wakeLock: boolean;
}

function detectDeviceType(): DeviceType {
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator as any).userAgentData?.platform?.toLowerCase() || navigator.platform?.toLowerCase() || '';
  
  const isIOS = /iphone|ipad|ipod/.test(ua) || 
    (platform === 'macos' && navigator.maxTouchPoints > 1) ||
    /mac/.test(platform) && 'ontouchend' in document;
  
  const isAndroid = /android/.test(ua);
  const isChrome = /chrome/.test(ua) && !/edge|edg/.test(ua);
  const isFirefox = /firefox/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome/.test(ua);
  const isMobile = isIOS || isAndroid || /mobile/.test(ua);
  
  if (isIOS && isSafari) return 'ios-safari';
  if (isAndroid && isChrome) return 'android-chrome';
  if (!isMobile && isChrome) return 'desktop-chrome';
  if (!isMobile && isFirefox) return 'desktop-firefox';
  if (!isMobile) return 'desktop-other';
  return 'mobile-other';
}

function checkWebAudio(): boolean {
  return !!(window.AudioContext || (window as any).webkitAudioContext);
}

function checkPushNotifications(): boolean {
  return 'PushManager' in window && 'serviceWorker' in navigator;
}

function checkServiceWorker(): boolean {
  return 'serviceWorker' in navigator;
}

function checkNotifications(): boolean {
  return 'Notification' in window;
}

function checkVibration(): boolean {
  return 'vibrate' in navigator;
}

function checkScreenWakeLock(): boolean {
  return 'wakeLock' in navigator;
}

function checkReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

export function detectCapabilities(): DeviceCapabilities {
  const deviceType = detectDeviceType();
  const isIOS = deviceType === 'ios-safari' || deviceType.includes('ios');
  const isAndroid = deviceType === 'android-chrome' || deviceType.includes('android');
  const isMobile = isIOS || isAndroid || deviceType === 'mobile-other';
  
  return {
    deviceType,
    webAudio: checkWebAudio(),
    pushNotifications: checkPushNotifications() && !isIOS,
    serviceWorker: checkServiceWorker(),
    notifications: checkNotifications(),
    vibration: checkVibration(),
    screenWakeLock: checkScreenWakeLock(),
    reducedMotion: checkReducedMotion(),
    isIOS,
    isAndroid,
    isMobile,
    isDesktop: !isMobile
  };
}

export function getNotificationStrategy(capabilities: DeviceCapabilities): NotificationStrategy {
  const { deviceType, pushNotifications, webAudio, vibration, screenWakeLock } = capabilities;
  
  switch (deviceType) {
    case 'ios-safari':
      return {
        primary: 'websocket',
        audio: webAudio,
        vibration: false,
        visualBadge: true,
        inAppBanner: true,
        wakeLock: screenWakeLock
      };
      
    case 'android-chrome':
      return {
        primary: pushNotifications ? 'push' : 'websocket',
        audio: webAudio,
        vibration: vibration,
        visualBadge: true,
        inAppBanner: true,
        wakeLock: screenWakeLock
      };
      
    case 'desktop-chrome':
    case 'desktop-firefox':
      return {
        primary: pushNotifications ? 'push' : 'websocket',
        audio: webAudio,
        vibration: false,
        visualBadge: true,
        inAppBanner: true,
        wakeLock: false
      };
      
    default:
      return {
        primary: 'websocket',
        audio: webAudio,
        vibration: vibration,
        visualBadge: true,
        inAppBanner: true,
        wakeLock: false
      };
  }
}

export function useDeviceCapabilities() {
  const capabilities = detectCapabilities();
  const strategy = getNotificationStrategy(capabilities);
  
  return {
    capabilities,
    strategy,
    canVibrate: () => capabilities.vibration && navigator.vibrate,
    vibrate: (pattern: number | number[]) => {
      if (capabilities.vibration) {
        try {
          navigator.vibrate(pattern);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  };
}
