import { auth } from '@/auth';
import { supabaseService } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // 1. Перевірка авторизації
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Отримання файлу
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // 3. Валідація розміру (15MB)
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'Файл занадто великий (макс. 15MB)' }, { status: 400 });
    }

    // 4. Валідація типів (Images + Docs)
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Цей формат файлу не підтримується' }, { status: 400 });
    }

    if (!supabaseService) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // 5. Шлях до файлу (залишаємо твій надійний метод)
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const path = `${session.user.id}/${timestamp}-${randomSuffix}-${sanitizedFilename}`;

    // 6. Завантаження
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseService.storage
      .from('chat-attachments')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: 'Failed to upload' }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseService.storage
      .from('chat-attachments')
      .getPublicUrl(path);

    return NextResponse.json({ url: publicUrl, path, type: file.type });

  } catch (err) {
    console.error('[API /upload] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}