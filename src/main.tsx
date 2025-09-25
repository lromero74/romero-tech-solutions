import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { checkFirefoxCompatibility, firefoxDebugLog, detectBrowser } from './utils/browserSupport';

const compatibility = checkFirefoxCompatibility();
if (!compatibility.compatible) {
  firefoxDebugLog('Compatibility issues detected', compatibility.issues);
} else {
  firefoxDebugLog('All compatibility checks passed');
}

// Simple Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application Error:', error);
    console.error('Error Info:', errorInfo);
    firefoxDebugLog('Application error caught', {
      error: error.message,
      stack: error.stack,
      userAgent: navigator.userAgent
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          fontFamily: 'Arial, sans-serif'
        }}>
          <h1>Something went wrong.</h1>
          <p>The application encountered an error.</p>
          {detectBrowser().isFirefox && (
            <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0' }}>
              <h3>Firefox Debug Info:</h3>
              <p>User Agent: {navigator.userAgent}</p>
              <p>Error: {this.state.error?.message}</p>
              <button
                onClick={() => window.location.reload()}
                style={{ padding: '10px 20px', marginTop: '10px' }}
              >
                Reload Page
              </button>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
