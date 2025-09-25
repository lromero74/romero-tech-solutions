import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:3001/api';

async function testRegistrationWorkflow() {
  console.log('🔍 Testing complete client registration workflow...\n');

  // Test data for registration (matching schema)
  const registrationData = {
    // Business information
    businessName: 'Test Tech Solutions',
    domainEmail: 'louis@romerotechsolutions.com',
    businessAddress: {
      street: '123 Tech Street',
      city: 'San Diego',
      state: 'CA',
      zipCode: '92101',
      country: 'USA'
    },

    // Primary contact information
    contactName: 'Louis Romero',
    contactEmail: 'louis@romerotechsolutions.com',
    contactPhone: '(619) 940-5550',
    jobTitle: 'CEO',

    // Password fields
    password: 'TestPassword123!',
    confirmPassword: 'TestPassword123!',

    // Service addresses (with nested address structure)
    serviceAddresses: [
      {
        label: 'Main Office',
        address: {
          street: '123 Tech Street',
          city: 'San Diego',
          state: 'CA',
          zipCode: '92101',
          country: 'USA'
        },
        contactPerson: 'Louis Romero',
        contactPhone: '(619) 940-5550',
        notes: 'Primary business location'
      },
      {
        label: 'Secondary Location',
        address: {
          street: '456 Innovation Ave',
          city: 'Escondido',
          state: 'CA',
          zipCode: '92025',
          country: 'USA'
        },
        contactPerson: 'Assistant Manager',
        contactPhone: '(619) 940-5551',
        notes: 'Branch office'
      }
    ]
  };

  try {
    // Step 1: Test client registration
    console.log('📝 Step 1: Testing client registration...');
    const registrationResponse = await fetch(`${API_BASE_URL}/clients/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(registrationData),
    });

    const registrationResult = await registrationResponse.json();

    if (registrationResponse.ok) {
      console.log('✅ Registration successful!');
      console.log('   Business ID:', registrationResult.data?.businessId);
      console.log('   User ID:', registrationResult.data?.userId);
      console.log('   Email confirmation sent:', registrationResult.data?.emailConfirmationSent);
      console.log('   Message:', registrationResult.message);
    } else {
      console.log('❌ Registration failed:', registrationResult.message);
      return;
    }

    // Step 2: Test email checking
    console.log('\n📝 Step 2: Testing email existence check...');
    const emailCheckResponse = await fetch(`${API_BASE_URL}/clients/check-email/${encodeURIComponent(registrationData.contactEmail)}`);
    const emailCheckResult = await emailCheckResponse.json();

    if (emailCheckResponse.ok) {
      console.log('✅ Email check successful!');
      console.log('   Email exists:', emailCheckResult.data?.exists);
    } else {
      console.log('❌ Email check failed:', emailCheckResult.message);
    }

    // Step 3: Test domain validation
    console.log('\n📝 Step 3: Testing domain validation...');
    const domainValidationResponse = await fetch(`${API_BASE_URL}/clients/validate-domain`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domainEmail: registrationData.domainEmail }),
    });

    const domainValidationResult = await domainValidationResponse.json();

    if (domainValidationResponse.ok) {
      console.log('✅ Domain validation successful!');
      console.log('   Domain valid:', domainValidationResult.data?.valid);
      console.log('   Message:', domainValidationResult.data?.message);
    } else {
      console.log('❌ Domain validation failed:', domainValidationResult.message);
    }

    // Step 4: Test resending confirmation email
    console.log('\n📝 Step 4: Testing resend confirmation email...');
    const resendResponse = await fetch(`${API_BASE_URL}/clients/resend-confirmation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: registrationData.contactEmail }),
    });

    const resendResult = await resendResponse.json();

    if (resendResponse.ok) {
      console.log('✅ Resend confirmation successful!');
      console.log('   Message:', resendResult.message);
    } else {
      console.log('❌ Resend confirmation failed:', resendResult.message);
    }

    console.log('\n📬 Check your email for confirmation messages!');
    console.log('📊 Check the database for new records:');
    console.log('   - businesses table');
    console.log('   - users table');
    console.log('   - service_addresses table');

  } catch (error) {
    console.error('❌ Registration workflow test failed:', error.message);
  }
}

testRegistrationWorkflow().then(() => {
  console.log('\n🎉 Registration workflow test completed!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Registration workflow test failed:', error);
  process.exit(1);
});