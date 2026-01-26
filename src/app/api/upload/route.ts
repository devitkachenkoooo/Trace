import { auth } from '@/auth';
import { supabaseService } from '@/lib/supabase';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const config = {
  api: {
    bodyParser: false, // Disabling Next.js body parser to handle FormData manually if needed, though usually standard fetch handles it.
    // Actually, for App Router route handlers, we don't need 'config' export for bodyParser. 
    // We just read req.formData().
  },
};

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse FormData
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // 3. Validate File
    // Max size: 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size limit exceeded (10MB)' },
        { status: 400 }
      );
    }

    // 4. Validate Supabase service client
    if (!supabaseService) {
      console.error('Supabase Service Client not initialized');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // 5. Generate Secure Path
    // structure: {userId}/{timestamp}-{random}-{filename}
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    // Sanitize filename to remove special chars
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const path = `${session.user.id}/${timestamp}-${randomSuffix}-${sanitizedFilename}`;

    // 6. Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 7. Upload to Supabase
    const { error: uploadError } = await supabaseService.storage
      .from('chat-attachments')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase Upload Error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // 8. Get public URL
    const { data: { publicUrl } } = supabaseService.storage
      .from('chat-attachments')
      .getPublicUrl(path);

    return NextResponse.json({ url: publicUrl, path });

  } catch (err: unknown) {
    console.error('[API /upload] Error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
