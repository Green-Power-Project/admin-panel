'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only redirect if not already on login page
    if (!loading && !currentUser && pathname !== '/login') {
      // Use replace to prevent back button navigation
      router.replace('/login');
    }
    
    // If user exists but is not admin, ensure they're logged out
    // This is handled in AuthContext, but we add extra protection here
    if (!loading && currentUser && !currentUser.isAdmin) {
      router.replace('/login');
    }
  }, [currentUser, loading, router, pathname]);

  if (loading) {
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

  // Block access if not authenticated or not admin
  if (!currentUser || !currentUser.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm max-w-md">
            <p className="font-semibold">Access Denied</p>
            <p className="mt-2">You do not have permission to access this page.</p>
            <button
              onClick={() => router.push('/login')}
              className="mt-4 px-4 py-2 bg-green-power-500 text-white text-sm font-medium rounded-sm hover:bg-green-power-600"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

