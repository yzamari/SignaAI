'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SignatureCanvas from 'react-signature-canvas';
import { 
  X, 
  RefreshCw, 
  Download, 
  Upload, 
  Type, 
  Pen,
  Check,
  Image as ImageIcon
} from 'lucide-react';

export interface SignatureOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSignatureComplete: (signatureData: string) => void;
  fieldId: string;
  title?: string;
  allowText?: boolean;
  allowUpload?: boolean;
  allowDraw?: boolean;
}

type SignatureMode = 'draw' | 'type' | 'upload';

export default function SignatureOverlay({
  isOpen,
  onClose,
  onSignatureComplete,
  fieldId,
  title = 'Add Your Signature',
  allowText = true,
  allowUpload = true,
  allowDraw = true
}: SignatureOverlayProps) {
  const [mode, setMode] = useState<SignatureMode>('draw');
  const [typedText, setTypedText] = useState<string>('');
  const [textFont, setTextFont] = useState<string>('Dancing Script');
  const [uploadedImage, setUploadedImage] = useState<string>('');
  const [signatureData, setSignatureData] = useState<string>('');
  
  const signatureRef = useRef<SignatureCanvas>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableFonts = [
    { name: 'Dancing Script', value: 'var(--font-dancing-script), Dancing Script, cursive' },
    { name: 'Pacifico', value: 'var(--font-pacifico), Pacifico, cursive' },
    { name: 'Shadows Into Light', value: 'Shadows Into Light, cursive' },
    { name: 'Kalam', value: 'var(--font-kalam), Kalam, cursive' },
    { name: 'Caveat', value: 'var(--font-caveat), Caveat, cursive' },
  ];

  const handleClear = () => {
    if (mode === 'draw') {
      signatureRef.current?.clear();
    } else if (mode === 'type') {
      setTypedText('');
    } else if (mode === 'upload') {
      setUploadedImage('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
    setSignatureData('');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setUploadedImage(imageData);
      generateUploadSignature(imageData);
    };
    reader.readAsDataURL(file);
  };

  const generateUploadSignature = (imageData: string) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = 400;
      canvas.height = 150;
      
      // Fill with white background
      ctx!.fillStyle = 'white';
      ctx!.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw the image
      const aspectRatio = img.width / img.height;
      let drawWidth = canvas.width;
      let drawHeight = canvas.height;
      
      if (aspectRatio > canvas.width / canvas.height) {
        drawHeight = canvas.width / aspectRatio;
      } else {
        drawWidth = canvas.height * aspectRatio;
      }
      
      const x = (canvas.width - drawWidth) / 2;
      const y = (canvas.height - drawHeight) / 2;
      
      ctx!.drawImage(img, x, y, drawWidth, drawHeight);
      setSignatureData(canvas.toDataURL());
    };
    
    img.src = imageData;
  };

  const generateTextSignature = () => {
    if (!typedText.trim()) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 150;
    
    // Fill with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Configure text
    ctx.fillStyle = '#000000';
    ctx.font = `48px ${textFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw text
    ctx.fillText(typedText, canvas.width / 2, canvas.height / 2);
    
    setSignatureData(canvas.toDataURL());
  };

  const handleSave = () => {
    let dataUrl = '';
    
    if (mode === 'draw') {
      if (signatureRef.current && !signatureRef.current.isEmpty()) {
        dataUrl = signatureRef.current.toDataURL();
      }
    } else if (mode === 'type') {
      generateTextSignature();
      dataUrl = signatureData;
    } else if (mode === 'upload') {
      dataUrl = signatureData;
    }
    
    if (dataUrl) {
      onSignatureComplete(dataUrl);
    }
  };

  // Generate text signature when text or font changes
  React.useEffect(() => {
    if (mode === 'type' && typedText.trim()) {
      generateTextSignature();
    }
  }, [typedText, textFont, mode]);

  const renderDrawMode = () => (
    <div className="space-y-4">
      <p className="text-text-secondary text-center">
        Draw your signature using your mouse or touch device
      </p>
      <div className="bg-white rounded-xl overflow-hidden border-2 border-border">
        <SignatureCanvas
          ref={signatureRef}
          canvasProps={{
            className: 'w-full h-48',
            style: { width: '100%', height: '192px' }
          }}
          backgroundColor="white"
          penColor="black"
          minWidth={1}
          maxWidth={3}
        />
      </div>
    </div>
  );

  const renderTypeMode = () => (
    <div className="space-y-4">
      <p className="text-text-secondary text-center">
        Type your name to create a signature
      </p>
      
      <input
        type="text"
        value={typedText}
        onChange={(e) => setTypedText(e.target.value)}
        placeholder="Enter your full name"
        className="w-full bg-background border border-border rounded-lg px-4 py-3 text-lg focus:border-primary focus:outline-none transition-colors"
        maxLength={50}
      />
      
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-secondary">Font Style</label>
        <select
          value={textFont}
          onChange={(e) => setTextFont(e.target.value)}
          className="w-full bg-background border border-border rounded-lg px-4 py-2 focus:border-primary focus:outline-none transition-colors"
        >
          {availableFonts.map((font) => (
            <option key={font.name} value={font.value}>
              {font.name}
            </option>
          ))}
        </select>
      </div>
      
      {typedText && (
        <div className="bg-white rounded-xl border-2 border-border p-8 flex items-center justify-center min-h-48">
          <span 
            style={{ fontFamily: textFont }}
            className="text-5xl text-black"
          >
            {typedText}
          </span>
        </div>
      )}
      
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );

  const renderUploadMode = () => (
    <div className="space-y-4">
      <p className="text-text-secondary text-center">
        Upload an image of your signature
      </p>
      
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
      >
        {uploadedImage ? (
          <img 
            src={uploadedImage} 
            alt="Uploaded signature" 
            className="max-h-32 mx-auto"
          />
        ) : (
          <div className="space-y-3">
            <ImageIcon className="w-12 h-12 text-text-secondary mx-auto" />
            <div>
              <p className="font-medium">Click to upload signature</p>
              <p className="text-sm text-text-secondary">PNG, JPG, or SVG up to 5MB</p>
            </div>
          </div>
        )}
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-surface rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-background transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex bg-background rounded-lg p-1 mb-6">
          {allowDraw && (
            <button
              onClick={() => setMode('draw')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors ${
                mode === 'draw' 
                  ? 'bg-primary text-background' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Pen className="w-4 h-4" />
              Draw
            </button>
          )}
          
          {allowText && (
            <button
              onClick={() => setMode('type')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors ${
                mode === 'type' 
                  ? 'bg-primary text-background' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Type className="w-4 h-4" />
              Type
            </button>
          )}
          
          {allowUpload && (
            <button
              onClick={() => setMode('upload')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors ${
                mode === 'upload' 
                  ? 'bg-primary text-background' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
          )}
        </div>

        {/* Mode Content */}
        <div className="mb-6">
          {mode === 'draw' && renderDrawMode()}
          {mode === 'type' && renderTypeMode()}
          {mode === 'upload' && renderUploadMode()}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleClear}
            className="px-4 py-2 border border-border rounded-lg hover:bg-background transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Clear
          </button>
          
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-background transition-colors"
          >
            Cancel
          </button>
          
          <button
            onClick={handleSave}
            disabled={
              (mode === 'draw' && signatureRef.current?.isEmpty()) ||
              (mode === 'type' && !typedText.trim()) ||
              (mode === 'upload' && !uploadedImage)
            }
            className="flex-1 px-4 py-2 bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            Apply Signature
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}