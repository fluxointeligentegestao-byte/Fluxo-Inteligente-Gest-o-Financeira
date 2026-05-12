import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useClient } from '../context/ClientContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area
} from 'recharts';
import { 
    TrendingUp, 
    Bell, 
    ChevronRight,
    ChevronLeft, 
    FileText, 
    MessageSquare, 
    Upload, 
    CreditCard, 
    LayoutDashboard, 
    Calendar, 
    ArrowUpRight,
    Users,
    ArrowUpCircle,
    ArrowDownCircle,
    Search
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { motion } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, onSnapshot, orderBy } from 'firebase/firestore';
import { canAccessReport, UserPlan } from '../lib/planUtils';
import { AlertCircle, Lock } from 'lucide-react';

const data = [
  { name: 'Jan', receita: 4000, despesa: 2400 },
  { name: 'Fev', receita: 3000, despesa: 1398 },
  { name: 'Mar', receita: 2000, despesa: 1200 },
  { name: 'Abr', receita: 2780, despesa: 2100 },
  { name: 'Mai', receita: 1890, despesa: 1500 },
  { name: 'Jun', receita: 2390, despesa: 1800 },
];

interface DashboardProps {
  setActiveTab: (tab: string) => void;
  onBack?: () => void;
}

export const Dashboard = ({ setActiveTab, onBack }: DashboardProps) => {
  const { profile, user, isAdmin, plansConfig } = useAuth();
  const { selectedClientId, selectedClientName, setSelectedClient, isPreviewMode, clients: clientList } = useClient();
  const isOwnerAdmin = user?.email === 'fluxointeligente.gestao@gmail.com';
  const showAdminView = isAdmin && !isPreviewMode;
  
  const clientPlan = isPreviewMode 
      ? clientList.find(c => c.id === selectedClientId)?.planId 
      : profile?.planId;
  
  const hasDashboardAccess = isOwnerAdmin || canAccessReport(clientPlan, '🎯 Dashboards', plansConfig);

  const firstName = isPreviewMode ? (selectedClientName?.split(' ')[0] || 'Cliente') : (profile?.name?.split(' ')[0] || 'Cliente');
  
  const [stats, setStats] = useState({
    totalClients: 0,
    pendingDocs: 14,
    totalReports: 842,
    clientToPay: 0,
    clientToReceive: 0,
    clientBalance: 0
  });

  const [clients, setClients] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [bankMovements, setBankMovements] = useState<Record<string, { in: number, out: number }>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile && !user) return;

    if (showAdminView) {
      const fetchAdminStats = async () => {
        const q = query(collection(db, 'userProfiles'), where('role', '==', 'client'));
        const snap = await getDocs(q);
        setStats(prev => ({ ...prev, totalClients: snap.size }));
      };
      fetchAdminStats();
    } else if (user || selectedClientId) {
      const activeId = isPreviewMode ? selectedClientId : user?.uid;
      if (!activeId) return;

      const currentMonth = new Date().toISOString().substring(0, 7);

      // Real-time banks for this client
      const banksRef = query(collection(db, 'banks'), where('clientId', '==', activeId));
      const unsubBanks = onSnapshot(banksRef, (snapshot) => {
        const banksList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setBanks(banksList);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'banks');
      });

      // Get transactions for this month to show movement per bank
      const transRef = collection(db, 'transactions');
      const qTrans = query(
        transRef,
        where('clientId', '==', activeId),
        where('status', 'in', ['Pago', 'Recebido', 'Conciliado']),
        where('settlement.paymentDate', '>=', `${currentMonth}-01`),
        where('settlement.paymentDate', '<=', `${currentMonth}-31`)
      );

      const unsubTrans = onSnapshot(qTrans, (snapshot) => {
        const movements: Record<string, { in: number, out: number }> = {};
        snapshot.docs.forEach(doc => {
          const t = doc.data();
          const bankId = t.settlement?.bankId;
          if (!bankId) return;
          
          if (!movements[bankId]) movements[bankId] = { in: 0, out: 0 };
          const val = t.settlement?.paidValue || 0;
          if (t.type === 'receita') movements[bankId].in += val;
          else movements[bankId].out += val;
        });
        setBankMovements(movements);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'transactions-dashboard');
      });

      const path = `financialAgenda/${activeId}/entries`;
      const q = query(collection(db, path), where('month', '==', currentMonth));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => doc.data());
        const toPay = items.filter(i => i.type === 'pagar').reduce((acc, curr) => acc + curr.value, 0);
        const toReceive = items.filter(i => i.type === 'receber').reduce((acc, curr) => acc + curr.value, 0);
        setStats(prev => ({
          ...prev,
          clientToPay: toPay,
          clientToReceive: toReceive,
          clientBalance: toReceive - toPay
        }));
      }, (error) => {
        console.error("Error listening to financialAgenda:", error);
        handleFirestoreError(error, OperationType.GET, path);
      });
      return () => {
        unsubscribe();
        unsubBanks();
        unsubTrans();
      };
    }
  }, [profile, user, showAdminView, isPreviewMode, selectedClientId]);

  useEffect(() => {
    if (!showAdminView) return;

    console.log("Dashboard: Subscribing to userProfiles (showAdminView=true)... Admin Email:", user?.email);
    const unsubClients = onSnapshot(collection(db, 'userProfiles'), async (snapshot) => {
        console.log(`Dashboard: Fetched ${snapshot.docs.length} total profiles`);
        const clientsList = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() as any }))
            .filter(p => {
                const role = p.role?.toLowerCase() || '';
                return role === 'client' || role === 'cliente' || !role;
            });
        
        console.log(`Dashboard: Final client list size: ${clientsList.length}`);
        // Update basic list first
        setClients(clientsList);
        setLoading(false);

        // For each client, let's fetch some quick stats separately to not block
        clientsList.forEach(async (client: any) => {
            try {
                // Docs pending
                const docsQuery = query(collection(db, 'clientDocuments'), where('clientId', '==', client.id), where('status', '==', 'pending'));
                const docsSnap = await getDocs(docsQuery);
                
                // Last report
                const reportsQuery = query(collection(db, 'reports'), where('clientId', '==', client.id), orderBy('createdAt', 'desc'));
                const reportsSnap = await getDocs(reportsQuery);
                const lastReportDate = reportsSnap.docs[0]?.data()?.createdAt?.toDate();

                setClients(prev => prev.map(c => c.id === client.id ? {
                    ...c,
                    pendingDocsCount: docsSnap.size,
                    lastReportDate
                } : c));
            } catch (err) {
                console.error(`Error fetching stats for client ${client.id}:`, err);
            }
        });
    }, (error) => {
        console.error("Error listening to clients in Dashboard:", error);
        handleFirestoreError(error, OperationType.LIST, 'userProfiles');
        setLoading(false);
    });

    return () => unsubClients();
  }, [showAdminView, setSelectedClient, setActiveTab]);

    if (showAdminView) {
        return (
            <div className="space-y-6 pb-12">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        {onBack && (
                            <button 
                                onClick={onBack}
                                className="p-2 -ml-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                            >
                                <ChevronLeft size={24} />
                            </button>
                        )}
                        <div>
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Gestão Administrativa</span>
                            </div>
                            <h1 className="text-2xl text-slate-900 font-black uppercase tracking-tight">Monitor Geral de Atividades</h1>
                            <p className="text-slate-500 mt-1 text-sm font-medium italic">Olá, {firstName}. Aqui está o que você precisa fazer hoje.</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" className="rounded-xl h-10 px-4 text-xs" onClick={() => setActiveTab('support')}><MessageSquare size={16} className="mr-2" /> Atendimentos</Button>
                        <Button variant="primary" className="rounded-xl h-10 px-4 text-xs shadow-lg shadow-primary/20" onClick={() => setActiveTab('clients')}>+ Novo Cliente</Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="p-5 border-slate-100 shadow-sm rounded-2xl bg-white">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total de Clientes</p>
                        <h3 className="text-2xl mt-1 text-slate-900 font-black">{clients.length}</h3>
                        <div className="mt-2 w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                            <div className="bg-primary h-full transition-all" style={{ width: '100%' }} />
                        </div>
                    </Card>
                    <Card className="p-5 border-slate-100 shadow-sm rounded-2xl bg-white">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Pendências Documentais</p>
                        <h3 className="text-2xl mt-1 text-amber-500 font-black">{clients.reduce((acc, c) => acc + (c.pendingDocsCount || 0), 0)}</h3>
                        <div className="mt-2 w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                            <div className="bg-amber-500 h-full transition-all" style={{ width: '40%' }} />
                        </div>
                    </Card>
                    <Card className="p-5 border-slate-100 shadow-sm rounded-2xl bg-white">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Relatórios p/ Atualizar</p>
                        <h3 className="text-2xl mt-1 text-rose-500 font-black">
                            {clients.filter(c => {
                                if (!c.lastReportDate) return true;
                                const diff = new Date().getTime() - c.lastReportDate.getTime();
                                return diff > 7 * 24 * 60 * 60 * 1000; // More than 7 days
                            }).length}
                        </h3>
                    </Card>
                    <Card className="p-5 border-slate-100 shadow-sm rounded-2xl bg-white">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Acessos Hoje</p>
                        <h3 className="text-2xl mt-1 text-emerald-500 font-black">4</h3>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-2 p-6 border-slate-100 shadow-xl shadow-slate-200/10 rounded-3xl bg-white">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Atividades por Cliente</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Sua agenda de processos para hoje</p>
                            </div>
                            <div className="relative group">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] uppercase font-black outline-none focus:ring-4 focus:ring-primary/5 transition-all w-full md:w-64"
                                    placeholder="Buscar empresa..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            {loading ? (
                                <div className="py-12 flex flex-col items-center gap-4 text-slate-300">
                                    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Sincronizando Agenda...</span>
                                </div>
                            ) : clients.length === 0 ? (
                                <div className="py-20 text-center text-slate-300">
                                    <Users size={48} className="mx-auto mb-4 opacity-20" />
                                    <p className="font-bold text-slate-400">Nenhum cliente cadastrado ainda.</p>
                                </div>
                            ) : (
                                <>
                                    {clients
                                        .filter(c => 
                                            (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                                            (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
                                        )
                                        .sort((a,b) => (b.pendingDocsCount || 0) - (a.pendingDocsCount || 0)).length === 0 ? (
                                            <div className="py-12 text-center text-slate-400">
                                                <p className="text-xs font-bold uppercase tracking-widest">Nenhum resultado para "{searchTerm}"</p>
                                            </div>
                                        ) : clients
                                            .filter(c => 
                                                (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                                                (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
                                            )
                                            .sort((a,b) => (b.pendingDocsCount || 0) - (a.pendingDocsCount || 0)).map((client) => (
                                            <div 
                                                key={client.id}
                                                className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-slate-50/50 border border-slate-50 rounded-2xl hover:border-primary/20 hover:bg-white transition-all group"
                                            >
                                                <div className="flex items-center gap-4 mb-4 md:mb-0">
                                                    <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-primary font-black text-lg shadow-sm group-hover:scale-105 transition-all">
                                                        {client.name?.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                                            {client.companyName || client.name || 'Sem Nome'}
                                                        </h4>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            {client.companyName && client.name && (
                                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mr-1">
                                                                    {client.name} • 
                                                                </span>
                                                            )}
                                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-100 rounded-md">
                                                                {client.planId || 'Sem Plano'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-3 gap-2 md:w-auto">
                                                    <div 
                                                        onClick={() => {
                                                            setSelectedClient(client.id, client.name);
                                                            setActiveTab('documents');
                                                        }}
                                                        className={cn(
                                                            "px-3 py-2 rounded-xl text-center border-2 transition-all cursor-pointer",
                                                            (client.pendingDocsCount || 0) > 0 
                                                                ? "bg-amber-50 border-amber-100 text-amber-600 hover:bg-amber-100 font-black" 
                                                                : "bg-white border-slate-50 text-slate-300"
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-center gap-1.5 mb-1">
                                                            <Upload size={12} />
                                                            <span className="text-[12px] font-black">{client.pendingDocsCount || 0}</span>
                                                        </div>
                                                        <p className="text-[7px] font-black uppercase tracking-tight">Docs Pendentes</p>
                                                    </div>

                                                    <div 
                                                        onClick={() => {
                                                            setSelectedClient(client.id, client.name);
                                                            setActiveTab('reports');
                                                        }}
                                                        className={cn(
                                                            "px-3 py-2 rounded-xl text-center border-2 transition-all cursor-pointer",
                                                            !client.lastReportDate 
                                                                ? "bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100 font-black" 
                                                                : "bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100 font-black"
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-center gap-1.5 mb-1">
                                                            <FileText size={12} />
                                                            <span className="text-[10px] font-black">
                                                                {client.lastReportDate ? 'OK' : '!'}
                                                            </span>
                                                        </div>
                                                        <p className="text-[7px] font-black uppercase tracking-tight">Relatórios</p>
                                                    </div>

                                                    <div 
                                                        onClick={() => {
                                                            setSelectedClient(client.id, client.name);
                                                            setActiveTab('transactions');
                                                        }}
                                                        className="px-3 py-2 rounded-xl text-center border-2 bg-primary text-white border-primary hover:scale-105 transition-all cursor-pointer shadow-lg shadow-primary/20"
                                                    >
                                                        <div className="flex items-center justify-center gap-1.5 mb-1">
                                                            <CreditCard size={12} />
                                                        </div>
                                                        <p className="text-[7px] font-black uppercase tracking-tight">Lançar</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </>
                            )}
                        </div>
                    </Card>

                    <div className="space-y-6">
                        <Card className="p-6 bg-slate-900 text-white rounded-3xl overflow-hidden relative group">
                            <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-primary/20 rounded-full blur-2xl group-hover:bg-primary/30 transition-all" />
                            
                            <h3 className="text-lg font-black uppercase tracking-tight mb-4 flex items-center gap-2">
                                <TrendingUp size={20} className="text-secondary" /> Resumo do BPO
                            </h3>
                            
                            <div className="space-y-4">
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <p className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-1">Ticket Médio</p>
                                    <h4 className="text-xl font-black">{formatCurrency(1250)}</h4>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <p className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-1">Satisfação</p>
                                    <h4 className="text-xl font-black">9.8/10</h4>
                                </div>
                            </div>

                            <Button 
                                className="w-full mt-6 bg-secondary text-slate-900 hover:bg-secondary/90 rounded-2xl h-12 font-black uppercase text-[10px] tracking-widest"
                                onClick={() => setActiveTab('clients')}
                            >
                                Ver Todos os Clientes
                            </Button>
                        </Card>

                        <Card className="p-6 border-slate-100 shadow-sm rounded-3xl bg-white">
                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">Avisos Rápidos</h3>
                            <div className="space-y-3">
                                {[
                                    { text: 'Novo documento enviado por Tech Solutions', time: '10m atrás' },
                                    { text: 'Mensagem de suporte pendente', time: '1h atrás' },
                                    { text: 'Relatório mensal de Padaria Alpha atrasado', time: '2h atrás' }
                                ].map((msg, i) => (
                                    <div key={i} className="flex gap-3 items-start">
                                        <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-700 leading-tight">{msg.text}</p>
                                            <p className="text-[8px] text-slate-400 mt-0.5">{msg.time}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        );
    }

  // Client View (Página Inicial com boas vindas e serviços)
  return (
    <div className="space-y-8 pb-12">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 p-8 md:p-12 text-white shadow-2xl">
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-primary/20 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-secondary/10 rounded-full blur-[80px]" />
          
          <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest mb-4 backdrop-blur-md">
                 <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                 Sua Gestão em Tempo Real
              </div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-3 uppercase leading-[0.9]">
                  Bem-vindo,<br/>
                  <span className="text-secondary">{firstName}</span>.
              </h1>
              <p className="text-slate-400 text-sm md:text-base font-medium leading-relaxed max-w-lg mb-6">
                  Sua central de relatórios e processos. Organizamos sua rotina financeira para que você foque no crescimento do seu negócio.
              </p>
              <div className="flex flex-wrap gap-3">
                  <Button 
                    variant="primary" 
                    className="rounded-xl px-6 py-5 h-auto bg-white text-slate-900 hover:bg-slate-100 font-black uppercase tracking-widest text-[10px]"
                    onClick={() => setActiveTab('reports')}
                  >
                        Relatórios Recentes <ArrowUpRight size={16} className="ml-2" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="rounded-xl px-6 py-5 h-auto border border-white/20 text-white hover:bg-white/10 font-black uppercase tracking-widest text-[10px]"
                    onClick={() => setActiveTab('support')}
                  >
                        Consultoria Especializada
                  </Button>
              </div>
          </div>
      </div>

      {/* Real-time Stats for Client */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1 space-y-4">
              <div className="grid grid-cols-1 gap-4">
                  <Card className="p-5 border-none shadow-xl shadow-slate-200/20 bg-white group hover:translate-y-[-2px] transition-all">
                      <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                              <ArrowUpCircle size={18} />
                          </div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">A Receber (Mês)</span>
                      </div>
                      <h3 className="text-xl font-black text-slate-900">{formatCurrency(stats.clientToReceive)}</h3>
                  </Card>
                  <Card className="p-5 border-none shadow-xl shadow-slate-200/20 bg-white group hover:translate-y-[-2px] transition-all">
                      <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                              <ArrowDownCircle size={18} />
                          </div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">A Pagar (Mês)</span>
                      </div>
                      <h3 className="text-xl font-black text-slate-900">{formatCurrency(stats.clientToPay)}</h3>
                  </Card>
                  <Card className={cn(
                      "p-5 border-none shadow-xl shadow-slate-200/20 group hover:translate-y-[-2px] transition-all",
                      stats.clientBalance >= 0 ? "bg-slate-900 text-white" : "bg-rose-600 text-white"
                  )}>
                      <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center">
                              <TrendingUp size={18} />
                          </div>
                          <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">Fluxo de Caixa</span>
                      </div>
                      <h3 className="text-xl font-black">{formatCurrency(stats.clientBalance)}</h3>
                  </Card>
              </div>
          </div>

          <Card className="lg:col-span-3 p-6 border-none shadow-xl shadow-slate-200/20 bg-white flex flex-col h-full">
              <div className="flex items-center justify-between mb-6">
                  <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Saldos Bancários Conciliados</h3>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Dados reais integrados</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-[9px] font-black uppercase tracking-widest text-primary h-8"
                    onClick={() => setActiveTab('reconciliation')}
                  >
                    Conciliar Novo Extrato
                  </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                  {banks.length === 0 ? (
                      <div className="col-span-full py-12 text-center text-slate-300">
                          <AlertCircle size={24} className="mx-auto mb-2 opacity-50" />
                          <p className="text-[10px] font-black uppercase tracking-widest leading-none">Nenhuma conta cadastrada</p>
                      </div>
                  ) : (
                      banks.map((bank) => (
                          <div 
                            key={bank.id}
                            className="p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-primary/20 hover:bg-white transition-all group"
                          >
                              <div className="flex items-center justify-between mb-3">
                                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-primary shadow-sm group-hover:scale-110 transition-all">
                                      <CreditCard size={14} />
                                  </div>
                                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest transition-colors group-hover:text-primary/50">Disponível</span>
                              </div>
                              <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight truncate mb-1">
                                  {bank.name}
                              </h4>
                              <p className="text-lg font-black text-slate-900 mb-2">
                                  {formatCurrency(bank.balance || 0)}
                              </p>
                              <div className="flex items-center gap-4 pt-3 border-t border-slate-100/50">
                                  <div className="flex flex-col">
                                      <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest">Entradas</span>
                                      <span className="text-[9px] font-bold text-slate-700">
                                          {formatCurrency(bankMovements[bank.id]?.in || 0)}
                                      </span>
                                  </div>
                                  <div className="flex flex-col">
                                      <span className="text-[7px] font-black text-rose-500 uppercase tracking-widest">Saídas</span>
                                      <span className="text-[9px] font-bold text-slate-700">
                                          {formatCurrency(bankMovements[bank.id]?.out || 0)}
                                      </span>
                                  </div>
                              </div>
                          </div>
                      ))
                  )}
              </div>
          </Card>
      </div>

      {/* Services Grid (The "Cards com Serviços" requested) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { id: 'reports', name: 'Relatórios Gerenciais', desc: 'BI e Análises', icon: FileText, color: 'text-primary bg-primary/5' },
            { id: 'documents', name: 'Documentos', desc: 'Notas e extratos', icon: Upload, color: 'text-amber-500 bg-amber-50' },
            { id: 'plans', name: 'Planos', desc: 'Escopo BPO', icon: CreditCard, color: 'text-emerald-500 bg-emerald-50' },
            { id: 'support', name: 'Consultoria', desc: 'Suporte à decisão', icon: MessageSquare, color: 'text-secondary bg-secondary/5' },
          ].map((service, idx) => (
            <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
            >
                <Card 
                    onClick={() => setActiveTab(service.id)}
                    className="group p-4 bg-white border-slate-100 hover:border-primary/20 hover:shadow-lg transition-all cursor-pointer rounded-2xl flex flex-col items-start gap-4"
                >
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center transition-all group-hover:scale-110", service.color)}>
                        <service.icon size={18} />
                    </div>
                    <div>
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight leading-none mb-1">{service.name}</h3>
                        <p className="text-[9px] text-slate-400 font-medium italic">{service.desc}</p>
                    </div>
                    
                    <div className="w-full pt-3 mt-auto border-t border-slate-50 flex items-center justify-between">
                         <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest">Acessar</span>
                         <ChevronRight size={12} className="text-slate-300 group-hover:text-primary transition-colors" />
                    </div>
                </Card>
            </motion.div>
          ))}
      </div>

      {/* Quick Summary Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6 bg-white border-slate-100 shadow-xl shadow-slate-200/10 rounded-3xl overflow-hidden relative group">
              <div className="flex items-center justify-between mb-8">
                  <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Performance Financeira</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Visão geral do faturamento vs despesas</p>
                  </div>
                  <div className="px-4 py-1.5 bg-slate-50 rounded-xl border border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Evolução Semestral
                  </div>
              </div>
              
              <div className="h-[240px] w-full relative">
                {!hasDashboardAccess && (
                    <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-500">
                        <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                            <Lock size={20} />
                        </div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-2">Dashboard Premium</h4>
                        <p className="text-[10px] text-slate-400 font-medium max-w-[200px] leading-relaxed uppercase tracking-wider">
                            Este gráfico e as análises BI fazem parte do plano <span className="text-primary font-black">Consultoria</span>. 
                            Upgrade seu pacote para visualizar sua performance detalhada!
                        </p>
                        <Button 
                            variant="primary" 
                            size="sm" 
                            className="mt-6 rounded-xl text-[9px] px-6 h-9"
                            onClick={() => setActiveTab('plans')}
                        >
                            Ver Planos Disponíveis
                        </Button>
                    </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 'bold' }} 
                            dy={10}
                        />
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 'bold' }} 
                        />
                        <Tooltip 
                            cursor={{ fill: '#f8fafc' }}
                            contentStyle={{ 
                                borderRadius: '16px', 
                                border: 'none', 
                                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                fontSize: '10px',
                                fontWeight: 'bold'
                            }} 
                        />
                        <Bar dataKey="receita" fill="#004b8d" radius={[4, 4, 0, 0]} barSize={24} />
                    </BarChart>
                </ResponsiveContainer>
              </div>
          </Card>

          <Card className="p-6 bg-slate-50 border-white shadow-xl shadow-slate-200/10 rounded-3xl flex flex-col justify-between group overflow-hidden relative">
              <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />
              
              <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">📅 Minha Agenda de Contas</h3>
                    <button 
                        onClick={() => setActiveTab('agenda')}
                        className="text-[9px] font-black text-primary uppercase tracking-widest hover:underline"
                    >
                        Ver Tudo
                    </button>
                  </div>
                  <div className="space-y-3">
                      {[
                        { title: 'Enviar Notas', time: 'Restam 2 dias', type: 'urgent' },
                        { title: 'Conciliar Extrato', time: 'Pendente', type: 'warning' },
                        { title: 'Agenda Mensal', time: 'Ver Planejamento', type: 'info' }
                      ].map((step, i) => (
                        <div 
                            key={i} 
                            onClick={() => setActiveTab('agenda')}
                            className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-slate-100 hover:translate-x-1 transition-all cursor-pointer group/item"
                        >
                            <div className={cn(
                                "w-1.5 h-8 rounded-full",
                                step.type === 'urgent' ? 'bg-rose-500' : step.type === 'warning' ? 'bg-amber-500' : 'bg-primary'
                            )} />
                            <div>
                                <p className="text-xs font-bold text-slate-800 tracking-tight leading-none mb-1">{step.title}</p>
                                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{step.time}</p>
                            </div>
                        </div>
                      ))}
                  </div>
              </div>

              <div className="mt-8 p-5 bg-primary rounded-2xl text-white">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/60 mb-1.5">Ajuda</p>
                  <p className="text-xs font-bold mb-3 leading-snug">Alguma dúvida sobre os números?</p>
                  <Button 
                    variant="ghost" 
                    className="w-full bg-white/10 hover:bg-white/20 text-white rounded-lg text-[9px] font-black uppercase tracking-widest"
                    onClick={() => setActiveTab('support')}
                  >
                      Abrir Chat de Suporte
                  </Button>
              </div>
          </Card>
      </div>
    </div>
  );
};
