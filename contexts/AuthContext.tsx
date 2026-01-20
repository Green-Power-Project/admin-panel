'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, setDoc, getDocFromServer, getDocsFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface AdminUser extends User {
  isAdmin?: boolean;
}

interface AuthContextType {
  currentUser: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  createCustomerAccount: (email: string, password: string) => Promise<string>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function checkIfAnyAdminsExist(): Promise<boolean> {
    if (!db) {
      console.error('Firestore is not initialized');
      return false;
    }

    // Retry logic for offline errors
    const maxRetries = 3;
    let lastError: any = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Try server read first (forces online)
        const adminsSnapshot = await getDocsFromServer(collection(db, 'admins'));
        return !adminsSnapshot.empty;
      } catch (error: any) {
        lastError = error;
        // If it's an offline error, wait and retry
        if (error?.code === 'unavailable' || error?.message?.includes('offline') || error?.code === 'failed-precondition') {
          if (attempt < maxRetries - 1) {
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            continue;
          }
        }
        // For other errors or final attempt, try cache fallback
        try {
          const adminsSnapshot = await getDocs(collection(db, 'admins'));
          return !adminsSnapshot.empty;
        } catch (fallbackError) {
          console.error('Error checking for existing admins (fallback):', fallbackError);
        }
      }
    }
    
    console.error('Error checking for existing admins after retries:', lastError);
    // If all retries fail, assume no admins exist (allows first user to become admin)
    return false;
  }

  async function checkAdminStatus(user: User): Promise<boolean> {
    if (!db) {
      console.error('Firestore is not initialized');
      return false;
    }

    // Retry logic for offline errors
    const maxRetries = 3;
    let lastError: any = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Try server read first (forces online)
        const adminDoc = await getDocFromServer(doc(db, 'admins', user.uid));
        return adminDoc.exists();
      } catch (error: any) {
        lastError = error;
        // If it's an offline error, wait and retry
        if (error?.code === 'unavailable' || error?.message?.includes('offline') || error?.code === 'failed-precondition') {
          if (attempt < maxRetries - 1) {
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            continue;
          }
        }
        // For other errors or final attempt, try cache fallback
        try {
          const adminDoc = await getDoc(doc(db, 'admins', user.uid));
          return adminDoc.exists();
        } catch (fallbackError) {
          console.error('Error checking admin status (fallback):', fallbackError);
        }
      }
    }
    
    console.error('Error checking admin status after retries:', lastError);
    return false;
  }

  async function createAdminDocument(user: User): Promise<void> {
    try {
      await setDoc(doc(db, 'admins', user.uid), {
        email: user.email || '',
        createdAt: new Date().toISOString(),
        autoCreated: true, // Mark as auto-created for first admin
      });
    } catch (error) {
      console.error('Error creating admin document:', error);
      throw error;
    }
  }

  async function login(email: string, password: string): Promise<void> {
    // First, authenticate with Firebase
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Check if user is already an admin (with retry logic)
    let isAdmin = await checkAdminStatus(user);
    
    // If not an admin, check if this is the first admin (no admins exist)
    if (!isAdmin) {
      const adminsExist = await checkIfAnyAdminsExist();
      
      if (!adminsExist) {
        // No admins exist - automatically create admin for first user
        try {
          await createAdminDocument(user);
          isAdmin = true;
        } catch (error: any) {
          // If creating admin doc fails due to offline, still allow login
          // The document will be created when connection is restored
          if (error?.code === 'unavailable' || error?.message?.includes('offline')) {
            console.warn('Offline: Admin document creation will be retried when online');
            isAdmin = true; // Allow login, document will sync later
          } else {
            throw error;
          }
        }
      } else {
        // Admins exist but this user is not one - deny access
        await signOut(auth);
        throw new Error('Access denied. Admin privileges required.');
      }
    }
    
    // Admin verified, set user
    setCurrentUser({ ...user, isAdmin: true });
  }

  async function logout(): Promise<void> {
    try {
      // Clear user state first
      setCurrentUser(null);
      
      // Sign out from Firebase Auth
      await signOut(auth);
      
      // Clear all local storage and session storage
      if (typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
        
        // Clear any Firebase-related storage
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('firebase:') || key.startsWith('_firebase_'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      }
    } catch (error) {
      console.error('Error during logout:', error);
      // Even if logout fails, clear local state
      setCurrentUser(null);
      if (typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
      }
      throw error;
    }
  }

  async function createCustomerAccount(email: string, password: string): Promise<string> {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user.uid;
  }

  function resetPassword(email: string) {
    return sendPasswordResetEmail(auth, email);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Verify admin status on every auth state change
        let isAdmin = await checkAdminStatus(user);
        
        // If not an admin, check if this is the first admin (no admins exist)
        if (!isAdmin) {
          const adminsExist = await checkIfAnyAdminsExist();
          
          if (!adminsExist) {
            // No admins exist - automatically create admin for first user
            try {
              await createAdminDocument(user);
              isAdmin = true;
            } catch (error) {
              console.error('Error auto-creating admin:', error);
            }
          }
        }
        
        if (isAdmin) {
          setCurrentUser({ ...user, isAdmin: true });
        } else {
          // Not an admin, sign out immediately and clear state
          setCurrentUser(null);
          await signOut(auth);
          
          // Clear all storage
          if (typeof window !== 'undefined') {
            localStorage.clear();
            sessionStorage.clear();
            
            // Redirect to login if not already there
            if (window.location.pathname !== '/login') {
              window.location.href = '/login';
            }
          }
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value: AuthContextType = {
    currentUser,
    loading,
    login,
    logout,
    createCustomerAccount,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

