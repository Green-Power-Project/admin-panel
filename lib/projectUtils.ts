import { storage } from './firebase';
import { ref, uploadBytes } from 'firebase/storage';
import { getAllFolderPathsArray } from './folderStructure';

/**
 * Create the FIXED predefined folder structure for a project in Firebase Storage
 * 
 * This function creates the exact folder structure as defined in PROJECT_FOLDER_STRUCTURE.
 * The structure is immutable and identical for all projects.
 * 
 * Creates placeholder files (.keep) to ensure folders exist in Firebase Storage.
 * 
 * @param projectId - The project ID for which to create the folder structure
 */
export async function createProjectFolderStructure(projectId: string): Promise<void> {
  // Get all valid folder paths from the fixed structure
  const folderPaths = getAllFolderPathsArray();
  
  // Create a small placeholder file to initialize each folder
  const placeholderContent = new Blob([''], { type: 'text/plain' });
  const placeholderFile = new File([placeholderContent], '.keep', { type: 'text/plain' });
  
  const uploadPromises = folderPaths.map(async (folderPath) => {
    try {
      // Create placeholder file in each folder to ensure folder exists
      const folderRef = ref(storage, `projects/${projectId}/${folderPath}/.keep`);
      await uploadBytes(folderRef, placeholderFile);
    } catch (error: any) {
      // Log errors but continue - folders will be created when files are uploaded
      if (error.code !== 'storage/unauthorized' && error.code !== 'storage/unknown') {
        console.warn(`Could not create folder ${folderPath} for project ${projectId}:`, error);
      }
    }
  });
  
  // Wait for all folder creations to complete (or fail gracefully)
  await Promise.allSettled(uploadPromises);
}

/**
 * Ensure folder structure exists for a project
 * Can be called to repair/restore folder structure if needed
 */
export async function ensureProjectFolderStructure(projectId: string): Promise<void> {
  await createProjectFolderStructure(projectId);
}

