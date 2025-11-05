import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Document {
  id: string;
  title: string;
  status: 'draft' | 'pending' | 'completed';
  createdAt: string;
  updatedAt: string;
  signedBy?: string[];
  totalSigners?: number;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
}

interface AppState {
  // User state
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  // Document state
  documents: Document[];
  currentDocument: Document | null;

  // Notification state
  notifications: Notification[];

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setAuthenticated: (isAuthenticated: boolean) => void;
  login: (user: User, token: string) => void;
  logout: () => void;

  setDocuments: (documents: Document[]) => void;
  addDocument: (document: any) => void;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  setCurrentDocument: (document: Document | null) => void;

  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,
      documents: [],
      currentDocument: null,
      notifications: [],
      isLoading: false,
      error: null,

      // User actions
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),

      login: (user, token) => set({
        user,
        token,
        isAuthenticated: true,
        error: null
      }),

      logout: () => set({
        user: null,
        token: null,
        isAuthenticated: false,
        documents: [],
        currentDocument: null,
        error: null
      }),

      // Document actions
      setDocuments: (documents) => set({ documents }),

      addDocument: (document) => set((state) => ({
        documents: [document, ...state.documents]
      })),

      updateDocument: (id, updates) => set((state) => ({
        documents: state.documents.map((doc) =>
          doc.id === id ? { ...doc, ...updates } : doc
        ),
        currentDocument: state.currentDocument?.id === id
          ? { ...state.currentDocument, ...updates }
          : state.currentDocument
      })),

      setCurrentDocument: (document) => set({ currentDocument: document }),

      // Notification actions
      addNotification: (notification) => set((state) => ({
        notifications: [notification, ...state.notifications]
      })),

      removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
      })),

      clearNotifications: () => set({ notifications: [] }),

      // UI actions
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'signaai-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
