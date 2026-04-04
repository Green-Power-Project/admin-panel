import type { Firestore } from 'firebase/firestore';
import {
  collection,
  doc,
  getDocs,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { getAllFolderPathsArray } from '@/lib/folderStructure';
import { deleteFile } from '@/lib/fileStorage';
import { fileKeyFromFirestoreDoc } from '@/lib/fileDocFields';

function getFolderSegments(folderPath: string): string[] {
  return folderPath.split('/').filter(Boolean);
}

/**
 * Delete all project files (Firestore metadata + local files), fileReadStatus,
 * reportApprovals, reportSignatures, and the project document.
 * Call this before deleting a project or as part of customer cascade.
 */
export async function deleteProjectCascade(
  db: Firestore,
  projectId: string
): Promise<void> {
  const folderPaths = getAllFolderPathsArray();

  for (const folderPath of folderPaths) {
    const segments = getFolderSegments(folderPath);
    if (segments.length === 0) continue;

    const folderPathId = segments.join('__');
    const filesRef = collection(db, 'files', 'projects', projectId, folderPathId, 'files');
    const snapshot = await getDocs(filesRef);

    for (const d of snapshot.docs) {
      const data = d.data();
      const publicId = fileKeyFromFirestoreDoc(data as Record<string, unknown>) || undefined;
      const fileName = data.fileName as string | undefined;
      if (publicId) {
        await deleteFile(publicId, fileName);
      }
      await deleteDoc(doc(db, 'files', 'projects', projectId, folderPathId, 'files', d.id));
    }
  }

  // Delete fileReadStatus entries for this project
  const readStatusRef = collection(db, 'fileReadStatus');
  const readStatusQuery = query(readStatusRef, where('projectId', '==', projectId));
  const readStatusSnapshot = await getDocs(readStatusQuery);
  await Promise.all(
    readStatusSnapshot.docs.map((d) => deleteDoc(doc(db, 'fileReadStatus', d.id)))
  );

  // Delete report approvals for this project
  const approvalsRef = collection(db, 'reportApprovals');
  const approvalsQuery = query(approvalsRef, where('projectId', '==', projectId));
  const approvalsSnapshot = await getDocs(approvalsQuery);
  await Promise.all(
    approvalsSnapshot.docs.map((d) => deleteDoc(doc(db, 'reportApprovals', d.id)))
  );

  const reportSigRef = collection(db, 'reportSignatures');
  const reportSigQuery = query(reportSigRef, where('projectId', '==', projectId));
  const reportSigSnapshot = await getDocs(reportSigQuery);
  await Promise.all(
    reportSigSnapshot.docs.map((d) => deleteDoc(doc(db, 'reportSignatures', d.id)))
  );

  // Delete the project document
  await deleteDoc(doc(db, 'projects', projectId));
}

/**
 * Delete related data for a single file (fileReadStatus, reportApprovals, reportSignatures).
 * Call when deleting a file from a project so admin screens (audit logs, tracking) stay in sync.
 * filePath in these collections is the storage file key (logical path).
 */
export async function deleteFileRelatedData(
  db: Firestore,
  projectId: string,
  fileKey: string
): Promise<void> {
  const readStatusRef = collection(db, 'fileReadStatus');
  const readStatusQuery = query(
    readStatusRef,
    where('projectId', '==', projectId),
    where('filePath', '==', fileKey)
  );
  const readStatusSnapshot = await getDocs(readStatusQuery);
  await Promise.all(
    readStatusSnapshot.docs.map((d) => deleteDoc(doc(db, 'fileReadStatus', d.id)))
  );

  const approvalsRef = collection(db, 'reportApprovals');
  const approvalsQuery = query(
    approvalsRef,
    where('projectId', '==', projectId),
    where('filePath', '==', fileKey)
  );
  const approvalsSnapshot = await getDocs(approvalsQuery);
  await Promise.all(
    approvalsSnapshot.docs.map((d) => deleteDoc(doc(db, 'reportApprovals', d.id)))
  );

  const reportSigRef = collection(db, 'reportSignatures');
  // fileKey is the full logical path (includes projectId); single-field query avoids composite index.
  const reportSigQuery = query(reportSigRef, where('filePath', '==', fileKey));
  const reportSigSnapshot = await getDocs(reportSigQuery);
  await Promise.all(
    reportSigSnapshot.docs.map((d) => deleteDoc(doc(db, 'reportSignatures', d.id)))
  );
}
