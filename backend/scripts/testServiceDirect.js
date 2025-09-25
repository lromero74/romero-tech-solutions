import { clientRegistrationService } from '../services/clientRegistrationService.js';
import dotenv from 'dotenv';

dotenv.config();

async function testServiceDirect() {
  console.log('🔍 Testing service directly (bypassing routes)...');

  // Test data with correct structure
  const registrationData = {
    businessName: 'Test Tech Solutions Direct',
    domainEmail: 'louis@romerotechsolutions.com',
    businessAddress: {
      street: '123 Tech Street',
      city: 'San Diego',
      state: 'CA',
      zipCode: '92101',
      country: 'USA'
    },
    contactName: 'Louis Romero',
    contactEmail: 'louis@romerotechsolutions.com',
    contactPhone: '(619) 940-5550',
    jobTitle: 'CEO',
    password: 'TestPassword123!',
    serviceAddresses: [
      {
        label: 'Main Office',
        street: '123 Tech Street',
        city: 'San Diego',
        state: 'CA',
        zipCode: '92101',
        country: 'USA',
        contactPerson: 'Louis Romero',
        contactPhone: '(619) 940-5550',
        notes: 'Primary business location'
      }
    ]
  };

  try {
    console.log('📝 Calling service directly...');
    const result = await clientRegistrationService.registerClient(registrationData);

    console.log('✅ Registration successful!');
    console.log('   Business ID:', result.businessId);
    console.log('   User ID:', result.userId);
    console.log('   Message:', result.message);
    console.log('   Email sent:', result.emailConfirmationSent);

  } catch (error) {
    console.error('❌ Direct service call failed:', error.message);
    console.error('   Stack:', error.stack);
  }
}

testServiceDirect().then(() => {
  console.log('\n🎉 Direct service test completed!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Direct service test failed:', error);
  process.exit(1);
});