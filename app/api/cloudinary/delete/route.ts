import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Generate Cloudinary signature for authenticated requests
function generateSignature(params: Record<string, string>): string {
  if (!API_SECRET) return '';
  
  // Sort parameters and create signature string
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  // Append API secret and create SHA1 hash
  const signatureString = sortedParams + API_SECRET;
  return crypto.createHash('sha1').update(signatureString).digest('hex');
}

export async function POST(request: NextRequest) {
  if (!CLOUD_NAME) {
    return NextResponse.json({ error: 'Cloudinary not configured' }, { status: 500 });
  }

  if (!API_KEY || !API_SECRET) {
    return NextResponse.json({ error: 'Cloudinary credentials missing' }, { status: 500 });
  }

  try {
    const { publicId } = await request.json();
    if (!publicId) {
      return NextResponse.json({ error: 'Public ID required' }, { status: 400 });
    }

    // Cloudinary Upload API destroy endpoint uses signature-based authentication
    // POST https://api.cloudinary.com/v1_1/{cloud_name}/{resource_type}/destroy
    // Try image first (most common), then raw if image fails
    
    // Prepare parameters for signature generation
    const params: Record<string, string> = {
      public_id: publicId,
      invalidate: 'true',
      timestamp: Math.floor(Date.now() / 1000).toString(),
    };
    
    // Generate signature
    const signature = generateSignature(params);
    params.signature = signature;
    params.api_key = API_KEY;
    
    const formData = new URLSearchParams();
    Object.keys(params).forEach(key => {
      formData.append(key, params[key]);
    });
    
    // Try image endpoint first
    let deleteUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`;
    let response = await fetch(deleteUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded'
      } as HeadersInit,
      body: formData.toString(),
    });

    // If image delete fails with 404, try raw endpoint (for PDFs and other files)
    if (!response.ok && response.status === 404) {
      // Clone response to check if it's HTML without consuming the body
      const clonedResponse = response.clone();
      const errorText = await clonedResponse.text();
      
      // If it's not HTML (meaning it's a proper API error), try raw endpoint
      if (!errorText.includes('<!DOCTYPE html>')) {
        // Regenerate signature for raw endpoint (timestamp might have changed, but it's fine)
        const rawParams: Record<string, string> = {
          public_id: publicId,
          invalidate: 'true',
          timestamp: Math.floor(Date.now() / 1000).toString(),
        };
        const rawSignature = generateSignature(rawParams);
        rawParams.signature = rawSignature;
        rawParams.api_key = API_KEY;
        
        const rawFormData = new URLSearchParams();
        Object.keys(rawParams).forEach(key => {
          rawFormData.append(key, rawParams[key]);
        });
        
        deleteUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/destroy`;
        response = await fetch(deleteUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded'
          } as HeadersInit,
          body: rawFormData.toString(),
        });
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      // Check if it's HTML (Cloudinary 404 page)
      if (errorText.includes('<!DOCTYPE html>')) {
        console.error('Cloudinary delete API returned 404 HTML page. Public ID:', publicId);
        return NextResponse.json(
          { error: 'File not found in Cloudinary. It may have already been deleted.' },
          { status: 404 }
        );
      }
      console.error('Cloudinary delete API error:', errorText);
      return NextResponse.json(
        { error: `Delete failed: ${errorText}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    // Cloudinary destroy API returns { result: 'ok' } on success
    if (result.result === 'ok' || result.result === 'not found') {
      return NextResponse.json({ success: true, result });
    }
    
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('Cloudinary delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Delete failed' },
      { status: 500 }
    );
  }
}

