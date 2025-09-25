import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AuthUser, UserRole } from '../types/database';

interface MockAuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  role: UserRole | null;
  isAdmin: boolean;
  isTechnician: boolean;
  isClient: boolean;
  isFirstAdmin: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUpAdmin: (userData: { email: string; password: string; name: string }) => Promise<{ user: any; isFirstAdmin: boolean }>;
  signOut: () => Promise<void>;
  hasPermission: (requiredRole: UserRole | UserRole[]) => boolean;
  refreshUser: () => Promise<void>;
}

const MockAuthContext = createContext<MockAuthContextType | undefined>(undefined);

interface MockAuthProviderProps {
  children: ReactNode;
}

export const MockAuthProvider: React.FC<MockAuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshUser = async () => {
    // Mock implementation
  };

  const handleSignIn = async (email: string, password: string): Promise<AuthUser> => {
    // Mock implementation - support different user types for demo
    let mockUser: AuthUser;

    if (email.includes('tech') || email.includes('technician')) {
      mockUser = {
        id: '2',
        email: email,
        role: 'technician' as UserRole,
        name: 'Jane Tech',
        isFirstAdmin: false
      };
    } else if (email.includes('client')) {
      mockUser = {
        id: '3',
        email: email,
        role: 'client' as UserRole,
        name: 'Client User',
        isFirstAdmin: false
      };
    } else {
      // Default to admin
      mockUser = {
        id: '1',
        email: email,
        role: 'admin' as UserRole,
        name: 'Admin User',
        isFirstAdmin: true
      };
    }

    setUser(mockUser);
    return mockUser;
  };

  const handleSignUpAdmin = async (userData: { email: string; password: string; name: string }) => {
    // Mock implementation
    const mockResult = {
      user: { userId: '1' },
      isFirstAdmin: true
    };
    return mockResult;
  };

  const handleSignOut = async (): Promise<void> => {
    setUser(null);
  };

  const hasPermission = (requiredRole: UserRole | UserRole[]): boolean => {
    if (!user) return false;

    const roleHierarchy = {
      admin: 3,
      technician: 2,
      client: 1
    };

    const userLevel = roleHierarchy[user.role];

    if (Array.isArray(requiredRole)) {
      return requiredRole.some(role => userLevel >= roleHierarchy[role]);
    }

    return userLevel >= roleHierarchy[requiredRole];
  };

  // Computed properties
  const isAuthenticated = !!user;
  const role = user?.role || null;
  const isAdmin = user?.role === 'admin';
  const isTechnician = user?.role === 'technician';
  const isClient = user?.role === 'client';
  const isFirstAdmin = user?.isFirstAdmin || false;

  const value: MockAuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    role,
    isAdmin,
    isTechnician,
    isClient,
    isFirstAdmin,
    signIn: handleSignIn,
    signUpAdmin: handleSignUpAdmin,
    signOut: handleSignOut,
    hasPermission,
    refreshUser
  };

  return (
    <MockAuthContext.Provider value={value}>
      {children}
    </MockAuthContext.Provider>
  );
};

export const useMockAuth = () => {
  const context = useContext(MockAuthContext);
  if (context === undefined) {
    throw new Error('useMockAuth must be used within a MockAuthProvider');
  }
  return context;
};

export default MockAuthContext;