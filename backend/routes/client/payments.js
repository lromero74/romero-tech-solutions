import express from 'express';
import { getPool } from '../../config/database.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware } from '../../middleware/clientMiddleware.js';
import {
  createOrGetCustomer,
  createPaymentIntent,
  getPaymentIntent,
  constructWebhookEvent,
} from '../../services/stripeService.js';

// Create composite middleware for client routes
const authenticateClient = [authMiddleware, clientContextMiddleware];

const router = express.Router();

/**
 * Create a payment intent for an invoice
 * POST /api/client/payments/create-intent
 */
router.post('/create-intent', authenticateClient, async (req, res) => {
  const pool = await getPool();
  const { invoiceId } = req.body;
  const clientId = req.user.clientId;

  try {
    // Get invoice details and verify ownership
    const invoiceQuery = await pool.query(
      `
      SELECT
        i.*,
        b.business_name,
        u.email as user_email,
        u.first_name,
        u.last_name
      FROM invoices i
      JOIN businesses b ON i.business_id = b.id
      JOIN users u ON b.id = u.business_id
      WHERE i.id = $1
        AND u.id = $2
        AND i.payment_status != 'paid'
      `,
      [invoiceId, clientId]
    );

    if (invoiceQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found or already paid',
      });
    }

    const invoice = invoiceQuery.rows[0];

    // Create or get Stripe customer
    const customer = await createOrGetCustomer({
      email: invoice.user_email,
      name: `${invoice.first_name} ${invoice.last_name}`,
      metadata: {
        businessId: invoice.business_id,
        userId: clientId,
      },
    });

    // Update invoice with Stripe customer ID if not already set
    if (!invoice.stripe_customer_id) {
      await pool.query(
        `UPDATE invoices SET stripe_customer_id = $1 WHERE id = $2`,
        [customer.id, invoiceId]
      );
    }

    // Cancel previous payment intent if exists and not succeeded
    if (invoice.stripe_payment_intent_id) {
      try {
        const existingPI = await getPaymentIntent(invoice.stripe_payment_intent_id);
        if (existingPI.status !== 'succeeded' && existingPI.status !== 'processing') {
          console.log(`🔄 Canceling previous payment intent: ${invoice.stripe_payment_intent_id}`);
          const { cancelPaymentIntent } = await import('../../services/stripeService.js');
          await cancelPaymentIntent(invoice.stripe_payment_intent_id);
        }
      } catch (error) {
        console.warn('⚠️ Could not cancel previous payment intent:', error.message);
      }
    }

    // Create payment intent
    const paymentIntent = await createPaymentIntent({
      amount: parseFloat(invoice.total_amount),
      currency: 'usd',
      customerId: customer.id,
      invoiceId: invoice.id,
      description: `Invoice ${invoice.invoice_number} - ${invoice.business_name}`,
      metadata: {
        invoiceNumber: invoice.invoice_number,
        businessId: invoice.business_id,
        userId: clientId,
      },
    });

    // Update invoice with NEW payment intent ID (always replace)
    await pool.query(
      `
      UPDATE invoices
      SET stripe_payment_intent_id = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [paymentIntent.id, invoiceId]
    );

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create payment intent',
      message: error.message,
    });
  }
});

/**
 * Get payment status for an invoice
 * GET /api/client/payments/status/:invoiceId
 */
router.get('/status/:invoiceId', authenticateClient, async (req, res) => {
  const pool = await getPool();
  const { invoiceId } = req.params;
  const clientId = req.user.clientId;

  try {
    // Get invoice and verify ownership
    const invoiceQuery = await pool.query(
      `
      SELECT
        i.id,
        i.invoice_number,
        i.total_amount,
        i.payment_status,
        i.payment_date,
        i.stripe_payment_intent_id,
        i.stripe_charge_id,
        i.payment_method
      FROM invoices i
      JOIN businesses b ON i.business_id = b.id
      JOIN users u ON b.id = u.business_id
      WHERE i.id = $1 AND u.id = $2
      `,
      [invoiceId, clientId]
    );

    if (invoiceQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found',
      });
    }

    const invoice = invoiceQuery.rows[0];

    // If there's a payment intent, get its latest status from Stripe
    let paymentIntentStatus = null;
    if (invoice.stripe_payment_intent_id) {
      try {
        const paymentIntent = await getPaymentIntent(
          invoice.stripe_payment_intent_id
        );
        paymentIntentStatus = {
          status: paymentIntent.status,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
        };
      } catch (error) {
        console.error('Error fetching payment intent:', error);
      }
    }

    res.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        totalAmount: invoice.total_amount,
        paymentStatus: invoice.payment_status,
        paymentDate: invoice.payment_date,
        paymentMethod: invoice.payment_method,
      },
      paymentIntent: paymentIntentStatus,
    });
  } catch (error) {
    console.error('❌ Error getting payment status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment status',
      message: error.message,
    });
  }
});

/**
 * Sync payment status with Stripe (for dev/test when webhooks aren't available)
 * POST /api/client/payments/sync-status/:invoiceId
 */
router.post('/sync-status/:invoiceId', authenticateClient, async (req, res) => {
  const pool = await getPool();
  const { invoiceId } = req.params;
  const clientId = req.user.clientId;

  try {
    // Get invoice and verify ownership
    const invoiceQuery = await pool.query(
      `
      SELECT
        i.id,
        i.invoice_number,
        i.payment_status,
        i.stripe_payment_intent_id
      FROM invoices i
      JOIN businesses b ON i.business_id = b.id
      JOIN users u ON b.id = u.business_id
      WHERE i.id = $1 AND u.id = $2
      `,
      [invoiceId, clientId]
    );

    if (invoiceQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found',
      });
    }

    const invoice = invoiceQuery.rows[0];

    // If no payment intent, nothing to sync
    if (!invoice.stripe_payment_intent_id) {
      return res.json({
        success: true,
        message: 'No payment intent to sync',
        paymentStatus: invoice.payment_status,
      });
    }

    // Get latest status from Stripe
    const paymentIntent = await getPaymentIntent(invoice.stripe_payment_intent_id);

    console.log(`🔄 Syncing payment status for invoice ${invoice.invoice_number}: ${paymentIntent.status}`);

    // Update invoice based on Stripe status
    if (paymentIntent.status === 'succeeded' && invoice.payment_status !== 'paid') {
      await pool.query(
        `
        UPDATE invoices
        SET
          payment_status = 'paid',
          payment_date = CURRENT_TIMESTAMP,
          stripe_charge_id = $1,
          payment_method = $2,
          stripe_payment_method_id = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        `,
        [
          paymentIntent.latest_charge,
          paymentIntent.payment_method_types?.[0] || 'card',
          paymentIntent.payment_method,
          invoiceId,
        ]
      );

      console.log(`✅ Updated invoice ${invoice.invoice_number} to paid`);

      return res.json({
        success: true,
        message: 'Invoice updated to paid',
        paymentStatus: 'paid',
        stripeStatus: paymentIntent.status,
      });
    }

    res.json({
      success: true,
      message: 'Invoice status is up to date',
      paymentStatus: invoice.payment_status,
      stripeStatus: paymentIntent.status,
    });
  } catch (error) {
    console.error('❌ Error syncing payment status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync payment status',
      message: error.message,
    });
  }
});

/**
 * Stripe webhook endpoint
 * POST /api/client/payments/webhook
 *
 * IMPORTANT: This route should NOT have authentication middleware
 * as Stripe sends the webhook directly
 */
export const webhookRouter = express.Router();

webhookRouter.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const pool = await getPool();
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    try {
      // Verify webhook signature
      const event = constructWebhookEvent(
        req.body,
        signature,
        webhookSecret
      );

      console.log(`🔔 Received Stripe webhook event: ${event.type}`);

      // Handle the event
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object;
          console.log(`✅ Payment succeeded: ${paymentIntent.id}`);

          // Update invoice as paid
          await pool.query(
            `
            UPDATE invoices
            SET
              payment_status = 'paid',
              payment_date = CURRENT_TIMESTAMP,
              stripe_charge_id = $1,
              payment_method = $2,
              stripe_payment_method_id = $3,
              updated_at = CURRENT_TIMESTAMP
            WHERE stripe_payment_intent_id = $4
            `,
            [
              paymentIntent.latest_charge,
              paymentIntent.payment_method_types?.[0] || 'card',
              paymentIntent.payment_method,
              paymentIntent.id,
            ]
          );

          console.log(`✅ Updated invoice for payment intent: ${paymentIntent.id}`);
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object;
          console.log(`❌ Payment failed: ${paymentIntent.id}`);

          // Update invoice as failed
          await pool.query(
            `
            UPDATE invoices
            SET
              payment_status = 'failed',
              updated_at = CURRENT_TIMESTAMP
            WHERE stripe_payment_intent_id = $1
            `,
            [paymentIntent.id]
          );
          break;
        }

        case 'payment_intent.canceled': {
          const paymentIntent = event.data.object;
          console.log(`⚠️ Payment canceled: ${paymentIntent.id}`);

          // Update invoice back to due (user can retry payment)
          await pool.query(
            `
            UPDATE invoices
            SET
              payment_status = 'due',
              updated_at = CURRENT_TIMESTAMP
            WHERE stripe_payment_intent_id = $1
            `,
            [paymentIntent.id]
          );
          break;
        }

        default:
          console.log(`ℹ️ Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('❌ Webhook error:', error);
      res.status(400).json({
        success: false,
        error: 'Webhook error',
        message: error.message,
      });
    }
  }
);

export default router;
