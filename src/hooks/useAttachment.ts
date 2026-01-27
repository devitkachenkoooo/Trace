'use client';

import imageCompression from 'browser-image-compression';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/SupabaseAuthProvider';
import { createClient } from '@/lib/supabase/client';
import type { Attachment } from '@/types';

export interface PendingAttachment extends Attachment {
  file: File;
  previewUrl: string;
  uploading: boolean;
  error?: string;
}

export function useAttachment(chatId: string) {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const { user } = useSupabaseAuth();
  const supabase = createClient();

  // Очищення URL-прев'ю при розмонтуванні компонента
  useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
  }, [attachments]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!user) {
        toast.error('Ви не авторизовані');
        return;
      }

      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      const isImage = file.type.startsWith('image/');

      // Формуємо чисте ім'я файлу (безпечно для URL)
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      const fileName = `${timestamp}_${safeName}`;

      // Шлях ВАЖЛИВИЙ: першим має йти chatId для нашої RLS політики
      const filePath = `${chatId}/${user.id}/${fileName}`;

      const newAttachment: PendingAttachment = {
        id,
        type: isImage ? 'image' : 'file',
        url: '',
        metadata: { name: file.name, size: file.size },
        file,
        previewUrl,
        uploading: true,
      };

      setAttachments((prev) => [...prev, newAttachment]);

      try {
        let fileToUpload: File | Blob = file;

        // Стиснення тільки для зображень
        if (isImage && file.size > 1024 * 1024) {
          // Стискати, якщо > 1MB
          try {
            fileToUpload = await imageCompression(file, {
              maxSizeMB: 0.8,
              maxWidthOrHeight: 1920,
              useWebWorker: true,
            });
          } catch (e) {
            console.warn('Стиснення не вдалося, вантажимо оригінал', e);
          }
        }

        const { error } = await supabase.storage
          .from('attachments')
          .upload(filePath, fileToUpload, {
            cacheControl: '3600',
            upsert: false,
          });

        if (error) {
          // Обробка нашого SQL-тригера на ліміт 10 завантажень
          if (error.message.toLowerCase().includes('rate limit')) {
            throw new Error('Ліміт вичерпано: не більше 10 файлів на хвилину.');
          }
          throw error;
        }

        // Отримуємо пряме посилання
        const { data: publicData } = supabase.storage.from('attachments').getPublicUrl(filePath);

        setAttachments((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, url: publicData.publicUrl, uploading: false } : a,
          ),
        );
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Помилка завантаження';
        toast.error(errorMessage);

        setAttachments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, uploading: false, error: errorMessage } : a)),
        );
      }
    },
    [chatId, user, supabase],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);
  }, [attachments]);

  return {
    attachments,
    uploadFile,
    removeAttachment,
    clearAttachments,
    isUploading: attachments.some((a) => a.uploading),
  };
}
