'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { computeAdminFolderUnreadByPath } from '@/lib/projectFolderUnreadAdmin';

/** Live map of folder path -> unread file count for that path (admin). */
export function useAdminFolderUnreadByPath(projectId: string | null | undefined): Map<string, number> {
  const [map, setMap] = useState<Map<string, number>>(new Map());

  const refresh = useCallback(async () => {
    if (!projectId || !db) {
      setMap(new Map());
      return;
    }
    try {
      const m = await computeAdminFolderUnreadByPath(projectId);
      setMap(m);
    } catch (e) {
      console.error('computeAdminFolderUnreadByPath', e);
      setMap(new Map());
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !db) {
      setMap(new Map());
      return undefined;
    }
    refresh();
    const q = query(collection(db, 'adminFileReadStatus'), where('projectId', '==', projectId));
    const unsub = onSnapshot(q, () => {
      refresh();
    });
    return () => unsub();
  }, [projectId, refresh]);

  return map;
}
