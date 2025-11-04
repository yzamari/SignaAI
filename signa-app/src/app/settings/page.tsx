'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Bell, Lock, Globe, CreditCard, Shield, 
  ChevronRight, ToggleLeft, Mail, MessageSquare,
  Smartphone, Key, Languages, Clock, Loader, 
  CheckCircle, XCircle
} from 'lucide-react';
import Navigation from '@/components/Navigation';
import { api } from '@/lib/api';

interface UserSettings {
  email_notifications: boolean;
  sms_notifications: boolean;
  push_notifications: boolean;
  document_reminders: boolean;
  language: string;
  timezone: string;
  date_format: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({
    email_notifications: true,
    sms_notifications: false,
    push_notifications: true,
    document_reminders: true,
    language: 'en',
    timezone: 'UTC-5:00',
    date_format: 'MM/DD/YYYY'
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);

  // Fetch user settings from API
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        setError(null);
        const userSettings = await api.getUserSettings();
        
        setSettings({
          email_notifications: userSettings.email_notifications ?? true,
          sms_notifications: userSettings.sms_notifications ?? false,
          push_notifications: userSettings.push_notifications ?? true,
          document_reminders: userSettings.document_reminders ?? true,
          language: userSettings.language ?? 'en',
          timezone: userSettings.timezone ?? 'UTC-5:00',
          date_format: userSettings.date_format ?? 'MM/DD/YYYY'
        });
      } catch (err) {
        console.error('Failed to fetch settings:', err);
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // Save settings to API
  const saveSettings = async (updatedSettings: Partial<UserSettings>) => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);
      
      const newSettings = { ...settings, ...updatedSettings };
      await api.updateUserSettings(newSettings);
      
      setSettings(newSettings);
      setSuccessMessage('Settings saved successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Handle notification toggle
  const handleNotificationToggle = (key: keyof Pick<UserSettings, 'email_notifications' | 'sms_notifications' | 'push_notifications' | 'document_reminders'>) => {
    const updatedValue = !settings[key];
    saveSettings({ [key]: updatedValue });
  };

  // Handle preference change
  const handlePreferenceChange = (key: keyof Pick<UserSettings, 'language' | 'timezone' | 'date_format'>, value: string) => {
    saveSettings({ [key]: value });
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-white">Settings</h1>
            {saving && (
              <div className="flex items-center gap-2 text-blue-500">
                <Loader className="animate-spin" size={16} />
                <span className="text-sm">Saving...</span>
              </div>
            )}
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="bg-green-600 bg-opacity-20 border border-green-500 rounded-xl p-4 mb-6 flex items-center gap-3">
              <CheckCircle className="text-green-500" size={20} />
              <span className="text-green-500">{successMessage}</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-600 bg-opacity-20 border border-red-500 rounded-xl p-4 mb-6 flex items-center gap-3">
              <XCircle className="text-red-500" size={20} />
              <span className="text-red-500">{error}</span>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="bg-gray-800 rounded-xl p-12 text-center mb-6">
              <Loader className="text-blue-500 mx-auto mb-4 animate-spin" size={48} />
              <h3 className="text-xl font-semibold text-white mb-2">Loading settings...</h3>
              <p className="text-gray-400">Please wait while we fetch your preferences</p>
            </div>
          )}

