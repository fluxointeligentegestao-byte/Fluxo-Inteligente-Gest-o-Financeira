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
      const q = query(collection(db, "userProfiles"), where("role", "==", "client"));
      const unsubscribe = onSnapshot(q, (snapshot: any) => {
        const clientList = snapshot.docs.map((doc: any) => {
          const data = doc.data();
          let planId = data.planId || data.plan;
          if (planId) {
            planId = planId.toLowerCase();
            if (planId === 'consultoria') planId = 'premium';
          }
          return {
            id: doc.id,
            name: data.name,
            planId: planId
          };
        });
        setClients(clientList);
      }, (error) => {
        console.error("Error listening to clients in ClientContext:", error);
        handleFirestoreError(error, OperationType.GET, 'userProfiles');
      });
      return () => unsubscribe();
    }
  }, [profile]);

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
