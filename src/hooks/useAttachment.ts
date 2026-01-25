'use client';

import { supabase } from '@/lib/supabase';
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
  const { data: session } = useSession(); // status прибрано, бо достатньо перевірки session

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
      // Перевірка авторизації через сесію
      if (!session?.user) {
        throw new Error("You must be logged in to upload files.");
      }

      // 1. Очищення chatId та генерація безпечного шляху (тільки ASCII)
      const cleanChatId = chatId.replace(/[^a-zA-Z0-9-]/g, 'x');
      const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
      const safePath = `${cleanChatId}/${id}.${extension}`;

      // 2. Обробка зображення
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

      // 3. Конвертація в Base64 для обходу ByteString Error
      const reader = new FileReader();
      const base64String = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // Беремо тільки чистий Base64 без префікса
        };
        reader.onerror = reject;
        reader.readAsDataURL(fileToProcess);
      });

      // 4. Відправка через API Route
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          base64: base64String,
          contentType: file.type,
          path: safePath,
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Upload failed');
      }

      setAttachments((prev) =>
        prev.map((a) => a.id === id ? { ...a, url: result.url as string, uploading: false } : a)
      );

    } catch (err: any) {
      console.error('[useAttachment] Error:', err);
      setAttachments((prev) =>
        prev.map((a) => a.id === id ? { ...a, uploading: false, error: err.message || 'Upload failed' } : a)
      );
    }
    // status видалено з залежностей, залишаємо тільки chatId та session
  }, [chatId, session]);

  const removeAttachment = useCallback(async (id: string) => {
    const attachment = attachments.find((a) => a.id === id);
    if (!attachment) return;

    setAttachments((prev) => prev.filter((a) => a.id !== id));
    URL.revokeObjectURL(attachment.previewUrl);

    if (attachment.url) {
      const fileName = attachment.url.split('/').pop();
      try {
        await supabase.storage.from('chat-attachments').remove([`${chatId}/${fileName}`]);
      } catch (err) {
        console.error('Delete error:', err);
      }
    }
  }, [attachments, chatId]);

  const clearAttachments = useCallback(() => {
    for (const a of attachments) {
      URL.revokeObjectURL(a.previewUrl);
    }
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