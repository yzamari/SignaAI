'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Filter, TrendingUp, Clock, CheckCircle, Users, Loader, XCircle, AlertCircle } from 'lucide-react';
import Navigation from '@/components/Navigation';
import SwipeCard from '@/components/SwipeCard';
import DocumentCard from '@/components/DocumentCard';
import { useStore, Document } from '@/lib/store';
import { api } from '@/lib/api';
import Link from 'next/link';

interface DashboardStats {
  total: number;
  pending: number;
  signed: number;
  rejected: number;
  processing?: number;
}

export default function DashboardPage() {
  const { documents, updateDocument, addNotification } = useStore();
  const [apiDocuments, setApiDocuments] = useState<Document[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ total: 0, pending: 0, signed: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filter, setFilter] = useState<'all' | 'pending' | 'signed' | 'rejected'>('pending');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    // Check if token exists in localStorage
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!token) {
      console.log('No auth token found, redirecting to login...');
      window.location.href = '/login';
      return;
    }
    setIsAuthenticated(true);
  }, []);

  // Fetch documents and stats from API
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch both documents and stats in parallel
        const [documentsResponse, statsResponse] = await Promise.all([
          api.getDocuments({ limit: 50 }).catch(err => {
            console.error('Failed to fetch documents:', err);
            return { documents: [] };
          }),
          api.getDashboardStats().catch(err => {
            console.error('Failed to fetch stats:', err);
            return null;
          })
        ]);

        // Transform documents data - handle both response formats
        const docsList = documentsResponse?.documents || [];
        
        // Merge API docs with local store docs
        const localDocs = documents || [];
        const allDocs = [...localDocs];
        
        // Add API docs that aren't already in local store
        (Array.isArray(docsList) ? docsList : []).forEach((apiDoc: any) => {
          if (!allDocs.find(d => d.id === apiDoc.id)) {
            allDocs.push(apiDoc);
          }
        });
        
        const transformedDocs: Document[] = allDocs.map((doc: any) => ({
          id: doc.id,
          title: doc.title || doc.name || 'Untitled Document',
          status: doc.status || 'pending',
          uploadedAt: new Date(doc.createdAt || doc.uploadedAt || new Date()),
          signers: doc.signers?.map((signer: any) => ({
            id: signer.id,
            name: signer.name,
            email: signer.email,
            status: signer.status || 'pending',
            signedAt: signer.signedAt ? new Date(signer.signedAt) : undefined
          })) || [],
          fields: doc.fields || []
        })) || [];

        setApiDocuments(transformedDocs);

        // Set stats from API or calculate from documents
        if (statsResponse && statsResponse.overview) {
          // Use new dashboard response format
          setStats({
            total: statsResponse.overview.total_documents || 0,
            pending: statsResponse.overview.pending_documents || 0,
            signed: statsResponse.overview.completed_documents || 0,
            rejected: 0 // Not provided in new format, keeping as 0
          });
        } else if (statsResponse && typeof statsResponse.total !== 'undefined') {
          // Use old format if available
          setStats({
            total: statsResponse.total || 0,
            pending: statsResponse.pending || 0,
            signed: statsResponse.signed || 0,
            rejected: statsResponse.rejected || 0
          });
        } else {
          // Calculate stats from documents if API doesn't provide them
          const calculatedStats = {
            total: transformedDocs.length,
            pending: transformedDocs.filter(d => d.status === 'pending').length,
            signed: transformedDocs.filter(d => d.status === 'signed').length,
            rejected: transformedDocs.filter(d => d.status === 'rejected').length
          };
          setStats(calculatedStats);
        }

        // Update the store with fetched documents
        transformedDocs.forEach(doc => {
          if (!documents.find(existingDoc => existingDoc.id === doc.id)) {
            useStore.getState().addDocument(doc);
          }
        });

      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard data';
        
        // Check if it's an authentication error
        if (errorMessage.includes('403') || errorMessage.includes('401') || errorMessage.includes('HTTP 403') || errorMessage.includes('HTTP 401')) {
          console.log('Authentication error, redirecting to login...');
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
          return;
        }
        
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [isAuthenticated]);

  // Combine API documents with local store documents
  const allDocuments = [...documents];
  apiDocuments.forEach(apiDoc => {
    if (!allDocuments.find(d => d.id === apiDoc.id)) {
      allDocuments.push(apiDoc);
    }
  });
  
  const filteredDocuments = allDocuments.filter(doc => 
    filter === 'all' || doc.status === filter
  );

  const currentDocument = filteredDocuments[currentIndex];

  const handleSwipeRight = async () => {
    if (currentDocument) {
      try {
        // Update status via API
        await api.updateDocumentStatus(currentDocument.id, 'signed');
        
        // Update local state
        updateDocument(currentDocument.id, { status: 'signed' });
        setApiDocuments(prev => 
          prev.map(doc => 
            doc.id === currentDocument.id ? { ...doc, status: 'signed' } : doc
          )
        );
        
        // Update stats
        setStats(prev => ({
          ...prev,
          pending: Math.max(0, prev.pending - 1),
          signed: prev.signed + 1
        }));
        
        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Document Approved',
          message: `${currentDocument.title} has been approved`,
          timestamp: new Date()
        });
      } catch (err) {
        console.error('Failed to approve document:', err);
        addNotification({
          id: Date.now().toString(),
          type: 'error',
          title: 'Error',
          message: 'Failed to approve document',
          timestamp: new Date()
        });
      }
      nextDocument();
    }
  };

  const handleSwipeLeft = async () => {
    if (currentDocument) {
      try {
        // Update status via API
        await api.updateDocumentStatus(currentDocument.id, 'rejected');
        
        // Update local state
        updateDocument(currentDocument.id, { status: 'rejected' });
        setApiDocuments(prev => 
          prev.map(doc => 
            doc.id === currentDocument.id ? { ...doc, status: 'rejected' } : doc
          )
        );
        
        // Update stats
        setStats(prev => ({
          ...prev,
          pending: Math.max(0, prev.pending - 1),
          rejected: prev.rejected + 1
        }));
        
        addNotification({
          id: Date.now().toString(),
          type: 'error',
          title: 'Document Rejected',
          message: `${currentDocument.title} has been rejected`,
          timestamp: new Date()
        });
      } catch (err) {
        console.error('Failed to reject document:', err);
        addNotification({
          id: Date.now().toString(),
          type: 'error',
          title: 'Error',
          message: 'Failed to reject document',
          timestamp: new Date()
        });
      }
      nextDocument();
    }
  };

  const handleSwipeUp = () => {
    addNotification({
      id: Date.now().toString(),
      type: 'info',
      title: 'Document Saved',
      message: 'Document saved for later review',
      timestamp: new Date()
    });
    nextDocument();
  };

  const handleSwipeDown = () => {
    // Navigate to edit mode
    console.log('Edit document');
  };

  const nextDocument = () => {
    if (currentIndex < filteredDocuments.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <Navigation />

      {/* Main Content */}
      <div className="lg:ml-72 pt-16 lg:pt-0">
        {/* Header */}
        <div 
          className="border-b px-4 sm:px-6 py-4"
          style={{ 
            backgroundColor: 'var(--color-surface)', 
            borderColor: 'var(--color-border)' 
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
                Document Dashboard
              </h1>
              <p className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Swipe to process your documents
              </p>
            </div>
            <Link
              href="/upload"
              className="px-4 py-2 rounded-xl transition-colors flex items-center gap-2 hover:opacity-90"
              style={{ 
                backgroundColor: 'var(--color-primary)', 
                color: 'var(--color-background)' 
              }}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Upload Document</span>
            </Link>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-4 sm:p-6">
            <div 
              className="rounded-xl p-12 text-center border"
              style={{ 
                backgroundColor: 'var(--color-surface)', 
                borderColor: 'var(--color-border)' 
              }}
            >
              <Loader className="mx-auto mb-4 animate-spin" size={48} style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                Loading dashboard...
              </h3>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Please wait while we fetch your documents and statistics
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-4 sm:p-6">
            <div 
              className="rounded-xl p-12 text-center border"
              style={{ 
                backgroundColor: 'var(--color-surface)', 
                borderColor: 'var(--color-border)' 
              }}
            >
              <XCircle className="mx-auto mb-4" size={48} style={{ color: 'var(--color-danger)' }} />
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                Error loading dashboard
              </h3>
              <p className="mb-6" style={{ color: 'var(--color-text-secondary)' }}>
                {error}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 rounded-lg transition-colors hover:opacity-90"
                style={{ 
                  backgroundColor: 'var(--color-primary)', 
                  color: 'var(--color-background)' 
                }}
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Dashboard Content */}
        {!loading && !error && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 sm:p-6">
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="rounded-xl p-4 border"
                style={{ 
                  backgroundColor: 'var(--color-surface)', 
                  borderColor: 'var(--color-border)' 
                }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 20%, transparent)' }}
                  >
                    <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Total</p>
                    <p className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{stats.total}</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02 }}
                className="rounded-xl p-4 border"
                style={{ 
                  backgroundColor: 'var(--color-surface)', 
                  borderColor: 'var(--color-border)' 
                }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--color-info) 20%, transparent)' }}
                  >
                    <Clock className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Pending</p>
                    <p className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{stats.pending}</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02 }}
                className="rounded-xl p-4 border"
                style={{ 
                  backgroundColor: 'var(--color-surface)', 
                  borderColor: 'var(--color-border)' 
                }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 20%, transparent)' }}
                  >
                    <CheckCircle className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Signed</p>
                    <p className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{stats.signed}</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02 }}
                className="rounded-xl p-4 border"
                style={{ 
                  backgroundColor: 'var(--color-surface)', 
                  borderColor: 'var(--color-border)' 
                }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--color-danger) 20%, transparent)' }}
                  >
                    <Users className="w-5 h-5" style={{ color: 'var(--color-danger)' }} />
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Rejected</p>
                    <p className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{stats.rejected}</p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Filter Tabs */}
            <div className="px-4 sm:px-6 mb-4">
              <div 
                className="rounded-xl p-1 inline-flex"
                style={{ backgroundColor: 'var(--color-surface)' }}
              >
                {(['all', 'pending', 'signed', 'rejected'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => {
                      setFilter(tab);
                      setCurrentIndex(0);
                    }}
                    className="px-4 py-2 rounded-lg capitalize transition-all"
                    style={{
                      backgroundColor: filter === tab ? 'var(--color-primary)' : 'transparent',
                      color: filter === tab ? 'var(--color-background)' : 'var(--color-text-secondary)'
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Swipe Area */}
            <div className="px-4 sm:px-6 pb-6">
              <div className="h-[600px] relative">
                <AnimatePresence mode="wait">
                  {currentDocument ? (
                    <SwipeCard
                      key={currentDocument.id}
                      onSwipeLeft={handleSwipeLeft}
                      onSwipeRight={handleSwipeRight}
                      onSwipeUp={handleSwipeUp}
                      onSwipeDown={handleSwipeDown}
                      className="absolute inset-0"
                      showHints={currentIndex === 0}
                    >
                      <DocumentCard document={currentDocument} className="h-full" />
                    </SwipeCard>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-center h-full"
                    >
                      <div className="text-center">
                        <div 
                          className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: 'var(--color-surface)' }}
                        >
                          <CheckCircle className="w-10 h-10" style={{ color: 'var(--color-primary)' }} />
                        </div>
                        <p className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                          All caught up!
                        </p>
                        <p className="mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                          No more documents to review
                        </p>
                        <Link
                          href="/upload"
                          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl transition-colors hover:opacity-90"
                          style={{ 
                            backgroundColor: 'var(--color-primary)', 
                            color: 'var(--color-background)' 
                          }}
                        >
                          <Plus className="w-5 h-5" />
                          Upload New Document
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Card Stack Preview */}
                {filteredDocuments.length > 1 && currentIndex < filteredDocuments.length - 1 && (
                  <div className="absolute inset-0 pointer-events-none">
                    {filteredDocuments.slice(currentIndex + 1, currentIndex + 3).map((doc, index) => (
                      <motion.div
                        key={doc.id}
                        initial={{ scale: 0.9 - index * 0.05, y: 20 + index * 10 }}
                        animate={{ scale: 0.9 - index * 0.05, y: 20 + index * 10 }}
                        className="absolute inset-4 opacity-50"
                        style={{ zIndex: -index - 1 }}
                      >
                        <DocumentCard document={doc} className="h-full" />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Progress Indicator */}
              {filteredDocuments.length > 0 && (
                <div className="flex justify-center gap-1 mt-4">
                  {filteredDocuments.map((_, index) => (
                    <div
                      key={index}
                      className="h-1 rounded-full transition-all"
                      style={{
                        width: index === currentIndex ? '32px' : '8px',
                        backgroundColor: index === currentIndex 
                          ? 'var(--color-primary)' 
                          : index < currentIndex 
                            ? 'color-mix(in srgb, var(--color-primary) 50%, transparent)' 
                            : 'var(--color-border)'
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}