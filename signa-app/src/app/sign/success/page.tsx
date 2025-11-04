'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircle, Download, Mail, Home } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function SignSuccessPage() {
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    // Trigger confetti animation
    const duration = 2000;
    const animationEnd = Date.now() + duration;
    const colors = ['#00DC82', '#0096FF'];

    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min;
    };

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);
      
      confetti({
        particleCount,
        startVelocity: 30,
        spread: 360,
        origin: {
          x: randomInRange(0.1, 0.9),
          y: Math.random() - 0.2
        },
        colors: colors
      });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  const handleSendEmail = () => {
    // Mock email sending
    setTimeout(() => {
      setEmailSent(true);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-surface to-background flex items-center justify-center px-4">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ 
          type: "spring",
          stiffness: 200,
          damping: 20
        }}
        className="text-center max-w-md"
      >
        {/* Success Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ 
            delay: 0.2,
            type: "spring",
            stiffness: 200
          }}
          className="w-24 h-24 mx-auto mb-6 bg-primary/20 rounded-full flex items-center justify-center"
        >
          <CheckCircle className="w-12 h-12 text-primary" />
        </motion.div>

        {/* Success Message */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h1 className="text-3xl font-bold mb-4">Successfully Signed!</h1>
          <p className="text-text-secondary mb-8">
            Your signature has been recorded and the document is now complete.
          </p>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-3"
        >
          <button className="w-full bg-primary text-background py-3 rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 font-semibold">
            <Download className="w-5 h-5" />
            Download Document
          </button>

          {!emailSent ? (
            <button
              onClick={handleSendEmail}
              className="w-full bg-surface border border-border py-3 rounded-xl hover:bg-surface/80 transition-colors flex items-center justify-center gap-2"
            >
              <Mail className="w-5 h-5" />
              Send Copy to Email
            </button>
          ) : (
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="w-full bg-primary/10 border border-primary/20 py-3 rounded-xl flex items-center justify-center gap-2 text-primary"
            >
              <CheckCircle className="w-5 h-5" />
              Email Sent!
            </motion.div>
          )}

          <Link
            href="/"
            className="w-full bg-surface border border-border py-3 rounded-xl hover:bg-surface/80 transition-colors flex items-center justify-center gap-2"
          >
            <Home className="w-5 h-5" />
            Back to Home
          </Link>
        </motion.div>

        {/* Additional Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 p-4 bg-surface rounded-xl border border-border"
        >
          <p className="text-sm text-text-secondary">
            A copy of the signed document has been sent to all parties. 
            You can access it anytime from your email.
          </p>
        </motion.div>

        {/* Security Note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 text-xs text-text-secondary"
        >
          🔒 Your signature is securely stored and encrypted
        </motion.p>
      </motion.div>
    </div>
  );
}