'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Zap, Shield, Smartphone, ChevronRight } from 'lucide-react';

export default function LandingPage() {
  const features = [
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Get documents signed in under 30 seconds'
    },
    {
      icon: Shield,
      title: 'Legally Binding',
      description: 'Fully compliant with Israeli electronic signature law'
    },
    {
      icon: Smartphone,
      title: 'Mobile First',
      description: 'Designed for one-thumb operation on any device'
    }
  ];

  return (
    <div className="min-h-screen" style={{ 
      background: 'linear-gradient(135deg, var(--color-background), var(--color-surface), var(--color-background))' 
    }}>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b" style={{ 
        borderColor: 'var(--color-border)' 
      }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <span className="gradient-text font-bold text-2xl">SignaAI</span>
            </div>
            <div className="flex items-center gap-4">
              <Link 
                href="/login" 
                className="transition-colors hover:opacity-80" 
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Login
              </Link>
              <Link 
                href="/signup" 
                className="px-4 py-2 rounded-lg font-medium transition-all hover:opacity-90 hover:scale-105"
                style={{ 
                  backgroundColor: 'var(--color-primary)', 
                  color: 'var(--color-background)' 
                }}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold mb-6">
              <span className="gradient-text">Swipe to Sign</span>
            </h1>
            <p 
              className="text-xl max-w-2xl mx-auto mb-10"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              The easiest way to get documents signed. No forms, no hassle. 
              Just swipe right to approve, left to reject. It&apos;s that simple.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link 
              href="/signup" 
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:scale-105"
              style={{
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-background)'
              }}
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link 
              href="/demo" 
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-lg border transition-all hover:opacity-80"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            >
              Watch Demo
            </Link>
          </motion.div>
        </div>

        {/* Swipe Demo Animation */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="max-w-md mx-auto mt-20"
        >
          <div className="relative">
            <div 
              className="absolute inset-0 blur-3xl" 
              style={{
                background: `linear-gradient(to right, 
                  color-mix(in srgb, var(--color-primary) 20%, transparent), 
                  color-mix(in srgb, var(--color-info) 20%, transparent)
                )`
              }}
            />
            <motion.div
              animate={{ 
                x: [0, 50, -50, 0],
                rotate: [0, 5, -5, 0]
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                repeatType: "loop",
                ease: "easeInOut"
              }}
              className="relative rounded-2xl p-6 border shadow-2xl"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)'
              }}
            >
              <div 
                className="aspect-[3/4] rounded-xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, var(--color-surface), var(--color-background))`
                }}
              >
                <div className="text-center">
                  <div 
                    className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-primary) 20%, transparent)'
                    }}
                  >
                    <Zap className="w-10 h-10" style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <p className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                    Contract.pdf
                  </p>
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    Swipe to sign
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 + index * 0.1 }}
                className="rounded-2xl p-8 border transition-all hover:scale-105 cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary) 50%, transparent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                }}
              >
                <div 
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-primary) 20%, transparent)'
                  }}
                >
                  <feature.icon className="w-7 h-7" style={{ color: 'var(--color-primary)' }} />
                </div>
                <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                  {feature.title}
                </h3>
                <p style={{ color: 'var(--color-text-secondary)' }}>
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1 }}
            className="rounded-3xl p-12 border"
            style={{
              background: `linear-gradient(to right, 
                color-mix(in srgb, var(--color-primary) 20%, transparent), 
                color-mix(in srgb, var(--color-info) 20%, transparent)
              )`,
              borderColor: 'var(--color-border)'
            }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--color-text)' }}>
              Ready to simplify signatures?
            </h2>
            <p className="text-lg mb-8" style={{ color: 'var(--color-text-secondary)' }}>
              Join thousands of professionals who save hours every week with SignaAI
            </p>
            <Link 
              href="/signup" 
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:scale-105"
              style={{
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-background)'
              }}
            >
              Start Your Free Trial
              <ChevronRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 px-4" style={{ borderColor: 'var(--color-border)' }}>
        <div className="max-w-7xl mx-auto text-center" style={{ color: 'var(--color-text-secondary)' }}>
          <p>&copy; 2025 SignaAI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}