import { getAllFolderPathsArray } from './folderStructure';

/**
 * Legacy no-op: project “folders” are logical paths on VPS disk (see `vpsStorage`), not buckets.
 */
export async function createProjectFolderStructure(projectId: string): Promise<void> {
  console.warn('Project folder structure placeholders are not created; storage uses path-based keys.', projectId);
}

export async function ensureProjectFolderStructure(projectId: string): Promise<void> {
  return createProjectFolderStructure(projectId);
}

