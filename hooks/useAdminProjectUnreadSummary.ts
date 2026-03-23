'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { subscribeToMessages } from '@/lib/chatRealtimeService';
import type { ChatMessage } from '@/lib/chatRealtimeTypes';
import { countUnreadChatForAdmin } from '@/lib/chatUnreadUtils';
import { computeAdminTotalFolderUnread } from '@/lib/projectFolderUnreadAdmin';

export interface AdminProjectUnreadSummary {
  chatUnread: number;
  folderUnread: number;
  total: number;
  loading: boolean;
}

export function useAdminProjectUnreadSummary(projectId: string | null | undefined): AdminProjectUnreadSummary {
  const [chatUnread, setChatUnread] = useState(0);
  const [folderUnread, setFolderUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshFolders = useCallback(async () => {
    if (!projectId || !db) {
      setFolderUnread(0);
      setLoading(false);
      return;
    }
    try {
      const total = await computeAdminTotalFolderUnread(projectId);
      setFolderUnread(total);
    } catch (e) {
      console.error('computeAdminTotalFolderUnread', e);
      setFolderUnread(0);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setChatUnread(0);
      setFolderUnread(0);
      setLoading(false);
      return undefined;
    }
    const unsub = subscribeToMessages(projectId, (messages: ChatMessage[]) => {
      setChatUnread(countUnreadChatForAdmin(messages));
    });
    return () => unsub();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !db) {
      setFolderUnread(0);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    refreshFolders();
    const q = query(collection(db, 'adminFileReadStatus'), where('projectId', '==', projectId));
    const unsub = onSnapshot(
      q,
      () => {
        refreshFolders();
      },
      (err) => {
        console.error('adminFileReadStatus listener', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [projectId, refreshFolders]);

  const total = chatUnread + folderUnread;
  return { chatUnread, folderUnread, total, loading };
}
