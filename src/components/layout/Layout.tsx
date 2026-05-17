import React from 'react';
import { motion } from 'motion/react';
import { 
  FileText, 
  Users,
  Upload, 
  CreditCard, 
  MessageSquare, 
  LogOut,
  Bell,
  BellOff,
  Menu,
  X,
  Home,
  LayoutDashboard,
  User,
  Calendar,
  Settings,
  Handshake,
  ChevronDown,
  Building2,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClient } from '../../context/ClientContext';
import { cn } from '../../lib/utils';
import { canAccessTab, UserPlan } from '../../lib/planUtils';
import { NotificationPrompt } from '../NotificationPrompt';
import { useNotifications } from '../../hooks/useNotifications';

import { toast } from 'react-hot-toast';

import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  limit,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';

import { Logo } from '../Logo';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Layout = ({ children, activeTab, setActiveTab }: LayoutProps) => {
  const { profile, user, signOut, isAdmin, plansConfig } = useAuth();
  const { selectedClientId, setSelectedClient, clients, isPreviewMode, setIsPreviewMode } = useClient();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [totalUnreadCount, setTotalUnreadCount] = React.useState(0);
  const { permission } = useNotifications();

  // Audio for notifications
  const notificationAudio = React.useMemo(() => new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3'), []);

  // Real-time listener for unread messages
  React.useEffect(() => {
    if (!user?.uid) return;

    let q;
    if (isAdmin && !isPreviewMode) {
      // Admin sees unread from all clients
      q = query(collection(db, 'channels'), where('unreadCountAdmin', '>', 0));
    } else {
      // Client sees unread from their own channel
      const channelId = isPreviewMode ? selectedClientId : user.uid;
      if (!channelId) return;
      q = query(collection(db, 'channels'), where('__name__', '==', channelId), where('unreadCountClient', '>', 0));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let count = 0;
      
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified' || change.type === 'added') {
          const data = change.doc.data();
          const unreadNum = (isAdmin && !isPreviewMode) ? (data.unreadCountAdmin || 0) : (data.unreadCountClient || 0);
          
          // If unread count increased for this specific channel
          // and we are NOT currently looking at the support tab for this specific client
          const isCurrentlyViewingSupport = activeTab === 'support';
          const isCurrentlyViewingThisClient = isAdmin ? selectedClientId === change.doc.id : true;

          if (unreadNum > 0 && (!isCurrentlyViewingSupport || (isAdmin && !isCurrentlyViewingThisClient))) {
            const lastSenderId = data.lastSenderId;
            // Don't toast if I am the one who sent it (sync across devices)
            if (lastSenderId !== user.uid) {
              notificationAudio.play().catch(e => console.log("Audio play failed:", e));
              
              toast.custom((t) => (
                <div 
                  onClick={() => {
                    if (isAdmin) setSelectedClient(change.doc.id, data.clientName || 'Cliente');
                    setActiveTab('support');
                    toast.dismiss(t.id);
                  }}
                  className={cn(
                    "bg-white border border-slate-100 shadow-2xl p-4 rounded-2xl flex gap-4 items-center cursor-pointer transition-all hover:scale-105 group active:scale-95",
                    t.visible ? "animate-in slide-in-from-top duration-300" : "animate-out fade-out duration-200"
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <MessageSquare size={20} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Nova Mensagem</p>
                    <p className="text-xs font-bold text-slate-800 line-clamp-1">
                      {isAdmin ? data.clientName : 'Suporte Central'}: {data.lastMessageText || 'Nova mensagem recebida'}
                    </p>
                  </div>
                </div>
              ), { duration: 5000 });
            }
          }
        }
      });

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        count += (isAdmin && !isPreviewMode) ? (data.unreadCountAdmin || 0) : (data.unreadCountClient || 0);
      });
      
      setTotalUnreadCount(count);
    });

    return () => unsubscribe();
  }, [user?.uid, isAdmin, isPreviewMode, selectedClientId, totalUnreadCount]);

  const ClientSelector = () => {
    if (!isAdmin) return null;
    console.log(`Layout: Rendering ClientSelector with ${clients.length} clients. Selected: ${selectedClientId}`);
    return (
      <div className="px-6 mb-8 space-y-2">
        <div className="relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
            <Building2 size={16} />
          </div>
          <select
            value={selectedClientId || ''}
            onChange={(e) => {
              const client = clients.find(c => c.id === e.target.value);
              setSelectedClient(e.target.value, client?.name || null);
            }}
            className="w-full pl-11 pr-10 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 focus:bg-white transition-all appearance-none cursor-pointer"
          >
            <option value="">Selecionar Empresa...</option>
            {clients.length === 0 && <option disabled>Nenhuma empresa encontrada</option>}
            {clients.map(client => (
              <option key={client.id} value={client.id}>
                {client.companyName ? `${client.companyName} (${client.name})` : client.name}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400">
            <ChevronDown size={14} />
          </div>
        </div>

        {selectedClientId && (
          <button 
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all font-black text-[9px] uppercase tracking-widest border",
              isPreviewMode 
                ? "bg-rose-50 border-rose-100 text-rose-500 shadow-sm" 
                : "bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100"
            )}
          >
            {isPreviewMode ? (
              <><EyeOff size={12} /> Sair da Visualização</>
            ) : (
              <><Eye size={12} /> Visualizar como Cliente</>
            )}
          </button>
        )}
      </div>
    );
  };

  const menuItems = (isAdmin && !isPreviewMode) 
    ? [
        { id: 'profile', label: 'Painel de Controle', icon: ShieldCheck, hasAccess: true },
        { id: 'dashboard', label: 'Monitor Geral', icon: LayoutDashboard, hasAccess: true },
        { id: 'reconciliation', label: 'Conciliação', icon: Handshake, hasAccess: true },
        { id: 'transactions', label: 'Lançamentos', icon: CreditCard, hasAccess: true },
        { id: 'registrations', label: 'Cadastros', icon: Settings, hasAccess: true },
        { id: 'reports', label: 'Relatórios', icon: FileText, hasAccess: true },
        { id: 'clients', label: 'Clientes', icon: Users, hasAccess: true },
        { id: 'documents', label: 'Documentos', icon: Upload, hasAccess: true },
        { id: 'plans', label: 'Planos & Serviços', icon: CreditCard, hasAccess: true },
        { id: 'support', label: 'Suporte', icon: MessageSquare, hasAccess: true },
      ]
    : [
        { id: 'dashboard', label: 'Página Inicial', icon: Home },
        { id: 'profile', label: 'Meu Perfil', icon: User },
        { id: 'reports', label: 'Meus Relatórios', icon: FileText },
        { id: 'documents', label: 'Meus Documentos', icon: Upload },
        { id: 'plans', label: 'Planos', icon: CreditCard },
        { id: 'support', label: 'Suporte & Ajuda', icon: MessageSquare },
      ].map(item => {
        const clientPlan = isPreviewMode 
            ? clients.find(c => c.id === selectedClientId)?.planId 
            : profile?.planId;
        
        // canAccessTab handles isAdmin check if pass properly, 
        // but here isAdmin is true for the whole component if user is admin.
        // We want to check access based on the impersonated client's plan.
        const hasAccess = canAccessTab(clientPlan as UserPlan, item.id, isAdmin && !isPreviewMode, plansConfig);
        
        return {
            ...item,
            hasAccess
        };
      });

  const handleTabClick = (itemId: string, hasAccess: boolean) => {
    if (itemId === 'logout') {
      signOut();
      return;
    }
    const isOwnerAdmin = user?.email === 'fluxointeligente.gestao@gmail.com';
    // If the owner is in preview mode, they should experience the restrictions
    const effectiveIsAdmin = isOwnerAdmin && !isPreviewMode;
    
    if (!hasAccess && !effectiveIsAdmin) {
        alert("Esta funcionalidade não faz parte do seu pacote atual. Entre em contato com a Fluxo Inteligente para fazer o upgrade do seu plano!");
        return;
    }
    setActiveTab(itemId as any);
  };

  const isBlocked = !isAdmin && profile?.isBlocked;

  if (isBlocked && activeTab !== 'profile') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 bg-rose-500/20 text-rose-500 rounded-3xl flex items-center justify-center mx-auto animate-pulse">
            <Lock size={40} />
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Acesso Bloqueado</h2>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest leading-relaxed">
              O acesso à sua plataforma foi temporariamente suspenso devido a pendências financeiras. 
              Por favor, regularize sua situação para reativar o sistema.
            </p>
          </div>
          <div className="pt-4 space-y-4">
             <button 
                onClick={() => setActiveTab('profile')}
                className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all hover:scale-[1.02]"
             >
                Ir para Meus Pagamentos
             </button>
             <button 
                onClick={() => signOut()}
                className="w-full py-4 bg-white/5 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-white/10 transition-all"
             >
                Sair / Trocar Conta
             </button>
          </div>
          <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.3em]">
            Fluxo Inteligente BPO • Conformidade LGPD
          </p>
        </div>
      </div>
    );
  }

   const currentProfile = isPreviewMode 
    ? (clients.find(c => c.id === selectedClientId) || profile)
    : profile;

  return (
    <div className="flex min-h-screen bg-background font-sans text-slate-900">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-72 bg-white border-r border-slate-100 flex-col h-screen sticky top-0 no-print">
        <div className="p-8 pb-10 flex items-center gap-3">
          <Logo size={54} />
        </div>

        <ClientSelector />

        <nav className="flex-1 px-6 space-y-2 overflow-y-auto scrollbar-hide">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id, item.hasAccess)}
              className={cn(
                'w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-200 group relative',
                activeTab === item.id 
                  ? 'bg-primary/5 text-primary font-bold overflow-hidden' 
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700',
                !item.hasAccess && 'opacity-60'
              )}
            >
              {activeTab === item.id && (
                  <motion.div 
                    layoutId="active-pill" 
                    className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary rounded-r-full"
                  />
              )}
              <item.icon size={20} className={cn(
                  "transition-colors",
                  activeTab === item.id ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600'
              )} />
              <span className="text-sm tracking-tight flex-1 text-left">{item.label}</span>
              {item.id === 'support' && totalUnreadCount > 0 && (
                <span className="absolute right-4 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white ring-4 ring-white">
                  {totalUnreadCount > 9 ? '+9' : totalUnreadCount}
                </span>
              )}
              {!item.hasAccess && <Lock size={14} className="text-slate-200" />}
            </button>
          ))}

          {/* Separador e Botão Sair no Menu Principal */}
          <div className="pt-4 mt-2 border-t border-slate-50">
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all duration-200 group"
            >
              <LogOut size={20} className="text-slate-400 group-hover:text-rose-500 transition-colors" />
              <span className="text-sm tracking-tight flex-1 text-left font-bold">Sair / Trocar Conta</span>
            </button>
          </div>
        </nav>

        <div className="p-6 mt-auto">
           <div className="p-4 rounded-3xl bg-slate-50 border border-slate-100 shadow-inner">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-primary shadow-sm font-bold overflow-hidden shrink-0">
                        {currentProfile?.photoURL ? (
                            <img src={currentProfile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            currentProfile?.name?.charAt(0)
                        )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-bold text-slate-800 truncate">{currentProfile?.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">{currentProfile?.role}</p>
                            <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                            <div className="flex items-center gap-1">
                                {permission === 'granted' ? (
                                    <Bell size={8} className="text-emerald-500 fill-emerald-500/20" />
                                ) : (
                                    <BellOff size={8} className="text-slate-300" />
                                )}
                                <span className={cn(
                                    "text-[9px] font-bold uppercase tracking-widest",
                                    permission === 'granted' ? "text-emerald-500" : "text-slate-400"
                                )}>
                                    {permission === 'granted' ? 'Ativo' : 'Off'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
           </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden h-16 bg-white border-b border-slate-100 flex items-center justify-between px-6 sticky top-0 z-40 no-print">
           <Logo size={36} />
           <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-500">
               <Menu size={24} />
           </button>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
             {children}
          </div>
        </main>
        <NotificationPrompt />
      </div>

      {/* Mobile Drawer (Simplificado) */}
      {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 lg:hidden no-print" onClick={() => setMobileMenuOpen(false)}>
              <motion.div 
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                className="w-4/5 h-full bg-white p-6 flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                  <div className="flex items-center justify-between mb-8">
                    <Logo />
                    <button onClick={() => setMobileMenuOpen(false)}><X size={24} /></button>
                  </div>
                  <ClientSelector />
                  <nav className="flex-1 space-y-4">
                      {menuItems.map(item => (
                          <button
                            key={item.id}
                            onClick={() => { handleTabClick(item.id, item.hasAccess); if(item.hasAccess) setMobileMenuOpen(false); }}
                            className={cn(
                                "w-full flex items-center gap-4 px-4 py-3 rounded-xl font-bold",
                                activeTab === item.id ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50",
                                !item.hasAccess && "opacity-60"
                            )}
                          >
                             <item.icon size={20} /> 
                             <span className="flex-1 text-left">{item.label}</span>
                             {!item.hasAccess && <Lock size={14} className="text-slate-300" />}
                          </button>
                      ))}
                  </nav>
                  
                  <div className="mt-auto pt-6 border-t border-slate-100">
                      <button 
                        onClick={() => signOut()}
                        className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-rose-500 hover:bg-rose-50 transition-all font-bold"
                      >
                          <LogOut size={20} /> 
                          <span>Sair / Trocar Conta</span>
                      </button>
                  </div>
              </motion.div>
          </div>
      )}
    </div>
  );
};
