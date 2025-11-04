'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, useAnimation, PanInfo, useMotionValue, useTransform } from 'framer-motion';
import { Check, X, Bookmark, Edit } from 'lucide-react';

interface SwipeCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  disabled?: boolean;
  className?: string;
  showHints?: boolean;
}

export default function SwipeCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  disabled = false,
  className = '',
  showHints = true
}: SwipeCardProps) {
  const [isActive, setIsActive] = useState(false);
  const controls = useAnimation();
  const cardRef = useRef<HTMLDivElement>(null);
  
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-30, 30]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);
  
  // Color overlays based on swipe direction
  const leftOverlay = useTransform(x, [-200, 0], [1, 0]);
  const rightOverlay = useTransform(x, [0, 200], [0, 1]);
  const upOverlay = useTransform(y, [-200, 0], [1, 0]);
  const downOverlay = useTransform(y, [0, 200], [0, 1]);

  const handleDragEnd = async (_: any, info: PanInfo) => {
    const threshold = 100;
    const velocity = info.velocity;
    
    if (Math.abs(info.offset.x) > Math.abs(info.offset.y)) {
      // Horizontal swipe
      if (info.offset.x > threshold || velocity.x > 500) {
        // Swipe right
        await controls.start({ x: 300, opacity: 0 });
        onSwipeRight?.();
      } else if (info.offset.x < -threshold || velocity.x < -500) {
        // Swipe left
        await controls.start({ x: -300, opacity: 0 });
        onSwipeLeft?.();
      } else {
        // Return to center
        controls.start({ x: 0, y: 0 });
      }
    } else {
      // Vertical swipe
      if (info.offset.y < -threshold || velocity.y < -500) {
        // Swipe up
        await controls.start({ y: -300, opacity: 0 });
        onSwipeUp?.();
      } else if (info.offset.y > threshold || velocity.y > 500) {
        // Swipe down
        await controls.start({ y: 300, opacity: 0 });
        onSwipeDown?.();
      } else {
        // Return to center
        controls.start({ x: 0, y: 0 });
      }
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <motion.div
        ref={cardRef}
        className={`swipe-card relative ${className}`}
        style={{ x, y, rotate, opacity }}
        drag={!disabled}
        dragElastic={0.2}
        dragConstraints={{ left: -200, right: 200, top: -200, bottom: 200 }}
        onDragEnd={handleDragEnd}
        animate={controls}
        onHoverStart={() => setIsActive(true)}
        onHoverEnd={() => setIsActive(false)}
        whileTap={{ scale: disabled ? 1 : 0.98 }}
      >
        {/* Swipe direction overlays */}
        <motion.div
          className="absolute inset-0 bg-danger/20 rounded-2xl pointer-events-none"
          style={{ opacity: leftOverlay }}
        >
          <div className="absolute top-8 left-8">
            <X className="w-12 h-12 text-danger" />
          </div>
        </motion.div>
        
        <motion.div
          className="absolute inset-0 bg-primary/20 rounded-2xl pointer-events-none"
          style={{ opacity: rightOverlay }}
        >
          <div className="absolute top-8 right-8">
            <Check className="w-12 h-12 text-primary" />
          </div>
        </motion.div>
        
        <motion.div
          className="absolute inset-0 bg-info/20 rounded-2xl pointer-events-none"
          style={{ opacity: upOverlay }}
        >
          <div className="absolute top-8 left-1/2 -translate-x-1/2">
            <Bookmark className="w-12 h-12 text-info" />
          </div>
        </motion.div>
        
        <motion.div
          className="absolute inset-0 bg-warning/20 rounded-2xl pointer-events-none"
          style={{ opacity: downOverlay }}
        >
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
            <Edit className="w-12 h-12 text-warning" />
          </div>
        </motion.div>

        {/* Card content */}
        {children}
      </motion.div>

      {/* Swipe hints */}
      {showHints && !disabled && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-4 -translate-y-1/2 text-danger/50">
            <X className="w-8 h-8" />
            <span className="text-xs mt-1 block">Reject</span>
          </div>
          <div className="absolute top-1/2 right-4 -translate-y-1/2 text-primary/50">
            <Check className="w-8 h-8" />
            <span className="text-xs mt-1 block">Approve</span>
          </div>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-info/50">
            <Bookmark className="w-8 h-8 mx-auto" />
            <span className="text-xs mt-1 block">Save</span>
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-warning/50">
            <Edit className="w-8 h-8 mx-auto" />
            <span className="text-xs mt-1 block">Edit</span>
          </div>
        </div>
      )}
    </div>
  );
}