          {/* Settings Content */}
          {!loading && (
            <>
              {/* Notifications */}
              <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <Bell className="text-blue-500" size={24} />
              <h2 className="text-xl font-semibold text-white">Notifications</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail size={20} className="text-gray-400" />
                  <div>
                    <p className="text-white">Email Notifications</p>
                    <p className="text-gray-400 text-sm">Receive updates via email</p>
                  </div>
                </div>
                <button
                  onClick={() => handleNotificationToggle('email_notifications')}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.email_notifications ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.email_notifications ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare size={20} className="text-gray-400" />
                  <div>
                    <p className="text-white">SMS Notifications</p>
                    <p className="text-gray-400 text-sm">Get text message alerts</p>
                  </div>
                </div>
                <button
                  onClick={() => handleNotificationToggle('sms_notifications')}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.sms_notifications ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.sms_notifications ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Smartphone size={20} className="text-gray-400" />
                  <div>
                    <p className="text-white">Push Notifications</p>
                    <p className="text-gray-400 text-sm">Mobile app notifications</p>
                  </div>
                </div>
                <button
                  onClick={() => handleNotificationToggle('push_notifications')}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.push_notifications ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.push_notifications ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock size={20} className="text-gray-400" />
                  <div>
                    <p className="text-white">Document Reminders</p>
                    <p className="text-gray-400 text-sm">Automatic follow-up reminders</p>
                  </div>
                </div>
                <button
                  onClick={() => handleNotificationToggle('document_reminders')}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.document_reminders ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.document_reminders ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="text-green-500" size={24} />
              <h2 className="text-xl font-semibold text-white">Security</h2>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => setShowPasswordModal(true)}
                className="w-full flex items-center justify-between bg-gray-700 text-white px-4 py-3 rounded-lg hover:bg-gray-600 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Lock size={20} />
                  <span>Change Password</span>
                </div>
                <ChevronRight size={20} className="text-gray-400" />
              </button>

              <button 
                onClick={() => setShow2FAModal(true)}
                className="w-full flex items-center justify-between bg-gray-700 text-white px-4 py-3 rounded-lg hover:bg-gray-600 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Shield size={20} />
                  <span>Two-Factor Authentication</span>
                </div>
                <ChevronRight size={20} className="text-gray-400" />
              </button>

              <button className="w-full flex items-center justify-between bg-gray-700 text-white px-4 py-3 rounded-lg hover:bg-gray-600 transition-colors">
                <div className="flex items-center gap-3">
                  <Key size={20} />
                  <span>API Keys</span>
                </div>
                <ChevronRight size={20} className="text-gray-400" />
              </button>
            </div>
          </div>

          {/* Preferences */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <Globe className="text-purple-500" size={24} />
              <h2 className="text-xl font-semibold text-white">Preferences</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-gray-400 mb-2">
                  <Languages size={18} />
                  Language
                </label>
                <select 
                  value={settings.language}
                  onChange={(e) => handlePreferenceChange('language', e.target.value)}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
                >
                  <option value="en">English (US)</option>
                  <option value="he">Hebrew (עברית)</option>
                  <option value="es">Spanish (Español)</option>
                  <option value="fr">French (Français)</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-gray-400 mb-2">
                  <Clock size={18} />
                  Time Zone
                </label>
                <select 
                  value={settings.timezone}
                  onChange={(e) => handlePreferenceChange('timezone', e.target.value)}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
                >
                  <option value="UTC-5:00">UTC-5:00 Eastern Time (New York)</option>
                  <option value="UTC+2:00">UTC+2:00 Israel Time (Jerusalem)</option>
                  <option value="UTC-8:00">UTC-8:00 Pacific Time (Los Angeles)</option>
                  <option value="UTC+0:00">UTC+0:00 Greenwich Mean Time (London)</option>
                </select>
              </div>

              <div>
                <label className="text-gray-400 mb-2 block">Date Format</label>
                <select 
                  value={settings.date_format}
                  onChange={(e) => handlePreferenceChange('date_format', e.target.value)}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
                >
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </div>
            </div>
          </div>

          {/* Billing */}
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <CreditCard className="text-yellow-500" size={24} />
                <h2 className="text-xl font-semibold text-white">Billing & Subscription</h2>
              </div>
              <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                Upgrade Plan
              </button>
            </div>

            <div className="bg-gray-700 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">Pro Plan</h3>
                  <p className="text-gray-400">$29/month • Renews on Feb 1, 2025</p>
                </div>
                <span className="bg-green-600 text-white px-2 py-1 rounded text-sm">Active</span>
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-white">47/100</p>
                  <p className="text-gray-400 text-sm">Documents</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">8/10</p>
                  <p className="text-gray-400 text-sm">Team Members</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">∞</p>
                  <p className="text-gray-400 text-sm">Signatures</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="text-white mb-3">Payment Method</h4>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-gradient-to-r from-blue-600 to-blue-400 px-3 py-1 rounded text-white font-bold">
                    VISA
                  </div>
                  <div>
                    <p className="text-white">•••• •••• •••• 4242</p>
                    <p className="text-gray-400 text-sm">Expires 12/25</p>
                  </div>
                </div>
                <button className="text-blue-500 hover:text-blue-400">Update</button>
              </div>
            </div>
          </div>
          </>
          )}

        </motion.div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-900 rounded-xl p-6 max-w-md w-full"
          >
            <h2 className="text-xl font-bold text-white mb-4">Change Password</h2>
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm">Current Password</label>
                <input type="password" className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg mt-1" />
              </div>
              <div>
                <label className="text-gray-400 text-sm">New Password</label>
                <input type="password" className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg mt-1" />
              </div>
              <div>
                <label className="text-gray-400 text-sm">Confirm New Password</label>
                <input type="password" className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Update Password
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}