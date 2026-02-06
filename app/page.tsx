'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

const REDIRECT_DELAY_MS = 150;
const MAX_LOADING_MS = 5000;

export default function Home() {
  const router = useRouter();
  const { currentUser, loading } = useAuth();
  const { t } = useLanguage();
  const mountedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        if (currentUser && currentUser.isAdmin) {
          router.push('/dashboard');
        } else {
          router.push('/login');
        }
      }, REDIRECT_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [currentUser, loading, router]);

  // Safety: if loading runs too long (e.g. auth hang), redirect to login so user is not stuck
  useEffect(() => {
    const timer = setTimeout(() => {
      const elapsed = Date.now() - mountedAt.current;
      if (elapsed >= MAX_LOADING_MS) {
        router.push('/login');
      }
    }, MAX_LOADING_MS);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="text-center">
        {/* Modern animated loader */}
        <div className="relative inline-block mb-8">
          {/* Rotating circles */}
          <div className="relative w-20 h-20">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-green-power-500 border-r-green-power-600"
                style={{
                  animation: `spin 1.5s linear infinite`,
                  animationDelay: `${i * 0.2}s`,
                  transform: `rotate(${i * 120}deg)`,
                }}
              ></div>
            ))}
            
            {/* Pulsing center circle */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div 
                className="w-8 h-8 rounded-full bg-gradient-to-br from-green-power-400 to-green-power-600 shadow-lg"
                style={{
                  animation: 'pulse-scale 1.5s ease-in-out infinite',
                }}
              ></div>
            </div>
          </div>
          
          {/* Orbiting dots */}
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-green-power-500"
              style={{
                transformOrigin: '0 40px',
                transform: `translate(-50%, -50%) rotate(${i * 90}deg) translateY(-40px)`,
                animation: `orbit 2s linear infinite`,
                animationDelay: `${i * 0.5}s`,
              }}
            ></div>
          ))}
        </div>
        
        <p className="text-xl font-semibold text-gray-800">{t('common.loading')}</p>
      </div>
    </div>
  );
}

