# Admin Panel: Data Fetching & Where Caching Is Needed

Audit of how the admin panel fetches data and where caching would help (mirrors the customer-panel audit). **Analysis only** — implementation can follow.

---

## 1. Real-time listeners (onSnapshot) — **caching not needed**

| Location | What | Why no cache |
|----------|------|----------------|
| **app/files/[projectId]/page.tsx** | onSnapshot(project), onSnapshot(filesQuery), onSnapshot(customers), onSnapshot(customerMessages) | Live project, file list, customers, messages. |
| **app/projects/[id]/page.tsx** | onSnapshot(project) | Project detail. |
| **app/projects/[id]/edit/page.tsx** | onSnapshot(project) | Project edit. |
| **app/dashboard/page.tsx** | onSnapshot(customers), onSnapshot(projects), onSnapshot(reportApprovals) | Dashboard lists. |
| **app/customers/page.tsx** | onSnapshot(projects), onSnapshot(customers) | Lists. |
| **app/customers/[id]/page.tsx** | onSnapshot(customer), onSnapshot(projects) | Customer detail. |
| **app/projects/page.tsx** | onSnapshot(customers), onSnapshot(projects) | Lists. |
| **app/customer-uploads/page.tsx** | onSnapshot(projects) x2, onSnapshot(customers) | Build folder tasks from live data. |
| **app/audit-logs/page.tsx** | onSnapshot(projects), onSnapshot(fileReadStatus), onSnapshot(customers) | Build audit data. |
| **app/tracking/page.tsx** | onSnapshot(projects), onSnapshot(fileReadStatus), onSnapshot(customers) | Build tracking data. |
| **app/approvals/page.tsx** | onSnapshot(projects), onSnapshot(approvals), onSnapshot(customers) | Lists. |
| **app/gallery/page.tsx** | onSnapshot(collection(db, 'gallery')) | Live gallery (also has loadGalleryImages getDocs). |

---

## 2. One-off / repeated reads — **caching helps or is critical**

### 2.1 app/files/[projectId]/page.tsx — **cache recommended**

- **What:** `getCountFromServer(ref)` per path in `pathsToCount` (scope folder + its children, or custom folder paths). Effect deps: `projectId`, `selectedFolder`, `project?.customFolders`.
- **When:** Runs whenever user changes folder or project data loads; no cache, so repeated navigations refetch.
- **Where caching helps:** In-memory cache keyed by `projectId` + sorted `pathsToCount.join(',')`, TTL 2 min (same pattern as customer ProjectFolderTree). Reduces aggregation queries on back/forward or re-renders.

---

### 2.2 app/projects/[id]/page.tsx (ProjectFoldersSection) — **cache recommended**

- **What:** `getCountFromServer(ref)` for every folder path (paths from PROJECT_FOLDER_STRUCTURE minus 2). One aggregation per path.
- **When:** Effect deps: `projectId`, `folders`. Runs on every mount and when folders reference changes.
- **Where caching helps:** In-memory cache keyed by `projectId` + stable paths key, TTL 2 min. Same as customer panel file counts.

---

### 2.3 app/dashboard/page.tsx — **cache recommended**

- **What:** `loadCustomerUploadsCount(projectsList)` runs when projects snapshot fires. For each project, for each of 4 customer-upload folder paths, does `getDocs(filesCollection)`. So **4 × N projects** getDocs every time projects update.
- **When:** Called from the projects onSnapshot callback.
- **Where caching helps:** Cache the result (e.g. `totalCustomerUploads`) keyed by sorted `projectIds.join(',')` with TTL 1–2 min, so when projects snapshot fires again (e.g. no real change) we don’t re-run 4×N getDocs.

---

### 2.4 app/gallery/page.tsx — **cache recommended**

- **What:** `loadGalleryImages()` does `getDocs(collection(db, 'gallery'))`, then filter/sort in memory. Used in useEffect (and possibly after delete/update).
- **When:** On mount and when explicitly reloading (e.g. after upload/delete).
- **Where caching helps:** In-memory cache for gallery list, key `'gallery'`, TTL 2 min. Same idea as customer panel galleryClient.

