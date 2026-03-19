import { Router, type RequestHandler } from 'express';
import { getDb } from '../db';
import { pushSubscriptions } from '../../shared/schema';
import {
  sendPushNotification,
  isValidPushSubscription,
  initializePush,
} from '../lib/push-service';
import { sendCustomNotification } from '../lib/order-notifier';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger';
import type { PushSubscriptionJSON } from '../../shared/schema';

const router = Router();

// Initialize push on first import
initializePush();

// ─── POST /api/push/subscribe – Store new subscription ─────────────────────
const handleSubscribe: RequestHandler = async (req, res) => {
  try {
    const { orderId, subscription } = req.body;

    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid orderId' });
    }

    if (!isValidPushSubscription(subscription)) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }

    const db = getDb();

    // Upsert: one subscription per order
    await db
      .insert(pushSubscriptions)
      .values({
        orderId,
        endpoint: subscription.endpoint!,
        p256dh: subscription.keys!.p256dh,
        auth: subscription.keys!.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.orderId,
        set: {
          endpoint: subscription.endpoint!,
          p256dh: subscription.keys!.p256dh,
          auth: subscription.keys!.auth,
        },
      });

    logger.info('Push subscription stored', {
      source: 'push-routes',
      orderId,
      endpoint: subscription.endpoint!.slice(0, 30) + '...',
    });

    res.json({ success: true });
  } catch (err: any) {
    logger.error('Failed to store subscription', {
      source: 'push-routes',
      error: err.message,
    });
    res.status(500).json({ error: 'Failed to store subscription' });
  }
};

// ─── POST /api/push/unsubscribe – Remove subscription ─────────────────────
const handleUnsubscribe: RequestHandler = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid orderId' });
    }

    const db = getDb();

    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.orderId, orderId));

    logger.info('Push subscription removed', {
      source: 'push-routes',
      orderId,
    });

    res.json({ success: true });
  } catch (err: any) {
    logger.error('Failed to remove subscription', {
      source: 'push-routes',
      error: err.message,
    });
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
};

// ─── POST /api/push/send – Send test notification (internal) ──────────────
const handleSendNotification: RequestHandler = async (req, res) => {
  try {
    const { orderId, title, body, icon } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Missing orderId' });
    }

    if (!title || !body) {
      return res.status(400).json({ error: 'Missing title or body' });
    }

    const sent = await sendCustomNotification(orderId, title, body, icon);

    if (!sent) {
      return res.status(502).json({ error: 'Failed to send push notification' });
    }

    res.json({ success: true });
  } catch (err: any) {
    logger.error('Error in send endpoint', {
      source: 'push-routes',
      error: err.message,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Mount handlers ────────────────────────────────────────────────────────
router.post('/api/push/subscribe', handleSubscribe);
router.post('/api/push/unsubscribe', handleUnsubscribe);
router.post('/api/push/send', handleSendNotification);

export default router;
