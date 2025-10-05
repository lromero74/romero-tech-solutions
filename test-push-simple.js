// Simple test for push subscription endpoint

async function test() {
  const response = await fetch('https://api.romerotechsolutions.com/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer invalid_test_token'
    },
    body: JSON.stringify({
      subscription: {
        endpoint: 'https://test.example.com/endpoint',
        keys: {
          p256dh: 'test_key',
          auth: 'test_auth'
        }
      },
      deviceInfo: {
        userAgent: 'Test Script'
      }
    })
  });

  console.log('Status:', response.status);
  const text = await response.text();
  console.log('Response:', text);
}

test().catch(console.error);