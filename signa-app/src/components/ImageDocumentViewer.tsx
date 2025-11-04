'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  Plus,
  Trash2,
  Move,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react';

export interface DocumentField {
  id: string;
  type: 'signature' | 'text' | 'date' | 'initial' | 'checkbox';
  page: number;
  x: number;  // Absolute pixel position
  y: number;
  width: number;
  height: number;
  label?: string;
  required?: boolean;
  confidence?: number;
  detected_by_ocr?: boolean;
  value?: string;
  assignedTo?: string;
}

export interface DocumentPage {
  page_number: number;
  width: number;
  height: number;
  original_image?: string;  // Base64 image
  overlay_image?: string;    // Base64 image with overlays
  fields_count?: number;
}

interface ImageDocumentViewerProps {
  documentId?: string;
  pages: DocumentPage[];
  fields: DocumentField[];
  onFieldsChanged?: (fields: DocumentField[]) => void;
  onFieldClick?: (field: DocumentField) => void;
  onFieldAdd?: (field: DocumentField) => void;
  onFieldRemove?: (fieldId: string) => void;
  onFieldMove?: (fieldId: string, x: number, y: number) => void;
  enableEditing?: boolean;
  showOverlays?: boolean;
  className?: string;
}

export default function ImageDocumentViewer({
  documentId,
  pages = [],
  fields = [],
  onFieldsChanged,
  onFieldClick,
  onFieldAdd,
  onFieldRemove,
  onFieldMove,
  enableEditing = true,
  showOverlays = true,
  className = ''
}: ImageDocumentViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [showFields, setShowFields] = useState(true);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  // Debug logging
  useEffect(() => {
    console.log('ImageDocumentViewer received pages:', pages.length, pages);
    if (pages.length > 0) {
      console.log('First page:', pages[0]);
    }
  }, [pages]);

  // Get current page data
  const currentPageData = pages.find(p => p.page_number === currentPage) || pages[0];
  const currentPageFields = fields.filter(f => f.page === currentPage);

  // Get the image to display (overlay if available and enabled, otherwise original)
  const displayImage = showOverlays && currentPageData?.overlay_image
    ? currentPageData.overlay_image
    : currentPageData?.original_image;

  // Handle field click
  const handleFieldClick = (e: React.MouseEvent, field: DocumentField) => {
    e.stopPropagation();
    setSelectedField(field.id);
    onFieldClick?.(field);
  };

  // Handle field drag
  const handleFieldDragStart = (e: React.MouseEvent, field: DocumentField) => {
    if (!enableEditing) return;
    e.stopPropagation();
    setIsDragging(true);
    setDraggedField(field.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const fieldStartX = field.x;
    const fieldStartY = field.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!imageRef.current) return;

      const rect = imageRef.current.getBoundingClientRect();
      const scale = rect.width / (currentPageData?.width || 1);

      const deltaX = (moveEvent.clientX - startX) / scale;
      const deltaY = (moveEvent.clientY - startY) / scale;

      const newX = Math.max(0, Math.min(fieldStartX + deltaX, (currentPageData?.width || 0) - field.width));
      const newY = Math.max(0, Math.min(fieldStartY + deltaY, (currentPageData?.height || 0) - field.height));

      onFieldMove?.(field.id, newX, newY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDraggedField(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle adding new field
  const handleImageClick = (e: React.MouseEvent) => {
    if (!enableEditing || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const scale = rect.width / (currentPageData?.width || 1);

    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    const newField: DocumentField = {
      id: `field-${Date.now()}`,
      type: 'text',
      page: currentPage,
      x: x - 50, // Center the field on click
      y: y - 15,
      width: 100,
      height: 30,
      label: 'New Field',
      required: false,
      detected_by_ocr: false
    };

    onFieldAdd?.(newField);
  };

  // Handle zoom
  const handleZoom = (delta: number) => {
    setZoom(prev => Math.max(0.5, Math.min(2, prev + delta)));
  };

  // Calculate field position and size based on image scale
  const getFieldStyle = (field: DocumentField) => {
    if (!imageRef.current || !currentPageData) return {};

    const rect = imageRef.current.getBoundingClientRect();
    const scale = rect.width / currentPageData.width;

    return {
      left: `${field.x * scale}px`,
      top: `${field.y * scale}px`,
      width: `${field.width * scale}px`,
      height: `${field.height * scale}px`
    };
  };

  // Get field color based on type
  const getFieldColor = (field: DocumentField) => {
    const colors = {
      signature: 'border-blue-500 bg-blue-500/10',
      initial: 'border-cyan-500 bg-cyan-500/10',
      date: 'border-orange-500 bg-orange-500/10',
      text: 'border-green-500 bg-green-500/10',
      checkbox: 'border-purple-500 bg-purple-500/10'
    };
    return colors[field.type] || 'border-gray-500 bg-gray-500/10';
  };

  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No document pages available
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-background ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-2">
          {/* Page Navigation */}
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="p-2 rounded-lg hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm">
            Page {currentPage} of {pages.length}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(pages.length, prev + 1))}
            disabled={currentPage === pages.length}
            className="p-2 rounded-lg hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <button
            onClick={() => handleZoom(-0.1)}
            className="p-2 rounded-lg hover:bg-background"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm w-16 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => handleZoom(0.1)}
            className="p-2 rounded-lg hover:bg-background"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          {/* Toggle Overlays */}
          <button
            onClick={() => setShowFields(!showFields)}
            className={`p-2 rounded-lg hover:bg-background ${showFields ? 'text-primary' : 'text-muted-foreground'}`}
            title={showFields ? 'Hide Fields' : 'Show Fields'}
          >
            {showFields ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {/* Field Count */}
          <div className="px-3 py-1 bg-background rounded-lg text-sm">
            {currentPageFields.length} fields
          </div>
        </div>
      </div>

      {/* Document Viewer */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-muted/50 p-4"
      >
        <div
          className="mx-auto"
          style={{
            width: 'fit-content',
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease'
          }}
        >
          <div
            ref={imageRef}
            className="relative bg-white shadow-lg"
            onClick={handleImageClick}
          >
            {/* Page Image */}
            {displayImage ? (
              <img
                src={displayImage}
                alt={`Page ${currentPage}`}
                className="w-full h-auto"
                style={{ maxWidth: `${currentPageData?.width}px` }}
                onLoad={() => setIsLoading(false)}
                onError={() => {
                  console.error('Failed to load page image');
                  setIsLoading(false);
                }}
              />
            ) : (
              <div
                className="flex items-center justify-center bg-white"
                style={{
                  width: `${currentPageData?.width || 800}px`,
                  height: `${currentPageData?.height || 1100}px`
                }}
              >
                {isLoading ? (
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-muted-foreground">No image available</span>
                )}
              </div>
            )}

            {/* Field Overlays */}
            {showFields && !showOverlays && currentPageFields.map(field => (
              <motion.div
                key={field.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`absolute border-2 rounded cursor-pointer transition-all ${getFieldColor(field)} ${
                  selectedField === field.id ? 'ring-2 ring-primary ring-offset-2' : ''
                } ${draggedField === field.id ? 'opacity-50' : ''}`}
                style={getFieldStyle(field)}
                onClick={(e) => handleFieldClick(e, field)}
                onMouseDown={(e) => handleFieldDragStart(e, field)}
              >
                {/* Field Label */}
                {field.label && (
                  <div className="absolute -top-6 left-0 text-xs font-medium px-1 py-0.5 bg-background rounded">
                    {field.label}
                  </div>
                )}

                {/* Field Controls */}
                {enableEditing && selectedField === field.id && (
                  <div className="absolute -top-8 -right-8 flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFieldRemove?.(field.id);
                        setSelectedField(null);
                      }}
                      className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
                      title="Remove Field"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* OCR Confidence Badge */}
                {field.detected_by_ocr && field.confidence && (
                  <div className="absolute -bottom-6 left-0 text-xs text-muted-foreground">
                    OCR: {Math.round(field.confidence * 100)}%
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t bg-card text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>Document: {documentId || 'Untitled'}</span>
          <span>•</span>
          <span>Size: {currentPageData?.width} × {currentPageData?.height}px</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{currentPageFields.filter(f => f.detected_by_ocr).length} OCR fields</span>
          <span>•</span>
          <span>{currentPageFields.filter(f => !f.detected_by_ocr).length} manual fields</span>
        </div>
      </div>
    </div>
  );
}