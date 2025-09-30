import { verificationCleanupService } from './services/verificationCleanupService.js';

/**
 * Test script for verification cleanup service
 */
console.log('📧 Testing Email Verification Cleanup Service');
console.log('============================================');

async function testCleanupService() {
  try {
    // Get current stats
    console.log('\n🔍 Getting cleanup statistics...');
    const stats = await verificationCleanupService.getCleanupStats();
    console.log('📊 Cleanup Stats:', stats);

    // Perform manual cleanup
    console.log('\n🧹 Running manual cleanup...');
    await verificationCleanupService.performCleanup();

    // Get updated stats
    console.log('\n📊 Getting updated statistics...');
    const updatedStats = await verificationCleanupService.getCleanupStats();
    console.log('📊 Updated Stats:', updatedStats);

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testCleanupService();