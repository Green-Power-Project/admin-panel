import { db } from './firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export interface FileReadStatus {
  id: string;
  projectId: string;
  customerId: string;
  filePath: string; // Full storage path: projects/{projectId}/{folderPath}/{filename}
  readAt: any; // Timestamp
}

/**
 * Check if a file has been read by a customer
 */
export async function isFileRead(
  projectId: string,
  customerId: string,
  filePath: string
): Promise<boolean> {
  if (!db) {
    console.error('Firestore database is not initialized.');
    return false;
  }
  const dbInstance = db; // Store for TypeScript narrowing
  
  try {
    const q = query(
      collection(dbInstance, 'fileReadStatus'),
      where('projectId', '==', projectId),
      where('customerId', '==', customerId),
      where('filePath', '==', filePath)
    );
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking file read status:', error);
    return false;
  }
}

/**
 * Get read status for a file (for admin view)
 * Returns the read status record if file has been read
 */
export async function getFileReadStatus(filePath: string): Promise<FileReadStatus | null> {
  if (!db) {
    console.error('Firestore database is not initialized.');
    return null;
  }
  const dbInstance = db; // Store for TypeScript narrowing
  
  try {
    const q = query(
      collection(dbInstance, 'fileReadStatus'),
      where('filePath', '==', filePath)
    );
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null; // File is unread
    }
    
    // Return the first read status (should only be one per file per customer)
    const doc = querySnapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    } as FileReadStatus;
  } catch (error) {
    console.error('Error getting file read status:', error);
    return null;
  }
}

/**
 * Get all read statuses for a file (in case multiple customers have access)
 */
export async function getAllFileReadStatuses(filePath: string): Promise<FileReadStatus[]> {
  if (!db) {
    console.error('Firestore database is not initialized.');
    return [];
  }
  const dbInstance = db; // Store for TypeScript narrowing
  
  try {
    const q = query(
      collection(dbInstance, 'fileReadStatus'),
      where('filePath', '==', filePath)
    );
    const querySnapshot = await getDocs(q);
    
    const statuses: FileReadStatus[] = [];
    querySnapshot.forEach((doc) => {
      statuses.push({
        id: doc.id,
        ...doc.data(),
      } as FileReadStatus);
    });
    
    return statuses;
  } catch (error) {
    console.error('Error getting file read statuses:', error);
    return [];
  }
}

