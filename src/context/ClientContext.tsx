import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

interface ClientContextType {
  selectedClientId: string | null;
  selectedClientName: string | null;
  clients: { id: string, name: string, planId?: string }[];
  isPreviewMode: boolean;
  setSelectedClient: (clientId: string | null, clientName: string | null) => void;
  setIsPreviewMode: (value: boolean) => void;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export const ClientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isAdmin } = useAuth();
  const [selectedClientId, setSelectedClientIdState] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientNameState] = useState<string | null>(null);
  const [clients, setClients] = useState<{ id: string, name: string, planId?: string }[]>([]);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Load clients for admin
  useEffect(() => {
    if (isAdmin) {
      console.log("ClientContext: Subscribing to userProfiles (isAdmin=true)... User:", profile?.email);
      // Broadened query to see if role filter was the issue
      const q = query(collection(db, "userProfiles"));
      const unsubscribe = onSnapshot(q, (snapshot: any) => {
        console.log(`ClientContext: Fetched ${snapshot.docs.length} total profiles from Firestore`);
        const clientList = snapshot.docs
          .map((doc: any) => {
            const data = doc.data();
            // console.log(`ClientContext: Profile found - ID: ${doc.id}, Name: ${data.name}, Role: ${data.role}`);
            return { 
              id: doc.id, 
              name: data.name || data.companyName || 'Sem nome',
              companyName: data.companyName || '',
              role: data.role?.toLowerCase() || '',
              ...data 
            };
          })
          .filter((profile: any) => {
            const role = profile.role;
            // Admin is never a client in this list
            if (role === 'admin') return false;
            // Common variations or empty role defaults to client
            return role === 'client' || role === 'cliente' || !role;
          }) 
          .map((profile: any) => {
            let planId = profile.planId || profile.plan;
            if (planId) {
              planId = planId.toLowerCase();
              if (planId === 'consultoria') planId = 'premium';
            }
            return {
              id: profile.id,
              name: profile.name || 'Sem nome',
              companyName: profile.companyName || '',
              planId: planId
            };
          });
        
        console.log(`ClientContext: Final client list size after filter: ${clientList.length}`);
        setClients(clientList);
      }, (error) => {
        console.error("Error listening to clients in ClientContext:", error);
        if (error.message.includes('permission-denied')) {
          console.log("Notice: Permission denied for listing userProfiles. This is expected if the user is not an administrator.");
        }
      });
      return () => unsubscribe();
    } else {
      console.log("ClientContext: Not an admin or not loaded, skipping client subscribe. isAdmin:", isAdmin, "Profile:", !!profile);
      setClients([]);
    }
  }, [profile, isAdmin]);

  // Default to own ID if not admin
  useEffect(() => {
    if (profile && !isAdmin) {
      setSelectedClientIdState(profile.uid);
      setSelectedClientNameState(profile.name || null);
    }
  }, [profile]);

  const setSelectedClient = (clientId: string | null, clientName: string | null) => {
    setSelectedClientIdState(clientId);
    setSelectedClientNameState(clientName);
    // Reset preview mode when changing client
    if (!clientId) setIsPreviewMode(false);
  };

  return (
    <ClientContext.Provider value={{ 
      selectedClientId, 
      selectedClientName, 
      clients, 
      isPreviewMode, 
      setSelectedClient, 
      setIsPreviewMode 
    }}>
      {children}
    </ClientContext.Provider>
  );
};

export const useClient = () => {
  const context = useContext(ClientContext);
  if (context === undefined) {
    throw new Error('useClient must be used within a ClientProvider');
  }
  return context;
};
