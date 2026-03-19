import { getDb } from '../db';
import { orders, pushSubscriptions } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { sendPushNotification } from './push-service';
import { logger } from './logger';
import type { PushSubscriptionJSON } from '../../shared/schema';

/**
 * Send push notification when order is ready for pickup
 * Called when order status transitions to 'notified' or similar ready states
 */
export async function notifyOrderReady(orderId: string): Promise<boolean> {
  try {
    const db = getDb();

    // Fetch order to get details for notification
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (!order) {
      logger.debug('Order not found for notification', {
        source: 'order-notifier',
        orderId,
      });
      return false;
    }

    // Fetch subscription
    const subRecord = await db.query.pushSubscriptions.findFirst({
      where: eq(pushSubscriptions.orderId, orderId),
    });

    if (!subRecord) {
      logger.debug('No push subscription for order', {
        source: 'order-notifier',
        orderId,
      });
      return false;
    }

    // Reconstruct subscription
    const subscription: PushSubscriptionJSON = {
      endpoint: subRecord.endpoint,
      keys: {
        p256dh: subRecord.p256dh,
        auth: subRecord.auth,
      },
    };

    // Send push
    const payload = {
      title: 'Your order is ready!',
      body: `Order ${orderId} – please pick up at the counter.`,
      icon: '/icons/icon-192.png',
      data: {
        orderId,
        status: order.status,
        url: `/order/${orderId}`,
      },
    };

    const sent = await sendPushNotification(subscription, payload);

    if (sent) {
      logger.info('Order ready notification sent', {
        source: 'order-notifier',
        orderId,
      });
    } else {
      logger.warn('Failed to send order ready notification', {
        source: 'order-notifier',
        orderId,
      });
    }

    return sent;
  } catch (err: any) {
    logger.error('Error sending order notification', {
      source: 'order-notifier',
      orderId,
      error: err.message,
    });
    return false;
  }
}

/**
 * Send a custom push notification
 * Used by admin for manual notifications
 */
export async function sendCustomNotification(
  orderId: string,
  title: string,
  body: string,
  icon?: string
): Promise<boolean> {
  try {
    const db = getDb();

    // Fetch subscription
    const subRecord = await db.query.pushSubscriptions.findFirst({
      where: eq(pushSubscriptions.orderId, orderId),
    });

    if (!subRecord) {
      logger.debug('No push subscription for order', {
        source: 'order-notifier',
        orderId,
      });
      return false;
    }

    // Reconstruct subscription
    const subscription: PushSubscriptionJSON = {
      endpoint: subRecord.endpoint,
      keys: {
        p256dh: subRecord.p256dh,
        auth: subRecord.auth,
      },
    };

    // Send push
    const payload = {
      title,
      body,
      icon: icon || '/icons/icon-192.png',
      data: {
        orderId,
        url: `/order/${orderId}`,
      },
    };

    const sent = await sendPushNotification(subscription, payload);

    if (sent) {
      logger.info('Custom notification sent', {
        source: 'order-notifier',
        orderId,
        title,
      });
    }

    return sent;
  } catch (err: any) {
    logger.error('Error sending custom notification', {
      source: 'order-notifier',
      orderId,
      error: err.message,
    });
    return false;
  }
}
