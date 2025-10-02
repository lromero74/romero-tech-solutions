// ApiResponse interface (commented out as unused)
/*
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  error?: string;
}
*/

interface RequestOptions extends RequestInit {
  skipAuth?: boolean; // Skip automatic session handling for some requests
}

class ApiService {
  private baseUrl: string;
  private onUnauthorized?: () => void;
  private csrfToken: string | null = null;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
    // Fetch CSRF token on initialization
    this.fetchCsrfToken();
  }

  /**
   * Fetch CSRF token from backend
   */
  private async fetchCsrfToken(): Promise<void> {
    try {
      console.log('🔐 Fetching CSRF token from:', `${this.baseUrl}/csrf-token`);

      const response = await fetch(`${this.baseUrl}/csrf-token`, {
        credentials: 'include', // Include cookies (session_token cookie provides session identifier)
      });
      console.log('🔐 CSRF token response status:', response.status);
      const data = await response.json();
      console.log('🔐 CSRF token response data:', data);
      if (data.success && data.csrfToken) {
        this.csrfToken = data.csrfToken;
        console.log('✅ CSRF token fetched successfully');
      } else {
        console.warn('⚠️ CSRF token response missing success or token');
      }
    } catch (error) {
      console.error('❌ Failed to fetch CSRF token:', error);
    }
  }

  /**
   * Get CSRF token (refetch if not available)
   */
  private async getCsrfToken(): Promise<string | null> {
    if (!this.csrfToken) {
      await this.fetchCsrfToken();
    }
    return this.csrfToken;
  }

  /**
   * Update CSRF token from login response
   * The server generates a new CSRF token/cookie after successful authentication
   */
  updateCsrfToken(newToken: string): void {
    this.csrfToken = newToken;
    console.log('✅ CSRF token updated from login response');
  }

  /**
   * Refresh CSRF token (call this after login to get a token with the authenticated session identifier)
   *
   * NOTE: The CSRF cookie is httpOnly, so we can't delete it from JavaScript.
   * Instead, we rely on the server to generate a new token/cookie pair when we make the request
   * with the authenticated sessionToken cookie.
   */
  async refreshCsrfToken(): Promise<void> {
    console.log('🔄 Refreshing CSRF token after authentication...');

    // Clear the cached token in memory
    this.csrfToken = null;

    // Fetch a new token - the server will generate a new cookie with the authenticated session identifier
    console.log('🔄 Fetching new CSRF token with authenticated session...');
    await this.fetchCsrfToken();

    console.log('✅ CSRF token refreshed - new token will be used for subsequent requests');
  }

  /**
   * Get CSRF token for manual requests (e.g., XMLHttpRequest)
   * Public method to allow components to access the token
   */
  async getToken(): Promise<string | null> {
    return await this.getCsrfToken();
  }

  /**
   * Set callback for handling unauthorized responses (401)
   */
  setUnauthorizedHandler(handler: () => void) {
    this.onUnauthorized = handler;
  }

  /**
   * Disable unauthorized handling (e.g., during manual logout)
   */
  disableUnauthorizedHandling() {
    this.skipUnauthorizedHandling = true;
  }

  /**
   * Re-enable unauthorized handling
   */
  enableUnauthorizedHandling() {
    this.skipUnauthorizedHandling = false;
  }

  /**
   * Get authorization headers with session token
   */
  private getAuthHeaders(): HeadersInit {
    const sessionToken = localStorage.getItem('sessionToken');
    return sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {};
  }

  /**
   * Handle API response, including session expiry
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    const data = await response.json();

    if (!response.ok) {
      // Handle 401 responses (session expired/invalid)
      if (response.status === 401 && !this.skipUnauthorizedHandling) {
        console.warn('🔐 API call returned 401 - session expired or invalid');

        // Clear local session data
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('user');
        localStorage.removeItem('sessionData');

        // Call the unauthorized handler if set
        if (this.onUnauthorized) {
          this.onUnauthorized();
        }
      }

      // Throw an error with the server response
      const error = new Error(data.message || `HTTP ${response.status} ${response.statusText}`) as Error & {
        code?: string;
        status?: number;
      };
      error.code = data.code;
      error.status = response.status;
      throw error;
    }

    return data;
  }

  private skipUnauthorizedHandling = false;

  /**
   * Make authenticated API request
   */
  async request<T = unknown>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { skipAuth = false, params, ...fetchOptions } = options as RequestOptions & { params?: Record<string, string> };

    // Build URL with query parameters if provided
    let url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString();
      url += `?${queryString}`;
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    };

    // Add auth headers unless explicitly skipped
    if (!skipAuth) {
      Object.assign(headers, this.getAuthHeaders());
    }

    // Add CSRF token for state-changing requests (POST, PUT, DELETE, PATCH)
    const method = (fetchOptions.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const csrfToken = await this.getCsrfToken();
      console.log(`🔐 ${method} request - CSRF token:`, csrfToken ? `${csrfToken.substring(0, 20)}...` : 'NOT AVAILABLE');
      if (csrfToken) {
        Object.assign(headers, { 'x-csrf-token': csrfToken });
        console.log('✅ Added CSRF token to request headers');
      } else {
        console.warn('⚠️ CSRF token not available for POST request!');
      }
    }

    // Temporarily skip unauthorized handling for specific requests
    this.skipUnauthorizedHandling = skipAuth;

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        credentials: 'include', // Include cookies for CSRF
      });

      return await this.handleResponse<T>(response);
    } finally {
      this.skipUnauthorizedHandling = false;
    }
  }

  /**
   * GET request
   */
  async get<T = unknown>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T = unknown>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T = unknown>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Session-specific API calls
   */
  async sessionHeartbeat(): Promise<{ success: boolean; session?: unknown; message?: string }> {
    try {
      const result = await this.post('/auth/heartbeat');
      return {
        success: true,
        session: result.session,
        message: result.message
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Session heartbeat failed'
      };
    }
  }

  async extendSession(): Promise<{ success: boolean; session?: unknown; message?: string }> {
    try {
      const result = await this.post('/auth/extend-session');
      return {
        success: true,
        session: result.session,
        message: result.message
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Session extension failed'
      };
    }
  }

  /**
   * Check if session is valid
   */
  async validateSession(): Promise<{ success: boolean; session?: unknown; message?: string }> {
    try {
      const result = await this.get('/auth/validate-session');
      return {
        success: true,
        session: result.session,
        message: result.message
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Session validation failed'
      };
    }
  }
}

// Create and export singleton instance
export const apiService = new ApiService();
export default apiService;