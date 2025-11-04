'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Home, 
  FileText, 
  Users, 
  BarChart3, 
  Settings, 
  Bell,
  User,
  LogOut,
  Menu,
  X,
  Plus
} from 'lucide-react';
import { useStore } from '@/lib/store';

export default function Navigation() {
  const pathname = usePathname();
  const { user, sidebarOpen, toggleSidebar, notifications } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  
  const unreadCount = notifications.filter(n => !n.read).length;

  const navItems = [
    { href: '/dashboard', icon: Home, label: 'Dashboard' },
    { href: '/documents', icon: FileText, label: 'Documents' },
    { href: '/contacts', icon: Users, label: 'Contacts' },
    { href: '/analytics', icon: BarChart3, label: 'Analytics' },
    { href: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <>
      {/* Mobile Header */}
      <div 
        className="lg:hidden fixed top-0 left-0 right-0 h-16 glass border-b z-50"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center justify-between h-full px-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" style={{ color: 'var(--color-text)' }} />
            ) : (
              <Menu className="w-5 h-5" style={{ color: 'var(--color-text)' }} />
            )}
          </button>
          
          <Link href="/" className="gradient-text font-bold text-xl">
            SignaAI
          </Link>

          <div className="flex items-center gap-2">
            <button 
              className="relative p-2 rounded-lg transition-colors hover:opacity-80"
              style={{ backgroundColor: 'var(--color-surface)' }}
            >
              <Bell className="w-5 h-5" style={{ color: 'var(--color-text)' }} />
              {unreadCount > 0 && (
                <span 
                  className="absolute top-1 right-1 w-2 h-2 rounded-full"
                  style={{ backgroundColor: 'var(--color-danger)' }}
                />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="lg:hidden fixed inset-0 z-40 pt-16"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <nav className="p-4 space-y-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 p-3 rounded-xl transition-all"
                  style={{
                    backgroundColor: pathname === item.href 
                      ? 'color-mix(in srgb, var(--color-primary) 20%, transparent)' 
                      : 'transparent',
                    color: pathname === item.href 
                      ? 'var(--color-primary)' 
                      : 'var(--color-text)'
                  }}
                  onMouseEnter={(e) => {
                    if (pathname !== item.href) {
                      e.currentTarget.style.backgroundColor = 'var(--color-surface)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (pathname !== item.href) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            <div 
              className="absolute bottom-0 left-0 right-0 p-4 border-t"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 20%, transparent)' }}
                >
                  <User className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <p className="font-medium" style={{ color: 'var(--color-text)' }}>
                    {user?.name || 'Guest'}
                  </p>
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {user?.email}
                  </p>
                </div>
              </div>
              <button 
                className="flex items-center gap-2 p-2 rounded-lg transition-colors w-full"
                style={{ 
                  color: 'var(--color-danger)',
                  backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)'
                }}
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <motion.div
          initial={false}
          animate={{ width: sidebarOpen ? 240 : 72 }}
          className="fixed left-0 top-0 bottom-0 border-r z-40"
          style={{ 
            backgroundColor: 'var(--color-surface)', 
            borderColor: 'var(--color-border)' 
          }}
        >
          <div className="h-full flex flex-col">
            {/* Logo */}
            <div 
              className="h-16 flex items-center px-6 border-b"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <Link href="/" className="gradient-text font-bold text-xl">
                {sidebarOpen ? 'SignaAI' : 'S'}
              </Link>
            </div>

            {/* Nav Items */}
            <nav className="flex-1 p-4 space-y-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 p-3 rounded-xl transition-all"
                  style={{
                    backgroundColor: pathname === item.href 
                      ? 'color-mix(in srgb, var(--color-primary) 20%, transparent)' 
                      : 'transparent',
                    color: pathname === item.href 
                      ? 'var(--color-primary)' 
                      : 'var(--color-text)'
                  }}
                  onMouseEnter={(e) => {
                    if (pathname !== item.href) {
                      e.currentTarget.style.backgroundColor = 'var(--color-background)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (pathname !== item.href) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                  title={!sidebarOpen ? item.label : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {sidebarOpen && <span>{item.label}</span>}
                </Link>
              ))}
            </nav>

            {/* User Section */}
            <div 
              className="p-4 border-t"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {sidebarOpen ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 20%, transparent)' }}
                    >
                      <User className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--color-text)' }}>
                        {user?.name || 'Guest'}
                      </p>
                      <p className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>
                        {user?.email}
                      </p>
                    </div>
                  </div>
                  <button 
                    className="flex items-center gap-2 p-2 rounded-lg transition-colors w-full"
                    style={{ 
                      color: 'var(--color-danger)',
                      backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)'
                    }}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </>
              ) : (
                <button 
                  className="p-3 rounded-xl transition-colors w-full hover:opacity-80"
                  style={{ backgroundColor: 'var(--color-background)' }}
                  title="Profile"
                >
                  <User className="w-5 h-5" style={{ color: 'var(--color-text)' }} />
                </button>
              )}
            </div>

            {/* Toggle Button */}
            <button
              onClick={toggleSidebar}
              className="absolute -right-3 top-20 w-6 h-6 rounded-full flex items-center justify-center shadow-lg"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <motion.div
                animate={{ rotate: sidebarOpen ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <X className="w-3 h-3" style={{ color: 'var(--color-background)' }} />
              </motion.div>
            </button>
          </div>
        </motion.div>
      </div>

      {/* Floating Action Button */}
      <Link
        href="/upload"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-110 transition-transform z-30"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <Plus className="w-6 h-6" style={{ color: 'var(--color-background)' }} />
      </Link>
    </>
  );
}