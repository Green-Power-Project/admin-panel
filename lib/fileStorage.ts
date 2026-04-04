/** Local VPS-backed file API. */

export interface StorageFile {
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
  storagePath?: string;
  storageProvider?: 'vps';
}

const STORAGE_BASE = '/api/storage';

export async function uploadFile(
  file: File | Blob,
  folderPath: string,
  fileName?: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    if (fileName) {
      const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
      formData.append('public_id', `${folderPath}/${fileNameWithoutExt}`);
    } else {
      formData.append('folder', folderPath);
    }

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const uploadProgress = Math.round((e.loaded / e.total) * 90);
        onProgress(uploadProgress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(95);
        try {
          const data = JSON.parse(xhr.responseText);
          if (onProgress) onProgress(100);
          resolve({
            public_id: data.public_id,
            secure_url: data.secure_url,
            bytes: data.bytes,
            format: data.format,
            resource_type: data.resource_type,
            storagePath: data.storagePath,
            storageProvider: data.storageProvider,
          });
        } catch {
          reject(new Error('Failed to parse response'));
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string; fileName?: string };
          if (body.error === 'duplicate_file_name') {
            const err = Object.assign(new Error('duplicate_file_name'), {
              code: 'DUPLICATE_FILE_NAME' as const,
              fileName: typeof body.fileName === 'string' ? body.fileName : '',
            });
            reject(err);
          } else {
            reject(new Error(body.error || 'Upload failed'));
          }
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    xhr.open('POST', `${STORAGE_BASE}/upload`);
    xhr.send(formData);
  });
}

export async function listFiles(folderPath: string): Promise<StorageFile[]> {
  try {
    const response = await fetch(`${STORAGE_BASE}/list?folder=${encodeURIComponent(folderPath)}`);
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

export async function deleteFile(publicId: string, hintFileName?: string): Promise<boolean> {
  try {
    const response = await fetch(`${STORAGE_BASE}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId, fileName: hintFileName }),
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
    const response = await fetch(`${STORAGE_BASE}/delete-folder`, {
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
