'use client';

import { useState, useEffect } from 'react';
import { subscribeToMessages } from '@/lib/chatRealtimeService';
import type { ChatMessage } from '@/lib/chatRealtimeTypes';
import { countUnreadChatForAdmin } from '@/lib/chatUnreadUtils';

/** Live count of unread chat messages for admin (customer messages not yet read). */
export function useAdminChatUnreadCount(projectId: string | null | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!projectId) {
      setCount(0);
      return undefined;
    }
    const unsub = subscribeToMessages(projectId, (messages: ChatMessage[]) => {
      setCount(countUnreadChatForAdmin(messages));
    });
    return () => unsub();
  }, [projectId]);

  return count;
}
