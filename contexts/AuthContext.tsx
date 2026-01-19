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
import { doc, getDoc } from 'firebase/firestore';
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

  async function checkAdminStatus(user: User): Promise<boolean> {
    try {
      // Check if user is admin by checking admin collection or custom claims
      // For now, we'll check a simple admin collection
      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      return adminDoc.exists();
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  async function login(email: string, password: string): Promise<void> {
    // First, authenticate with Firebase
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Then verify admin status
    const isAdmin = await checkAdminStatus(user);
    if (!isAdmin) {
      // Not an admin, sign out immediately
      await signOut(auth);
      throw new Error('Access denied. Admin privileges required.');
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
        const isAdmin = await checkAdminStatus(user);
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

