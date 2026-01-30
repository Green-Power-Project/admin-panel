/**
 * FIXED FOLDER STRUCTURE
 * 
 * This is the predefined, immutable folder structure for all projects.
 * This structure MUST be identical for every project and CANNOT be modified.
 * 
 * Structure:
 * - 00_New_Not_Viewed_Yet_ (root level)
 * - 01_Customer_Uploads (with Photos, Documents, Other subfolders)
 * - 02_Photos (with Before, During_Work, After, Damages_and_Defects subfolders)
 * - 03_Reports (with Daily_Reports, Weekly_Reports, Acceptance_Protocols subfolders)
 * - 04_Emails (with Incoming, Outgoing subfolders)
 * - 05_Quotations (with Drafts, Approved, Rejected subfolders)
 * - 06_Invoices (with Progress_Invoices, Final_Invoices, Credit_Notes subfolders)
 * - 07_Delivery_Notes (with Material_Delivery_Notes, Piecework_Delivery_Notes, Reports_Linked_to_Delivery_Notes subfolders)
 * - 08_General (with Contracts, Plans, Other_Documents subfolders)
 * - 09_Admin_Only (admin-only private folder – not visible to customers; e.g. material prices, internal notes)
 */

/** Folder path for the admin-only private folder. Must match the path used in window-app blocking logic. */
export const ADMIN_ONLY_FOLDER_PATH = '09_Admin_Only' as const;

export interface Folder {
  name: string;
  path: string;
  children?: Folder[];
}

/**
 * FIXED PROJECT FOLDER STRUCTURE
 * This structure is immutable and must be identical for all projects.
 */
export const PROJECT_FOLDER_STRUCTURE: Folder[] = [
  {
    name: '00_New_Not_Viewed_Yet_',
    path: '00_New_Not_Viewed_Yet_',
  },
  {
    name: '01_Customer_Uploads',
    path: '01_Customer_Uploads',
    children: [
      { name: 'Photos', path: '01_Customer_Uploads/Photos' },
      { name: 'Documents', path: '01_Customer_Uploads/Documents' },
      { name: 'Other', path: '01_Customer_Uploads/Other' },
    ],
  },
  {
    name: '02_Photos',
    path: '02_Photos',
    children: [
      { name: 'Before', path: '02_Photos/Before' },
      { name: 'During_Work', path: '02_Photos/During_Work' },
      { name: 'After', path: '02_Photos/After' },
      { name: 'Damages_and_Defects', path: '02_Photos/Damages_and_Defects' },
    ],
  },
  {
    name: '03_Reports',
    path: '03_Reports',
    children: [
      { name: 'Daily_Reports', path: '03_Reports/Daily_Reports' },
      { name: 'Weekly_Reports', path: '03_Reports/Weekly_Reports' },
      { name: 'Acceptance_Protocols', path: '03_Reports/Acceptance_Protocols' },
    ],
  },
  {
    name: '04_Emails',
    path: '04_Emails',
    children: [
      { name: 'Incoming', path: '04_Emails/Incoming' },
      { name: 'Outgoing', path: '04_Emails/Outgoing' },
    ],
  },
  {
    name: '05_Quotations',
    path: '05_Quotations',
    children: [
      { name: 'Drafts', path: '05_Quotations/Drafts' },
      { name: 'Approved', path: '05_Quotations/Approved' },
      { name: 'Rejected', path: '05_Quotations/Rejected' },
    ],
  },
  {
    name: '06_Invoices',
    path: '06_Invoices',
    children: [
      { name: 'Progress_Invoices', path: '06_Invoices/Progress_Invoices' },
      { name: 'Final_Invoices', path: '06_Invoices/Final_Invoices' },
      { name: 'Credit_Notes', path: '06_Invoices/Credit_Notes' },
    ],
  },
  {
    name: '07_Delivery_Notes',
    path: '07_Delivery_Notes',
    children: [
      { name: 'Material_Delivery_Notes', path: '07_Delivery_Notes/Material_Delivery_Notes' },
      { name: 'Piecework_Delivery_Notes', path: '07_Delivery_Notes/Piecework_Delivery_Notes' },
      { name: 'Reports_Linked_to_Delivery_Notes', path: '07_Delivery_Notes/Reports_Linked_to_Delivery_Notes' },
    ],
  },
  {
    name: '08_General',
    path: '08_General',
    children: [
      { name: 'Contracts', path: '08_General/Contracts' },
      { name: 'Plans', path: '08_General/Plans' },
      { name: 'Other_Documents', path: '08_General/Other_Documents' },
    ],
  },
  {
    name: '09_Admin_Only',
    path: '09_Admin_Only',
    // No children – single folder for private files (material prices, internal notes). Not visible to customers.
  },
];

/**
 * Whether the folder path is the admin-only private folder (or a subpath).
 * Used to hide this folder from customer-facing APIs and UI.
 */
export function isAdminOnlyFolderPath(folderPath: string): boolean {
  return folderPath === ADMIN_ONLY_FOLDER_PATH || folderPath.startsWith(`${ADMIN_ONLY_FOLDER_PATH}/`);
}

const VISIBLE_FOLDER_STRUCTURE = PROJECT_FOLDER_STRUCTURE.filter(
  (f) => f.path !== '00_New_Not_Viewed_Yet_' && f.path !== '01_Customer_Uploads'
);

/**
 * Returns the single top-level folder that contains (or equals) the selected folder path.
 * Used so the files sidebar shows only the opened folder and its subfolders.
 */
export function getScopeFolder(selectedFolderPath: string): Folder | null {
  for (const folder of VISIBLE_FOLDER_STRUCTURE) {
    if (selectedFolderPath === folder.path) return folder;
    if (folder.children?.some((c) => c.path === selectedFolderPath)) return folder;
  }
  return null;
}

/**
 * Default folder path when opening files for a project (first visible folder or first child).
 */
export function getDefaultFilesFolderPath(): string {
  for (const folder of VISIBLE_FOLDER_STRUCTURE) {
    if (folder.children && folder.children.length > 0) {
      return folder.children[0].path;
    }
    return folder.path;
  }
  return VISIBLE_FOLDER_STRUCTURE[0]?.path ?? '';
}

/**
 * Get all valid folder paths (including nested folders)
 * Returns a Set for fast lookup
 */
export function getAllValidFolderPaths(): Set<string> {
  const paths = new Set<string>();
  
  PROJECT_FOLDER_STRUCTURE.forEach((folder) => {
    paths.add(folder.path);
    if (folder.children) {
      folder.children.forEach((child) => {
        paths.add(child.path);
      });
    }
  });
  
  return paths;
}

/**
 * Validate if a folder path is valid according to the fixed structure
 * @param folderPath - The folder path to validate
 * @returns true if the path is valid, false otherwise
 */
export function isValidFolderPath(folderPath: string): boolean {
  const validPaths = getAllValidFolderPaths();
  return validPaths.has(folderPath);
}

/**
 * Get all folder paths as an array (for iteration)
 */
export function getAllFolderPathsArray(): string[] {
  return Array.from(getAllValidFolderPaths());
}

/**
 * Get folder paths that are visible in the project UI (for admin edit table).
 * Excludes 00_New_Not_Viewed_Yet_ and 01_Customer_Uploads.
 */
export function getVisibleFolderPathsForEdit(): string[] {
  const paths: string[] = [];
  VISIBLE_FOLDER_STRUCTURE.forEach((folder) => {
    paths.push(folder.path);
    folder.children?.forEach((child) => paths.push(child.path));
  });
  return paths;
}
