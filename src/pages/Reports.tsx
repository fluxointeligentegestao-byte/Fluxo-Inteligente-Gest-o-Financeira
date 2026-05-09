import React, { useState, useEffect } from 'react';
import { 
    FileText, 
    Search, 
    ChevronRight,
    ChevronLeft,
    ExternalLink, 
    Upload,
    X,
    Filter,
    ArrowRight,
    FolderOpen,
    Plus,
    Trash2,
    Calendar,
    ArrowLeft,
    CheckCircle2,
    Clock,
    AlertCircle,
    Eye,
    Download,
    Printer
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { 
    collection, 
    query, 
    where, 
    onSnapshot,
    addDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    orderBy,
    getDocs
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useClient } from '../context/ClientContext';
import { motion, AnimatePresence } from 'motion/react';
import { ReconciliationReport } from '../components/ReconciliationReport';
import { CashFlowReport } from '../components/CashFlowReport';
import { ReportsDashboard } from '../components/ReportsDashboard';
import DreReport from '../components/DreReport';
import { canAccessReport, UserPlan, PLAN_CONFIG, normalizePlan } from '../lib/planUtils';

interface Report {
    id: string;
    clientId: string;
    clientName?: string;
    title: string;
    category: string;
    status: 'draft' | 'published';
    period: string;
    url: string;
    documents?: { name: string; url: string }[];
    notes?: string;
    createdAt: any;
}

const CATEGORY_DETAILS: Record<string, { emoji: string }> = {
    '📅 Minha Agenda de Contas': { emoji: '📅' },
    '🔄 Conciliação Bancária': { emoji: '🔄' },
    '📈 DRE Gerencial': { emoji: '📈' },
    '💰 Fluxo de Caixa': { emoji: '💰' },
    '📝 Relatório Mensal': { emoji: '📝' },
    '🎯 Dashboards': { emoji: '🎯' }
};

const REPORT_CATEGORIES = Object.keys(CATEGORY_DETAILS);

export const Reports = ({ setActiveTab }: { setActiveTab?: (tab: string) => void }) => {
    const { profile, user, isAdmin, plansConfig } = useAuth();
    const { selectedClientId, selectedClientName, clients, setSelectedClient, isPreviewMode } = useClient();
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentCategory, setCurrentCategory] = useState<string | null>(null);
    const [selectedReportForPreview, setSelectedReportForPreview] = useState<Report | null>(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    
    const clientPlan = isPreviewMode 
        ? clients.find(c => c.id === selectedClientId)?.planId 
        : profile?.planId;

    const normalizedPlan = normalizePlan(clientPlan);
    const planLabel = PLAN_CONFIG[normalizedPlan].label;
    const isOwnerAdmin = user?.email === 'fluxointeligente.gestao@gmail.com';
    
    // Upload Form State
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState(REPORT_CATEGORIES[0]);
    const [url, setUrl] = useState('');
    const [period, setPeriod] = useState('');
    const [targetClientId, setTargetClientId] = useState(selectedClientId || '');
    const [uploading, setUploading] = useState(false);
    const [reportClientId, setReportClientId] = useState(selectedClientId || '');

    useEffect(() => {
        if (selectedClientId && reportClientId !== selectedClientId) {
            setReportClientId(selectedClientId);
        }
    }, [selectedClientId]);

    useEffect(() => {
        if (!user || !selectedClientId) {
            setLoading(false);
            setReports([]);
            return;
        }

        let q;
        if (isAdmin) {
            // Admins see reports for the selected client ONLY or all? 
            // In a multi-tenant world, admin selects a client to see THEIR reports.
            q = query(
                collection(db, 'reports'), 
                where('clientId', '==', selectedClientId),
                orderBy('createdAt', 'desc')
            );
        } else {
            q = query(
                collection(db, 'reports'), 
                where('clientId', '==', selectedClientId),
                orderBy('createdAt', 'desc')
            );
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Report[];
            setReports(docs);
            setLoading(false);
        }, (error) => {
            handleFirestoreError(error, OperationType.LIST, 'reports');
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, profile, selectedClientId]);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !url || (!targetClientId && isAdmin)) return;

        setUploading(true);
        try {
            const targetClient = clients.find(c => c.id === targetClientId);
            await addDoc(collection(db, 'reports'), {
                title,
                category,
                url,
                period,
                status: 'published',
                clientId: isAdmin ? targetClientId : user?.uid,
                clientName: isAdmin ? (targetClient?.name || 'Cliente') : profile?.name,
                createdAt: serverTimestamp()
            });
            setIsUploadModalOpen(false);
            setTitle('');
            setUrl('');
            setPeriod('');
        } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, 'reports');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Excluir este relatório?')) return;
        try {
            await deleteDoc(doc(db, 'reports', id));
            alert('Relatório excluído com sucesso!');
        } catch (error) {
            console.error("Error deleting report:", error);
            alert('Erro ao excluir o relatório. Verifique suas permissões.');
            handleFirestoreError(error, OperationType.DELETE, 'reports');
        }
    };

    const filteredReports = reports.filter(r => {
        if (!currentCategory) return true;
        const reportCat = (r.category || '').toLowerCase().trim();
        const selectedCat = (currentCategory || '').toLowerCase().trim();
        return reportCat === selectedCat || reportCat.includes(selectedCat) || selectedCat.includes(reportCat);
    });

    return (
        <div className="space-y-8 pb-12">
            {!selectedClientId && isAdmin && (
                <Card className="p-12 text-center bg-white border-2 border-dashed border-slate-100 rounded-[2.5rem] mt-8">
                    <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-6">
                        <FileText size={32} />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Nenhum Cliente Selecionado</h3>
                    <p className="text-slate-400 text-xs font-medium max-w-xs mx-auto mt-2">
                        Selecione um cliente no Monitor Geral para visualizar e gerenciar seus relatórios de gestão.
                    </p>
                    <Button 
                        variant="primary" 
                        className="mt-8 rounded-xl px-8 py-3 text-[11px] font-black uppercase tracking-widest"
                        onClick={() => setActiveTab && setActiveTab('dashboard')}
                    >
                        Ir para Monitor Geral
                    </Button>
                </Card>
            )}

            {selectedClientId && (
                <>
                {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 no-print">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => {
                            if (currentCategory) {
                                setCurrentCategory(null);
                            } else if (setActiveTab) {
                                setActiveTab('dashboard');
                            }
                        }}
                        className="p-2 -ml-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all no-print"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <div>
                        <div className="flex items-center gap-3 mb-2 no-print">
                            <span className="px-3 py-1 bg-primary/5 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">
                                {currentCategory ? 'Visualização' : 'Relatórios Gerenciais'}
                            </span>
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                Plano: <span className="text-primary">{planLabel}</span>
                            </span>
                        </div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
                            {isAdmin ? `Relatórios: ${selectedClientName || 'Nenhum Cliente'}` : (currentCategory ? currentCategory : 'Relatórios de Gestão')}
                        </h1>
                        {!currentCategory && (
                            <p className="text-slate-500 mt-1 text-sm font-medium no-print">
                                Análises para suporte à decisão.
                            </p>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-2 no-print">
                </div>
            </div>

            {/* Folders View */}
            {!currentCategory && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 no-print">
                    {REPORT_CATEGORIES.map((cat) => {
                        const catReports = reports.filter(r => r.category === cat);
                        const detail = CATEGORY_DETAILS[cat];
                        // Owner Admin always has access even in preview mode to manage client
                        const hasAccess = isOwnerAdmin || canAccessReport(clientPlan, cat, plansConfig);

                        return (
                            <Card 
                                key={cat} 
                                onClick={() => {
                                    if (!hasAccess) {
                                        alert(`Este relatório (${cat}) não faz parte do seu pacote atual. Entre em contato com a Fluxo Inteligente para fazer o upgrade do seu plano!`);
                                        return;
                                    }
                                    if (cat === '📅 Minha Agenda de Contas' && setActiveTab) {
                                        setActiveTab('agenda');
                                    } else {
                                        setCurrentCategory(cat);
                                    }
                                }}
                                className={cn(
                                    "p-4 bg-white border-slate-100 hover:border-primary/20 hover:shadow-lg transition-all group cursor-pointer active:scale-[0.98] relative overflow-hidden rounded-2xl flex flex-col items-center text-center",
                                    !hasAccess && "opacity-75 grayscale-[0.5]"
                                )}
                            >
                                <div className={cn(
                                    "absolute top-0 left-0 w-full h-1 bg-primary/5 transition-colors",
                                    hasAccess ? "group-hover:bg-primary" : "bg-slate-200"
                                )} />
                                
                                <div className="mb-3 text-2xl group-hover:scale-110 transition-transform duration-300">
                                    {detail.emoji}
                                </div>
                                
                                <h3 className={cn(
                                    "text-[10px] font-black group-hover:text-primary transition-colors uppercase tracking-tight leading-tight mb-1",
                                    hasAccess ? "text-slate-900" : "text-slate-400"
                                )}>
                                    {cat}
                                </h3>
                                
                                {!hasAccess ? (
                                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-rose-50 rounded-full">
                                        <AlertCircle size={8} className="text-rose-500" />
                                        <span className="text-[7px] text-rose-500 font-bold uppercase tracking-widest">Bloqueado</span>
                                    </div>
                                ) : (
                                    catReports.length > 0 && (
                                        <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-slate-50 rounded-full group-hover:bg-primary/5 transition-colors">
                                            <span className="text-[7px] text-slate-400 font-bold uppercase tracking-widest group-hover:text-primary/70">
                                                {`${catReports.length} Docs`}
                                            </span>
                                        </div>
                                    )
                                )}
                                
                                <ChevronRight size={12} className="absolute bottom-3 right-3 text-slate-200 group-hover:text-primary transition-colors" />
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* List View */}
            {currentCategory && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-400 mb-6">
                        <FolderOpen size={16} className="text-primary" />
                        <span>{currentCategory}</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                        <span className="text-primary">{filteredReports.length} relatórios</span>
                    </div>

                    {currentCategory === '🔄 Conciliação Bancária' && (
                        <div className="mb-10 space-y-4">
                            {isAdmin && (
                                <div className="max-w-xs">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Visualizar para o Cliente:</label>
                                    <select 
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none"
                                        value={reportClientId}
                                        onChange={(e) => setReportClientId(e.target.value)}
                                    >
                                        <option value="">Selecione um cliente...</option>
                                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            )}
                            
                            {reportClientId ? (
                                <ReconciliationReport 
                                    clientId={reportClientId} 
                                    clientName={isAdmin ? (clients.find(c => c.id === reportClientId)?.name || 'Cliente') : (profile?.name || 'Cliente')} 
                                />
                            ) : (
                                <Card className="p-12 text-center bg-slate-50 border-dashed border-slate-200">
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Selecione um cliente para gerar o relatório</p>
                                </Card>
                            )}

                            <div className="pt-8 border-t border-slate-100">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <FileText size={14} /> Documentos Arquivados
                                </h3>
                            </div>
                        </div>
                    )}

                    {currentCategory === '📈 DRE Gerencial' && (
                        <div className="mb-10 space-y-4 animate-in fade-in duration-500">
                            {isAdmin && (
                                <div className="max-w-xs mb-8 no-print">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Analisar Cliente:</label>
                                    <select 
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none"
                                        value={reportClientId}
                                        onChange={(e) => setReportClientId(e.target.value)}
                                    >
                                        <option value="">Selecione um cliente...</option>
                                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            )}
                            
                            {reportClientId ? (
                                <DreReport 
                                    clientName={isAdmin ? (clients.find(c => c.id === reportClientId)?.name || 'Cliente') : (profile?.name || 'Cliente')} 
                                    selectedYear={new Date().getFullYear().toString()}
                                />
                            ) : (
                                <Card className="p-12 text-center bg-slate-50 border-dashed border-slate-200">
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Selecione um cliente para analisar a DRE Gerencial</p>
                                </Card>
                            )}
                        </div>
                    )}

                    {currentCategory === '💰 Fluxo de Caixa' && (
                        <div className="mb-10 space-y-4 animate-in fade-in duration-500">
                            {isAdmin && (
                                <div className="max-w-xs mb-8 no-print">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Analisar Cliente:</label>
                                    <select 
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none"
                                        value={reportClientId}
                                        onChange={(e) => setReportClientId(e.target.value)}
                                    >
                                        <option value="">Selecione um cliente...</option>
                                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            )}
                            
                            {reportClientId ? (
                                <CashFlowReport 
                                    clientId={reportClientId} 
                                    clientName={isAdmin ? (clients.find(c => c.id === reportClientId)?.name || 'Cliente') : (profile?.name || 'Cliente')} 
                                />
                            ) : (
                                <Card className="p-12 text-center bg-slate-50 border-dashed border-slate-200">
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Selecione um cliente para analisar o fluxo de caixa</p>
                                </Card>
                            )}
                        </div>
                    )}

                    {currentCategory === '📝 Relatório Mensal' && (
                        <div className="mb-10 space-y-4 animate-in fade-in duration-500">
                            {isAdmin && (
                                <div className="max-w-xs mb-8 no-print">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Analisar Cliente:</label>
                                    <select 
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none"
                                        value={reportClientId}
                                        onChange={(e) => setReportClientId(e.target.value)}
                                    >
                                        <option value="">Selecione um cliente...</option>
                                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            )}
                            
                            {reportClientId ? (
                                <ReportsDashboard 
                                    clientId={reportClientId} 
                                    clientName={isAdmin ? (clients.find(c => c.id === reportClientId)?.name || 'Cliente') : (profile?.name || 'Cliente')} 
                                />
                            ) : (
                                <Card className="p-12 text-center bg-slate-50 border-dashed border-slate-200">
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Selecione um cliente para visualizar o relatório mensal</p>
                                </Card>
                            )}
                        </div>
                    )}

                    {currentCategory === '🎯 Dashboards' && (
                        <div className="mb-10 space-y-4 animate-in fade-in duration-500">
                            {isAdmin && (
                                <div className="max-w-xs mb-8 no-print">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Analisar Cliente:</label>
                                    <select 
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none"
                                        value={reportClientId}
                                        onChange={(e) => setReportClientId(e.target.value)}
                                    >
                                        <option value="">Selecione um cliente...</option>
                                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            )}
                            
                            {reportClientId ? (
                                <ReportsDashboard 
                                    clientId={reportClientId} 
                                    clientName={isAdmin ? (clients.find(c => c.id === reportClientId)?.name || 'Cliente') : (profile?.name || 'Cliente')} 
                                />
                            ) : (
                                <Card className="p-12 text-center bg-slate-50 border-dashed border-slate-200">
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Selecione um cliente para visualizar o dashboard</p>
                                </Card>
                            )}

                            <div className="pt-8 border-t border-slate-100 no-print">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <FileText size={14} /> Dashboards Publicados
                                </h3>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
                        {filteredReports.map((report) => (
                             <Card 
                                key={report.id} 
                                className="flex items-center justify-between p-5 bg-white border border-slate-100 rounded-3xl hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 transition-all group"
                             >
                                 <div className="flex items-center gap-5 flex-1 min-w-0">
                                     <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all shrink-0 shadow-inner">
                                         <FileText size={24} />
                                     </div>
                                     <div className="flex-1 min-w-0">
                                         <div className="flex items-center gap-2">
                                             <h4 className="font-black text-slate-900 text-base truncate group-hover:text-primary transition-colors tracking-tight uppercase">{report.title}</h4>
                                             {isAdmin && report.clientName && (
                                                <span className="text-[8px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md font-bold truncate max-w-[80px]">
                                                    {report.clientName}
                                                </span>
                                             )}
                                         </div>
                                         <div className="flex items-center gap-3 mt-1">
                                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{report.period || 'Geral'}</span>
                                             <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                             <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Pronto para Análise</span>
                                         </div>
                                     </div>
                                 </div>
                                 
                                 <div className="flex items-center gap-2 ml-4">
                                     <Button 
                                         variant="ghost" 
                                         size="icon" 
                                         className="h-11 w-11 text-primary hover:bg-primary/10 rounded-2xl bg-primary/5 border border-primary/10 transition-all"
                                         onClick={() => setSelectedReportForPreview(report)}
                                         title="Visualizar na Tela"
                                      >
                                         <Eye size={20} />
                                      </Button>
                                     
                                     <Button 
                                         variant="ghost" 
                                         size="icon" 
                                         className="h-11 w-11 text-slate-600 hover:bg-slate-100 rounded-2xl bg-slate-50 border border-slate-100 transition-all"
                                         onClick={() => window.open(report.url, '_blank')}
                                         title="Fazer Download / Imprimir"
                                     >
                                         <Download size={20} />
                                     </Button>

                                      {isAdmin && (
                                         <Button 
                                             variant="ghost" 
                                             size="icon" 
                                             className="h-11 w-11 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                                             onClick={(e) => {
                                                 e.stopPropagation();
                                                 handleDelete(report.id);
                                             }}
                                            title="Excluir Relatório"
                                         >
                                             <Trash2 size={20} />
                                         </Button>
                                      )}
                                  </div>
                             </Card>
                        ))}

                        {filteredReports.length === 0 && (
                            <div className="col-span-full py-20 text-center flex flex-col items-center gap-4 text-slate-300">
                                <FolderOpen size={48} />
                                <div className="max-w-xs mx-auto text-center">
                                    <p className="text-slate-900 font-bold uppercase tracking-tight">Pasta Vazia</p>
                                    <p className="text-sm text-slate-400 mt-1">Nenhum relatório foi publicado nesta seção.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Upload Modal */}
            <AnimatePresence>
                {isUploadModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl p-8"
                        >
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Publicar Relatório</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Relatórios Gerenciais</p>
                                </div>
                                <button 
                                    onClick={() => setIsUploadModalOpen(false)}
                                    className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleUpload} className="space-y-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Título do Relatório</label>
                                        <input 
                                            required
                                            className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                                            placeholder="Ex: DRE Gerencial - Abril/24"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Período</label>
                                            <input 
                                                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                                                placeholder="Mensal / 2024"
                                                value={period}
                                                onChange={(e) => setPeriod(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Pasta Destino</label>
                                            <select 
                                                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all appearance-none"
                                                value={category}
                                                onChange={(e) => setCategory(e.target.value)}
                                            >
                                                {REPORT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Link do Arquivo (URL)</label>
                                        <input 
                                            required
                                            className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                                            placeholder="https://..."
                                            value={url}
                                            onChange={(e) => setUrl(e.target.value)}
                                        />
                                    </div>

                                    {isAdmin && (
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Selecionar Cliente</label>
                                            <select 
                                                required
                                                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all appearance-none"
                                                value={targetClientId}
                                                onChange={(e) => setTargetClientId(e.target.value)}
                                            >
                                                <option value="">Escolha um cliente...</option>
                                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                <Button 
                                    className="w-full rounded-[1.25rem] py-8 text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20"
                                    disabled={uploading}
                                >
                                    {uploading ? 'Processando...' : 'Publicar Agora'}
                                </Button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            
            {/* Preview Modal */}
            <AnimatePresence>
                {selectedReportForPreview && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-md">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 40 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 40 }}
                            className="bg-white w-full h-full sm:h-[90vh] max-w-6xl sm:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
                        >
                            {/* Modal Header */}
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-primary/5 rounded-2xl flex items-center justify-center text-primary">
                                        <FileText size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none">{selectedReportForPreview.title}</h3>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedReportForPreview.category}</span>
                                            <div className="w-1 h-1 rounded-full bg-slate-200" />
                                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">{selectedReportForPreview.period}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        className="rounded-xl h-10 px-4 border-slate-200 text-slate-600 hover:bg-slate-50 text-[10px] font-black uppercase tracking-widest"
                                        onClick={() => window.open(selectedReportForPreview.url, '_blank')}
                                    >
                                        <Printer size={14} className="mr-2" /> Download / Imprimir
                                    </Button>
                                    <button 
                                        onClick={() => setSelectedReportForPreview(null)}
                                        className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Content - Iframe viewing */}
                            <div className="flex-1 bg-slate-100 p-0 sm:p-4 overflow-hidden relative">
                                {selectedReportForPreview.url.includes('drive.google.com') ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 bg-white rounded-2xl shadow-inner">
                                        <div className="w-20 h-20 bg-primary/5 text-primary rounded-full flex items-center justify-center mb-6">
                                            <ExternalLink size={40} />
                                        </div>
                                        <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">Visualização Restrita</h4>
                                        <p className="text-sm text-slate-500 max-w-sm mb-8">
                                            Este documento está hospedado no Google Drive. Para melhor visualização e segurança, utilize o visualizador nativo.
                                        </p>
                                        <Button 
                                            onClick={() => window.open(selectedReportForPreview.url, '_blank')}
                                            className="rounded-xl px-8"
                                        >
                                            Abrir em Nova Aba
                                        </Button>
                                    </div>
                                ) : (
                                    <iframe 
                                        src={selectedReportForPreview.url} 
                                        className="w-full h-full border-none sm:rounded-2xl bg-white shadow-inner"
                                        title={selectedReportForPreview.title}
                                    />
                                )}
                            </div>
                            
                            {/* Modal Footer */}
                            <div className="p-4 border-t border-slate-50 bg-slate-50/50 flex items-center justify-center gap-6 shrink-0">
                                <div className="flex items-center gap-2 text-slate-400">
                                    <Clock size={14} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Publicado em: {selectedReportForPreview.createdAt?.seconds ? new Date(selectedReportForPreview.createdAt.seconds * 1000).toLocaleDateString('pt-BR') : 'Data não disponível'}</span>
                                </div>
                                <div className="w-1 h-1 rounded-full bg-slate-200" />
                                <div className="flex items-center gap-2 text-slate-400">
                                    <CheckCircle2 size={14} className="text-emerald-500" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Verificado com Sucesso</span>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            </>
            )}
        </div>
    );
};

const LayoutDashboard = ({ size }: { size: number }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="lucide lucide-layout-dashboard"
    >
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
);

