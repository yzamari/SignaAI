'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Phone, ArrowRight, Eye, EyeOff, Check } from 'lucide-react';
import { useStore } from '@/lib/store';
import api from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const { setUser } = useStore();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'sender' as 'sender' | 'signer'
  });

  const passwordRequirements = [
    { met: formData.password.length >= 8, text: 'At least 8 characters' },
    { met: /[A-Z]/.test(formData.password), text: 'One uppercase letter' },
    { met: /[a-z]/.test(formData.password), text: 'One lowercase letter' },
    { met: /[0-9]/.test(formData.password), text: 'One number' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await api.register(formData);
      
      // Check if registration was successful and we have a token
      if (response && response.token) {
        // Token is already set in api.register
        // Set user in store if available
        if (response.user) {
          setUser(response.user);
        }
        // Redirect to dashboard
        router.push('/dashboard');
      } else {
        console.error('Registration response missing token:', response);
        alert('Registration completed but login failed. Please try logging in manually.');
      }
    } catch (error) {
      console.error('Registration error:', error);
      alert(error instanceof Error ? error.message : 'Registration failed');
    }
  };

  const inputStyle = {
    backgroundColor: 'var(--color-surface)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text)'
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'var(--color-primary)';
    e.target.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent)';
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'var(--color-border)';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center px-4"
      style={{ 
        background: 'linear-gradient(135deg, var(--color-background), var(--color-surface), var(--color-background))' 
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="gradient-text font-bold text-3xl">SignaAI</h1>
          </Link>
          <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>
            Create your account
          </p>
        </div>

        {/* Role Selector */}
        <div 
          className="rounded-2xl p-1 mb-6 flex"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <button
            type="button"
            onClick={() => setFormData({ ...formData, role: 'sender' })}
            className="flex-1 py-2 px-4 rounded-xl transition-all font-medium"
            style={{
              backgroundColor: formData.role === 'sender' ? 'var(--color-primary)' : 'transparent',
              color: formData.role === 'sender' ? 'var(--color-background)' : 'var(--color-text-secondary)'
            }}
          >
            I send documents
          </button>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, role: 'signer' })}
            className="flex-1 py-2 px-4 rounded-xl transition-all font-medium"
            style={{
              backgroundColor: formData.role === 'signer' ? 'var(--color-primary)' : 'transparent',
              color: formData.role === 'signer' ? 'var(--color-background)' : 'var(--color-text-secondary)'
            }}
          >
            I sign documents
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Input */}
          <div className="relative">
            <User 
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" 
              style={{ color: 'var(--color-text-secondary)' }}
            />
            <input
              type="text"
              placeholder="Full Name"
              autoComplete="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border rounded-xl pl-12 pr-4 py-3 transition-colors focus:outline-none"
              style={inputStyle}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              required
            />
          </div>

          {/* Email Input */}
          <div className="relative">
            <Mail 
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" 
              style={{ color: 'var(--color-text-secondary)' }}
            />
            <input
              type="email"
              placeholder="Email Address"
              autoComplete="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full border rounded-xl pl-12 pr-4 py-3 transition-colors focus:outline-none"
              style={inputStyle}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              required
            />
          </div>

          {/* Phone Input */}
          <div className="relative">
            <Phone 
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" 
              style={{ color: 'var(--color-text-secondary)' }}
            />
            <input
              type="tel"
              placeholder="Phone Number"
              autoComplete="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full border rounded-xl pl-12 pr-4 py-3 transition-colors focus:outline-none"
              style={inputStyle}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            />
          </div>

          {/* Password Input */}
          <div className="relative">
            <Lock 
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" 
              style={{ color: 'var(--color-text-secondary)' }}
            />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              autoComplete="new-password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full border rounded-xl pl-12 pr-12 py-3 transition-colors focus:outline-none"
              style={inputStyle}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 hover:opacity-80"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {/* Password Requirements */}
          {formData.password && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="rounded-xl p-3 space-y-1"
              style={{ 
                backgroundColor: 'color-mix(in srgb, var(--color-surface) 50%, transparent)' 
              }}
            >
              {passwordRequirements.map((req, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <Check 
                    className="w-4 h-4" 
                    style={{ 
                      color: req.met ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-text-secondary) 50%, transparent)' 
                    }} 
                  />
                  <span 
                    style={{ 
                      color: req.met ? 'var(--color-text)' : 'color-mix(in srgb, var(--color-text-secondary) 50%, transparent)' 
                    }}
                  >
                    {req.text}
                  </span>
                </div>
              ))}
            </motion.div>
          )}

          {/* Terms */}
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="terms"
              className="mt-1 w-4 h-4 rounded border"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                accentColor: 'var(--color-primary)'
              }}
              required
            />
            <label htmlFor="terms" className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              I agree to the{' '}
              <Link href="/terms" className="hover:underline" style={{ color: 'var(--color-primary)' }}>
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="hover:underline" style={{ color: 'var(--color-primary)' }}>
                Privacy Policy
              </Link>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 group transition-all hover:scale-105"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-background)'
            }}
          >
            Create Account
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        {/* Login Link */}
        <p className="text-center mt-6" style={{ color: 'var(--color-text-secondary)' }}>
          Already have an account?{' '}
          <Link href="/login" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}