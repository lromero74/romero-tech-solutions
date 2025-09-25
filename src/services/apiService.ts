interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  error?: string;
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean; // Skip automatic session handling for some requests
}

class ApiService {
  private baseUrl: string;
  private onUnauthorized?: () => void;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
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
      const error = new Error(data.message || `HTTP ${response.status} ${response.statusText}`);
      (error as any).code = data.code;
      (error as any).status = response.status;
      throw error;
    }

    return data;
  }

  private skipUnauthorizedHandling = false;

  /**
   * Make authenticated API request
   */
  async request<T = any>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { skipAuth = false, ...fetchOptions } = options;

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    };

    // Add auth headers unless explicitly skipped
    if (!skipAuth) {
      Object.assign(headers, this.getAuthHeaders());
    }

    // Temporarily skip unauthorized handling for specific requests
    this.skipUnauthorizedHandling = skipAuth;

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
      });

      return await this.handleResponse<T>(response);
    } finally {
      this.skipUnauthorizedHandling = false;
    }
  }

  /**
   * GET request
   */
  async get<T = any>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T = any>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T = any>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch<T = any>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T = any>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Session-specific API calls
   */
  async sessionHeartbeat(): Promise<{ success: boolean; session?: any; message?: string }> {
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

  async extendSession(): Promise<{ success: boolean; session?: any; message?: string }> {
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
  async validateSession(): Promise<{ success: boolean; session?: any; message?: string }> {
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