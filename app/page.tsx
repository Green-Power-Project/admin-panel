'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const router = useRouter();
  const { currentUser, loading } = useAuth();

  useEffect(() => {
    // Add a small delay to prevent rapid redirects
    const timer = setTimeout(() => {
      if (!loading) {
        // Only redirect admin users to dashboard
        if (currentUser && currentUser.isAdmin) {
          router.push('/dashboard');
        } else {
          // Non-admin or not logged in, go to login
          router.push('/login');
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [currentUser, loading, router]);

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
        
        {/* Animated text */}
        <div className="space-y-3">
          <h2 className="text-xl font-bold text-gray-800 tracking-tight">
            <span className="inline-block" style={{ animation: 'fade-in-up 0.6s ease-out' }}>V</span>
            <span className="inline-block" style={{ animation: 'fade-in-up 0.6s ease-out 0.1s', animationFillMode: 'both' }}>e</span>
            <span className="inline-block" style={{ animation: 'fade-in-up 0.6s ease-out 0.2s', animationFillMode: 'both' }}>r</span>
            <span className="inline-block" style={{ animation: 'fade-in-up 0.6s ease-out 0.3s', animationFillMode: 'both' }}>i</span>
            <span className="inline-block" style={{ animation: 'fade-in-up 0.6s ease-out 0.4s', animationFillMode: 'both' }}>f</span>
            <span className="inline-block" style={{ animation: 'fade-in-up 0.6s ease-out 0.5s', animationFillMode: 'both' }}>y</span>
            <span className="inline-block mx-2" style={{ animation: 'fade-in-up 0.6s ease-out 0.6s', animationFillMode: 'both' }}>A</span>
            <span className="inline-block" style={{ animation: 'fade-in-up 0.6s ease-out 0.7s', animationFillMode: 'both' }}>c</span>
            <span className="inline-block" style={{ animation: 'fade-in-up 0.6s ease-out 0.8s', animationFillMode: 'both' }}>c</span>
            <span className="inline-block" style={{ animation: 'fade-in-up 0.6s ease-out 0.9s', animationFillMode: 'both' }}>e</span>
            <span className="inline-block" style={{ animation: 'fade-in-up 0.6s ease-out 1s', animationFillMode: 'both' }}>s</span>
            <span className="inline-block" style={{ animation: 'fade-in-up 0.6s ease-out 1.1s', animationFillMode: 'both' }}>s</span>
          </h2>
          
          {/* Animated dots */}
          <div className="flex items-center justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-green-power-500"
                style={{
                  animation: `bounce 1.4s ease-in-out infinite`,
                  animationDelay: `${i * 0.2}s`,
                }}
              ></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

