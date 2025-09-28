import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { ThemeProvider } from '../contexts/ThemeContext';
import { EnhancedAuthProvider } from '../contexts/EnhancedAuthContext';

// Import User type
type MockUser = {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  emailVerified: boolean;
  isOnVacation: boolean;
  isOutSick: boolean;
};

// Mock providers for testing
const MockThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mockThemeContext = {
    isDarkMode: false,
    toggleDarkMode: jest.fn(),
    themeClasses: {
      bg: 'bg-white',
      text: 'text-gray-900',
      card: 'bg-white',
      border: 'border-gray-200',
      input: 'bg-white border-gray-300',
      button: 'bg-blue-600 hover:bg-blue-700',
      accent: 'bg-blue-50',
      sidebar: 'bg-gray-50',
      header: 'bg-white'
    }
  };

  return (
    <ThemeProvider value={mockThemeContext}>
      {children}
    </ThemeProvider>
  );
};

const MockAuthProvider: React.FC<{ children: React.ReactNode; mockUser?: MockUser | null }> = ({
  children,
  mockUser = null
}) => {
  const mockAuthContext = {
    user: mockUser,
    isAuthenticated: !!mockUser,
    isLoading: false,
    signIn: jest.fn(),
    signOut: jest.fn(),
    updateUserAttribute: jest.fn(),
    checkAuthState: jest.fn(),
    hasRole: jest.fn().mockReturnValue(false),
    isAdmin: false,
    isTechnician: false,
    isClient: false,
    isSales: false,
    userRole: null
  };

  return (
    <EnhancedAuthProvider value={mockAuthContext}>
      {children}
    </EnhancedAuthProvider>
  );
};

// All providers wrapper
const AllProvidersWrapper: React.FC<{ children: React.ReactNode; mockUser?: MockUser | null }> = ({
  children,
  mockUser
}) => {
  return (
    <MockThemeProvider>
      <MockAuthProvider mockUser={mockUser}>
        {children}
      </MockAuthProvider>
    </MockThemeProvider>
  );
};

// Custom render function that includes providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  mockUser?: MockUser | null;
  wrapper?: React.ComponentType<{ children: React.ReactNode }>;
}

const customRender = (
  ui: ReactElement,
  options: CustomRenderOptions = {}
) => {
  const { mockUser, wrapper, ...renderOptions } = options;

  const Wrapper = wrapper || (({ children }: { children: React.ReactNode }) => (
    <AllProvidersWrapper mockUser={mockUser}>
      {children}
    </AllProvidersWrapper>
  ));

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };

// Helper functions for common test scenarios
export const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  username: 'testuser',
  role: 'admin',
  ...overrides
});

export const createMockAdmin = () => createMockUser({
  email: 'admin@romerotechsolutions.com',
  role: 'admin'
});

export const createMockClient = () => createMockUser({
  email: 'client@example.com',
  role: 'client'
});

export const createMockTechnician = () => createMockUser({
  email: 'tech@romerotechsolutions.com',
  role: 'technician'
});

// Mock API responses
export const mockApiResponse = (data: unknown, success = true) => ({
  data: success ? data : null,
  error: success ? null : data,
  success
});

// Wait for async operations
export const waitForAsyncOperations = () => new Promise(resolve => setTimeout(resolve, 0));