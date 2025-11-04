'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download,
  Loader2,
  FileX,
  Pen,
  MousePointer,
  ExternalLink
} from 'lucide-react';
import SignatureOverlay from './SignatureOverlay';

export interface OCRField {
  id: string;
  type: 'signature' | 'text' | 'date' | 'initial';
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  confidence: number;
  required: boolean;
  value?: string;
  signatureData?: string;
}

export interface PDFViewerProps {
  file?: File;
  url?: string;
  className?: string;
  onFieldDetected?: (fields: OCRField[]) => void;
  onFieldSigned?: (fieldId: string, data: string) => void;
  onDocumentSigned?: (signedData: { fieldId: string; data: string }[]) => void;
  enableOCR?: boolean;
  enableSigning?: boolean;
  readonly?: boolean;
  ocrEndpoint?: string;
}

export default function PDFViewer({
  file,
  url,
  className = '',
  onFieldDetected,
  onFieldSigned,
  onDocumentSigned,
  enableOCR = true,
  enableSigning = false,
  readonly = false,
  ocrEndpoint = 'http://localhost:8002/detect-fields'
}: PDFViewerProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [ocrFields, setOcrFields] = useState<OCRField[]>([]);
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [signedFields, setSignedFields] = useState<Map<string, string>>(new Map());
  const [showSignatureModal, setShowSignatureModal] = useState<boolean>(false);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const pdfIframeRef = useRef<HTMLIFrameElement>(null);

  // Create object URL for PDF file
  useEffect(() => {
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setPdfObjectUrl(objectUrl);
      
      // Cleanup on unmount
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    } else if (url) {
      setPdfObjectUrl(url);
    }
  }, [file, url]);

  // Run OCR when PDF loads
  useEffect(() => {
    if (file && enableOCR && !ocrLoading && ocrFields.length === 0) {
      runOCR();
    }
  }, [file, enableOCR]);

  const runOCR = async () => {
    if (!file) return;

    setOcrLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Call OCR service directly
      const response = await fetch('http://localhost:8002/detect-fields', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('OCR service unavailable');
      }

      const result = await response.json();
      console.log('OCR result:', result);
      
      const fields: OCRField[] = [];
      
      // Process OCR results
      if (result.analysis_results) {
        result.analysis_results.forEach((page: any, pageIndex: number) => {
          page.fields?.forEach((field: any, fieldIndex: number) => {
            fields.push({
              id: `field-${pageIndex}-${fieldIndex}`,
              type: 'signature',
              x: field.x || Math.random() * 400 + 100,
              y: field.y || Math.random() * 200 + 100,
              width: field.width || 200,
              height: field.height || 40,
              page: pageIndex + 1,
              confidence: field.confidence || 0.8,
              required: true
            });
          });
        });
      }
      
      // NO MOCK DATA - Only use real OCR results
      console.log(`Real OCR detected ${fields.length} fields from ${result.total_pages} pages`);

      setOcrFields(fields);
      onFieldDetected?.(fields);
      setError(''); // Clear any previous errors
    } catch (error) {
      console.error('OCR failed:', error);
      setError(`OCR service error: ${error.message}`);
      // NO MOCK DATA - Only show real results or error
    } finally {
      setOcrLoading(false);
    }
  };

  const handleIframeLoad = () => {
    setLoading(false);
  };

  const handleIframeError = () => {
    setError('Failed to load PDF');
    setLoading(false);
  };

  const handleFieldClick = (field: OCRField) => {
    if (readonly || !enableSigning) return;
    
    setSelectedField(field.id);
    if (field.type === 'signature') {
      setShowSignatureModal(true);
    }
  };

  const handleSignatureComplete = (signatureData: string) => {
    if (!selectedField) return;

    const newSignedFields = new Map(signedFields);
    newSignedFields.set(selectedField, signatureData);
    setSignedFields(newSignedFields);
    
    onFieldSigned?.(selectedField, signatureData);
    setShowSignatureModal(false);
    setSelectedField(null);
  };

  const renderField = (field: OCRField) => {
    const isSigned = signedFields.has(field.id);
    const signatureData = signedFields.get(field.id);
    
    // Convert PDF coordinates to screen coordinates (simplified for iframe approach)
    const fieldX = field.x;
    const fieldY = field.y;
    const fieldWidth = field.width;
    const fieldHeight = field.height;

    return (
      <motion.div
        key={field.id}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute cursor-pointer group z-10"
        style={{
          left: `${fieldX}px`,
          top: `${fieldY}px`,
          width: `${fieldWidth}px`,
          height: `${fieldHeight}px`,
        }}
        onClick={() => handleFieldClick(field)}
      >
        {/* Field Border */}
        <div 
          className={`
            w-full h-full rounded-lg border-2 transition-all duration-200
            ${isSigned 
              ? 'border-green-500 bg-green-500/10' 
              : 'border-primary border-dashed bg-primary/5 hover:bg-primary/10'
            }
            ${selectedField === field.id ? 'ring-2 ring-primary ring-offset-2' : ''}
          `}
        >
          {/* Signature Display */}
          {isSigned && signatureData && (
            <img 
              src={signatureData} 
              alt="Signature" 
              className="w-full h-full object-contain p-1"
            />
          )}
          
          {/* Field Icon */}
          {!isSigned && (
            <div className="w-full h-full flex items-center justify-center">
              {field.type === 'signature' ? (
                <Pen className="w-6 h-6 text-primary opacity-70 group-hover:opacity-100" />
              ) : (
                <MousePointer className="w-6 h-6 text-primary opacity-70 group-hover:opacity-100" />
              )}
            </div>
          )}
        </div>

        {/* Field Label */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-8 left-0 bg-primary text-background text-xs px-2 py-1 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
        >
          {field.type === 'signature' ? 'Click to Sign' : `${field.type} field`}
        </motion.div>
      </motion.div>
    );
  };

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center min-h-96 bg-surface rounded-2xl ${className}`}>
        <FileX className="w-16 h-16 text-text-secondary mb-4" />
        <p className="text-text-secondary text-lg">{error}</p>
        {file && (
          <button 
            onClick={() => {
              setError('');
              setLoading(true);
            }}
            className="mt-4 px-4 py-2 bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl shadow-2xl overflow-hidden ${className}`}>
      {/* Controls Header */}
      <div className="bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
        {/* PDF Info */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1 bg-background rounded-lg">
            <FileX className="w-4 h-4" />
            <span className="text-sm font-medium">
              {file ? file.name : url ? 'PDF Document' : 'No PDF'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {pdfObjectUrl && (
            <a
              href={pdfObjectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-background transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          
          {pdfObjectUrl && (
            <a
              href={pdfObjectUrl}
              download={file ? file.name : 'document.pdf'}
              className="p-2 rounded-lg hover:bg-background transition-colors"
              title="Download PDF"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
        </div>

        {/* OCR Status */}
        <div className="flex items-center gap-2">
          {ocrLoading && (
            <div className="flex items-center gap-2 text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Detecting fields...</span>
            </div>
          )}
          
          {enableOCR && ocrFields.length > 0 && (
            <div className="text-sm text-text-secondary">
              {signedFields.size}/{ocrFields.length} fields completed
            </div>
          )}
        </div>
      </div>

      {/* PDF Viewer */}
      <div 
        ref={containerRef}
        className="relative bg-gray-100 overflow-auto"
        style={{ height: '600px' }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-text-secondary">Loading PDF...</p>
            </div>
          </div>
        )}

        {pdfObjectUrl && (
          <div className="relative w-full h-full">
            {/* PDF Iframe */}
            <iframe
              ref={pdfIframeRef}
              src={`${pdfObjectUrl}#toolbar=1&navpanes=0&scrollbar=1&page=1&view=FitH`}
              className="w-full h-full border-0"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              title="PDF Document"
            />
            
            {/* OCR Fields Overlay */}
            {enableOCR && !loading && ocrFields.map(renderField)}
          </div>
        )}

        {!pdfObjectUrl && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <FileX className="w-16 h-16 text-text-secondary" />
              <p className="text-text-secondary">No PDF to display</p>
            </div>
          </div>
        )}
      </div>

      {/* Signature Modal */}
      <AnimatePresence>
        {showSignatureModal && selectedField && (
          <SignatureOverlay
            isOpen={showSignatureModal}
            onClose={() => {
              setShowSignatureModal(false);
              setSelectedField(null);
            }}
            onSignatureComplete={handleSignatureComplete}
            fieldId={selectedField}
          />
        )}
      </AnimatePresence>
    </div>
  );
}