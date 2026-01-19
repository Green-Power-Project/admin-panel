'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AppHeader from '@/components/AppHeader';
import Link from 'next/link';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ref, listAll, getDownloadURL, getMetadata, deleteObject, uploadBytes } from 'firebase/storage';
import { PROJECT_FOLDER_STRUCTURE, isValidFolderPath } from '@/lib/folderStructure';

interface Project {
  id: string;
  name: string;
  year?: number;
}

interface FileItem {
  name: string;
  url: string;
  size: number;
  type: string;
  fullPath: string;
  folderPath: string;
}

export default function ProjectFilesPage() {
  return (
    <ProtectedRoute>
      <ProjectFilesContent />
    </ProtectedRoute>
  );
}

function ProjectFilesContent() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    if (projectId) {
      loadProject();
    }
  }, [projectId]);

  useEffect(() => {
    if (project && selectedFolder) {
      loadFiles();
    }
  }, [project, selectedFolder]);

  async function loadProject() {
    setLoading(true);
    try {
      const projectDoc = await getDoc(doc(db, 'projects', projectId));
      if (projectDoc.exists()) {
        setProject({ id: projectDoc.id, ...projectDoc.data() } as Project);
      }
    } catch (error) {
      console.error('Error loading project:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadFiles() {
    if (!selectedFolder) return;
    setLoading(true);
    try {
      const folderRef = ref(storage, `projects/${projectId}/${selectedFolder}`);
      const fileList = await listAll(folderRef);
      
      const filesList: FileItem[] = [];
      for (const itemRef of fileList.items) {
        try {
          const [url, metadata] = await Promise.all([
            getDownloadURL(itemRef),
            getMetadata(itemRef)
          ]);
          
          filesList.push({
            name: itemRef.name,
            url,
            size: metadata.size,
            type: metadata.contentType || 'application/octet-stream',
            fullPath: itemRef.fullPath,
            folderPath: selectedFolder,
          });
        } catch (err) {
          console.error('Error loading file:', itemRef.name, err);
        }
      }
      setFiles(filesList);
    } catch (error: any) {
      if (error.code === 'storage/object-not-found') {
        setFiles([]);
      } else {
        console.error('Error loading files:', error);
      }
    } finally {
      setLoading(false);
    }
  }

  function validateFile(file: File): string | null {
    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const fileType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();
    
    // Check MIME type and file extension
    const isValidType = allowedTypes.includes(fileType) || 
                       fileName.endsWith('.pdf') || 
                       fileName.endsWith('.jpg') || 
                       fileName.endsWith('.jpeg') || 
                       fileName.endsWith('.png');
    
    if (!isValidType) {
      return 'Only PDF, JPG, and PNG files are allowed.';
    }

    // Validate file size: Max 5 MB
    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      return 'File size must be less than 5 MB.';
    }

    return null;
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedFolder) return;

    setUploadError('');
    
    // Validate folder path is valid according to fixed structure
    if (!isValidFolderPath(selectedFolder)) {
      setUploadError('Invalid folder path. Files can only be uploaded to predefined folders.');
      return;
    }
    
    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setUploading(true);
    try {
      const fileRef = ref(storage, `projects/${projectId}/${selectedFolder}/${file.name}`);
      await uploadBytes(fileRef, file);
      await loadFiles();
      e.target.value = '';
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadError('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(filePath: string, fileName: string) {
    if (!confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
      return;
    }

    setDeleting(filePath);
    try {
      const fileRef = ref(storage, filePath);
      await deleteObject(fileRef);
      await loadFiles();
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('Failed to delete file. Please try again.');
    } finally {
      setDeleting(null);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getFileIcon(type: string): string {
    if (type.includes('pdf')) return '📄';
    if (type.includes('image')) return '🖼️';
    return '📎';
  }

  if (loading && !project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500">Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link
            href="/files"
            className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
          >
            ← Back to Files
          </Link>
          <h2 className="text-2xl font-semibold text-gray-900">{project?.name}</h2>
          {project?.year && (
            <p className="text-sm text-gray-500 mt-1">Year: {project.year}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded-sm">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-900">Select Folder</h3>
                <p className="text-xs text-gray-500 mt-0.5">Fixed structure (read-only)</p>
                <p className="text-xs text-gray-400 mt-1">📁 Folder structure cannot be modified</p>
              </div>
              <div className="p-2">
                <div className="space-y-1">
                  {PROJECT_FOLDER_STRUCTURE.map((folder) => (
                    <div key={folder.path}>
                      <button
                        onClick={() => setSelectedFolder(folder.path)}
                        className={`w-full text-left px-3 py-2 text-sm rounded-sm ${
                          selectedFolder === folder.path
                            ? 'bg-green-power-50 text-green-power-700 border border-green-power-200'
                            : 'text-gray-700 hover:bg-gray-50 border border-transparent'
                        }`}
                      >
                        {folder.name}
                      </button>
                      {folder.children && (
                        <div className="ml-3 mt-1 space-y-0.5">
                          {folder.children.map((child) => (
                            <button
                              key={child.path}
                              onClick={() => setSelectedFolder(child.path)}
                              className={`w-full text-left px-3 py-1.5 text-xs rounded-sm ${
                                selectedFolder === child.path
                                  ? 'bg-green-power-50 text-green-power-700 border border-green-power-200'
                                  : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                              }`}
                            >
                              └─ {child.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            {!selectedFolder ? (
              <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
                <p className="text-sm text-gray-500">Select a folder to view and manage files</p>
              </div>
            ) : (
              <>
                <div className="bg-white border border-gray-200 rounded-sm mb-6">
                  <div className="px-5 py-4 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900">Upload File</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Folder: {selectedFolder}</p>
                    <p className="text-xs text-gray-400 mt-1">⚠️ Files can only be uploaded to predefined folders. Folder structure cannot be modified.</p>
                  </div>
                  <div className="p-5">
                    {uploadError && (
                      <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm mb-4">
                        {uploadError}
                      </div>
                    )}
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer disabled:opacity-50"
                    />
                    <p className="mt-2 text-xs text-gray-500">
                      Allowed formats: PDF, JPG, PNG | Max size: 5 MB
                    </p>
                    {uploading && (
                      <p className="mt-2 text-xs text-green-power-600 font-medium">Uploading file...</p>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-sm">
                  <div className="px-5 py-4 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900">Files</h3>
                  </div>
                  {loading ? (
                    <div className="p-12 text-center">
                      <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
                      <p className="mt-4 text-sm text-gray-500">Loading files...</p>
                    </div>
                  ) : files.length === 0 ? (
                    <div className="p-12 text-center">
                      <p className="text-sm text-gray-500">No files in this folder.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {files.map((file) => (
                        <div key={file.fullPath} className="px-5 py-3 hover:bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center flex-1 min-w-0">
                              <span className="mr-3 text-lg">{getFileIcon(file.type)}</span>
                              <div className="flex-1 min-w-0">
                                <a
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-gray-900 hover:text-green-power-600 break-words"
                                >
                                  {file.name}
                                </a>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {formatFileSize(file.size)}
                                </p>
                              </div>
                            </div>
                            <div className="ml-4 flex items-center space-x-2">
                              <a
                                href={file.url}
                                download={file.name}
                                className="px-3 py-1.5 text-xs text-gray-700 hover:text-gray-900 border border-gray-300 rounded-sm hover:bg-gray-50 font-medium"
                              >
                                Download
                              </a>
                              <button
                                onClick={() => handleDelete(file.fullPath, file.name)}
                                disabled={deleting === file.fullPath}
                                className="px-3 py-1.5 text-xs text-red-600 hover:text-red-700 border border-red-300 rounded-sm hover:bg-red-50 font-medium disabled:opacity-50"
                              >
                                {deleting === file.fullPath ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

