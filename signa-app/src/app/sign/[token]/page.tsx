'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import SignatureCanvas from 'react-signature-canvas';
import { 
  FileText, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Download, 
  ChevronRight,
  ChevronLeft,
  Pen,
  Loader2,
  AlertCircle
} from 'lucide-react';
import PDFViewer, { OCRField } from '@/components/PDFViewer';
import api from '@/lib/api';

export default function SignDocumentPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  
  const [document, setDocument] = useState<any>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [ocrFields, setOcrFields] = useState<OCRField[]>([]);
  const [signedFields, setSignedFields] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Load document data on mount
  useEffect(() => {
    loadDocumentData();
  }, [token]);

  const loadDocumentData = async () => {
    try {
      setLoading(true);
      console.log('Loading document with token:', token);
      
      // Get document data by token
      const docData = await api.getSignatureDocument(token);
      console.log('Document loaded:', docData);
      setDocument(docData);
      
      // If we have a PDF URL, convert it to a File for the PDFViewer
      if (docData.pdfUrl) {
        const response = await fetch(docData.pdfUrl);
        const blob = await response.blob();
        const file = new File([blob], `${docData.title}.pdf`, { type: 'application/pdf' });
        setPdfFile(file);
      } else if (docData.documentId) {
        // Get PDF URL from document ID
        const pdfResponse = await api.getPDFUrl(docData.documentId);
        setPdfUrl(pdfResponse.url);
      }
      
    } catch (error: any) {
      console.error('Failed to load document:', error);
      console.error('Error details:', error?.message || error);
      setError(error?.message || 'Failed to load document. Please check the link and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldDetected = (fields: OCRField[]) => {
    setOcrFields(fields);
  };

  const handleFieldSigned = (fieldId: string, signatureData: string) => {
    const newSignedFields = new Map(signedFields);
    newSignedFields.set(fieldId, signatureData);
    setSignedFields(newSignedFields);
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      
      // Convert signed fields to array format
      const signedFieldsData = Array.from(signedFields.entries()).map(([fieldId, data]) => ({
        fieldId,
        signatureData: data,
        timestamp: new Date().toISOString()
      }));
      
      // Submit signature to API
      await api.submitSignature(token, '', signedFieldsData);
      
      // Redirect to success page
      router.push('/sign/success');
      
    } catch (error) {
      console.error('Failed to submit signature:', error);
      setError('Failed to submit signature. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isAllFieldsSigned = () => {
    const requiredFields = ocrFields.filter(field => field.required);
    return requiredFields.every(field => signedFields.has(field.id));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-surface to-background">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="gradient-text font-bold text-xl">SignaAI</div>
              {document && (
                <>
                  <div className="text-text-secondary">•</div>
                  <div className="text-sm">
                    <p className="font-medium">{document.title}</p>
                    <p className="text-text-secondary">Signing as: {document.signerName || 'Guest'}</p>
                  </div>
                </>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              {ocrFields.length > 0 && (
                <div className="text-sm text-text-secondary">
                  {signedFields.size}/{ocrFields.filter(f => f.required).length} required fields signed
                </div>
              )}
              
              {isAllFieldsSigned() && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-2 text-primary"
                >
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Ready to Submit</span>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-24 pb-20 px-4">
        <div className="max-w-5xl mx-auto">
          {loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-text-secondary">Loading document...</p>
            </motion.div>
          ) : error ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-surface rounded-2xl p-8 text-center"
            >
              <AlertCircle className="w-16 h-16 text-danger mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Document Not Found</h2>
              <p className="text-text-secondary mb-6">{error}</p>
              <button
                onClick={() => router.push('/')}
                className="px-6 py-3 bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors"
              >
                Go Home
              </button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {/* PDF Viewer with OCR */}
              {(pdfFile || pdfUrl) && (
                <PDFViewer
                  file={pdfFile || undefined}
                  url={pdfUrl || undefined}
                  enableOCR={true}
                  enableSigning={true}
                  onFieldDetected={handleFieldDetected}
                  onFieldSigned={handleFieldSigned}
                  className="mb-6"
                />
              )}
            </motion.div>
          )}

          {/* Action Buttons */}
          {!loading && !error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-6 flex gap-4"
            >
              <button
                onClick={() => router.push('/')}
                disabled={submitting}
                className="flex-1 bg-surface border border-border py-3 rounded-xl hover:bg-surface/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <XCircle className="w-5 h-5" />
                Decline
              </button>
              
              <button
                onClick={handleSubmit}
                disabled={!isAllFieldsSigned() || submitting}
                className="flex-1 bg-primary text-background py-3 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Complete Signing
                  </>
                )}
              </button>
            </motion.div>
          )}
        </div>
      </div>

    </div>
  );
}