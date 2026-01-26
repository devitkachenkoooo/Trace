'use client';

import type { Attachment } from '@/types';
import imageCompression from 'browser-image-compression';
import { useSupabaseAuth } from '@/components/SupabaseAuthProvider';
import { useCallback, useState } from 'react';

export interface PendingAttachment extends Attachment {
  file: File;
  previewUrl: string;
  uploading: boolean;
  error?: string;
}

export function useAttachment(chatId: string) {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const { user } = useSupabaseAuth();

  const uploadFile = useCallback(async (file: File) => {
    const id = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    const isImage = file.type.startsWith('image/');
    
    const newAttachment: PendingAttachment = {
      id,
      type: isImage ? 'image' : 'file',
      url: '',
      metadata: { name: file.name, size: file.size },
      file,
      previewUrl,
      uploading: true
    };

    setAttachments((prev) => [...prev, newAttachment]);

    try {
      if (!user) throw new Error("You must be logged in.");

      // 1. Обробка зображення (стиснення)
      let fileToProcess: File | Blob = file;
      if (isImage) {
        try {
          fileToProcess = await imageCompression(file, { 
            maxSizeMB: 1, 
            maxWidthOrHeight: 1920,
            useWebWorker: true 
          });
        } catch (e) {
          fileToProcess = file;
        }
      }

      // 2. Створюємо FormData
      const formData = new FormData();
      formData.append('file', fileToProcess, file.name);
      formData.append('chatId', chatId);

      // 3. Відправка на API Route
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Upload failed');
      }

      // Оновлюємо статус: записуємо URL, який повернув сервер
      setAttachments((prev) =>
        prev.map((a) => a.id === id ? { ...a, url: result.url, uploading: false } : a)
      );

    } catch (err: any) {
      console.error('[useAttachment] Error:', err);
      setAttachments((prev) =>
        prev.map((a) => a.id === id ? { ...a, uploading: false, error: err.message } : a)
      );
    }
  }, [chatId, user]);

  const removeAttachment = useCallback(async (id: string) => {
    const attachment = attachments.find((a) => a.id === id);
    if (!attachment) return;

    setAttachments((prev) => prev.filter((a) => a.id !== id));
    URL.revokeObjectURL(attachment.previewUrl);
  }, [attachments]);

  const clearAttachments = useCallback(() => {
    attachments.forEach((a) => {
      URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);
  }, [attachments]);

  return { 
    attachments, 
    uploadFile, 
    removeAttachment, 
    clearAttachments, 
    isUploading: attachments.some(a => a.uploading) 
  };
}