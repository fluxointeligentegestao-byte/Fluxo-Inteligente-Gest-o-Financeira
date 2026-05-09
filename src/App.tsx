import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ClientProvider } from './context/ClientContext';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Reports } from './pages/Reports';
import { Dashboard } from './pages/Dashboard';
import { Profile } from './pages/Profile';
import { Clients } from './pages/Clients';
import { Documents } from './pages/Documents';
import { Plans } from './pages/Plans';
import { Support } from './pages/Support';
import { FinancialAgenda } from './pages/FinancialAgenda';
import { Registrations } from './pages/Registrations';
import { Transactions } from './pages/Transactions';
import { Reconciliation } from './pages/Reconciliation';

function AppContent() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = React.useState('profile');
  const [prevTab, setPrevTab] = React.useState('dashboard');

  const handleTabChange = (newTab: string) => {
    setPrevTab(activeTab);
    setActiveTab(newTab);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
        <div className="absolute inset-x-0 -bottom-8 text-center text-[10px] font-black uppercase text-primary tracking-widest animate-pulse">Fluxo</div>
      </div>
    </div>
  );

  if (!user) return <Login />;

  return (
    <Layout activeTab={activeTab} setActiveTab={handleTabChange}>
      {activeTab === 'profile' && <Profile setActiveTab={handleTabChange} onBack={() => handleTabChange(prevTab)} />}
      {activeTab === 'dashboard' && <Dashboard setActiveTab={handleTabChange} onBack={() => handleTabChange(prevTab)} />}
      {activeTab === 'reports' && <Reports setActiveTab={handleTabChange} />}
      {activeTab === 'clients' && <Clients setActiveTab={handleTabChange} onBack={() => handleTabChange(prevTab)} />}
      {activeTab === 'documents' && <Documents setActiveTab={handleTabChange} onBack={() => handleTabChange(prevTab)} />}
      {activeTab === 'plans' && <Plans onBack={() => handleTabChange(prevTab)} />}
      {activeTab === 'support' && <Support setActiveTab={handleTabChange} onBack={() => handleTabChange(prevTab)} />}
      {activeTab === 'agenda' && <FinancialAgenda setActiveTab={handleTabChange} onBack={() => handleTabChange(prevTab)} />}
      {activeTab === 'transactions' && <Transactions setActiveTab={handleTabChange} onBack={() => handleTabChange(prevTab)} />}
      {activeTab === 'registrations' && <Registrations setActiveTab={handleTabChange} onBack={() => handleTabChange(prevTab)} />}
      {activeTab === 'reconciliation' && <Reconciliation setActiveTab={handleTabChange} onBack={() => handleTabChange(prevTab)} />}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ClientProvider>
        <AppContent />
      </ClientProvider>
    </AuthProvider>
  );
}