---

### 2.5 app/profile/page.tsx — **cache recommended**

- **What:** `loadProfile()`: `getDoc(doc(db, 'admins', currentUser.uid))` and `getContactSettings(db)` (which does getDoc on contact settings). `handleSaveName`: another `getDoc(admins/uid)` to decide update vs set.
- **When:** On mount (effect) and before saving name.
- **Where caching helps:** (1) Cache admin profile by uid (name + docId), TTL 2 min; use cached docId in save so we can skip the second getDoc when possible. (2) Contact settings are global — cache in lib/contactSettings or in profile with TTL 2 min.

---

### 2.6 contexts/LanguageContext.tsx — **cache recommended**

- **What:** `getDoc(doc(db, 'admins', currentUser.uid))` to load language preference (and on save, again to decide update vs set).
- **When:** Once per user when provider mounts / currentUser set; again on setLanguage before write.
- **Where caching helps:** Cache language by uid (TTL 2 min). On load, if cache hit skip getDoc; on save, update cache after write. Same pattern as customer LanguageContext.

---

### 2.7 contexts/AuthContext.tsx — **optional cache**

- **What:** `getDocs(collection(db, 'admins'))` in hasAnyAdmins; `getDoc(doc(db, 'admins', user.uid))` in checkAdminStatus. Already uses cache-first then server fallback.
- **When:** On first admin check and when checking if current user is admin.
- **Where caching helps:** Optional: cache “admin status for uid” with short TTL so repeated checkAdminStatus (e.g. after tab focus) doesn’t hit Firestore. Low priority.

---

### 2.8 lib/galleryCategoryLabels.ts — **cache recommended**

- **What:** `getGalleryCategoryLabels(db)` and `getGalleryCategoryKeys(db)` each do `getDoc(doc(db, 'config', 'gallery'))` — **same doc read twice** if both are used.
- **When:** Called from gallery page (and possibly others) when building category dropdowns/labels.
- **Where caching helps:** Single cache entry for `config/gallery` (return both labels and keys from one getDoc, or cache both with same key), TTL 2 min. Reduces duplicate reads and repeated reads on re-mount.

---

### 2.9 lib/contactSettings.ts — **cache recommended**

- **What:** `getContactSettings(db)` does `getDoc(doc(db, 'siteSettings', 'contact'))`.
- **When:** Called from profile page (loadProfile) and possibly elsewhere when displaying contact info.
- **Where caching helps:** In-memory cache key `'contact'`, TTL 2 min. Same as customer panel contactSettings if we add cache there; admin profile loads contact on every visit otherwise.

---

### 2.10 app/customer-uploads/page.tsx — **optional cache**

- **What:** When building “folder tasks” from projects/customers, then one `getDocs(adminFileReadStatus)` and one `getDocs(task.ref)` per task (many getDocs in parallel).
- **When:** Triggered by snapshot updates (projects/customers). Builds full list of customer uploads.
- **Where caching helps:** Caching the aggregated list is tricky (many dimensions). Optional: cache `adminFileReadStatus` result for 1–2 min so repeated builds don’t re-read it. Medium impact.

---

### 2.11 app/audit-logs/page.tsx, app/tracking/page.tsx — **optional cache**

- **What:** After snapshots, they run `getDocs(task.ref)` per task to load file details (or similar). Many getDocs when data is built.
- **When:** When listeners fire (projects, fileReadStatus, customers).
- **Where caching helps:** Optional: cache the final computed list keyed by something stable (e.g. projectIds + customerIds + timestamp bucket) with short TTL to avoid refetch on every snapshot if nothing changed. Lower priority.

---

### 2.12 app/approvals/page.tsx — **no cache needed for single getDocs**

- **What:** `getDocs(q)` when opening a file (by cloudinaryPublicId) to get URL. One query per user click.
- **When:** On demand when user clicks to view file.
- **Where caching helps:** Not necessary; one-off per action.

---

