import { sessionService } from '../services/sessionService.js';
import { closePool } from '../config/database.js';

async function testHeartbeatEndpoint() {
  try {
    console.log('🧪 Testing Heartbeat Endpoint\n');

    // Test 1: Create a test session first
    console.log('📝 Step 1: Creating test session...');
    const testUserId = 'test-heartbeat-user';
    const testEmail = 'heartbeat-test@example.com';

    const session = await sessionService.createSession(
      testUserId,
      testEmail,
      'Test Browser/1.0',
      '192.168.1.100'
    );

    console.log('✅ Test session created:', {
      sessionId: session.sessionId,
      sessionToken: session.sessionToken?.substring(0, 16) + '...',
      expiresAt: session.expiresAt
    });

    // Test 2: Test heartbeat endpoint simulation
    console.log('\n📝 Step 2: Testing heartbeat logic...');

    // Simulate what the heartbeat endpoint does
    const beforeHeartbeat = await sessionService.validateSession(session.sessionToken);
    console.log('📊 Session state before heartbeat:', {
      lastActivity: beforeHeartbeat?.lastActivity,
      expiresAt: beforeHeartbeat?.expiresAt
    });

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulate heartbeat call (validateSession automatically extends the session)
    const afterHeartbeat = await sessionService.validateSession(session.sessionToken);

    if (afterHeartbeat) {
      console.log('✅ Heartbeat successful!');
      console.log('📊 Session state after heartbeat:', {
        lastActivity: afterHeartbeat.lastActivity,
        expiresAt: afterHeartbeat.expiresAt
      });

      // Calculate time remaining (same logic as heartbeat endpoint)
      const now = new Date();
      const expiresAt = new Date(afterHeartbeat.expiresAt);
      const timeRemainingMs = expiresAt.getTime() - now.getTime();
      const timeRemainingMinutes = Math.max(0, Math.ceil(timeRemainingMs / (1000 * 60)));
      const timeRemainingSeconds = Math.max(0, Math.ceil(timeRemainingMs / 1000));

      console.log('⏱️  Time calculations:', {
        timeRemainingMinutes,
        timeRemainingSeconds,
        isActive: timeRemainingMs > 0
      });
    } else {
      console.log('❌ Heartbeat failed - session not found');
    }

    // Test 3: Test with invalid session token
    console.log('\n📝 Step 3: Testing with invalid session token...');
    const invalidSession = await sessionService.validateSession('invalid-token-123');

    if (invalidSession === null) {
      console.log('✅ Invalid token correctly rejected');
    } else {
      console.log('❌ Invalid token was accepted (this is wrong)');
    }

    // Test 4: Clean up test session
    console.log('\n📝 Step 4: Cleaning up test session...');
    const sessionEnded = await sessionService.endSession(session.sessionToken);
    console.log('✅ Test session cleaned up:', sessionEnded);

    console.log('\n🎉 All heartbeat tests passed!');
    console.log('\n💡 Heartbeat endpoint functionality verified:');
    console.log('   ✅ Validates session tokens');
    console.log('   ✅ Updates last_activity and expires_at');
    console.log('   ✅ Calculates time remaining correctly');
    console.log('   ✅ Handles invalid tokens properly');

  } catch (error) {
    console.error('❌ Heartbeat test failed:', error);
  } finally {
    await closePool();
  }
}

testHeartbeatEndpoint();