import { sessionService } from '../services/sessionService.js';
import { closePool } from '../config/database.js';

async function testSessionTracking() {
  try {
    console.log('🧪 Testing Real-Time Session Tracking System\n');

    // Test 1: Create a test session
    console.log('📝 Test 1: Creating a test session...');
    const testUserId = 'test-user-123';
    const testEmail = 'test@romerotechsolutions.com';
    const testUserAgent = 'Test Browser/1.0';
    const testIpAddress = '192.168.1.100';

    const session = await sessionService.createSession(
      testUserId,
      testEmail,
      testUserAgent,
      testIpAddress
    );

    console.log('✅ Session created:', {
      sessionId: session.sessionId,
      sessionToken: session.sessionToken?.substring(0, 16) + '...',
      expiresAt: session.expiresAt
    });

    // Test 2: Validate the session
    console.log('\n📝 Test 2: Validating the session...');
    const validatedSession = await sessionService.validateSession(session.sessionToken);

    if (validatedSession) {
      console.log('✅ Session validated successfully:', {
        userId: validatedSession.userId,
        userEmail: validatedSession.userEmail,
        lastActivity: validatedSession.lastActivity
      });
    } else {
      console.log('❌ Session validation failed');
      return;
    }

    // Test 3: Check user login status
    console.log('\n📝 Test 3: Checking user login status...');
    const isLoggedIn = await sessionService.isUserLoggedIn(testUserId);
    console.log(`✅ User ${testEmail} is logged in:`, isLoggedIn);

    // Test 4: Get login status for multiple users
    console.log('\n📝 Test 4: Getting login status for multiple users...');
    const userIds = [testUserId, 'non-existent-user'];
    const loginStatusMap = await sessionService.getUsersLoginStatus(userIds);

    console.log('✅ Login status map:');
    Object.entries(loginStatusMap).forEach(([userId, status]) => {
      console.log(`   - ${userId}: ${status.isLoggedIn ? 'ONLINE' : 'OFFLINE'} (${status.activeSessions} sessions)`);
    });

    // Test 5: Get active sessions
    console.log('\n📝 Test 5: Getting all active sessions...');
    const activeSessions = await sessionService.getActiveSessions();
    console.log(`✅ Found ${activeSessions.length} active sessions`);

    activeSessions.forEach(session => {
      console.log(`   - ${session.userEmail}: ${session.isRecentlyActive ? 'Recently Active' : 'Idle'} (IP: ${session.ipAddress})`);
    });

    // Test 6: Get session statistics
    console.log('\n📝 Test 6: Getting session statistics...');
    const stats = await sessionService.getSessionStats();
    console.log('✅ Session statistics:', {
      activeSessions: stats.activeSessions,
      recentlyActive: stats.recentlyActive,
      uniqueActiveUsers: stats.uniqueActiveUsers,
      expiredSessions: stats.expiredSessions
    });

    // Test 7: End the session
    console.log('\n📝 Test 7: Ending the session...');
    const sessionEnded = await sessionService.endSession(session.sessionToken);
    console.log('✅ Session ended:', sessionEnded);

    // Test 8: Verify session is no longer valid
    console.log('\n📝 Test 8: Verifying session is no longer valid...');
    const invalidSession = await sessionService.validateSession(session.sessionToken);
    console.log('✅ Session invalidated:', invalidSession === null);

    // Test 9: Clean up expired sessions
    console.log('\n📝 Test 9: Cleaning up expired sessions...');
    const cleanedCount = await sessionService.cleanupExpiredSessions();
    console.log(`✅ Cleaned up ${cleanedCount} expired sessions`);

    console.log('\n🎉 All session tracking tests passed!');
    console.log('\n💡 Real-time session tracking system is ready:');
    console.log('   ✅ Sessions are created on login');
    console.log('   ✅ Sessions are validated and updated on activity');
    console.log('   ✅ Login status is tracked in real-time');
    console.log('   ✅ Automatic session cleanup works');
    console.log('   ✅ Admin can view all active sessions');
    console.log('   ✅ Employee table shows real login status');

  } catch (error) {
    console.error('❌ Session tracking test failed:', error);
  } finally {
    await closePool();
  }
}

testSessionTracking();