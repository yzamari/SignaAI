'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus,
  X,
  Move,
  RotateCw,
  Pen,
  MousePointer,
  Calendar,
  Type,
  Hash,
  Users,
  Trash2,
  Save,
  Eye,
  EyeOff,
  Settings,
  Copy,
  Layers,
  FileText,
  Download,
  ZoomIn,
  ZoomOut,
  Camera
} from 'lucide-react';
import SignatureOverlay from './SignatureOverlay';
import { OCRField } from './PDFViewer';

export interface FieldTemplate {
  id: string;
  type: 'signature' | 'text' | 'date' | 'initial' | 'checkbox';
  name: string;
  defaultWidth: number;
  defaultHeight: number;
  icon: React.ComponentType<any>;
  color: string;
}

export interface EnhancedOCRField extends OCRField {
  assignedTo?: string;
  label?: string;
  placeholder?: string;
  validation?: {
    required: boolean;
    pattern?: string;
    message?: string;
  };
  ocrSourceResolution?: {
    width: number;
    height: number;
  };
}

export interface FieldManagementProps {
  file?: File;
  url?: string;
  className?: string;
  onFieldsChanged?: (fields: EnhancedOCRField[]) => void;
  onFieldSigned?: (fieldId: string, data: string) => void;
  onScreenshot?: (screenshotData: string, page: number) => void;
  enableSigning?: boolean;
  enableEditing?: boolean;
  showToolbar?: boolean;
  readonly?: boolean;
  initialFields?: EnhancedOCRField[];
  fields?: EnhancedOCRField[];
}

const FIELD_TEMPLATES: FieldTemplate[] = [
  {
    id: 'signature',
    type: 'signature',
    name: 'Signature',
    defaultWidth: 200,
    defaultHeight: 60,
    icon: Pen,
    color: '#00DC82'
  },
  {
    id: 'initial',
    type: 'initial',
    name: 'Initial',
    defaultWidth: 80,
    defaultHeight: 40,
    icon: Hash,
    color: '#3B82F6'
  },
  {
    id: 'date',
    type: 'date',
    name: 'Date',
    defaultWidth: 120,
    defaultHeight: 30,
    icon: Calendar,
    color: '#F59E0B'
  },
  {
    id: 'text',
    type: 'text',
    name: 'Text Field',
    defaultWidth: 160,
    defaultHeight: 30,
    icon: Type,
    color: '#8B5CF6'
  },
  {
    id: 'checkbox',
    type: 'checkbox',
    name: 'Checkbox',
    defaultWidth: 20,
    defaultHeight: 20,
    icon: MousePointer,
    color: '#EF4444'
  }
];

