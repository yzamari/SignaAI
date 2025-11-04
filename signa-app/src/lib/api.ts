const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5112/api/v1';

class ApiService {
  private token: string | null = null;

  constructor() {
    // Load token from localStorage if available
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        ...options.headers,
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
        ...(!(options.body instanceof FormData) && { 'Content-Type': 'application/json' }),
      },
    };

    const response = await fetch(url, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      // Handle different error formats from backend
      const errorMessage = error.detail || error.message || error.error || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Auth endpoints
  async register(data: { email: string; password: string; name: string; phone?: string; role: string }) {
    // Map frontend fields to backend fields
    const backendData = {
      email: data.email,
      password: data.password,
      name: data.name,
      phone: data.phone || null
    };
    
    const response = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(backendData),
    });
    
    if (response.access_token) {
      this.setToken(response.access_token);
      // Add token field for backward compatibility with frontend components
      response.token = response.access_token;
    } else if (response.token) {
      this.setToken(response.token);
    }
    
    return response;
  }

  async login(email: string, password: string) {
    // Backend expects form data with 'username' field for OAuth2PasswordRequestForm
    const formData = new URLSearchParams();
    formData.append('username', email);  // OAuth2 expects 'username' field
    formData.append('password', password);

    const url = `${API_BASE_URL}/auth/login`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(error.detail || 'Invalid credentials');
    }

    const data = await response.json();

    // The backend returns access_token in the response
    if (data.access_token) {
      this.setToken(data.access_token);
      // Add token field for backward compatibility with frontend components
      data.token = data.access_token;
    } else if (data.token) {
      this.setToken(data.token);
    }

    return data;
  }

  logout() {
    this.clearToken();
  }

  // Document endpoints
  async uploadDocument(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    return this.request('/documents/upload', {
      method: 'POST',
      body: formData,
    });
  }

  async getDocuments(params?: { limit?: number; offset?: number; status?: string }) {
    const queryParams = new URLSearchParams(params as any).toString();
    return this.request(`/documents${queryParams ? `?${queryParams}` : ''}`);
  }

  async getDocument(id: string) {
    return this.request(`/documents/${id}`);
  }

  async updateDocumentStatus(id: string, status: string) {
    return this.request(`/documents/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  async createDocument(data: {
    title: string;
    file_path?: string;
    signers: Array<{ name: string; email: string; phone?: string }>;
    fields: any[];
    workflow: { type: string; deadline?: string };
  }) {
    return this.request('/documents/create', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Workflow endpoints
  async createWorkflow(data: {
    documentId: string;
    signers: Array<{ name: string; email: string; phone?: string }>;
    type?: 'parallel' | 'sequential';
    deadline?: string;
    fields?: any[];
  }) {
    return this.request('/workflows', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getWorkflow(id: string) {
    return this.request(`/workflows/${id}`);
  }

  async sendWorkflowNotifications(id: string, sendVia: string[]) {
    return this.request(`/workflows/${id}/send`, {
      method: 'POST',
      body: JSON.stringify({ sendVia }),
    });
  }

  // Signature endpoints (PUBLIC - no auth required)
  async getSignatureDocument(token: string) {
    // Use the public signing endpoint - token is the document ID
    const publicUrl = `${API_BASE_URL}/signing/documents/${token}`;
    const response = await fetch(publicUrl);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Document not found' }));
      throw new Error(error.detail || `Document not found`);
    }
    
    return response.json();
  }

  async submitSignature(token: string, signatureData: string, fields?: any[]) {
    // Use the public signing submission endpoint
    const publicUrl = `${API_BASE_URL}/signing/documents/${token}/submit`;
    const response = await fetch(publicUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ signature_data: { signatureData, fields } }),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to submit signature' }));
      throw new Error(error.detail || `Failed to submit signature`);
    }
    
    return response.json();
  }

  async declineSignature(token: string, reason?: string) {
    return this.request('/signatures/decline', {
      method: 'POST',
      body: JSON.stringify({ token, reason }),
    });
  }

  // Dashboard stats
  async getDashboardStats() {
    return this.request('/dashboard/stats');
  }

  // User profile endpoints
  async getUserProfile() {
    return this.request('/users/profile');
  }

  async updateUserProfile(data: { name?: string; phone?: string; company?: string }) {
    return this.request('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // User settings endpoints
  async getUserSettings() {
    return this.request('/users/settings');
  }

  async updateUserSettings(settings: {
    email_notifications?: boolean;
    sms_notifications?: boolean;
    push_notifications?: boolean;
    document_reminders?: boolean;
    language?: string;
    timezone?: string;
    date_format?: string;
  }) {
    return this.request('/users/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // OCR endpoints
  async detectFields(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    return this.request('/ocr/detect-fields', {
      method: 'POST',
      body: formData,
    });
  }

  async validateFields(fields: any[], userFeedback?: any) {
    return this.request('/ocr/validate-fields', {
      method: 'POST',
      body: JSON.stringify({ fields, userFeedback }),
    });
  }

  async getOCRStatus() {
    return this.request('/ocr/status');
  }

  // PDF and document processing
  async getPDFUrl(documentId: string) {
    return this.request(`/documents/${documentId}/pdf`);
  }

  async applySignature(documentId: string, signatureData: string, fields: any[]) {
    return this.request(`/documents/${documentId}/sign`, {
      method: 'POST',
      body: JSON.stringify({ signatureData, fields }),
    });
  }

  async downloadSignedDocument(documentId: string) {
    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/download`, {
      headers: {
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to download document');
    }
    
    return response.blob();
  }

  // Document field management
  async saveDocumentFields(documentId: string, fields: any[]) {
    return this.request(`/documents/${documentId}/fields`, {
      method: 'POST',
      body: JSON.stringify({ fields }),
    });
  }

  async getDocumentFields(documentId: string) {
    return this.request(`/documents/${documentId}/fields`);
  }

  // Health check
  async healthCheck() {
    return this.request('/health');
  }
}

export const api = new ApiService();
export default api;