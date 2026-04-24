/**
 * Admin unread file counts using adminFileReadStatus (same collection as customer-uploads).
 */

import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { mergeDynamicSubfolders, PROJECT_FOLDER_STRUCTURE, type Folder } from '@/lib/folderStructure';
import { fileKeyFromFirestoreDoc } from '@/lib/fileDocFields';

const UNREAD_COUNT_QUERY_LIMIT = 300;

function getFolderSegments(folderPath: string): string[] {
  return folderPath.split('/').filter(Boolean);
}

function getProjectFolderRef(projectId: string, folderSegments: string[]) {
  if (folderSegments.length === 0) {
    throw new Error('Folder segments must not be empty');
  }
  if (!db) {
    throw new Error('Firestore database is not initialized');
  }
  const folderPathId = folderSegments.join('__');
  return collection(db, 'files', 'projects', projectId, folderPathId, 'files');
}

function collectSubfolders(folders: Folder[]): Array<{ path: string; parentPath: string }> {
  const out: Array<{ path: string; parentPath: string }> = [];
  for (const folder of folders) {
    if (folder.path === '00_New_Not_Viewed_Yet_') continue;
    if (!folder.children?.length) {
      out.push({ path: folder.path, parentPath: folder.path });
      continue;
    }
    for (const child of folder.children) {
      out.push({ path: child.path, parentPath: folder.path });
      if (child.children) {
        for (const grand of child.children) {
          out.push({ path: grand.path, parentPath: folder.path });
        }
      }
    }
  }
  return out;
}

/** All project folders except the special inbox root — full walk (includes customer uploads). */
export function getAdminFolderRootsForUnreadAggregation(): Folder[] {
  return PROJECT_FOLDER_STRUCTURE.filter((f) => f.path !== '00_New_Not_Viewed_Yet_');
}

/**
 * Same roots as the admin project detail "Project Folders" grid (projects/[id]).
 * Excludes only 00_New_Not_Viewed_Yet_ (inbox) — includes Customer Uploads and all other roots.
 */
export function getAdminFolderRootsVisibleOnProjectPage(): Folder[] {
  return PROJECT_FOLDER_STRUCTURE.filter((f) => f.path !== '00_New_Not_Viewed_Yet_');
}

async function countUnreadFilesInLeaf(
  projectId: string,
  folderPath: string,
  readPaths: Set<string>
): Promise<number> {
  try {
    const segments = getFolderSegments(folderPath);
    if (segments.length === 0) return 0;
    const filesCollection = getProjectFolderRef(projectId, segments);
    const filesQuery = query(filesCollection, limit(UNREAD_COUNT_QUERY_LIMIT));
    const snapshot = await getDocs(filesQuery);
    let unread = 0;
    snapshot.forEach((docSnap) => {
      const d = docSnap.data();
      // Admin unread badges should reflect customer-originated files only.
      // Admin uploads must not create admin unread noise on folder cards.
      const uploadedBy = typeof d.uploadedBy === 'string' ? d.uploadedBy.trim() : '';
      if (!uploadedBy) return;
      const filePath = fileKeyFromFirestoreDoc(d as Record<string, unknown>);
      if (!readPaths.has(filePath)) unread++;
    });
    return unread;
  } catch {
    return 0;
  }
}

/** Per folder path (each subfolder leaf) unread counts — for badges on subfolders. */
export async function computeAdminFolderUnreadByPath(projectId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!db) return counts;

  const readSnap = await getDocs(
    query(collection(db, 'adminFileReadStatus'), where('projectId', '==', projectId))
  );
  const readPaths = new Set<string>();
  readSnap.forEach((d) => {
    const data = d.data();
    if (data.adminRead && data.filePath) readPaths.add(data.filePath as string);
  });

  const projectSnap = await getDoc(doc(db, 'projects', projectId));
  const dynamicSubfolders = projectSnap.exists()
    ? (projectSnap.data().dynamicSubfolders as Record<string, string[]> | undefined)
    : undefined;
  const roots = mergeDynamicSubfolders(getAdminFolderRootsForUnreadAggregation(), dynamicSubfolders);
  const allSubfolders = collectSubfolders(roots);

  const results = await Promise.all(
    allSubfolders.map((sf) =>
      countUnreadFilesInLeaf(projectId, sf.path, readPaths).then((n) => ({ path: sf.path, parentPath: sf.parentPath, n }))
    )
  );

  for (const { path, n } of results) {
    counts.set(path, n);
  }

  return counts;
}

/** Sum unread under a top-level folder (for main folder cards). */
export function sumUnreadForTopLevelFolder(folder: Folder, byPath: Map<string, number>): number {
  let sum = 0;
  if (!folder.children?.length) {
    return byPath.get(folder.path) ?? 0;
  }
  for (const child of folder.children) {
    sum += byPath.get(child.path) ?? 0;
    if (child.children) {
      for (const grand of child.children) {
        sum += byPath.get(grand.path) ?? 0;
      }
    }
  }
  return sum;
}

/**
 * Total file-unread matching the admin project folder grid (same roots as projects/[id]),
 * including dynamic subfolders — must use merged roots so counts match per-folder badges.
 */
export async function computeAdminTotalFolderUnread(projectId: string): Promise<number> {
  if (!db) return 0;
  const map = await computeAdminFolderUnreadByPath(projectId);
  const projectSnap = await getDoc(doc(db, 'projects', projectId));
  const dynamicSubfolders = projectSnap.exists()
    ? (projectSnap.data().dynamicSubfolders as Record<string, string[]> | undefined)
    : undefined;
  const roots = mergeDynamicSubfolders(getAdminFolderRootsVisibleOnProjectPage(), dynamicSubfolders);
  let total = 0;
  for (const folder of roots) {
    total += sumUnreadForTopLevelFolder(folder, map);
  }
  return total;
}
