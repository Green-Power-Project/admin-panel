import type { ChatMessage } from '@/lib/chatRealtimeTypes';

export function countUnreadChatForCustomer(messages: ChatMessage[]): number {
  return messages.filter((m) => m.senderType === 'admin' && m.status === 'sent').length;
}

export function countUnreadChatForAdmin(messages: ChatMessage[]): number {
  return messages.filter((m) => m.senderType === 'customer' && m.status === 'sent').length;
}