export default function FieldManagementPDFViewer({
  file,
  url,
  className = '',
  onFieldsChanged,
  onFieldSigned,
  onScreenshot,
  enableSigning = false,
  enableEditing = false,
  showToolbar = false,
  readonly = false,
  initialFields = [],
  fields: propFields = []
}: FieldManagementProps) {
  const [fields, setFields] = useState<EnhancedOCRField[]>(propFields.length > 0 ? propFields : initialFields);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const [showFieldEditor, setShowFieldEditor] = useState<boolean>(false);
  const [showSignatureModal, setShowSignatureModal] = useState<boolean>(false);
  const [fieldsVisible, setFieldsVisible] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string>('');
  const [isProcessingOCR, setIsProcessingOCR] = useState<boolean>(false);
  const [ocrResults, setOcrResults] = useState<any>(null);
  const [viewerDimensions, setViewerDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [activeFieldType, setActiveFieldType] = useState<FieldTemplate | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfIframeRef = useRef<HTMLIFrameElement>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Create object URL for PDF
  useEffect(() => {
    if (file) {
      try {
        const objectUrl = URL.createObjectURL(file);
        setPdfObjectUrl(objectUrl);
        console.log('PDF URL created:', objectUrl);
        
        return () => {
          URL.revokeObjectURL(objectUrl);
        };
      } catch (error) {
        console.error('Error creating PDF URL:', error);
      }
    } else if (url) {
      setPdfObjectUrl(url);
    }
  }, [file, url]);

  // Process with OCR when PDF loads - only if no fields provided via props
  useEffect(() => {
    // Don't call OCR if fields were already provided via props
    if (file && propFields.length === 0 && initialFields.length === 0 && fields.length === 0) {
      processWithOCR();
    }
  }, [file]);
  
  // Update fields when propFields changes
  useEffect(() => {
    if (propFields && propFields.length > 0) {
      // Only update if fields are actually different
      const fieldsChanged = JSON.stringify(fields) !== JSON.stringify(propFields);
      if (fieldsChanged) {
        console.log('Updating fields from props:', propFields);
        setFields(propFields);
      }
    }
  }, [propFields, fields]);

  // Notify parent of field changes - but only for user-initiated changes
  useEffect(() => {
    // Don't notify if fields were just set from props
    // Only notify when fields are modified by user interaction
    if (fields.length > 0 || (propFields && propFields.length === 0)) {
      onFieldsChanged?.(fields);
    }
  }, [fields, onFieldsChanged]);

  // Keyboard event handler for deleting selected field
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readonly || !selectedField) return;
      
      // Delete or Backspace key
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeField(selectedField);
      }
      
      // Escape key to deselect
      if (e.key === 'Escape') {
        setSelectedField(null);
        setActiveFieldType(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedField, readonly]);

  // Track viewer dimensions for scaling
  useEffect(() => {
    const updateViewerDimensions = () => {
      // Try to get the iframe dimensions first
      if (pdfIframeRef.current) {
        const iframeRect = pdfIframeRef.current.getBoundingClientRect();
        setViewerDimensions({ width: iframeRect.width, height: iframeRect.height });
        console.log('PDF viewer dimensions:', { width: iframeRect.width, height: iframeRect.height });
      } else if (containerRef.current) {
        // Fallback to container dimensions
        const rect = containerRef.current.getBoundingClientRect();
        setViewerDimensions({ width: rect.width, height: rect.height });
      }
    };

    // Initial update
    updateViewerDimensions();
    
    // Update on window resize
    window.addEventListener('resize', updateViewerDimensions);

    // Update when iframe loads
    const iframe = pdfIframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', () => {
        // Wait a bit for the PDF to render
        setTimeout(updateViewerDimensions, 500);
      });
    }

    return () => {
      window.removeEventListener('resize', updateViewerDimensions);
      if (iframe) {
        iframe.removeEventListener('load', updateViewerDimensions);
      }
    };
  }, [pdfObjectUrl]);

  // Calculate scale factor for a field with proper coordinate transformation
  const getFieldScale = (field: EnhancedOCRField): number => {
    if (!field.ocrSourceResolution || viewerDimensions.width === 0) {
      // Fallback: assume standard A4 proportions
      const defaultScale = viewerDimensions.width / 595; // A4 width in PDF points
      return defaultScale * zoom;
    }

    // Key insight: OCR coordinates are in pixels at 300 DPI (1700x2200)
    // Standard A4 PDF is 595x842 points at 72 DPI
    // We need to map OCR pixels directly to PDF display pixels
    
    // Get the actual display size of the PDF iframe
    const iframeWidth = pdfIframeRef.current?.clientWidth || viewerDimensions.width;
    const iframeHeight = pdfIframeRef.current?.clientHeight || viewerDimensions.height;
    
    // OCR document dimensions (from 300 DPI scan)
    const ocrWidth = field.ocrSourceResolution.width;   // 1700px
    const ocrHeight = field.ocrSourceResolution.height; // 2200px
    
    // Standard A4 PDF dimensions in points
    const A4_WIDTH = 595;  // points
    const A4_HEIGHT = 842; // points
    
    // Calculate the scale from OCR pixels to PDF points
    // This is the key: map 1700px OCR width to 595pt PDF width
    const ocrToPdfScaleX = A4_WIDTH / ocrWidth;   // 595/1700 = 0.35
    const ocrToPdfScaleY = A4_HEIGHT / ocrHeight; // 842/2200 = 0.38
    
    // Use the smaller scale to maintain aspect ratio
    const ocrToPdfScale = Math.min(ocrToPdfScaleX, ocrToPdfScaleY); // 0.35
    
    // Now scale from PDF points to display pixels
    // The iframe shows the PDF at a certain pixel size
    const pdfToDisplayScaleX = iframeWidth / A4_WIDTH;
    const pdfToDisplayScaleY = iframeHeight / A4_HEIGHT;
    const pdfToDisplayScale = Math.min(pdfToDisplayScaleX, pdfToDisplayScaleY);
    
    // Combine the scales: OCR pixels → PDF points → Display pixels
    const finalScale = ocrToPdfScale * pdfToDisplayScale * zoom;
    
    console.log('Improved scale calculation:', {
      fieldId: field.id,
      ocrDimensions: { width: ocrWidth, height: ocrHeight },
      pdfDimensions: { width: A4_WIDTH, height: A4_HEIGHT },
      iframeDimensions: { width: iframeWidth, height: iframeHeight },
      scales: {
        ocrToPdf: ocrToPdfScale,
        pdfToDisplay: pdfToDisplayScale,
        zoom: zoom,
        final: finalScale
      }
    });
    
    return Math.max(0.1, Math.min(5, finalScale));
  };

  const processWithOCR = async () => {
    if (!file) return;

    setIsProcessingOCR(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Try OCR service - use environment variable for URL
      const ocrUrl = process.env.NEXT_PUBLIC_OCR_URL || 'http://localhost:8002';
      const response = await fetch(`${ocrUrl}/detect-fields`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        setOcrResults(result);
        console.log('OCR Results:', result);
        
        // Process overlayed images
        if (result.overlayed_images) {
          result.overlayed_images.forEach((imageData: string, index: number) => {
            console.log(`Page ${index + 1} overlay:`, imageData.substring(0, 100) + '...');
            onScreenshot?.(imageData, index + 1);
          });
        }

        // Convert OCR results to fields
        const detectedFields: EnhancedOCRField[] = [];
        if (result.analysis_results) {
          result.analysis_results.forEach((page: any, pageIndex: number) => {
            page.fields?.forEach((field: any, fieldIndex: number) => {
              detectedFields.push({
                id: `ocr-field-${pageIndex}-${fieldIndex}`,
                type: field.type || 'signature',
                x: field.x || Math.random() * 400 + 100,
                y: field.y || Math.random() * 200 + 100,
                width: field.width || 200,
                height: field.height || 40,
                page: pageIndex + 1,
                confidence: field.confidence || 0.8,
                required: true,
                label: field.label || `${field.type || 'signature'} field`,
                validation: {
                  required: true
                }
              });
            });
          });
        }

        setFields(detectedFields);
      } else {
        console.warn('OCR service unavailable, using example fields');
        addExampleFields();
      }
    } catch (error) {
      console.error('OCR processing failed:', error);
      addExampleFields();
    } finally {
      setIsProcessingOCR(false);
    }
  };

  const addExampleFields = () => {
    const exampleFields: EnhancedOCRField[] = [
      {
        id: 'example-signature-1',
        type: 'signature',
        x: 100,
        y: 300,
        width: 200,
        height: 60,
        page: 1,
        confidence: 0.9,
        required: true,
        label: 'Primary Signature',
        validation: { required: true }
      },
      {
        id: 'example-date-1',
        type: 'date',
        x: 400,
        y: 150,
        width: 120,
        height: 30,
        page: 1,
        confidence: 0.8,
        required: true,
        label: 'Signature Date',
        validation: { required: true }
      },
      {
        id: 'example-initial-1',
        type: 'initial',
        x: 150,
        y: 200,
        width: 80,
        height: 40,
        page: 1,
        confidence: 0.7,
        required: false,
        label: 'Initial Here',
        validation: { required: false }
      }
    ];
    setFields(exampleFields);
  };

  const addField = (template: FieldTemplate, position?: { x: number, y: number }) => {
    if (readonly) return;

    const newField: EnhancedOCRField = {
      id: `field-${Date.now()}`,
      type: template.type,
      x: position?.x || 100 + Math.random() * 200,
      y: position?.y || 100 + Math.random() * 200,
      width: template.defaultWidth,
      height: template.defaultHeight,
      page: currentPage,
      confidence: 1.0,
      required: template.type === 'signature',
      label: template.name,
      validation: {
        required: template.type === 'signature'
      }
    };

    setFields(prev => [...prev, newField]);
    setSelectedField(newField.id);
    setActiveFieldType(null); // Reset active field type after placing
  };

  const removeField = (fieldId: string) => {
    if (readonly) return;

    setFields(prev => prev.filter(f => f.id !== fieldId));
    if (selectedField === fieldId) {
      setSelectedField(null);
    }
  };

  const duplicateField = (fieldId: string) => {
    if (readonly) return;

    const originalField = fields.find(f => f.id === fieldId);
    if (!originalField) return;

    const newField: EnhancedOCRField = {
      ...originalField,
      id: `field-${Date.now()}`,
      x: originalField.x + 20,
      y: originalField.y + 20,
      label: `${originalField.label} (Copy)`
    };

    setFields(prev => [...prev, newField]);
    setSelectedField(newField.id);
  };

  const updateField = (fieldId: string, updates: Partial<EnhancedOCRField>) => {
    if (readonly) return;

    setFields(prev => prev.map(f => 
      f.id === fieldId ? { ...f, ...updates } : f
    ));
  };

  const handleMouseDown = (e: React.MouseEvent, fieldId: string) => {
    if (readonly || enableSigning) return;

    e.preventDefault();
    e.stopPropagation();

    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const rect = e.currentTarget.getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    setDraggedField(fieldId);
    setSelectedField(fieldId);

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const scale = getFieldScale(field);
      
      // Calculate new position in screen coordinates
      const screenX = e.clientX - containerRect.left - dragOffsetRef.current.x;
      const screenY = e.clientY - containerRect.top - dragOffsetRef.current.y;
      
      // Convert back to original OCR coordinates by dividing by scale
      const ocrX = screenX / scale;
      const ocrY = screenY / scale;

      updateField(fieldId, {
        x: Math.max(0, Math.min(ocrX, (containerRect.width / scale) - field.width)),
        y: Math.max(0, Math.min(ocrY, (containerRect.height / scale) - field.height))
      });
    };

    const handleMouseUp = () => {
      setDraggedField(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readonly || enableSigning) return;
    
    // If an active field type is selected, place it where clicked
    if (activeFieldType && containerRef.current) {
      e.stopPropagation();
      const rect = containerRef.current.getBoundingClientRect();
      const scale = viewerDimensions.width > 0 ? viewerDimensions.width / 800 : 1;
      
      // Calculate position relative to container
      const clickX = (e.clientX - rect.left) / scale;
      const clickY = (e.clientY - rect.top) / scale;
      
      // Center the field on click position
      const fieldX = clickX - (activeFieldType.defaultWidth / 2);
      const fieldY = clickY - (activeFieldType.defaultHeight / 2);
      
      addField(activeFieldType, { x: fieldX, y: fieldY });
    }
  };

  const handleFieldClick = (field: EnhancedOCRField, e: React.MouseEvent) => {
    e.stopPropagation();

    if (enableSigning && field.type === 'signature') {
      setSelectedField(field.id);
      setShowSignatureModal(true);
    } else if (!readonly) {
      setSelectedField(field.id);
      setShowFieldEditor(true);
    }
  };

  const takeScreenshot = async () => {
    try {
      // For now, we'll create a simple representation
      // In a real implementation, you'd use html2canvas or similar
      const screenshotData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
      onScreenshot?.(screenshotData, currentPage);
      console.log(`Screenshot taken for page ${currentPage}`);
    } catch (error) {
      console.error('Screenshot failed:', error);
    }
  };

  const renderField = (field: EnhancedOCRField) => {
    const isSelected = selectedField === field.id;
    const isDragged = draggedField === field.id;
    const template = FIELD_TEMPLATES.find(t => t.type === field.type);
    const IconComponent = template?.icon || Pen;

    // Apply dynamic scaling to field coordinates
    const scale = getFieldScale(field);
    const scaledX = Math.round(field.x * scale);
    const scaledWidth = Math.round(field.width * scale);
    const scaledHeight = Math.round(field.height * scale);
    
    // Y-axis adjustment for proper positioning
    // The OCR backend positions fields 10px ABOVE detected lines
    // We compensate by moving them down slightly
    const yAdjustment = 10; // Compensate for OCR positioning above lines
    const scaledY = Math.round((field.y + yAdjustment) * scale); // Direct scaling without artificial spreading

    // Only log for debugging specific issues
    if (field.id === 'field-0-0') {
      console.log(`Field positioning debug:`, {
        fieldId: field.id,
        original: { x: field.x, y: field.y, width: field.width, height: field.height },
        scale,
        scaled: { x: scaledX, y: scaledY, width: scaledWidth, height: scaledHeight },
        viewerDimensions
      });
    }

    return (
      <motion.div
        key={field.id}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ 
          opacity: fieldsVisible ? 1 : 0.3, 
          scale: isDragged ? 1.1 : 1,
          zIndex: isSelected ? 100 : field.page === currentPage ? 50 : 10
        }}
        className={`absolute cursor-pointer group ${readonly ? 'pointer-events-none' : ''}`}
        style={{
          left: `${scaledX}px`,
          top: `${scaledY}px`,
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
          display: field.page === currentPage ? 'block' : 'none'
        }}
        onMouseDown={(e) => handleMouseDown(e, field.id)}
        onClick={(e) => handleFieldClick(field, e)}
      >
        {/* Field Container - Improved styling */}
        <div 
          className={`
            w-full h-full rounded transition-all duration-200 relative
            ${isSelected 
              ? 'ring-2 ring-offset-1' 
              : 'hover:ring-1 hover:ring-offset-1'
            }
          `}
          style={{ 
            backgroundColor: `${template?.color || '#00DC82'}80`,  // Increased to 80% opacity for better visibility
            borderColor: template?.color || '#00DC82',
            border: '3px solid',  // Consistent thick border
            borderStyle: 'solid',
            opacity: 1,  // Full opacity for debugging
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',  // Stronger shadow
            zIndex: 9999  // Ensure overlays are always on top
          }}
        >
          {/* Field Label */}
          {field.label && (
            <div 
              className="absolute -top-5 left-0 text-xs font-medium px-1 rounded"
              style={{ 
                backgroundColor: `${template?.color || '#00DC82'}20`,
                color: template?.color || '#00DC82'
              }}
            >
              {field.label.substring(0, 20)}
            </div>
          )}
          
          {/* Field Icon and Type */}
          <div className="w-full h-full flex items-center justify-between p-1">
            <IconComponent 
              className="w-3 h-3 opacity-60" 
              style={{ color: template?.color || '#00DC82' }}
            />
            {/* Field type indicator */}
            <span 
              className="text-[10px] opacity-60 pr-1"
              style={{ color: template?.color || '#00DC82' }}
            >
              {field.type === 'text' ? 'Text' : 
               field.type === 'signature' ? 'Sign' :
               field.type === 'date' ? 'Date' :
               field.type === 'checkbox' ? '✓' : field.type}
            </span>
          </div>

          {/* Field Controls (when selected and not readonly) */}
          {isSelected && !readonly && (
            <div className="absolute -top-10 -right-2 flex flex-col gap-1 z-50">
              {/* Field Type Selector */}
              <select
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  const newType = e.target.value as EnhancedOCRField['type'];
                  updateField(field.id, { 
                    type: newType,
                    label: FIELD_TEMPLATES.find(t => t.type === newType)?.name || newType
                  });
                }}
                value={field.type}
                className="px-2 py-1 text-xs bg-white border rounded shadow-sm hover:border-primary focus:outline-none focus:border-primary"
                title="Change field type"
              >
                <option value="signature">Signature</option>
                <option value="initial">Initial</option>
                <option value="date">Date</option>
                <option value="text">Text</option>
                <option value="checkbox">Checkbox</option>
              </select>
              
              {/* Action Buttons */}
              <div className="flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateField(field.id);
                  }}
                  className="p-1 bg-white rounded border shadow-sm hover:bg-gray-50"
                  title="Duplicate"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeField(field.id);
                  }}
                  className="p-1 bg-white rounded border shadow-sm hover:bg-red-50 text-red-600"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Field Label */}
          <div 
            className="absolute -top-6 left-0 bg-white text-xs px-2 py-1 rounded shadow-sm border opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
            style={{ backgroundColor: template?.color || '#00DC82', color: 'white' }}
          >
            {field.label || field.type}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className={`bg-white rounded-2xl shadow-2xl overflow-hidden ${className}`}>
      {/* Header Controls */}
      <div className="bg-surface border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Document Info */}
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-medium">
                {file ? file.name : url ? 'PDF Document' : 'No Document'}
              </h3>
              <p className="text-sm text-text-secondary">
                {fields.length} field{fields.length !== 1 ? 's' : ''} • Page {currentPage}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-background rounded-lg px-2 py-1">
              <button
                onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
                className="p-1 rounded hover:bg-surface transition-colors"
                title="Zoom Out"
                aria-label="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium px-2 min-w-[50px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                className="p-1 rounded hover:bg-surface transition-colors"
                title="Zoom In"
                aria-label="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <div className="w-px h-6 bg-border" />

            <button
              onClick={() => setFieldsVisible(!fieldsVisible)}
              className="p-2 rounded-lg hover:bg-background transition-colors"
              title={fieldsVisible ? "Hide Fields" : "Show Fields"}
            >
              {fieldsVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            
            <button
              onClick={takeScreenshot}
              className="p-2 rounded-lg hover:bg-background transition-colors"
              title="Take Screenshot"
            >
              <Camera className="w-4 h-4" />
            </button>

            {pdfObjectUrl && (
              <a
                href={pdfObjectUrl}
                download={file?.name || 'document.pdf'}
                className="p-2 rounded-lg hover:bg-background transition-colors"
                title="Download PDF"
              >
                <Download className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Field Templates Toolbar (only if not readonly) */}
      {!readonly && (
        <div className="bg-background border-b border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-text-secondary" />
              <span className="text-sm font-medium text-text-secondary">Add Fields:</span>
            </div>
            {activeFieldType && (
              <span className="text-xs text-primary animate-pulse">
                Click on PDF to place {activeFieldType.name}
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {FIELD_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  if (activeFieldType?.id === template.id) {
                    setActiveFieldType(null);
                  } else {
                    setActiveFieldType(template);
                  }
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm ${
                  activeFieldType?.id === template.id 
                    ? 'border-primary bg-primary/10 shadow-md' 
                    : 'border-border hover:border-primary hover:bg-primary/5'
                }`}
                style={{ 
                  borderColor: activeFieldType?.id === template.id ? template.color : undefined,
                  backgroundColor: activeFieldType?.id === template.id ? `${template.color}20` : undefined
                }}
                title={activeFieldType?.id === template.id ? "Click on PDF to place field" : "Select to place on PDF"}
              >
                <template.icon className="w-4 h-4" style={{ color: template.color }} />
                {template.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PDF Viewer Container */}
      <div 
        ref={containerRef}
        className="relative bg-gray-100 overflow-auto"
        style={{ 
          height: '600px',
          cursor: activeFieldType ? 'crosshair' : 'default'
        }}
        onClick={(e) => {
          if (!activeFieldType) {
            setSelectedField(null);
          }
        }}
      >
        {pdfObjectUrl ? (
          <div className="relative w-full h-full">
            {/* PDF Iframe */}
            <iframe
              ref={pdfIframeRef}
              src={`${pdfObjectUrl}#toolbar=1&navpanes=0&scrollbar=1&page=${currentPage}&view=FitH&zoom=${zoom * 100}`}
              className="w-full h-full border-0 bg-white"
              title="PDF Document"
              onLoad={() => {
                console.log('PDF iframe loaded:', pdfObjectUrl);
                // Update viewer dimensions after PDF loads
                setTimeout(() => {
                  if (pdfIframeRef.current) {
                    const rect = pdfIframeRef.current.getBoundingClientRect();
                    setViewerDimensions({ width: rect.width, height: rect.height });
                    console.log('PDF dimensions after load:', rect.width, 'x', rect.height);
                  }
                }, 500);
              }}
              onError={(e) => {
                console.error('PDF iframe failed to load:', e);
              }}
            />
            
            {/* Fields Overlay - Improved positioning */}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: 10,
                overflow: 'auto'
              }}
            >
              {/* Make overlay clickable when placing fields */}
              <div 
                className={activeFieldType ? "pointer-events-auto" : "pointer-events-none"}
                style={{ position: 'absolute', inset: 0 }}
                onClick={handleOverlayClick}
              />
              {/* Only render fields for current page */}
              {fields
                .map(field => (
                  <div key={field.id} className="pointer-events-auto">
                    {renderField(field)}
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-500">No document loaded</p>
              {file && <p className="text-sm text-gray-400 mt-1">Processing {file.name}...</p>}
            </div>
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessingOCR && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-50">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-text-secondary">Processing with OCR...</p>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="bg-surface border-t border-border px-4 py-2 text-xs text-text-secondary">
        <div className="flex items-center justify-between">
          <span>
            {fields.length} field{fields.length !== 1 ? 's' : ''} total
          </span>
          {ocrResults && (
            <span>
              OCR processed • {ocrResults.analysis_results?.length || 0} page{(ocrResults.analysis_results?.length || 0) !== 1 ? 's' : ''}
            </span>
          )}
        </div>
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
            onSignatureComplete={(data) => {
              onFieldSigned?.(selectedField, data);
              setShowSignatureModal(false);
              setSelectedField(null);
            }}
            fieldId={selectedField}
          />
        )}
      </AnimatePresence>

      {/* Field Editor Modal (you can implement this separately if needed) */}
      {showFieldEditor && selectedField && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Edit Field</h3>
            {/* Field editing form would go here */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowFieldEditor(false)}
                className="flex-1 px-4 py-2 border border-border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowFieldEditor(false)}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}