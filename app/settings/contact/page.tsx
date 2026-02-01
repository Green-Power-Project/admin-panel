'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Contact settings are now in Profile. Redirect old bookmarks.
 */
export default function ContactSettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/profile');
  }, [router]);
  return null;
}
