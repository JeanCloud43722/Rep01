import webPush from 'web-push';
import { logger } from './logger';
import type { PushSubscriptionJSON } from '@shared/schema';

// Initialize VAPID keys from environment
export function initializePush() {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (vapidPublicKey && vapidPrivateKey) {
    webPush.setVapidDetails(
      'mailto:admin@bistrobuzzer.app',
      vapidPublicKey,
      vapidPrivateKey
    );
    logger.info('Push notifications configured with VAPID keys', {
      source: 'push-service',
    });
  } else {
    logger.warn('VAPID keys not configured – push notifications disabled', {
      source: 'push-service',
      hint: 'Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Replit Secrets',
    });
  }
}

/**
 * Send a push notification to a subscriber
 * @param subscription - Browser push subscription
 * @param payload - Notification content
 * @returns true if sent successfully, false otherwise
 */
export async function sendPushNotification(
  subscription: PushSubscriptionJSON,
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    data?: Record<string, any>;
  }
): Promise<boolean> {
  try {
    if (!subscription.endpoint || !subscription.keys) {
      logger.debug('Invalid subscription – missing endpoint or keys', {
        source: 'push-service',
      });
      return false;
    }

    await webPush.sendNotification(
      subscription as webPush.PushSubscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/icons/icon-192.png',
        badge: payload.badge || '/icons/badge-72.png',
        data: {
          ...payload.data,
          timestamp: Date.now(),
          url: payload.data?.url || '/',
        },
      })
    );

    logger.debug('Push notification sent', {
      source: 'push-service',
      endpoint: subscription.endpoint.slice(0, 30) + '...',
    });
    return true;
  } catch (err: any) {
    // Handle common push errors gracefully
    if (err.statusCode === 410) {
      // Subscription expired/revoked
      logger.warn('Subscription expired (410) – will be cleaned up', {
        source: 'push-service',
        endpoint: subscription.endpoint?.slice(0, 30),
      });
      return false;
    }

    if (err.statusCode === 401) {
      // Auth error (invalid VAPID)
      logger.error('Push auth failed (401) – check VAPID keys in Secrets', {
        source: 'push-service',
      });
      return false;
    }

    // Generic error
    logger.warn('Push notification failed', {
      source: 'push-service',
      error: err.message,
      statusCode: err.statusCode,
    });
    return false;
  }
}

/**
 * Validate a push subscription before storing
 */
export function isValidPushSubscription(sub: PushSubscriptionJSON): boolean {
  return !!(sub.endpoint && sub.keys?.p256dh && sub.keys?.auth);
}
