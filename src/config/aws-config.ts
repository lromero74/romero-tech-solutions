import { Amplify } from 'aws-amplify';

// AWS Amplify Configuration for v6
// Using your actual AWS configuration values
export const awsConfig = {
  Auth: {
    Cognito: {
      // REQUIRED - Amazon Cognito Region
      region: 'us-east-1',

      // REQUIRED - Amazon Cognito User Pool ID
      userPoolId: import.meta.env.VITE_AWS_USER_POOL_ID,

      // REQUIRED - Amazon Cognito Web Client ID (26-char alphanumeric string)
      userPoolClientId: import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID,

      // OPTIONAL - Manually set the authentication flow type. Default is 'USER_SRP_AUTH'
      loginWith: {
        email: true
      },

      signUpVerificationMethod: 'code', // 'code' | 'link'

      // Client secret configuration (if your app client has secret enabled)
      userPoolClientSecret: import.meta.env.VITE_AWS_USER_POOL_CLIENT_SECRET
    }
  },
  // Configure RDS/API Gateway for database operations
  API: {
    REST: {
      'myapi': {
        endpoint: import.meta.env.VITE_API_ENDPOINT || 'https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/prod',
        region: import.meta.env.VITE_AWS_REGION || 'us-east-1'
      }
    }
  }
};

// Configure Amplify
Amplify.configure(awsConfig);

export default awsConfig;