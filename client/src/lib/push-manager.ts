import { logger } from './logger';
import type { PushSubscriptionJSON } from '@shared/schema';

/**
 * Client-side push notification manager
 * Handles permission request, subscription, and backend registration
 */
export class PushManager {
  private vapidPublicKey: string;
  private registration: ServiceWorkerRegistration | null = null;
  private permissionRequested = false;

  constructor(vapidPublicKey: string) {
    this.vapidPublicKey = vapidPublicKey;
  }

  /**
   * Request push permission ONLY after user interaction
   * This is critical for iOS Safari compliance
   */
  async requestPermissionOnInteraction(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      logger.warn('Notifications not supported in this browser', {
        source: 'push-manager',
      });
      return 'denied';
    }

    // If permission already granted, just subscribe
    if (Notification.permission === 'granted') {
      logger.info('Push already granted – subscribing', {
        source: 'push-manager',
      });
      await this.subscribe();
      return 'granted';
    }

    // If already denied, don't prompt again
    if (Notification.permission === 'denied') {
      logger.debug('Push previously denied', { source: 'push-manager' });
      return 'denied';
    }

    // Request permission (must be triggered by user gesture)
    logger.info('Requesting push permission...', { source: 'push-manager' });
    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      logger.info('Push permission granted', { source: 'push-manager' });
      await this.subscribe();
      return 'granted';
    }

    logger.info('Push permission denied by user', { source: 'push-manager' });
    return permission;
  }

  /**
   * Subscribe to push notifications
   */
  private async subscribe(): Promise<void> {
    try {
      // Get or register service worker
      if (!this.registration) {
        this.registration = await navigator.serviceWorker.ready;
      }

      // Check if already subscribed
      let subscription = await this.registration.pushManager.getSubscription();

      if (subscription) {
        logger.debug('Already subscribed to push', {
          source: 'push-manager',
          endpoint: subscription.endpoint?.slice(0, 30),
        });
        // Still send to backend to ensure it's stored
        await this.registerWithBackend(subscription);
        return;
      }

      // Subscribe with VAPID key
      logger.debug('Subscribing to push manager...', { source: 'push-manager' });
      subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey),
      });

      logger.debug('Successfully subscribed', {
        source: 'push-manager',
        endpoint: subscription.endpoint?.slice(0, 30),
      });

      // Register with backend
      await this.registerWithBackend(subscription);
    } catch (err: any) {
      logger.error('Failed to subscribe to push', {
        source: 'push-manager',
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Send subscription to backend for storage
   */
  private async registerWithBackend(
    subscription: PushSubscription
  ): Promise<void> {
    try {
      const orderId = this.getCurrentOrderId();

      if (!orderId) {
        logger.warn('No orderId in URL – cannot register subscription', {
          source: 'push-manager',
        });
        return;
      }

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          subscription: subscription.toJSON(),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Backend registration failed: ${error}`);
      }

      logger.info('Subscription registered with backend', {
        source: 'push-manager',
        orderId,
      });
    } catch (err: any) {
      logger.error('Failed to register subscription with backend', {
        source: 'push-manager',
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Convert VAPID key from base64 to Uint8Array for pushManager
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Extract orderId from URL path (/order/ABC-123 → ABC-123)
   */
  private getCurrentOrderId(): string | null {
    const match = window.location.pathname.match(/\/order\/([^/]+)/);
    return match?.[1] || null;
  }

  /**
   * Reset permission flag for testing
   */
  resetPermissionFlag(): void {
    this.permissionRequested = false;
  }
}
