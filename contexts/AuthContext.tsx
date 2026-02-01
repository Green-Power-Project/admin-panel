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
  isLoggingOut: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  createCustomerAccount: (email: string, password: string) => Promise<string>;
  signOutCustomerAfterCreation: () => Promise<void>;
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
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function checkIfAnyAdminsExist(): Promise<boolean> {
    if (!db) {
      console.error('Firestore is not initialized');
      return false;
    }
    const dbInstance = db; // Store for TypeScript narrowing

    try {
      // Cache-first approach: check cache first for instant response
      const adminsSnapshot = await getDocs(collection(dbInstance, 'admins'));
      if (!adminsSnapshot.empty) {
        return true;
      }
      
      // If cache is empty, try server (non-blocking, don't wait for retries)
      try {
        const serverSnapshot = await getDocsFromServer(collection(dbInstance, 'admins'));
        return !serverSnapshot.empty;
      } catch (serverError) {
        // If server fails, trust cache result (empty = no admins)
        return false;
      }
    } catch (error) {
      console.error('Error checking for existing admins:', error);
      // If all fails, assume no admins exist (allows first user to become admin)
      return false;
    }
  }

  async function checkAdminStatus(user: User): Promise<boolean> {
    if (!db) {
      console.error('Firestore is not initialized');
      return false;
    }
    const dbInstance = db; // Store for TypeScript narrowing

    try {
      // Cache-first approach: check cache first for instant response
      const adminDoc = await getDoc(doc(dbInstance, 'admins', user.uid));
      if (adminDoc.exists()) {
        return true;
      }
      
      // If cache says doesn't exist, try server (non-blocking)
      try {
        const serverDoc = await getDocFromServer(doc(dbInstance, 'admins', user.uid));
        return serverDoc.exists();
      } catch (serverError) {
        // If server fails, trust cache result
        return false;
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  async function createAdminDocument(user: User): Promise<void> {
    if (!db) {
      throw new Error('Firestore is not initialized');
    }
    const dbInstance = db; // Store for TypeScript narrowing
    
    try {
      await setDoc(doc(dbInstance, 'admins', user.uid), {
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
    if (!auth) {
      throw new Error('Firebase Auth is not initialized');
    }
    const authInstance = auth; // Store for TypeScript narrowing
    
    // First, authenticate with Firebase
    const userCredential = await signInWithEmailAndPassword(authInstance, email, password);
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
        await signOut(authInstance);
        throw new Error('Access denied. Admin privileges required.');
      }
    }
    
    // Admin verified, set user
    setCurrentUser({ ...user, isAdmin: true });
  }

  async function logout(): Promise<void> {
    if (!auth) {
      throw new Error('Firebase Auth is not initialized');
    }
    const authInstance = auth; // Store for TypeScript narrowing
    
    try {
      // Set logging out flag to prevent access denied message
      setIsLoggingOut(true);
      
      // Clear user state first
      setCurrentUser(null);
      
      // Sign out from Firebase Auth
      await signOut(authInstance);
      
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
    } finally {
      // Reset logging out flag after a short delay to allow redirect
      setTimeout(() => setIsLoggingOut(false), 100);
    }
  }

  async function createCustomerAccount(email: string, password: string): Promise<string> {
    if (!auth) {
      throw new Error('Firebase Auth is not initialized');
    }
    const authInstance = auth; // Store for TypeScript narrowing
    
    // Set flag in sessionStorage to prevent auth state handler from signing out
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('creatingCustomer', 'true');
    }
    setIsCreatingCustomer(true);
    
    try {
      const userCredential = await createUserWithEmailAndPassword(authInstance, email, password);
      const newCustomerUid = userCredential.user.uid;
      
      // Return the UID immediately - the caller will write to Firestore
      // Then we'll sign out the customer after Firestore write completes
      return newCustomerUid;
    } finally {
      // Don't clear the flag yet - we'll clear it after Firestore write
    }
  }

  async function signOutCustomerAfterCreation(): Promise<void> {
    if (!auth) {
      return;
    }
    const authInstance = auth;
    
    try {
      // Sign out the customer user
      await signOut(authInstance);
      
      // Wait for auth state to update
      await new Promise(resolve => setTimeout(resolve, 200));
    } finally {
      setIsCreatingCustomer(false);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('creatingCustomer');
      }
    }
  }

  function resetPassword(email: string) {
    if (!auth) {
      throw new Error('Firebase Auth is not initialized');
    }
    const authInstance = auth; // Store for TypeScript narrowing
    return sendPasswordResetEmail(authInstance, email);
  }

  // Safeguard: if loading takes too long (e.g. Firestore hang), stop loading so user is not stuck
  useEffect(() => {
    const maxLoadingMs = 5000;
    const t = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn('Auth loading timeout – stopping loading after', maxLoadingMs, 'ms');
          return false;
        }
        return prev;
      });
    }, maxLoadingMs);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!auth) {
      console.error('Firebase Auth is not initialized. Cannot set up auth state listener.');
      setLoading(false);
      return;
    }
    const authInstance = auth; // Store for TypeScript narrowing
    const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
      try {
        if (user) {
          // Keep loading true while verifying admin status
          setLoading(true);
          // Timeout so Firestore hang does not block forever
          const timeoutMs = 8000;
          const timeoutPromise = new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('Admin check timeout')), timeoutMs)
          );
          const isAdmin = await Promise.race([
            checkAdminStatus(user),
            timeoutPromise,
          ]).catch(() => false);
          
          if (!isAdmin) {
            // If not an admin, check if this is the first admin (no admins exist)
            const adminsExist = await Promise.race([
              checkIfAnyAdminsExist(),
              new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('Admins check timeout')), 6000)),
            ]).catch(() => true);
            
            if (!adminsExist) {
              // No admins exist - automatically create admin for first user
              try {
                await createAdminDocument(user);
                setCurrentUser({ ...user, isAdmin: true });
                setLoading(false);
              } catch (error) {
                console.error('Error auto-creating admin:', error);
                // If creation fails, still allow access (will retry later)
                setCurrentUser({ ...user, isAdmin: true });
                setLoading(false);
              }
            } else {
              // Not an admin - but check if we're in the middle of creating a customer
              // If so, don't sign out (the createCustomerAccount function will handle it)
              const creatingCustomer = typeof window !== 'undefined' && sessionStorage.getItem('creatingCustomer') === 'true';
              
              if (isCreatingCustomer || creatingCustomer) {
                // Just clear the user state, don't sign out yet
                // The createCustomerAccount function will sign out the customer
                setCurrentUser(null);
                setLoading(false);
                return;
              }
              
              // Not an admin and not creating customer - sign out immediately and clear state
              setCurrentUser(null);
              setLoading(false);
              try {
                await signOut(authInstance);
              } catch (signOutError) {
                console.error('Error signing out:', signOutError);
              }
              
              // Clear all storage
              if (typeof window !== 'undefined') {
                localStorage.clear();
                sessionStorage.clear();
              }
            }
          } else {
            // Admin verified - set user with admin flag
            setCurrentUser({ ...user, isAdmin: true });
            setLoading(false);
          }
        } else {
          // No user - clear state and stop loading
          setCurrentUser(null);
          setLoading(false);
        }
      } catch (error) {
        // Catch any errors in the auth state change handler
        console.error('Error in auth state change handler:', error);
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const value: AuthContextType = {
    currentUser,
    loading,
    isLoggingOut,
    login,
    logout,
    createCustomerAccount,
    signOutCustomerAfterCreation,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

