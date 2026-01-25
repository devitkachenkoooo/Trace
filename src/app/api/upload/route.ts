import { auth } from '@/auth';
import { supabaseService } from '@/lib/supabase';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse JSON payload
    const body = await req.json();
    const { base64, contentType, path } = body;

    if (!base64 || !path) {
      return NextResponse.json(
        { error: 'Missing required fields: base64 or path' },
        { status: 400 }
      );
    }

    // 3. Validate Supabase service client
    if (!supabaseService) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // 4. Convert Base64 to Buffer
    const buffer = Buffer.from(base64, 'base64');

    // 5. Upload to Supabase
    const { error: uploadError } = await supabaseService.storage
      .from('chat-attachments')
      .upload(path, buffer, {
        contentType: contentType || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      );
    }

    // 6. Get public URL
    const { data: { publicUrl } } = supabaseService.storage
      .from('chat-attachments')
      .getPublicUrl(path);

    return NextResponse.json({ url: publicUrl });

  } catch (err: unknown) {
    console.error('[API /upload] Error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
