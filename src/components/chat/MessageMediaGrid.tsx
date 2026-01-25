import Image from 'next/image';
import type { Attachment } from '@/types';
import { cn } from '@/lib/utils';

interface MessageMediaGridProps {
  images: Attachment[];
}

export function MessageMediaGrid({ images }: MessageMediaGridProps) {
  const count = images.length;
  if (count === 0) return null;

  if (count === 1) {
    const img = images[0];
    const aspectRatio = img.metadata.width && img.metadata.height 
      ? img.metadata.width / img.metadata.height 
      : 1;

    return (
      <div 
        className="relative rounded-lg overflow-hidden border border-white/10 bg-white/5"
        style={{ 
          maxWidth: '100%', 
          aspectRatio: aspectRatio > 1.5 ? '16/9' : (aspectRatio < 0.6 ? '9/16' : undefined)
        }}
      >
        <Image
          src={img.url}
          alt={img.metadata.name}
          width={img.metadata.width || 800}
          height={img.metadata.height || 600}
          className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
          unoptimized
        />
      </div>
    );
  }

  // Grid for 2-4 images (2x2) or more
  const displayImages = images.slice(0, 4);
  const remaining = count - 4;

  return (
    <div className={cn(
      "grid gap-1 rounded-lg overflow-hidden border border-white/10 bg-white/5",
      count === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2"
    )}>
      {displayImages.map((img, i) => (
        <div key={img.id} className="relative aspect-square">
          <Image
            src={img.url}
            alt={img.metadata.name}
            fill
            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
            unoptimized
          />
          {i === 3 && remaining > 0 && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-lg pointer-events-none">
              +{remaining}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
