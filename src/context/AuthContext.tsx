import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, signInWithEmailAndPassword, sendPasswordResetEmail as fbSendPasswordResetEmail, updateEmail as fbUpdateEmail, updatePassword as fbUpdatePassword } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  plansConfig: any;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  updateEmail: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [plansConfig, setPlansConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // System plans config is fetched globally but only if user exists
  useEffect(() => {
    if (!user) {
      setPlansConfig(null);
      return;
    }

    const userIsAdmin = user.email?.toLowerCase() === 'fluxointeligente.gestao@gmail.com'.toLowerCase() || profile?.role === 'admin';
    const path = 'system_configs/plans_config';
    const unsubscribe = onSnapshot(doc(db, 'system_configs', 'plans_config'), async (docSnap) => {
      if (docSnap.exists()) {
        setPlansConfig(docSnap.data());
      } else if (userIsAdmin) {
        // Init default plans if admin and doesn't exist
        console.log("Initializing default plans config...");
        const defaultPlans = {
          essencial: { 
            level: 1, 
            label: 'Essencial — Operação', 
            price: 400, 
            entriesLimit: 50, 
            tagline: 'Organização e rotina',
            reports: ['📅 Minha Agenda de Contas', '🔄 Conciliação Bancária'],
            features: [
              'Organização da rotina financeira',
              'Controle de contas a pagar e receber',
              'Cadastro e estruturação financeira',
              'Conciliação bancária básica',
              'Acompanhamento operacional financeiro'
            ]
          },
          profissional: { 
            level: 2, 
            label: 'Profissional — Operação', 
            price: 800, 
            entriesLimit: 150, 
            tagline: 'Gestão estruturada',
            reports: ['📅 Minha Agenda de Contas', '🔄 Conciliação Bancária', '📈 DRE Gerencial', '💰 Fluxo de Caixa'],
            features: [
              'Gestão financeira estruturada',
              'Controle financeiro operacional',
              'Conciliação bancária avançada',
              'Conferência e organização das movimentações',
              'Acompanhamento financeiro mensal'
            ]
          },
          premium: { 
            level: 3, 
            label: 'Premium — Operação & Análise', 
            price: 1200, 
            entriesLimit: 0, 
            tagline: 'Inteligência Estratégica',
            reports: ['📅 Minha Agenda de Contas', '🔄 Conciliação Bancária', '📈 DRE Gerencial', '💰 Fluxo de Caixa', '📝 Relatório Mensal', '🎯 Dashboards'],
            features: [
              'Tudo do Profissional +',
              'Indicadores financeiros do fluxo de caixa',
              'Indicadores da DRE gerencial',
              'KPIs financeiros estratégicos',
              'Dashboards financeiros inteligentes'
            ]
          }
        };
        try {
          const payload = { 
            plans: defaultPlans,
            updatedAt: serverTimestamp() 
          };
          await setDoc(doc(db, 'system_configs', 'plans_config'), payload);
          setPlansConfig(payload);
        } catch (err) {
          console.error("Failed to init plans config:", err);
        }
      }
    }, (error) => {
      console.error("Error listening to plans config:", error);
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsubscribe();
  }, [user, profile]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        const profileRef = doc(db, 'userProfiles', user.uid);
        
        // Use onSnapshot for real-time updates
        const unsubscribeProfile = onSnapshot(profileRef, async (profileDoc) => {
          if (profileDoc.exists()) {
            const data = profileDoc.data() as UserProfile;
            
            // Normalize plan fields
            if (!data.planId && (data as any).plan) {
                data.planId = (data as any).plan;
            }
            if (data.planId) {
                data.planId = data.planId.toLowerCase();
                if (data.planId === 'consultoria') data.planId = 'premium';
            }
            
            // Auto-elevate admin based on email
            if (user.email === 'fluxointeligente.gestao@gmail.com' && data.role !== 'admin') {
               await updateDoc(profileRef, { role: 'admin' });
               data.role = 'admin';
            }
            
            setProfile(data);
          } else {
            // New user setup
            const role = user.email === 'fluxointeligente.gestao@gmail.com' ? 'admin' : 'client';
            const newProfile: UserProfile = {
              uid: user.uid,
              name: user.displayName || 'Usuário',
              email: user.email || '',
              role: role,
              createdAt: serverTimestamp(),
            };
            await setDoc(profileRef, newProfile);
            setProfile(newProfile);
          }
          setLoading(false);
        }, (error) => {
          console.error("Error listening to profile:", error);
          handleFirestoreError(error, OperationType.GET, `userProfiles/${user.uid}`);
          setLoading(false);
        });

        return () => unsubscribeProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      console.log('Attempting Google Sign-In...');
      const result = await signInWithPopup(auth, provider);
      console.log('Google Sign-In successful for user:', result.user.email);
    } catch (error: any) {
      console.error('Google Sign-In error:', error.code, error.message);
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    try {
      console.log('Attempting Email Sign-In for:', email);
      const result = await signInWithEmailAndPassword(auth, email, pass);
      console.log('Email Sign-In successful for user:', result.user.email);
    } catch (error: any) {
      console.error('Email Sign-In error:', error.code, error.message);
      throw error;
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return;
    const profilePath = `userProfiles/${user.uid}`;
    try {
      await setDoc(doc(db, 'userProfiles', user.uid), updates, { merge: true });
      setProfile(prev => prev ? { ...prev, ...updates } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, profilePath);
      throw error;
    }
  };

  const updateEmail = async (newEmail: string) => {
    if (!auth.currentUser) return;
    try {
      await fbUpdateEmail(auth.currentUser, newEmail);
      await updateProfile({ email: newEmail });
    } catch (error) {
      console.error('Update email error:', error);
      throw error;
    }
  };

  const updatePassword = async (newPassword: string) => {
    if (!auth.currentUser) return;
    try {
      await fbUpdatePassword(auth.currentUser, newPassword);
    } catch (error) {
      console.error('Update password error:', error);
      throw error;
    }
  };

  const sendPasswordResetEmail = async (email: string) => {
    try {
      auth.languageCode = 'pt-BR';
      await fbSendPasswordResetEmail(auth, email);
    } catch (error: any) {
      console.error('Send password reset email error:', error.code, error.message);
      
      // Handle network errors specifically with more context
      if (error.code === 'auth/network-request-failed') {
        throw new Error('Falha na conexão. Verifique sua internet ou tente novamente em alguns instantes.');
      }
      
      if (error.code === 'auth/user-not-found') {
        throw new Error('Este e-mail não está cadastrado em nossa base.');
      }

      if (error.code === 'auth/invalid-email') {
        throw new Error('O e-mail digitado é inválido.');
      }
      
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const isAdmin = profile?.role === 'admin' || user?.email?.toLowerCase() === 'fluxointeligente.gestao@gmail.com'.toLowerCase();

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, plansConfig, loading, signInWithGoogle, signInWithEmail, updateProfile, updateEmail, updatePassword, sendPasswordResetEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
