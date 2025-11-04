'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Building, Calendar, Edit2, Save, X } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { useStore } from '@/lib/store';
import api from '@/lib/api';

export default function ProfilePage() {
  const { user } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    role: 'sender'
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const data = await api.getUserProfile();
      setProfile(data);
      setFormData({
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        company: data.company || 'SignaAI Inc.',
        role: data.role || 'sender'
      });
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await api.updateUserProfile({
        name: formData.name,
        phone: formData.phone,
        company: formData.company
      });
      await fetchProfile();
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update profile:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-gray-800 rounded-xl p-6 animate-pulse">
              <div className="h-8 bg-gray-700 rounded w-1/3 mb-4"></div>
              <div className="h-24 bg-gray-700 rounded mb-4"></div>
              <div className="h-64 bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-white">My Profile</h1>
            <button
              onClick={() => isEditing ? handleSave() : setIsEditing(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {isEditing ? (
                <>
                  <Save size={20} />
                  Save Changes
                </>
              ) : (
                <>
                  <Edit2 size={20} />
                  Edit Profile
                </>
              )}
            </button>
          </div>

          <div className="bg-gray-800 rounded-xl p-6">
            {/* Profile Header */}
            <div className="flex items-center mb-8">
              <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-3xl font-bold">
                {formData.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="ml-6">
                <h2 className="text-2xl font-bold text-white">{formData.name}</h2>
                <p className="text-gray-400">{formData.email}</p>
                <span className="inline-block mt-2 px-3 py-1 bg-blue-600 text-white text-sm rounded-full">
                  {formData.role === 'sender' ? 'Document Sender' : 'Document Signer'}
                </span>
              </div>
            </div>

            {/* Profile Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center gap-2 text-gray-400 mb-2">
                  <User size={18} />
                  Full Name
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
                  />
                ) : (
                  <p className="text-white text-lg">{formData.name}</p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-gray-400 mb-2">
                  <Mail size={18} />
                  Email Address
                </label>
                {isEditing ? (
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
                  />
                ) : (
                  <p className="text-white text-lg">{formData.email}</p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-gray-400 mb-2">
                  <Phone size={18} />
                  Phone Number
                </label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
                  />
                ) : (
                  <p className="text-white text-lg">{formData.phone}</p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-gray-400 mb-2">
                  <Building size={18} />
                  Company
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
                  />
                ) : (
                  <p className="text-white text-lg">{formData.company}</p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-gray-400 mb-2">
                  <Calendar size={18} />
                  Member Since
                </label>
                <p className="text-white text-lg">January 2025</p>
              </div>

              <div>
                <label className="text-gray-400 mb-2 block">Account Type</label>
                <p className="text-white text-lg">Pro Account</p>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-8 pt-8 border-t border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Activity Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-500">{profile?.stats?.totalDocuments || 0}</p>
                  <p className="text-gray-400 text-sm">Documents Sent</p>
                </div>
                <div className="bg-gray-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-500">{profile?.stats?.signedDocuments || 0}</p>
                  <p className="text-gray-400 text-sm">Completed</p>
                </div>
                <div className="bg-gray-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-500">{profile?.stats?.pendingDocuments || 0}</p>
                  <p className="text-gray-400 text-sm">Pending</p>
                </div>
                <div className="bg-gray-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-purple-500">{profile?.stats?.successRate || 0}%</p>
                  <p className="text-gray-400 text-sm">Success Rate</p>
                </div>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-gray-800 rounded-xl p-6 mt-6">
            <h3 className="text-lg font-semibold text-white mb-4">Account Settings</h3>
            <div className="space-y-3">
              <button className="w-full text-left bg-gray-700 text-white px-4 py-3 rounded-lg hover:bg-gray-600 transition-colors">
                Change Password
              </button>
              <button className="w-full text-left bg-gray-700 text-white px-4 py-3 rounded-lg hover:bg-gray-600 transition-colors">
                Download My Data
              </button>
              <button className="w-full text-left bg-red-600 bg-opacity-20 text-red-500 px-4 py-3 rounded-lg hover:bg-red-600 hover:bg-opacity-30 transition-colors">
                Delete Account
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}