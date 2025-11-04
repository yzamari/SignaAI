'use client';

import React from 'react';
import { FileText, Users, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Document } from '@/lib/store';
import { motion } from 'framer-motion';

interface DocumentCardProps {
  document: Document;
  className?: string;
}

export default function DocumentCard({ document, className = '' }: DocumentCardProps) {
  const getStatusIcon = () => {
    switch (document.status) {
      case 'signed':
        return <CheckCircle className="w-5 h-5 text-primary" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-danger" />;
      case 'expired':
        return <AlertCircle className="w-5 h-5 text-warning" />;
      default:
        return <Clock className="w-5 h-5 text-info" />;
    }
  };

  const getStatusColor = () => {
    switch (document.status) {
      case 'signed':
        return 'text-primary border-primary/20 bg-primary/10';
      case 'rejected':
        return 'text-danger border-danger/20 bg-danger/10';
      case 'expired':
        return 'text-warning border-warning/20 bg-warning/10';
      default:
        return 'text-info border-info/20 bg-info/10';
    }
  };

  const signedCount = document.signers.filter(s => s.status === 'signed').length;
  const totalSigners = document.signers.length;

  return (
    <div className={`bg-surface rounded-2xl p-6 border border-border ${className}`}>
      {/* Document Preview */}
      <div className="aspect-[3/4] bg-gradient-to-br from-surface to-background rounded-xl mb-4 flex items-center justify-center overflow-hidden">
        {document.preview ? (
          <img 
            src={document.preview} 
            alt={document.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <FileText className="w-16 h-16 text-text-secondary/50" />
        )}
      </div>

      {/* Document Info */}
      <div className="space-y-3">
        <h3 className="font-semibold text-lg truncate">{document.title}</h3>
        
        {/* Status Badge */}
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${getStatusColor()}`}>
          {getStatusIcon()}
          <span className="capitalize">{document.status}</span>
        </div>

        {/* Signers Progress */}
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Users className="w-4 h-4" />
          <span>{signedCount} of {totalSigners} signed</span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(signedCount / totalSigners) * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>

        {/* Date */}
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Clock className="w-3 h-3" />
          <span>{new Date(document.uploadedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}