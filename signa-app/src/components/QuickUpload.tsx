'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';

interface QuickUploadProps {
  onUpload: (files: File[]) => void;
  multiple?: boolean;
  maxSize?: number;
  accept?: Record<string, string[]>;
  className?: string;
}

export default function QuickUpload({
  onUpload,
  multiple = false,
  maxSize = 50 * 1024 * 1024, // 50MB
  accept = {
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'image/*': ['.png', '.jpg', '.jpeg']
  },
  className = ''
}: QuickUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      // Handle rejected files
      console.error('Rejected files:', rejectedFiles);
    }

    setFiles(prev => multiple ? [...prev, ...acceptedFiles] : acceptedFiles);
    
    // Simulate upload
    acceptedFiles.forEach((file) => {
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          const current = prev[file.name] || 0;
          if (current >= 100) {
            clearInterval(interval);
            return prev;
          }
          return { ...prev, [file.name]: Math.min(current + 10, 100) };
        });
      }, 200);
    });

    // Call parent handler
    setTimeout(() => {
      onUpload(acceptedFiles);
    }, 2000);
  }, [multiple, onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple,
    maxSize,
    accept
  });

  const removeFile = (fileName: string) => {
    setFiles(prev => prev.filter(f => f.name !== fileName));
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[fileName];
      return newProgress;
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className={className}>
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer
          ${isDragActive 
            ? 'border-primary bg-primary/10 scale-105' 
            : 'border-border hover:border-primary/50 hover:bg-surface'
          }
        `}
      >
        <input {...getInputProps()} />
        
        <div className="text-center">
          <motion.div
            animate={{
              y: isDragActive ? -10 : 0,
              scale: isDragActive ? 1.1 : 1
            }}
            transition={{ type: 'spring', stiffness: 300 }}
            className="mx-auto w-16 h-16 mb-4 rounded-full bg-primary/20 flex items-center justify-center"
          >
            <Upload className="w-8 h-8 text-primary" />
          </motion.div>

          <h3 className="text-lg font-semibold mb-2">
            {isDragActive ? 'Drop your files here' : 'Drag & drop files here'}
          </h3>
          
          <p className="text-sm text-text-secondary mb-4">
            or <span className="text-primary underline">browse</span> to choose files
          </p>

          <p className="text-xs text-text-secondary">
            Supported: PDF, Word, Images • Max {maxSize / 1024 / 1024}MB
          </p>
        </div>
      </div>

      {/* Uploaded Files */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mt-4 space-y-2"
          >
            {files.map((file) => {
              const progress = uploadProgress[file.name] || 0;
              const isComplete = progress === 100;
              
              return (
                <motion.div
                  key={file.name}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-surface rounded-xl p-4 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <File className="w-5 h-5 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file.name}</p>
                    <p className="text-sm text-text-secondary">{formatFileSize(file.size)}</p>
                  </div>

                  {!isComplete ? (
                    <div className="w-24">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-background rounded-full h-1.5 overflow-hidden">
                          <motion.div
                            className="h-full bg-primary rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                        <span className="text-xs text-text-secondary">{progress}%</span>
                      </div>
                    </div>
                  ) : (
                    <CheckCircle className="w-5 h-5 text-primary" />
                  )}

                  <button
                    onClick={() => removeFile(file.name)}
                    className="p-1 hover:bg-danger/10 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 text-danger" />
                  </button>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}