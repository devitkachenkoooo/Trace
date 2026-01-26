'use client';

import { cn } from '@/lib/utils';
import type { Attachment } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ChevronLeft, ChevronRight, Clock, Download, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ImageModalProps {
  isOpen: boolean;
  images: Attachment[];
  initialIndex: number;
  onClose: () => void;
}

export function ImageModal({ isOpen, images, initialIndex, onClose }: ImageModalProps) {
  const [mounted, setMounted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [direction, setDirection] = useState(0);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Скидаємо помилку при зміні картинки
  useEffect(() => {
    setHasError(false);
  }, [currentIndex]);

  // Sync index when initialIndex changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setDirection(0);
    }
    // currentIndex видалено звідси, щоб Biome не сварився
  }, [isOpen, initialIndex]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => {
      if (prev < images.length - 1) {
        setDirection(1);
        return prev + 1;
      }
      return prev;
    });
  }, [images.length]);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => {
      if (prev > 0) {
        setDirection(-1);
        return prev - 1;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, handleNext, handlePrev]);

  if (!mounted) return null;

  const currentImage = images[currentIndex];
  if (!currentImage) return null;

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : direction < 0 ? -300 : 0,
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : direction > 0 ? -300 : 0,
      opacity: 0,
      scale: 0.95,
    }),
  };

  const modalContent = (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex flex-col bg-black/95 backdrop-blur-md"
          onClick={onClose}
        >
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 h-20 px-6 flex items-center justify-between z-[10000] bg-gradient-to-b from-black/50 to-transparent">
            <div className="flex flex-col text-white">
              <span className="font-medium truncate max-w-[200px] sm:max-w-md text-sm">
                {currentImage.metadata?.name || 'Image'}
              </span>
              <span className="text-white/40 text-[11px] uppercase tracking-wider">
                {currentIndex + 1} of {images.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {!hasError && (
                <a
                  href={currentImage.url}
                  download={currentImage.metadata?.name}
                  onClick={(e) => e.stopPropagation()}
                  className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all"
                >
                  <Download size={20} />
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all shadow-xl"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="relative flex-1 flex items-center justify-center p-4">
            {currentIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-4 z-[10001] p-3 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all backdrop-blur-sm border border-white/10"
              >
                <ChevronLeft size={28} />
              </button>
            )}

            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.div
                key={currentIndex}
                custom={direction}
                variants={variants}
                initial={direction === 0 ? { opacity: 0, scale: 0.9 } : 'enter'}
                animate="center"
                exit="exit"
                transition={{
                  x: { type: 'spring', stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
                className="relative w-full h-full flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                {!hasError ? (
                  <Image
                    src={currentImage.url}
                    alt="Gallery view"
                    fill
                    className="object-contain select-none"
                    priority
                    unoptimized
                    onError={() => setHasError(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 text-white/50 bg-white/5 p-12 rounded-3xl border border-white/10 backdrop-blur-sm">
                    <div className="relative">
                      <Clock className="w-16 h-16 opacity-20" />
                      <AlertCircle className="w-8 h-8 text-red-500 absolute -bottom-1 -right-1" />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-medium text-white/80">Media unavailable</p>
                      <p className="text-sm text-white/40">This file has expired or was removed</p>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {currentIndex < images.length - 1 && (
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-4 z-[10001] p-3 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all backdrop-blur-sm border border-white/10"
              >
                <ChevronRight size={28} />
              </button>
            )}
          </div>

          {/* Footer Indicators */}
          <div className="h-20 px-6 flex items-center justify-center gap-2 z-[10000]">
            {images.length > 1 &&
              images.map((img, idx) => (
                <div
                  key={img.id}
                  className={cn(
                    'h-1.5 transition-all duration-300 rounded-full',
                    idx === currentIndex ? 'w-8 bg-blue-500' : 'w-1.5 bg-white/20',
                  )}
                />
              ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}