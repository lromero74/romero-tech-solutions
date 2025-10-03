import Stripe from 'stripe';

// Initialize Stripe with secret key from environment
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia', // Use latest API version
});

/**
 * Create or retrieve a Stripe customer
 * @param {Object} params - Customer parameters
 * @param {string} params.email - Customer email
 * @param {string} params.name - Customer name
 * @param {Object} params.metadata - Additional metadata
 * @returns {Promise<Object>} Stripe customer object
 */
export async function createOrGetCustomer({ email, name, metadata = {} }) {
  try {
    // Check if customer already exists
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      console.log(`✅ Found existing Stripe customer: ${existingCustomers.data[0].id}`);
      return existingCustomers.data[0];
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email,
      name,
      metadata,
    });

    console.log(`✅ Created new Stripe customer: ${customer.id}`);
    return customer;
  } catch (error) {
    console.error('❌ Error creating/retrieving Stripe customer:', error);
    throw error;
  }
}

/**
 * Create a payment intent for an invoice
 * @param {Object} params - Payment intent parameters
 * @param {number} params.amount - Amount in cents
 * @param {string} params.currency - Currency code (e.g., 'usd')
 * @param {string} params.customerId - Stripe customer ID
 * @param {string} params.invoiceId - Internal invoice ID
 * @param {string} params.description - Payment description
 * @param {Object} params.metadata - Additional metadata
 * @returns {Promise<Object>} Stripe payment intent object
 */
export async function createPaymentIntent({
  amount,
  currency = 'usd',
  customerId,
  invoiceId,
  description,
  metadata = {},
}) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      customer: customerId,
      description,
      metadata: {
        ...metadata,
        invoiceId,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log(`✅ Created payment intent: ${paymentIntent.id} for $${amount}`);
    return paymentIntent;
  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    throw error;
  }
}

/**
 * Retrieve a payment intent
 * @param {string} paymentIntentId - Stripe payment intent ID
 * @returns {Promise<Object>} Stripe payment intent object
 */
export async function getPaymentIntent(paymentIntentId) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error('❌ Error retrieving payment intent:', error);
    throw error;
  }
}

/**
 * Confirm a payment intent
 * @param {string} paymentIntentId - Stripe payment intent ID
 * @param {string} paymentMethodId - Stripe payment method ID
 * @returns {Promise<Object>} Confirmed payment intent
 */
export async function confirmPaymentIntent(paymentIntentId, paymentMethodId) {
  try {
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });

    console.log(`✅ Confirmed payment intent: ${paymentIntentId}`);
    return paymentIntent;
  } catch (error) {
    console.error('❌ Error confirming payment intent:', error);
    throw error;
  }
}

/**
 * Cancel a payment intent
 * @param {string} paymentIntentId - Stripe payment intent ID
 * @returns {Promise<Object>} Cancelled payment intent
 */
export async function cancelPaymentIntent(paymentIntentId) {
  try {
    const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);
    console.log(`✅ Cancelled payment intent: ${paymentIntentId}`);
    return paymentIntent;
  } catch (error) {
    console.error('❌ Error cancelling payment intent:', error);
    throw error;
  }
}

/**
 * Construct webhook event from request
 * @param {string} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @param {string} webhookSecret - Webhook secret from Stripe
 * @returns {Object} Stripe event object
 */
export function constructWebhookEvent(payload, signature, webhookSecret) {
  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
    return event;
  } catch (error) {
    console.error('❌ Webhook signature verification failed:', error);
    throw error;
  }
}

/**
 * Get payment method details
 * @param {string} paymentMethodId - Stripe payment method ID
 * @returns {Promise<Object>} Payment method object
 */
export async function getPaymentMethod(paymentMethodId) {
  try {
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    return paymentMethod;
  } catch (error) {
    console.error('❌ Error retrieving payment method:', error);
    throw error;
  }
}

export default {
  stripe,
  createOrGetCustomer,
  createPaymentIntent,
  getPaymentIntent,
  confirmPaymentIntent,
  cancelPaymentIntent,
  constructWebhookEvent,
  getPaymentMethod,
};
