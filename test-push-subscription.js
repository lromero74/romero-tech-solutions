#!/usr/bin/env node

/**
 * Test script for push notification subscription
 * Tests the subscription endpoint with a mock subscription object
 */

// Get a valid session token from the database
async function getValidToken() {
  const { getPool } = await import('./backend/config/database.js');
  const pool = await getPool();

  const result = await pool.query(`
    SELECT token
    FROM user_sessions
    WHERE is_active = true
      AND expires_at > NOW()
      AND user_email LIKE '%@romerotechsolutions.com'
    ORDER BY created_at DESC
    LIMIT 1
  `);

  await pool.end();

  if (result.rows.length === 0) {
    throw new Error('No active sessions found');
  }

  return result.rows[0].token;
}

// Mock subscription object (similar to what a browser would send)
const mockSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-' + Date.now(),
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM=',
    auth: 'tBHItJI5svbpez7KI4CCXg=='
  }
};

const deviceInfo = {
  userAgent: 'Test Script',
  platform: 'Node.js',
  language: 'en-US',
  screenResolution: '1920x1080',
  timezone: 'America/Los_Angeles',
  timestamp: new Date().toISOString()
};

async function testSubscription() {
  try {
    console.log('🔍 Getting valid session token...');
    const token = await getValidToken();
    console.log('✅ Got token:', token.substring(0, 20) + '...');

    console.log('\n📤 Sending subscription request to production...');
    const response = await fetch('https://api.romerotechsolutions.com/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        subscription: mockSubscription,
        deviceInfo: deviceInfo
      })
    });

    console.log('📥 Response status:', response.status);
    const responseData = await response.text();
    console.log('📥 Response data:', responseData);

    if (response.ok) {
      console.log('✅ Subscription successful!');
    } else {
      console.log('❌ Subscription failed');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testSubscription();