### 2.13 app/customers/page.tsx (handleExport) — **optional**

- **What:** getDocs(projectsQuery), getDocs(approvalsQuery), getDocs(customersQuery) for CSV export.
- **When:** One-off when user clicks export.
- **Where caching helps:** Optional; only runs on export.

---

### 2.14 app/projects/new/page.tsx, app/projects/[id]/edit/page.tsx — **optional**

- **What:** `getDocs(customersQuery)` to populate customer dropdown (orderBy customerNumber).
- **When:** On mount of the page.
- **Where caching helps:** Cache customer list (e.g. key `'customers-list'`) TTL 2 min so navigating new → edit → new doesn’t re-fetch. Low priority.

---

### 2.15 app/customers/[id]/page.tsx — **optional**

- **What:** getDocs(existingQuery) to check existing customer; getDocs(customerQuery) to load customer by uid.
- **When:** On load / when resolving customer.
- **Where caching helps:** Cache customer doc by uid or by id with TTL 1–2 min. Low priority.

---

### 2.16 lib/cascadeDelete.ts, lib/reportApproval.ts, lib/fileReadTracking.ts — **no cache**

- **What:** getDocs for cascade delete, approval checks, file read checks. Used in delete flows or one-off checks.
- **When:** On user action (delete, approve, etc.).
- **Where caching helps:** Not needed; write/delete flows should see fresh data.

---

## 3. Summary table

| Place | How they're doing it | Cache needed? | Notes |
|-------|----------------------|---------------|--------|
| **files/[projectId]** | getCountFromServer per path (scope + children) | **Yes** | Key projectId + paths, TTL 2 min. |
| **projects/[id]** (ProjectFoldersSection) | getCountFromServer per folder path | **Yes** | Key projectId + paths, TTL 2 min. |
| **dashboard** | loadCustomerUploadsCount: 4×N getDocs per projects snapshot | **Yes** | Cache totalCustomerUploads by projectIds, TTL 2 min. |
| **gallery** | getDocs(collection(gallery)) in loadGalleryImages | **Yes** | Key 'gallery', TTL 2 min. |
| **profile** | getDoc(admins/uid) + getContactSettings (getDoc contact) | **Yes** | Cache admin by uid + contact settings. |
| **LanguageContext** | getDoc(admins/uid) for language | **Yes** | Cache language by uid, TTL 2 min. |
| **AuthContext** | getDocs(admins), getDoc(admins/uid) | Optional | Cache admin status by uid. |
| **galleryCategoryLabels** | getDoc(config/gallery) twice (labels + keys) | **Yes** | One cache for config/gallery (both labels and keys). |
| **contactSettings** | getDoc(siteSettings/contact) | **Yes** | Key 'contact', TTL 2 min. |
| **customer-uploads** | getDocs(adminFileReadStatus) + getDocs per task | Optional | Cache admin read status. |
| **audit-logs, tracking** | getDocs per task when building list | Optional | Cache computed list if stable. |
| **approvals** | getDocs by file path on view click | No | One-off. |
| **customers (export), projects new/edit, customers [id]** | getDocs for export or dropdowns | Optional | Low priority. |

---

## 4. Suggested implementation order

1. **File counts:** files/[projectId] and projects/[id] — same pattern as customer ProjectFolderTree; high impact (aggregation quota).
2. **Dashboard:** loadCustomerUploadsCount cache — avoids 4×N getDocs on every projects snapshot.
3. **Gallery:** loadGalleryImages cache — simple, high reuse.
4. **Profile:** admin doc + contact settings cache; use docId in save to avoid extra getDoc.
5. **LanguageContext:** language-by-uid cache (and update cache on setLanguage).
6. **contactSettings.ts:** global contact getDoc cache.
7. **galleryCategoryLabels.ts:** single getDoc + cache for config/gallery (return/cache both labels and keys).
8. **AuthContext:** optional admin-status cache.
9. **customer-uploads / audit-logs / tracking:** optional caches as above.

This audit reflects current admin-panel behavior and where caching is needed without changing any code.
