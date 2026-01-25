'use client';

import Image from 'next/image';
import type { Attachment } from '@/types';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { ImageModal } from './ImageModal';

interface MessageMediaGridProps {
  images: Attachment[];
}

export function MessageMediaGrid({ images }: MessageMediaGridProps) {
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const count = images.length;
  
  if (count === 0) return null;

  // 1. ОДНЕ ЗОБРАЖЕННЯ
  if (count === 1) {
    const img = images[0];
    return (
      <>
        <button 
          type="button"
          className="relative rounded-2xl overflow-hidden border border-white/10 bg-white/5 cursor-pointer hover:opacity-90 transition-opacity duration-300 block overflow-hidden"
          onClick={() => setSelectedImage({ url: img.url, name: img.metadata.name })}
        >
          <Image
            src={img.url}
            alt={img.metadata.name}
            width={400}
            height={300}
            className="w-auto h-auto max-w-full max-h-[350px] object-contain"
            unoptimized
          />
        </button>
        <ImageModal
          isOpen={!!selectedImage}
          imageUrl={selectedImage?.url || ''}
          imageName={selectedImage?.name || ''}
          onClose={() => setSelectedImage(null)}
        />
      </>
    );
  }

  // 2. БАГАТО ЗОБРАЖЕНЬ
  const displayImages = images.slice(0, 4);
  const remaining = count - 4;

  return (
    <>
      <div className={cn(
        "grid gap-0.5 rounded-2xl overflow-hidden border border-white/10 bg-white/5 w-[260px] sm:w-[300px]", // Фіксована ширина сітки
        count === 2 ? "grid-cols-2" : "grid-cols-2"
      )}>
        {displayImages.map((img, i) => (
          <button 
            key={img.id}
            type="button" 
            // aspect-square гарантує, що фото не будуть сплюснуті
            className={cn(
              "relative aspect-square cursor-pointer hover:opacity-90 transition-opacity duration-300 block bg-neutral-800",
              count === 3 && i === 0 ? "col-span-2 aspect-[2/1]" : "" // Якщо 3 фото, перше зверху широке
            )}
            onClick={() => setSelectedImage({ url: img.url, name: img.metadata.name })}
          >
            <Image
              src={img.url}
              alt={img.metadata.name}
              fill
              className="object-cover"
              unoptimized
            />
            {i === 3 && remaining > 0 && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center text-white font-bold text-xl">
                +{remaining}
              </div>
            )}
          </button>
        ))}
      </div>

      <ImageModal
        isOpen={!!selectedImage}
        imageUrl={selectedImage?.url || ''}
        imageName={selectedImage?.name || ''}
        onClose={() => setSelectedImage(null)}
      />
    </>
  );
}