import { db } from './firebase';
import { collection, query, where, getDocs, addDoc, Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';

export interface ReportApproval {
  id?: string;
  projectId: string;
  customerId: string;
  filePath: string; // Full storage path: projects/{projectId}/{folderPath}/{filename}
  approvedAt: Timestamp;
  status: 'pending' | 'approved' | 'auto-approved';
  uploadedAt?: Timestamp;
  autoApproveDate?: Timestamp;
}

export type ReportStatus = 'pending' | 'approved' | 'auto-approved';

/**
 * Check if a file path is a report (in 03_Reports folder)
 */
export function isReportFile(folderPath: string): boolean {
  return folderPath.startsWith('03_Reports');
}

/**
 * Check if a report has been approved
 */
export async function isReportApproved(
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
      collection(dbInstance, 'reportApprovals'),
      where('projectId', '==', projectId),
      where('customerId', '==', customerId),
      where('filePath', '==', filePath),
      where('status', 'in', ['approved', 'auto-approved'])
    );
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking report approval status:', error);
    return false;
  }
}

/**
 * Get report approval status
 */
export async function getReportApprovalStatus(
  projectId: string,
  customerId: string,
  filePath: string
): Promise<ReportStatus | null> {
  if (!db) {
    console.error('Firestore database is not initialized.');
    return null;
  }
  const dbInstance = db; // Store for TypeScript narrowing
  
  try {
    const q = query(
      collection(dbInstance, 'reportApprovals'),
      where('projectId', '==', projectId),
      where('customerId', '==', customerId),
      where('filePath', '==', filePath)
    );
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return 'pending';
    }
    
    const doc = querySnapshot.docs[0];
    return doc.data().status as ReportStatus;
  } catch (error) {
    console.error('Error getting report approval status:', error);
    return null;
  }
}

/**
 * Calculate 5 working days from a date (excluding weekends)
 */
export function addWorkingDays(date: Date, days: number): Date {
  const result = new Date(date);
  let addedDays = 0;
  
  while (addedDays < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      addedDays++;
    }
  }
  
  return result;
}

