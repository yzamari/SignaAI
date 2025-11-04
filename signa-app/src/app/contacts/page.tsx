'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Plus,
  Search,
  Mail,
  Phone,
  Edit2,
  Trash2,
  Save,
  X
} from 'lucide-react';
import Navigation from '@/components/Navigation';

interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role?: string;
  createdAt: Date;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [newContact, setNewContact] = useState({
    name: '',
    email: '',
    phone: '',
    role: ''
  });

  // Load contacts from localStorage (temporary storage)
  useEffect(() => {
    const savedContacts = localStorage.getItem('signaai_contacts');
    if (savedContacts) {
      setContacts(JSON.parse(savedContacts));
    }
  }, []);

  // Save contacts to localStorage
  const saveContacts = (updatedContacts: Contact[]) => {
    localStorage.setItem('signaai_contacts', JSON.stringify(updatedContacts));
    setContacts(updatedContacts);
  };

  // Add new contact
  const handleAddContact = () => {
    if (newContact.name && newContact.email) {
      const contact: Contact = {
        id: `contact-${Date.now()}`,
        ...newContact,
        createdAt: new Date()
      };
      saveContacts([...contacts, contact]);
      setNewContact({ name: '', email: '', phone: '', role: '' });
      setIsAddingContact(false);
    }
  };

  // Delete contact
  const handleDeleteContact = (id: string) => {
    saveContacts(contacts.filter(c => c.id !== id));
  };

  // Update contact
  const handleUpdateContact = (id: string, updates: Partial<Contact>) => {
    saveContacts(contacts.map(c => c.id === id ? { ...c, ...updates } : c));
    setEditingContact(null);
  };

  // Filter contacts based on search
  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.phone?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <Navigation />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Contacts</h1>
          <p className="text-muted-foreground">Manage your signing contacts</p>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            onClick={() => setIsAddingContact(true)}
            className="ml-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Contact
          </button>
        </div>

        {/* Add Contact Form */}
        {isAddingContact && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-card border rounded-lg"
          >
            <h3 className="font-semibold mb-4">Add New Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input
                type="text"
                placeholder="Name *"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                className="px-3 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="email"
                placeholder="Email *"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                className="px-3 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="tel"
                placeholder="Phone"
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                className="px-3 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="text"
                placeholder="Role"
                value={newContact.role}
                onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                className="px-3 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setIsAddingContact(false)}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddContact}
                disabled={!newContact.name || !newContact.email}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Contact
              </button>
            </div>
          </motion.div>
        )}

        {/* Contacts List */}
        {filteredContacts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredContacts.map((contact) => (
              <motion.div
                key={contact.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-card border rounded-lg hover:shadow-lg transition-shadow"
              >
                {editingContact === contact.id ? (
                  // Edit Mode
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(e) => handleUpdateContact(contact.id, { name: e.target.value })}
                      className="w-full px-2 py-1 bg-background border rounded"
                    />
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) => handleUpdateContact(contact.id, { email: e.target.value })}
                      className="w-full px-2 py-1 bg-background border rounded"
                    />
                    <input
                      type="tel"
                      value={contact.phone}
                      onChange={(e) => handleUpdateContact(contact.id, { phone: e.target.value })}
                      className="w-full px-2 py-1 bg-background border rounded"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingContact(null)}
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingContact(null)}
                        className="p-1 text-green-600 hover:text-green-700"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                          <Users className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{contact.name}</h3>
                          {contact.role && (
                            <p className="text-sm text-muted-foreground">{contact.role}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setEditingContact(contact.id)}
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteContact(contact.id)}
                          className="p-1 text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="w-4 h-4" />
                        <span>{contact.email}</span>
                      </div>
                      {contact.phone && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="w-4 h-4" />
                          <span>{contact.phone}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No contacts yet</h3>
            <p className="text-muted-foreground">
              {searchQuery ? 'No contacts match your search' : 'Add your first contact to get started'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}