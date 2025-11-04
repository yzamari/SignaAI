'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, Download, Send, Eye, Trash2, 
  MoreVertical, Search, Filter, Clock,
  CheckCircle, XCircle, AlertCircle, Loader
} from 'lucide-react';
import Navigation from '@/components/Navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface DocumentData {
  id: string;
  title: string;
  status: 'pending' | 'signed' | 'rejected' | 'processing';
  signers: number;
  signedBy: number;
  createdAt: string;
  deadline?: string;
  completedAt?: string;
  rejectedAt?: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Fetch documents from API
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.getDocuments();
        
        // Transform API response to match our interface
        const transformedDocs: DocumentData[] = response.documents?.map((doc: any) => ({
          id: doc.id,
          title: doc.title || doc.name || 'Untitled Document',
          status: doc.status || 'pending',
          signers: doc.signers?.length || 0,
          signedBy: doc.signers?.filter((s: any) => s.status === 'signed').length || 0,
          createdAt: doc.createdAt || doc.uploadedAt || new Date().toISOString(),
          deadline: doc.deadline,
          completedAt: doc.completedAt,
          rejectedAt: doc.rejectedAt
        })) || [];
        
        setDocuments(transformedDocs);
      } catch (err) {
        console.error('Failed to fetch documents:', err);
        setError(err instanceof Error ? err.message : 'Failed to load documents');
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, []);

  // Handle document actions
  const handleDocumentAction = async (docId: string, action: 'delete' | 'remind' | 'download') => {
    try {
      switch (action) {
        case 'delete':
          // Note: Add delete endpoint to API service if available
          console.log('Delete document:', docId);
          // For now, remove from local state
          setDocuments(documents.filter(doc => doc.id !== docId));
          break;
        case 'remind':
          // Note: Add remind endpoint to API service if available
          console.log('Send reminder for document:', docId);
          break;
        case 'download':
          // Note: Add download endpoint to API service if available
          const doc = await api.getDocument(docId);
          if (doc.downloadUrl) {
            window.open(doc.downloadUrl, '_blank');
          }
          break;
      }
    } catch (err) {
      console.error(`Failed to ${action} document:`, err);
      setError(err instanceof Error ? err.message : `Failed to ${action} document`);
    } finally {
      setSelectedDoc(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'signed':
        return <CheckCircle className="text-green-500" size={20} />;
      case 'pending':
        return <Clock className="text-yellow-500" size={20} />;
      case 'rejected':
        return <XCircle className="text-red-500" size={20} />;
      default:
        return <AlertCircle className="text-gray-500" size={20} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'signed':
        return 'bg-green-600 bg-opacity-20 text-green-500';
      case 'pending':
        return 'bg-yellow-600 bg-opacity-20 text-yellow-500';
      case 'rejected':
        return 'bg-red-600 bg-opacity-20 text-red-500';
      default:
        return 'bg-gray-600 bg-opacity-20 text-gray-500';
    }
  };

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || doc.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <Navigation />
      <div className="lg:ml-72 container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto"
        >
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <h1 className="text-3xl font-bold" style={{ color: 'var(--color-text)' }}>Documents</h1>
            <Link
              href="/upload"
              className="px-6 py-2 rounded-lg transition-colors hover:opacity-90"
              style={{ 
                backgroundColor: 'var(--color-primary)', 
                color: 'var(--color-background)' 
              }}
            >
              Upload New Document
            </Link>
          </div>

          {/* Search and Filter */}
          <div className="rounded-xl p-4 mb-6" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2" style={{ color: 'var(--color-text-secondary)' }} size={20} />
                <input
                  type="text"
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border"
                  style={{ 
                    backgroundColor: 'var(--color-background)', 
                    color: 'var(--color-text)',
                    borderColor: 'var(--color-border)'
                  }}
                />
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setFilterStatus('all')}
                  className="px-4 py-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: filterStatus === 'all' 
                      ? 'var(--color-primary)' 
                      : 'var(--color-background)',
                    color: filterStatus === 'all'
                      ? 'var(--color-background)'
                      : 'var(--color-text-secondary)'
                  }}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterStatus('pending')}
                  className="px-4 py-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: filterStatus === 'pending' 
                      ? 'var(--color-primary)' 
                      : 'var(--color-background)',
                    color: filterStatus === 'pending'
                      ? 'var(--color-background)'
                      : 'var(--color-text-secondary)'
                  }}
                >
                  Pending
                </button>
                <button
                  onClick={() => setFilterStatus('signed')}
                  className="px-4 py-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: filterStatus === 'signed' 
                      ? 'var(--color-primary)' 
                      : 'var(--color-background)',
                    color: filterStatus === 'signed'
                      ? 'var(--color-background)'
                      : 'var(--color-text-secondary)'
                  }}
                >
                  Signed
                </button>
                <button
                  onClick={() => setFilterStatus('rejected')}
                  className="px-4 py-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: filterStatus === 'rejected' 
                      ? 'var(--color-primary)' 
                      : 'var(--color-background)',
                    color: filterStatus === 'rejected'
                      ? 'var(--color-background)'
                      : 'var(--color-text-secondary)'
                  }}
                >
                  Rejected
                </button>
              </div>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="bg-gray-800 rounded-xl p-12 text-center">
              <Loader className="text-blue-500 mx-auto mb-4 animate-spin" size={48} />
              <h3 className="text-xl font-semibold text-white mb-2">Loading documents...</h3>
              <p className="text-gray-400">Please wait while we fetch your documents</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-gray-800 rounded-xl p-12 text-center">
              <XCircle className="text-red-500 mx-auto mb-4" size={48} />
              <h3 className="text-xl font-semibold text-white mb-2">Error loading documents</h3>
              <p className="text-gray-400 mb-6">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Documents List */}
          {!loading && !error && (
            <div className="space-y-4">
              <AnimatePresence>
                {filteredDocs.map((doc) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-gray-800 rounded-xl p-6 hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <FileText className="text-gray-400" size={32} />
                      <div>
                        <h3 className="text-lg font-semibold text-white">{doc.title}</h3>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            Created: {new Date(doc.createdAt).toLocaleDateString()}
                          </span>
                          {doc.deadline && (
                            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                              Deadline: {new Date(doc.deadline).toLocaleDateString()}
                            </span>
                          )}
                          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            {doc.signedBy}/{doc.signers} signed
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(doc.status)}`}>
                        {doc.status}
                      </span>
                      {getStatusIcon(doc.status)}
                      
                      <div className="relative">
                        <button
                          onClick={() => setSelectedDoc(selectedDoc === doc.id ? null : doc.id)}
                          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          <MoreVertical className="text-gray-400" size={20} />
                        </button>
                        
                        {selectedDoc === doc.id && (
                          <div className="absolute right-0 top-10 bg-gray-700 rounded-lg shadow-lg p-2 z-10 w-48">
                            <button
                              onClick={() => setShowPreview(true)}
                              className="w-full text-left px-4 py-2 text-white hover:bg-gray-600 rounded flex items-center gap-2"
                            >
                              <Eye size={16} />
                              Preview
                            </button>
                            <button 
                              onClick={() => handleDocumentAction(doc.id, 'download')}
                              className="w-full text-left px-4 py-2 text-white hover:bg-gray-600 rounded flex items-center gap-2"
                            >
                              <Download size={16} />
                              Download
                            </button>
                            <button 
                              onClick={() => handleDocumentAction(doc.id, 'remind')}
                              className="w-full text-left px-4 py-2 text-white hover:bg-gray-600 rounded flex items-center gap-2"
                            >
                              <Send size={16} />
                              Send Reminder
                            </button>
                            <hr className="my-2 border-gray-600" />
                            <button 
                              onClick={() => handleDocumentAction(doc.id, 'delete')}
                              className="w-full text-left px-4 py-2 text-red-500 hover:bg-gray-600 rounded flex items-center gap-2"
                            >
                              <Trash2 size={16} />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
              </AnimatePresence>
            </div>
          )}

          {!loading && !error && filteredDocs.length === 0 && (
            <div className="rounded-xl p-12 text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
              <FileText className="mx-auto mb-4" style={{ color: 'var(--color-text-secondary)' }} size={48} />
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>No documents found</h3>
              <p className="mb-6" style={{ color: 'var(--color-text-secondary)' }}>
                {searchQuery || filterStatus !== 'all' 
                  ? "Try adjusting your search or filters"
                  : "Upload your first document to get started"}
              </p>
              <Link
                href="/upload"
                className="inline-block px-6 py-2 rounded-lg transition-colors hover:opacity-90"
                style={{ 
                  backgroundColor: 'var(--color-primary)', 
                  color: 'var(--color-background)' 
                }}
              >
                Upload Document
              </Link>
            </div>
          )}
        </motion.div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-900 rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Document Preview</h2>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="rounded-lg p-4 h-96 overflow-hidden" style={{ backgroundColor: 'var(--color-background)' }}>
              <iframe 
                src="/heskem.pdf" 
                className="w-full h-full rounded-lg"
                title="Document Preview"
                style={{ border: '1px solid var(--color-border)' }}
              />
              
              {/* OCR Field Overlays */}
              <div className="relative -mt-96 h-96 pointer-events-none">
                {/* Signature Field Example */}
                <div 
                  className="absolute border-2 border-dashed pointer-events-auto cursor-pointer hover:opacity-75"
                  style={{ 
                    borderColor: 'var(--color-primary)',
                    backgroundColor: 'color-mix(in srgb, var(--color-primary) 20%, transparent)',
                    left: '20%', 
                    top: '60%', 
                    width: '200px', 
                    height: '40px' 
                  }}
                  title="Signature field detected by OCR"
                >
                  <div className="text-xs p-1" style={{ color: 'var(--color-primary)' }}>
                    Signature Required
                  </div>
                </div>
                
                {/* Date Field Example */}
                <div 
                  className="absolute border-2 border-dashed pointer-events-auto cursor-pointer hover:opacity-75"
                  style={{ 
                    borderColor: 'var(--color-info)',
                    backgroundColor: 'color-mix(in srgb, var(--color-info) 20%, transparent)',
                    left: '60%', 
                    top: '20%', 
                    width: '120px', 
                    height: '30px' 
                  }}
                  title="Date field detected by OCR"
                >
                  <div className="text-xs p-1" style={{ color: 'var(--color-info)' }}>
                    Date
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between mt-6">
              <button 
                className="px-6 py-2 rounded-lg transition-colors hover:opacity-90"
                style={{ 
                  backgroundColor: 'var(--color-primary)', 
                  color: 'var(--color-background)' 
                }}
              >
                Download
              </button>
              <div className="flex gap-3">
                <button 
                  className="px-6 py-2 rounded-lg transition-colors hover:opacity-90"
                  style={{ 
                    backgroundColor: 'var(--color-surface)', 
                    color: 'var(--color-text)' 
                  }}
                >
                  Send Reminder
                </button>
                <button 
                  className="px-6 py-2 rounded-lg transition-colors hover:opacity-90"
                  style={{ 
                    backgroundColor: 'var(--color-primary)', 
                    color: 'var(--color-background)' 
                  }}
                >
                  Share Link
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}