'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Attachment } from '@/types';
import imageCompression from 'browser-image-compression';
import { z } from 'zod';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const fileSchema = z.object({
  size: z.number().max(MAX_FILE_SIZE, 'File size must be less than 10MB'),
  type: z.string().refine((type) => ALLOWED_MIME_TYPES.includes(type), {
    message: 'File type not allowed',
  }),
});

export interface PendingAttachment extends Attachment {
  file: File;
  previewUrl: string;
  uploading: boolean;
  error?: string;
}

export function useAttachment(chatId: string) {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const uploadFile = useCallback(async (file: File) => {
    const id = crypto.randomUUID();
    const type: 'image' | 'file' = file.type.startsWith('image/') ? 'image' : 'file';
    const previewUrl = URL.createObjectURL(file);
    
    const newAttachment: PendingAttachment = {
      id,
      type,
      url: '',
      metadata: {
        name: file.name,
        size: file.size,
      },
      file,
      previewUrl,
      uploading: true,
    };

    setAttachments((prev) => [...prev, newAttachment]);

    try {
      // Validate file
      fileSchema.parse(file);

      let fileToUpload = file;

      // Compress images
      if (type === 'image') {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        };
        fileToUpload = await imageCompression(file, options);
      }

      const filePath = `${chatId}/${id}-${file.name}`;
      const { error } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, fileToUpload);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);

      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, url: publicUrl, uploading: false } : a
        )
      );

      // Extract image dimensions if applicable
      if (type === 'image') {
        const img = new Image();
        img.src = previewUrl;
        img.onload = () => {
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? {
                    ...a,
                    metadata: {
                      ...a.metadata,
                      width: img.width,
                      height: img.height,
                    },
                  }
                : a
            )
          );
        };
      }
    } catch (err: unknown) {
      console.error('Upload error:', err);
      const message = err instanceof Error ? err.message : 'Upload failed';
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, uploading: false, error: message } : a
        )
      );
    }
  }, [chatId]);

  const removeAttachment = useCallback(async (id: string) => {
    const attachment = attachments.find((a) => a.id === id);
    if (!attachment) return;

    // Remove from UI state
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    
    // Revoke object URL to free memory
    URL.revokeObjectURL(attachment.previewUrl);

    // If uploaded, try to delete from Supabase
    if (attachment.url) {
      const urlParts = attachment.url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const filePath = `${chatId}/${fileName}`;
      
      try {
        await supabase.storage.from('chat-attachments').remove([filePath]);
      } catch (err) {
        console.error('Failed to delete file from storage:', err);
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
    isUploading: attachments.some((a) => a.uploading),
  };
}
