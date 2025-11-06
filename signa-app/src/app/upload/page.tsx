'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, FileText, Users, Clock, Send, Loader2 } from 'lucide-react';
import Navigation from '@/components/Navigation';
import QuickUpload from '@/components/QuickUpload';
import ImageDocumentViewer, { DocumentField, DocumentPage } from '@/components/ImageDocumentViewer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import Link from 'next/link';

export default function UploadPage() {
  const router = useRouter();
  const { addDocument, addNotification } = useStore();
  const [step, setStep] = useState(1);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  
  // Log step changes
  useEffect(() => {
    console.log('📍 CURRENT STEP IS:', step);
    // Make step globally accessible for testing
    if (typeof window !== 'undefined') {
      (window as any).currentUploadStep = step;
    }
  }, [step]);
  const [signers, setSigners] = useState([
    { id: '1', name: '', email: '', phone: '' }
  ]);
  const [workflow, setWorkflow] = useState({
    type: 'parallel' as 'parallel' | 'sequential',
    deadline: ''
  });
  const [documentPages, setDocumentPages] = useState<DocumentPage[]>([]);
  const [detectedFields, setDetectedFields] = useState<DocumentField[]>([]);
  const [documentId, setDocumentId] = useState<string>('');
  const [isOCRProcessing, setIsOCRProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<string>('');

  // Debug effect to monitor documentPages state
  useEffect(() => {
    console.log('[STATE] documentPages changed:', {
      length: documentPages.length,
      pages: documentPages.map(p => ({
        page_number: p.page_number,
        has_original: !!p.original_image,
        has_overlay: !!p.overlay_image,
        original_length: p.original_image?.length,
        overlay_length: p.overlay_image?.length
      }))
    });
  }, [documentPages]);

  // Debug effect to monitor detectedFields state
  useEffect(() => {
    console.log('[STATE] detectedFields changed:', {
      length: detectedFields.length,
      fields: detectedFields.map(f => ({
        id: f.id,
        type: f.type,
        page: f.page,
        label: f.label
      }))
    });
  }, [detectedFields]);

  // Retry helper for OCR requests
  async function fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[RETRY] Attempt ${attempt}/${maxRetries} for ${url}`);
        const response = await fetch(url, options);

        if (response.ok) {
          console.log(`[RETRY] Success on attempt ${attempt}`);
          return response;
        }

        console.warn(`[RETRY] Attempt ${attempt} failed with status ${response.status}`);
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        console.error(`[RETRY] Attempt ${attempt} threw error:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < maxRetries) {
        console.log(`[RETRY] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  const handleUpload = async (files: File[]) => {
    console.log('Files uploaded:', files.length);
    setUploadedFiles(files);
    setIsOCRProcessing(true);
    setOcrProgress('Uploading document...');

    // Process with OCR if it's a PDF
    if (files[0]?.type === 'application/pdf') {
      try {
        console.log('[OCR] Starting OCR processing for file:', files[0].name);
        const formData = new FormData();
        formData.append('file', files[0]);

        setOcrProgress('Processing with OCR...');

        const ocrServiceUrl = process.env.NEXT_PUBLIC_OCR_SERVICE_URL || 'http://localhost:5113';
        console.log('[OCR] OCR service URL:', ocrServiceUrl);

        const startTime = Date.now();
        const response = await fetchWithRetry(
          `${ocrServiceUrl}/detect-fields`,
          {
            method: 'POST',
            body: formData,
          },
          3,  // max retries
          2000  // 2 second delay between retries
        ).catch((err) => {
          console.error('[OCR] All retry attempts failed:', err);
          return null;
        });

        const fetchTime = Date.now() - startTime;
        console.log('[OCR] Fetch completed in', fetchTime, 'ms');

        if (response && response.ok) {
          console.log('[OCR] Response OK, status:', response.status);
          setOcrProgress('Analyzing document...');
          const result = await response.json();
          console.log('[OCR] Parsed JSON result:', {
            document_id: result.document_id,
            total_pages: result.total_pages,
            total_fields: result.total_fields,
            processing_time_ms: result.processing_time_ms,
            has_analysis_results: !!result.analysis_results,
            analysis_results_length: result.analysis_results?.length || 0
          });

          // Set document ID
          setDocumentId(result.document_id || '');

          // Convert analysis_results to our format
          const pages: DocumentPage[] = [];
          const fields: DocumentField[] = [];

          if (result.analysis_results) {
            console.log('[OCR] Processing', result.analysis_results.length, 'pages');
            result.analysis_results.forEach((pageResult: any, pageIndex: number) => {
              console.log('[OCR] Page', pageIndex + 1, ':', {
                page: pageResult.page,
                width: pageResult.source_image_resolution?.width,
                height: pageResult.source_image_resolution?.height,
                has_original_image: !!pageResult.original_image,
                original_image_length: pageResult.original_image?.length || 0,
                original_image_prefix: pageResult.original_image?.substring(0, 30),
                has_overlayed_image: !!pageResult.overlayed_image,
                overlayed_image_length: pageResult.overlayed_image?.length || 0,
                fields_count: pageResult.fields?.length || 0
              });

              // Create page data
              pages.push({
                page_number: pageResult.page,
                width: pageResult.source_image_resolution?.width || 1700,
                height: pageResult.source_image_resolution?.height || 2200,
                original_image: pageResult.original_image,
                overlay_image: pageResult.overlayed_image, // Note: OCR returns 'overlayed_image'
                fields_count: pageResult.fields?.length || 0
              });

              // Convert fields from this page
              if (pageResult.fields) {
                pageResult.fields.forEach((field: any, index: number) => {
                  fields.push({
                    id: `field-${pageResult.page}-${index}`,
                    type: field.type === 'signature_area' ? 'signature' : 'text',
                    page: pageResult.page,
                    x: field.bounding_box.x,
                    y: field.bounding_box.y,
                    width: field.bounding_box.width,
                    height: field.bounding_box.height,
                    label: field.label || `Field ${index + 1}`,
                    required: true,
                    confidence: field.confidence,
                    detected_by_ocr: true,
                    value: '',
                    assignedTo: undefined
                  });
                });
              }
            });
          }

          console.log('[OCR] Setting state - pages:', pages.length, 'fields:', fields.length);
          setDocumentPages(pages);
          console.log('[OCR] Document pages state updated');

          console.log(`Total fields from OCR: ${fields.length}`);
          console.log('Document pages:', pages.length);
          if (pages.length > 0) {
            console.log('First page data:', pages[0]);
          }

          setDetectedFields(fields);
          console.log('[OCR] Detected fields state updated');
          setOcrProgress('Complete!');
        } else {
          console.error('[OCR] Response not OK:', {
            response: response,
            status: response?.status,
            statusText: response?.statusText
          });
          setOcrProgress('Failed');
          setDetectedFields([]);
          setDocumentPages([]);
        }
      } catch (error) {
        console.error('[OCR] Processing failed with error:', error);
        console.error('[OCR] Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        setOcrProgress('Failed');
        setDetectedFields([]);
        setDocumentPages([]);
      } finally {
        setIsOCRProcessing(false);
        setTimeout(() => setOcrProgress(''), 2000);  // Clear after 2s
      }
    }
    
    // Ensure at least one signer exists
    if (signers.length === 0) {
      setSigners([{
        id: Date.now().toString(),
        name: '',
        email: '',
        phone: ''
      }]);
    }
    
    // Auto-advance to Recipients step after upload
    // Commented out for testing - stay on Step 4 to see field overlays
    // console.log('Auto-advancing to Recipients step...');
    // setTimeout(() => {
    //   console.log('SETTING STEP TO 2 NOW');
    //   setStep(2);
    //   console.log('Advanced to step 2, signers:', signers.length);
    // }, 1500);
  };

  const addSigner = () => {
    setSigners([
      ...signers,
      { id: Date.now().toString(), name: '', email: '', phone: '' }
    ]);
  };

  const removeSigner = (id: string) => {
    setSigners(signers.filter(s => s.id !== id));
  };

  const updateSigner = (id: string, field: string, value: string) => {
    setSigners(signers.map(s => 
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  const handleSubmit = async () => {
    try {
      // Create document via API
      if (uploadedFiles.length > 0) {
        const documentData = {
          title: uploadedFiles[0].name,
          signers: signers.filter(s => s.email), // Only include signers with email
          fields: detectedFields.map(f => ({
            type: f.type,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            required: f.required,
            assignedTo: f.assignedTo
          })),
          workflow: {
            type: workflow.type,
            deadline: workflow.deadline
          }
        };

        // Call API to create document
        const response = await api.createDocument(documentData);
        
        // Add to local store for immediate UI update
        const newDoc = {
          id: response.id || Date.now().toString(),
          title: uploadedFiles[0].name,
          status: 'pending' as const,
          uploadedAt: new Date(),
          signers: signers.map(s => ({
            ...s,
            status: 'pending' as const
          })),
          fields: detectedFields
        };
        addDocument(newDoc);

        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Document Sent',
          message: `${uploadedFiles[0].name} has been sent for signature`,
          timestamp: new Date()
        });

        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Failed to submit document:', error);
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Submission Failed',
        message: 'Failed to send document. Please try again.',
        timestamp: new Date()
      });
    }
  };

  const steps = [
    { number: 1, title: 'Upload', icon: FileText },
    { number: 2, title: 'Recipients', icon: Users },
    { number: 3, title: 'Settings', icon: Clock },
    { number: 4, title: 'Send', icon: Send }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="lg:ml-72 pt-16 lg:pt-0">
        {/* Header */}
        <div className="bg-surface border-b border-border px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="p-2 hover:bg-background rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold">Upload Document</h1>
                <p className="text-text-secondary mt-1">Send documents for signature</p>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="px-4 sm:px-6 py-6">
          <div className="flex items-center justify-center mb-8">
            {steps.map((s, index) => (
              <React.Fragment key={s.number}>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex flex-col items-center"
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                      step >= s.number
                        ? 'bg-primary text-background'
                        : 'bg-surface border-2 border-border text-text-secondary'
                    }`}
                  >
                    <s.icon className="w-5 h-5" />
                  </div>
                  <span className="text-sm mt-2 hidden sm:block">{s.title}</span>
                </motion.div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 transition-colors ${
                      step > s.number ? 'bg-primary' : 'bg-border'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Step Content */}
          <div className="max-w-3xl mx-auto">
            <AnimatePresence mode="wait">
              {/* Step 1: Upload */}
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <QuickUpload
                    onUpload={handleUpload}
                    multiple={false}
                    className="mb-6"
                  />
                  
                  {/* Document Preview with Fields */}
                  {uploadedFiles.length > 0 && (
                    <>
                      {/* OCR Processing Indicator */}
                      {isOCRProcessing && (
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
                          <div className="bg-surface p-6 rounded-lg shadow-lg text-center border border-border">
                            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                            <p className="text-lg font-medium">{ocrProgress}</p>
                            <p className="text-sm text-text-secondary mt-2">This may take a few seconds...</p>
                          </div>
                        </div>
                      )}

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-medium">Document Preview</h3>
                          {detectedFields.length > 0 && (
                            <div className="text-sm text-text-secondary">
                              {detectedFields.length} signature field{detectedFields.length !== 1 ? 's' : ''} detected
                            </div>
                          )}
                        </div>

                        {/* Image Document Viewer with OCR overlays */}
                        <ErrorBoundary fallback={
                          <div className="p-4 text-center">
                            <p className="text-red-600">Failed to load document viewer</p>
                          </div>
                        }>
                          <ImageDocumentViewer
                            key={`viewer-${documentPages.length}`}
                            documentId={documentId}
                            pages={documentPages}
                            fields={detectedFields}
                            onFieldsChanged={setDetectedFields}
                            onFieldClick={(field) => console.log('Field clicked:', field)}
                            onFieldAdd={(field) => setDetectedFields([...detectedFields, field])}
                            onFieldRemove={(fieldId) => setDetectedFields(detectedFields.filter(f => f.id !== fieldId))}
                            onFieldMove={(fieldId, x, y) => {
                              setDetectedFields(detectedFields.map(f =>
                                f.id === fieldId ? { ...f, x, y } : f
                              ));
                            }}
                            enableEditing={false}
                            showOverlays={true}
                            className="h-[600px]"
                          />
                        </ErrorBoundary>
                      </div>
                      
                      {/* Next Button */}
                      <div className="flex justify-end pt-4">
                        <button
                          onClick={() => setStep(2)}
                          className="px-6 py-2 bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
                        >
                          Next: Add Recipients
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              )}

              {/* Step 2: Recipients - Show even without files for debugging */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <h2 className="text-xl font-semibold mb-4">Add Recipients</h2>
                  
                  {signers.map((signer, index) => (
                    <div key={signer.id} className="bg-surface rounded-xl p-4 border border-border">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium">Recipient {index + 1}</span>
                        {signers.length > 1 && (
                          <button
                            onClick={() => removeSigner(signer.id)}
                            className="text-danger hover:bg-danger/10 p-1 rounded-lg transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid gap-3">
                        <input
                          type="text"
                          placeholder="Full Name"
                          value={signer.name}
                          onChange={(e) => updateSigner(signer.id, 'name', e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-4 py-2 focus:border-primary focus:outline-none transition-colors"
                        />
                        <div className="grid sm:grid-cols-2 gap-3">
                          <input
                            type="email"
                            placeholder="Email Address"
                            value={signer.email}
                            onChange={(e) => updateSigner(signer.id, 'email', e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-4 py-2 focus:border-primary focus:outline-none transition-colors"
                          />
                          <input
                            type="tel"
                            placeholder="Phone Number (optional)"
                            value={signer.phone}
                            onChange={(e) => updateSigner(signer.id, 'phone', e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-4 py-2 focus:border-primary focus:outline-none transition-colors"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={addSigner}
                    className="w-full bg-surface border border-dashed border-border rounded-xl py-3 hover:border-primary hover:text-primary transition-colors"
                  >
                    + Add Another Recipient
                  </button>

                  <div className="flex justify-between pt-4">
                    <button
                      onClick={() => setStep(1)}
                      className="px-6 py-2 border border-border rounded-lg hover:bg-surface transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setStep(3)}
                      className="px-6 py-2 bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Settings */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <h2 className="text-xl font-semibold mb-4">Workflow Settings</h2>

                  <div className="bg-surface rounded-xl p-4 border border-border">
                    <label className="block text-sm font-medium mb-3">Signing Order</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setWorkflow({ ...workflow, type: 'parallel' })}
                        className={`p-3 rounded-lg border transition-all ${
                          workflow.type === 'parallel'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="font-medium mb-1">Parallel</div>
                        <div className="text-xs text-text-secondary">All sign at once</div>
                      </button>
                      <button
                        onClick={() => setWorkflow({ ...workflow, type: 'sequential' })}
                        className={`p-3 rounded-lg border transition-all ${
                          workflow.type === 'sequential'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="font-medium mb-1">Sequential</div>
                        <div className="text-xs text-text-secondary">Sign in order</div>
                      </button>
                    </div>
                  </div>

                  <div className="bg-surface rounded-xl p-4 border border-border">
                    <label className="block text-sm font-medium mb-3">Deadline (Optional)</label>
                    <input
                      type="date"
                      value={workflow.deadline}
                      onChange={(e) => setWorkflow({ ...workflow, deadline: e.target.value })}
                      className="w-full bg-background border border-border rounded-lg px-4 py-2 focus:border-primary focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="flex justify-between pt-4">
                    <button
                      onClick={() => setStep(2)}
                      className="px-6 py-2 border border-border rounded-lg hover:bg-surface transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setStep(4)}
                      className="px-6 py-2 bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 4: Review & Send */}
              {step === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <h2 className="text-xl font-semibold mb-4">Review & Send</h2>

                  {/* Image Document Preview with OCR */}
                  {documentPages.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium">Document Preview</h3>
                        {detectedFields.length > 0 && (
                          <div className="text-sm text-text-secondary">
                            {detectedFields.length} field{detectedFields.length !== 1 ? 's' : ''} detected by OCR
                          </div>
                        )}
                      </div>
                      <ErrorBoundary>
                        <ImageDocumentViewer
                          documentId={documentId}
                          pages={documentPages}
                          fields={detectedFields}
                          onFieldsChanged={setDetectedFields}
                          onFieldClick={(field) => console.log('Field clicked:', field)}
                          onFieldAdd={(field) => setDetectedFields([...detectedFields, field])}
                          onFieldRemove={(fieldId) => setDetectedFields(detectedFields.filter(f => f.id !== fieldId))}
                          onFieldMove={(fieldId, x, y) => {
                            setDetectedFields(detectedFields.map(f =>
                              f.id === fieldId ? { ...f, x, y } : f
                            ));
                          }}
                          enableEditing={true}
                          showOverlays={false}
                          className="h-[600px]"
                        />
                      </ErrorBoundary>
                    </div>
                  )}

                  <div className="bg-surface rounded-xl p-6 border border-border space-y-4">
                    <div>
                      <p className="text-sm text-text-secondary mb-2">Documents</p>
                      <p className="font-medium">{uploadedFiles.map(f => f.name).join(', ')}</p>
                    </div>

                    <div>
                      <p className="text-sm text-text-secondary mb-2">Recipients</p>
                      <div className="space-y-1">
                        {signers.map(s => s.name).filter(Boolean).map((name, i) => (
                          <p key={i} className="font-medium">{name}</p>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-text-secondary mb-2">Workflow</p>
                      <p className="font-medium capitalize">{workflow.type} Signing</p>
                    </div>

                    {workflow.deadline && (
                      <div>
                        <p className="text-sm text-text-secondary mb-2">Deadline</p>
                        <p className="font-medium">{new Date(workflow.deadline).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between pt-4">
                    <button
                      onClick={() => setStep(3)}
                      className="px-6 py-2 border border-border rounded-lg hover:bg-surface transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSubmit}
                      className="px-8 py-3 bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors font-semibold flex items-center gap-2"
                    >
                      Send for Signature
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}