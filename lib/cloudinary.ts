export interface CloudinaryFile {
  public_id: string;
  public_id_full?: string;
  secure_url: string;
  resource_type: string;
  format: string;
  bytes: number;
  created_at: string;
  folder: string;
  original_filename?: string;
}

export interface UploadResult {
  public_id: string;
  secure_url: string;
  bytes: number;
  format: string;
  resource_type: string;
}

const CLOUDINARY_BASE = '/api/cloudinary';

export async function uploadFile(
  file: File | Blob,
  folderPath: string,
  fileName?: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
    if (preset) {
      formData.append('upload_preset', preset);
    }
    if (fileName) {
      // public_id should contain the full path including folder
      // Remove file extension for public_id (Cloudinary will add it back)
      const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
      formData.append('public_id', `${folderPath}/${fileNameWithoutExt}`);
    } else {
      // If no fileName provided, use folder to set the path
      formData.append('folder', folderPath);
    }

    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        // Calculate percentage (0-90% for upload, remaining 10% for processing)
        const uploadProgress = Math.round((e.loaded / e.total) * 90);
        onProgress(uploadProgress);
      }
    });

    // Handle completion
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Simulate processing phase (90-100%)
        if (onProgress) {
          onProgress(95);
        }
        
        try {
          const data = JSON.parse(xhr.responseText);
          // Final progress update
          if (onProgress) {
            onProgress(100);
          }
          
          resolve({
            public_id: data.public_id,
            secure_url: data.secure_url,
            bytes: data.bytes,
            format: data.format,
            resource_type: data.resource_type,
          });
        } catch (error) {
          reject(new Error('Failed to parse response'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.error || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    });

    // Handle errors
    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    // Start upload
    xhr.open('POST', `${CLOUDINARY_BASE}/upload`);
    xhr.send(formData);
  });
}

export async function listFiles(folderPath: string): Promise<CloudinaryFile[]> {
  try {
    const response = await fetch(`${CLOUDINARY_BASE}/list?folder=${encodeURIComponent(folderPath)}`);
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return data.resources || [];
  } catch (error) {
    console.error('Error listing files:', error);
    return [];
  }
}

export async function deleteFile(publicId: string): Promise<boolean> {
  try {
    const response = await fetch(`${CLOUDINARY_BASE}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Delete API error:', errorData);
      return false;
    }
    
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

export async function deleteFolder(folderPath: string): Promise<boolean> {
  try {
    const response = await fetch(`${CLOUDINARY_BASE}/delete-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error deleting folder:', error);
    return false;
  }
}

