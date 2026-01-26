'use client';

import type { Attachment } from '@/types';
import imageCompression from 'browser-image-compression';
import { useSession } from 'next-auth/react';
import { useCallback, useState } from 'react';

export interface PendingAttachment extends Attachment {
  file: File;
  previewUrl: string;
  uploading: boolean;
  error?: string;
}

export function useAttachment(chatId: string) {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const { data: session } = useSession();

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
      if (!session?.user) throw new Error("You must be logged in.");

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

      // 2. Створюємо FormData (Це виправляє помилку Content-Type)
      const formData = new FormData();
      formData.append('file', fileToProcess, file.name);
      formData.append('chatId', chatId); // Сервер зможе сам згенерувати шлях

      // 3. Відправка на API Route
      const response = await fetch('/api/upload', {
        method: 'POST',
        // ВАЖЛИВО: headers з Content-Type прибираємо взагалі! 
        // Браузер сам поставить multipart/form-data
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
  }, [chatId, session]);

  // Інші функції залишаються майже такими самими, 
  // але видалення тепер теж краще робити через твій новий серверний Action/API
  const removeAttachment = useCallback(async (id: string) => {
    const attachment = attachments.find((a) => a.id === id);
    if (!attachment) return;

    setAttachments((prev) => prev.filter((a) => a.id !== id));
    URL.revokeObjectURL(attachment.previewUrl);
    
    // Тут раніше був прямий запит до Supabase Client. 
    // Оскільки ми вирішили робити все через сервер, 
    // видалення відбудеться автоматично при видаленні повідомлення.
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