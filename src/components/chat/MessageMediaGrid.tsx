'use client';

import { FileX, ImageOff, PlayCircle } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/types';
import { ImageModal } from './ImageModal';

interface MessageMediaGridProps {
  items: Attachment[];
}

const MediaPlaceholder = ({ reason = 'deleted' }: { reason?: 'deleted' | 'error' }) => {
  const Icon = reason === 'deleted' ? FileX : ImageOff;
  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 rounded-xl p-4 text-center min-h-[150px]">
      <Icon className="w-5 h-5 text-neutral-500 mb-2" />
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        {reason === 'deleted' ? 'Deleted' : 'Error'}
      </p>
    </div>
  );
};

export function MessageMediaGrid({ items }: MessageMediaGridProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  if (!items || items.length === 0) return null;

  const handleImageError = (url: string) => {
    setFailedUrls((prev) => new Set(prev).add(url));
  };

  const activeMedia = items.filter((item) => !item.isDeleted && !failedUrls.has(item.url));
  const count = items.length;

  const handleMediaClick = (index: number) => {
    const clickedItem = items[index];
    if (clickedItem.isDeleted || failedUrls.has(clickedItem.url)) return;
    const activeIndex = activeMedia.findIndex((m) => m.id === clickedItem.id);
    if (activeIndex !== -1) setSelectedIndex(activeIndex);
  };

  const modalImages = activeMedia.filter(item => item.type === 'image');

  const renderItem = (item: Attachment, index: number, isLarge = false) => {
    const isFailed = failedUrls.has(item.url) || item.isDeleted;

    return (
      <div 
        key={item.id}
        className={cn(
          "relative overflow-hidden group bg-neutral-200 dark:bg-neutral-800",
          isLarge ? "col-span-2 aspect-video" : "aspect-square"
        )}
      >
        {isFailed ? (
          <MediaPlaceholder reason={item.isDeleted ? 'deleted' : 'error'} />
        ) : (
          <button
            type="button"
            className="w-full h-full relative block"
            onClick={() => handleMediaClick(index)}
          >
            {item.type === 'video' ? (
              <div className="w-full h-full relative bg-black">
                <video src={item.url} className="w-full h-full object-cover text-white">
                  <track kind="captions" />
                </video>
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                  <PlayCircle className="w-10 h-10 text-white/80" />
                </div>
              </div>
            ) : (
              <Image
                src={item.url}
                alt=""
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
                unoptimized
                onError={() => handleImageError(item.url)}
              />
            )}
            {index === 3 && count > 4 && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white z-10">
                <span className="text-xl font-bold">+{count - 4}</span>
              </div>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div className={cn(
        "grid gap-1 overflow-hidden rounded-2xl w-[400px] max-w-full max-sm:w-[280px]",
        count === 1 ? "grid-cols-1" : "grid-cols-2"
      )}>
        {count === 1 && (
          <div 
            className="relative overflow-hidden bg-neutral-200 dark:bg-neutral-800 rounded-2xl"
            style={{ 
              aspectRatio: items[0].metadata?.width && items[0].metadata?.height 
                ? `${items[0].metadata.width}/${items[0].metadata.height}` 
                : '16/10',
              maxHeight: '500px'
            }}
          >
             {items[0].isDeleted || failedUrls.has(items[0].url) ? (
               <MediaPlaceholder reason="error" />
             ) : (
               <button type="button" onClick={() => handleMediaClick(0)} className="w-full h-full relative block">
                 {items[0].type === 'video' ? (
                    <video src={items[0].url} className="w-full h-full object-contain bg-black">
                      <track kind="captions" />
                    </video>
                 ) : (
                    <Image 
                      src={items[0].url} 
                      alt="" 
                      fill 
                      className="object-contain bg-neutral-900/10" 
                      unoptimized 
                      onError={() => handleImageError(items[0].url)}
                    />
                 )}
               </button>
             )}
          </div>
        )}

        {count === 2 && items.map((item, i) => renderItem(item, i))}
        
        {count === 3 && (
          <>
            {renderItem(items[0], 0, true)}
            {renderItem(items[1], 1)}
            {renderItem(items[2], 2)}
          </>
        )}

        {count >= 4 && items.slice(0, 4).map((item, i) => renderItem(item, i))}
      </div>

      <ImageModal
        isOpen={selectedIndex !== null}
        images={modalImages}
        initialIndex={selectedIndex ?? 0}
        onClose={() => setSelectedIndex(null)}
      />
    </>
  );
}