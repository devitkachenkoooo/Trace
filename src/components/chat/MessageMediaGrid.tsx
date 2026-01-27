'use client';

import { Clock, EyeOff } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/types';
import { ImageModal } from './ImageModal';

interface MessageMediaGridProps {
  images: Attachment[];
}

// Винесено за межі основного компонента для запобігання помилкам рендеру
const DeletedPlaceholder = ({ name }: { name: string }) => (
  <div className="flex flex-col items-center justify-center w-full h-full bg-neutral-900/80 border border-white/5 rounded-xl p-4 text-center min-h-[150px] min-w-[200px]">
    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-2">
      <Clock className="w-5 h-5 text-white/40" />
    </div>
    <p className="text-[11px] text-white/40 font-medium uppercase tracking-widest">Файл видалено</p>
    <p className="text-[10px] text-white/20 mt-1 truncate max-w-[180px]">{name}</p>
  </div>
);

export function MessageMediaGrid({ images }: MessageMediaGridProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const activeImages = images.filter((img) => !img.isDeleted);
  const count = images.length;

  if (count === 0) return null;

  const handleImageClick = (index: number) => {
    const clickedImage = images[index];
    if (clickedImage.isDeleted) return;

    const activeIndex = activeImages.findIndex((img) => img.id === clickedImage.id);
    if (activeIndex !== -1) {
      setSelectedIndex(activeIndex);
    }
  };

  const modalElement = (
    <ImageModal
      isOpen={selectedIndex !== null}
      images={activeImages}
      initialIndex={selectedIndex ?? 0}
      onClose={() => setSelectedIndex(null)}
    />
  );

  // --- 1 КАРТИНКА: Пріоритет на якість та розмір ---
  if (count === 1) {
    const img = images[0];
    return (
      <>
        <div className="relative group w-fit max-w-full">
          {img.isDeleted ? (
            <DeletedPlaceholder name={img.metadata?.name || 'image'} />
          ) : (
            <button
              type="button"
              className="relative rounded-2xl overflow-hidden border border-white/10 bg-white/5 cursor-pointer hover:opacity-95 transition-all duration-300 block w-full max-w-[400px]"
              onClick={() => handleImageClick(0)}
            >
              <Image
                src={img.url}
                alt={img.metadata?.name || 'Media'}
                width={800}
                height={600}
                className="w-full h-auto max-h-[450px] object-contain bg-neutral-900/20"
                unoptimized
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
            </button>
          )}
        </div>
        {modalElement}
      </>
    );
  }

  // --- МУЛЬТИ-СІТКА (2+ картинки) ---
  const displayImages = images.slice(0, 4);
  const remaining = count - 4;

  return (
    <>
      <div
        className={cn(
          'grid gap-1.5 rounded-2xl overflow-hidden border border-white/10 bg-white/5 w-full max-w-[500px]',
          count === 2 ? 'grid-cols-2 aspect-[16/10]' : 'grid-cols-2 aspect-square',
        )}
      >
        {displayImages.map((img, i) => {
          const isLast = i === 3;
          const showOverlay = isLast && remaining > 0;

          return (
            <div
              key={img.id}
              className={cn(
                'relative bg-neutral-800 overflow-hidden group',
                // Якщо 3 картинки: перша займає всю верхню частину
                count === 3 && i === 0 ? 'col-span-2 row-span-1' : '',
              )}
            >
              {img.isDeleted ? (
                <div className="w-full h-full flex items-center justify-center bg-neutral-900/50 min-h-[120px]">
                  <EyeOff className="w-4 h-4 text-white/20" />
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full h-full relative block min-h-[120px]"
                  onClick={() => handleImageClick(i)}
                >
                  <Image
                    src={img.url}
                    alt={img.metadata?.name || 'Media'}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />

                  {showOverlay && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] flex items-center justify-center text-white z-10">
                      <span className="font-bold text-2xl tracking-tighter">+{remaining}</span>
                    </div>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {modalElement}
    </>
  );
}
