import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  MoreVertical, 
  ExternalLink, 
  Mail, 
  Phone, 
  Building2,
  ChevronRight,
  ChevronLeft,
  Plus,
  FileText,
  Upload,
  X,
  CheckCircle2,
  Clock,
  Loader2
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useClient } from '../context/ClientContext';
import { base64ToURL } from '../lib/pdfUtils';

interface Client {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  planId?: string;
  status: 'Ativo' | 'Pendente' | 'Inativo';
  lastReport: string;
}

interface Report {
  id: string;
  clientId: string;
  title: string;
  category: string;
  status: 'draft' | 'published';
  period: string;
  documents?: { name: string; url: string }[];
  notes?: string;
  createdAt: any;
}

const REPORT_CATEGORIES = [
    '📅 Minha Agenda de Contas',
    '🔄 Conciliação Bancária',
    '📈 DRE Gerencial',
    '💰 Fluxo de Caixa',
    '📝 Relatório Mensal',
    '🎯 Dashboards'
];

interface ClientsProps {
    setActiveTab?: (tab: string) => void;
    onBack?: () => void;
}

const CATEGORY_COLORS: Record<string, { bgColor: string; borderColor: string; textColor: string; iconBg: string; iconColor: string }> = {
    '📅 Minha Agenda de Contas': { bgColor: 'bg-slate-50/70', borderColor: 'border-slate-200', textColor: 'text-slate-700', iconBg: 'bg-slate-100', iconColor: 'text-slate-500' },
    '🔄 Conciliação Bancária': { bgColor: 'bg-emerald-50/70', borderColor: 'border-emerald-200', textColor: 'text-emerald-700', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-500' },
    '📈 DRE Gerencial': { bgColor: 'bg-amber-50/70', borderColor: 'border-amber-200', textColor: 'text-amber-700', iconBg: 'bg-amber-100', iconColor: 'text-amber-500' },
    '💰 Fluxo de Caixa': { bgColor: 'bg-indigo-50/70', borderColor: 'border-indigo-200', textColor: 'text-indigo-700', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-500' },
    '📝 Relatório Mensal': { bgColor: 'bg-rose-50/70', borderColor: 'border-rose-200', textColor: 'text-rose-700', iconBg: 'bg-rose-100', iconColor: 'text-rose-500' },
    '🎯 Dashboards': { bgColor: 'bg-teal-50/70', borderColor: 'border-teal-200', textColor: 'text-teal-700', iconBg: 'bg-teal-100', iconColor: 'text-teal-500' }
};

export const Clients = ({ setActiveTab, onBack }: ClientsProps) => {
    const { setSelectedClient: setGlobalSelectedClient } = useClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [clients, setClients] = useState<Client[]>([]);
    const [reports, setReports] = useState<Report[]>([]);

    // Form states (Client)
    const [name, setName] = useState('');
    const [company, setCompany] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [planId, setPlanId] = useState('essencial');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [currentCategory, setCurrentCategory] = useState<string | null>(null);

    // Form states (Report)
    const [reportTitle, setReportTitle] = useState('');
    const [reportPeriod, setReportPeriod] = useState('');
    const [reportCategory, setReportCategory] = useState(REPORT_CATEGORIES[0]);
    const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
    const [previewDoc, setPreviewDoc] = useState<{name: string, url: string} | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Effect to handle blob URL for preview
    useEffect(() => {
        if (previewDoc) {
            const url = base64ToURL(previewDoc.url);
            setPreviewUrl(url);
            return () => {
                URL.revokeObjectURL(url);
            };
        } else {
            setPreviewUrl(null);
        }
    }, [previewDoc]);

    // Real-time listener for clients
    useEffect(() => {
        const q = query(collection(db, 'userProfiles'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            console.log(`Clients fetched: ${snapshot.docs.length}`);
            const clientList = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() as any }))
                .filter(p => {
                    const role = (p.role || '').toLowerCase();
                    return role === 'client' || role === 'cliente' || !role;
                });
            
            // Sort manually by createdAt if exists
            const sortedClients = clientList.sort((a: any, b: any) => {
                const dateA = a.createdAt?.seconds || 0;
                const dateB = b.createdAt?.seconds || 0;
                return dateB - dateA;
            });

            setClients(sortedClients);
            setLoading(false);

            if (selectedClient) {
                const refreshed = sortedClients.find(c => c.id === selectedClient.id);
                if (refreshed) {
                    setSelectedClient(refreshed);
                    setGlobalSelectedClient(refreshed.id, refreshed.name);
                }
            }
        }, (error) => {
            console.error('Firestore Clients Error:', error);
            handleFirestoreError(error, OperationType.LIST, 'userProfiles');
            setLoading(false);
        });

        return () => unsubscribe();
    }, [selectedClient?.id]);

    // Real-time listener for reports of selected client
    useEffect(() => {
        if (!selectedClient) {
            setReports([]);
            return;
        }

        const q = query(
            collection(db, 'reports'),
            where('clientId', '==', selectedClient.id)
            // Removed orderBy to avoid index issues if not created
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            console.log(`Reports fetched: ${snapshot.docs.length} for client ${selectedClient.id}`);
            const reportList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as Report[];
            // Sort manually in memory if needed
            const sortedReports = reportList.sort((a, b) => {
                const dateA = a.createdAt?.seconds || 0;
                const dateB = b.createdAt?.seconds || 0;
                return dateB - dateA;
            });
            setReports(sortedReports);
        }, (error) => {
            handleFirestoreError(error, OperationType.LIST, 'reports');
        });

        return () => unsubscribe();
    }, [selectedClient?.id]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !email) return;

        setSaving(true);
        const clientId = `client_${Date.now()}`;
        const newClient = {
            uid: clientId, 
            name,
            companyName: company,
            email,
            phone,
            planId,
            role: 'client',
            status: 'Ativo',
            createdAt: serverTimestamp(),
        };

        try {
            await setDoc(doc(db, 'userProfiles', clientId), newClient);
            setIsModalOpen(false);
            setName('');
            setCompany('');
            setEmail('');
            setPhone('');
        } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, `userProfiles/${clientId}`);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveReport = async (e: React.FormEvent, shouldAddAnother = false) => {
        e.preventDefault();
        if (!selectedClient || !reportTitle || !reportPeriod) return;
        if (filesToUpload.length === 0) {
            alert('Por favor, anexe pelo menos um documento.');
            return;
        }

        setSaving(true);
        const reportId = `report_${Date.now()}`;
        
        try {
            // Check file size (Firestore has 1MB limit for document)
            const totalSize = filesToUpload.reduce((acc, f) => acc + f.size, 0);
            if (totalSize > 900000) { 
                alert('O arquivo é um pouco grande demais para esta versão de teste. Por favor, tente um arquivo menor que 900KB.');
                setSaving(false);
                return;
            }

            // Convert files to Base64
            const documentPromises = filesToUpload.map(file => {
                return new Promise<{name: string, url: string}>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => resolve({
                        name: file.name,
                        url: reader.result as string
                    });
                    reader.onerror = error => reject(error);
                });
            });

            const dummyDocuments = await Promise.all(documentPromises);

            const newReport = {
                clientId: selectedClient.id,
                title: reportTitle,
                category: reportCategory,
                period: reportPeriod,
                documents: dummyDocuments,
                status: 'published',
                createdAt: serverTimestamp(),
            };

            await setDoc(doc(db, 'reports', reportId), newReport);
            
            alert('Relatório publicado com sucesso!');
            
            // Reset form for next report or close
            setReportTitle('');
            setReportPeriod('');
            setReportCategory(REPORT_CATEGORIES[0]);
            setFilesToUpload([]);

            if (!shouldAddAnother) {
                setIsReportModalOpen(false);
            }
        } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
        } finally {
            setSaving(false);
        }
    };

    const handleViewFile = (doc: {name: string, url: string}) => {
        try {
            // Convert Base64 back to Blob for more robust viewing
            const parts = doc.url.split(';base64,');
            const contentType = parts[0].split(':')[1];
            const raw = window.atob(parts[1]);
            const rawLength = raw.length;
            const uInt8Array = new Uint8Array(rawLength);
            for (let i = 0; i < rawLength; ++i) {
                uInt8Array[i] = raw.charCodeAt(i);
            }
            const blob = new Blob([uInt8Array], { type: contentType });
            const blobUrl = URL.createObjectURL(blob);
            
            // Open in new window
            const win = window.open(blobUrl, '_blank');
            if (!win) {
                // Fallback to direct download if popup blocked
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = doc.name;
                link.click();
            }
        } catch (err) {
            console.error('Error opening file:', err);
            // Last resort fallback
            const link = document.createElement('a');
            link.href = doc.url;
            link.download = doc.name;
            link.click();
        }
    };

    const filteredClients = clients.filter(c => 
        (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
        (c.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (selectedClient) {
        // Robust filtering to handle old category names or slight variations
        const filteredReports = reports.filter(r => {
            if (!currentCategory) return true;
            const reportCat = (r.category || '').toLowerCase().trim();
            const selectedCat = (currentCategory || '').toLowerCase().trim();
            // Match same name or if one contains the other (for emoji compatibility)
            return reportCat === selectedCat || reportCat.includes(selectedCat) || selectedCat.includes(reportCat);
        });

        return (
            <div className="space-y-8 pb-12">
                <div className="flex items-center justify-between">
                    <button 
                        onClick={() => {
                            if (currentCategory) {
                                setCurrentCategory(null);
                            } else {
                                setSelectedClient(null);
                                setCurrentCategory(null);
                            }
                        }}
                        className="p-3 -ml-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-2xl transition-all bg-white border border-slate-100 shadow-sm active:scale-95"
                    >
                        <ChevronLeft size={24} />
                    </button>

                    {currentCategory && (
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 bg-slate-50 px-4 py-2 rounded-xl">
                            <span className="uppercase tracking-widest">Pastas</span>
                            <ChevronRight size={14} className="opacity-30" />
                            <span className="text-primary uppercase tracking-widest">{currentCategory}</span>
                        </div>
                    )}
                </div>

                {/* File Preview Modal */}
                <AnimatePresence>
                    {previewDoc && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm">
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white w-full max-w-5xl h-[90vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl"
                            >
                                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                                            <FileText size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-sm">{previewDoc.name}</h3>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Visualização do Documento</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => {
                                                const link = document.createElement('a');
                                                link.href = previewDoc.url;
                                                link.download = previewDoc.name;
                                                link.click();
                                            }}
                                            className="rounded-xl gap-2"
                                        >
                                            <Upload size={16} className="rotate-180" /> Baixar
                                        </Button>
                                        <button 
                                            onClick={() => setPreviewDoc(null)}
                                            className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 bg-slate-100 relative">
                                    {previewUrl && (previewDoc.url.startsWith('data:application/pdf') || previewDoc.name.toLowerCase().endsWith('.pdf')) ? (
                                        <iframe 
                                            src={previewUrl} 
                                            className="w-full h-full border-none"
                                            title="PDF Preview"
                                        />
                                    ) : previewDoc?.url?.startsWith('data:image') ? (
                                        <div className="w-full h-full flex items-center justify-center p-8">
                                            <img src={previewDoc.url} alt="Preview" className="max-w-full max-h-full object-contain shadow-lg" />
                                        </div>
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-slate-400">
                                            <FileText size={64} />
                                            <p className="font-medium text-slate-500">Este tipo de arquivo não pode ser visualizado diretamente.</p>
                                            <Button 
                                                variant="primary" 
                                                onClick={() => {
                                                    const link = document.createElement('a');
                                                    link.href = previewDoc.url;
                                                    link.download = previewDoc.name;
                                                    link.click();
                                                }}
                                                className="rounded-xl"
                                            >
                                                Baixar para ver
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
                            {selectedClient.name?.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl text-slate-900 font-bold tracking-tight">{selectedClient.name}</h1>
                                <span className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                    selectedClient.status === 'Ativo' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                                )}>
                                    {selectedClient.status}
                                </span>
                            </div>
                            <p className="text-slate-500 font-medium flex items-center gap-2 mt-1">
                                <Building2 size={16} /> {selectedClient.companyName || 'Sem empresa vinculada'}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" className="rounded-xl border-slate-200">Editar Cadastro</Button>
                        <Button 
                            variant="primary" 
                            onClick={() => setIsReportModalOpen(true)}
                            className="rounded-xl shadow-lg shadow-primary/20 font-bold"
                        >
                            <Plus size={20} className="mr-2" /> Novo Relatório
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Info Card */}
                    <Card className="p-8 space-y-6 bg-white border-slate-100 h-fit">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Informações de Contato</h3>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 text-slate-600">
                                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                                    <Mail size={16} />
                                </div>
                                <span className="text-sm font-medium">{selectedClient.email}</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-600">
                                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                                    <Phone size={16} />
                                </div>
                                <span className="text-sm font-medium">{selectedClient.phone || 'Nenhum telefone'}</span>
                            </div>
                        </div>
                    </Card>

                    {/* Reports List */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                    <FileText size={16} className="text-primary" />
                                    {currentCategory && currentCategory !== 'Tudo' ? 'Documentos na Pasta' : 'Relatórios e Documentos'}
                                </h3>
                                <div className="flex items-center gap-3">
                                    {currentCategory && (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => setCurrentCategory(null)}
                                            className="text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/5"
                                        >
                                            Voltar para Pastas
                                        </Button>
                                    )}
                                    <span className="text-xs text-slate-400 font-bold">
                                        {currentCategory && currentCategory !== 'Tudo'
                                            ? `${filteredReports.length} arquivos`
                                            : `${reports.length} total de arquivos`
                                        }
                                    </span>
                                </div>
                            </div>
                            
                            {!currentCategory && (
                                <button 
                                    onClick={() => setCurrentCategory('Tudo')}
                                    className="text-[10px] text-slate-400 font-black uppercase tracking-widest hover:text-primary transition-colors text-left"
                                >
                                    Ou clique aqui para ver todos os arquivos deste cliente (Sem Pastas)
                                </button>
                            )}
                            
                            {currentCategory && currentCategory !== 'Tudo' && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 rounded-lg w-fit text-xs font-bold text-primary">
                                    <span>Sistema</span>
                                    <ChevronRight size={12} className="text-primary/30" />
                                    <span>Relatórios</span>
                                    <ChevronRight size={12} className="text-primary/30" />
                                    <span className="text-slate-900">{currentCategory}</span>
                                </div>
                            )}

                            {!currentCategory || currentCategory === 'Tudo' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {REPORT_CATEGORIES.map((cat) => {
                                        const categoryReports = reports.filter(r => {
                                            const reportCat = (r.category || '').toLowerCase().trim();
                                            const folderCat = cat.toLowerCase().trim();
                                            return reportCat === folderCat || reportCat.includes(folderCat) || folderCat.includes(reportCat);
                                        });
                                        const colors = CATEGORY_COLORS[cat] || { bgColor: 'bg-white', borderColor: 'border-slate-100', textColor: 'text-slate-900', iconBg: 'bg-slate-50', iconColor: 'text-slate-400' };
                                        
                                        return (
                                            <div 
                                                key={cat}
                                                onClick={() => setCurrentCategory(cat)}
                                                className={cn(
                                                    "group cursor-pointer p-6 border rounded-[2rem] transition-all hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1 relative overflow-hidden",
                                                    colors.bgColor,
                                                    colors.borderColor
                                                )}
                                            >
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-white/40 rounded-full blur-2xl -mr-12 -mt-12" />
                                                
                                                <div className="flex items-center justify-between mb-6">
                                                    <div className={cn(
                                                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-sm",
                                                        colors.iconBg,
                                                        "group-hover:scale-110 group-hover:rotate-3 group-hover:bg-white"
                                                    )}>
                                                        <span className="text-xl">{cat.split(' ')[0]}</span>
                                                    </div>
                                                    <div className="w-8 h-8 rounded-xl bg-white/50 flex items-center justify-center text-slate-300 group-hover:text-primary transition-all">
                                                        <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                                    </div>
                                                </div>

                                                <div className="space-y-1 relative z-10">
                                                    <h4 className={cn("font-black uppercase tracking-tight text-sm", colors.textColor)}>
                                                        {cat.split(' ').slice(1).join(' ') || cat}
                                                    </h4>
                                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] opacity-60">
                                                        {categoryReports.length === 0 ? 'Pasta Vazia' : `${categoryReports.length} ${categoryReports.length === 1 ? 'arquivo' : 'arquivos'}`}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : filteredReports.length === 0 ? (
                                <Card className="p-16 border-dashed border-2 border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center text-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center text-slate-200">
                                        <FileText size={40} />
                                    </div>
                                    <div className="max-w-xs">
                                        <p className="text-slate-900 font-bold text-lg">Pasta Vazia</p>
                                        <p className="text-sm text-slate-500 mt-2 font-medium">Nenhum arquivo encontrado em <span className="text-slate-900 font-bold">"{currentCategory}"</span>.</p>
                                        <p className="text-[10px] text-slate-400 mt-4 uppercase font-bold tracking-widest">Total de arquivos enviados ao cliente: {reports.length}</p>
                                    </div>
                                    <div className="flex gap-3 mt-4">
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => setCurrentCategory(null)}
                                            className="rounded-xl px-6"
                                        >
                                            Voltar
                                        </Button>
                                        <Button 
                                            variant="primary" 
                                            size="sm" 
                                            onClick={() => setIsReportModalOpen(true)}
                                            className="rounded-xl px-6 shadow-lg shadow-primary/10"
                                        >
                                            Adicionar Agora
                                        </Button>
                                    </div>
                                </Card>
                            ) : (
                                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    {filteredReports.map((report) => (
                                         <div 
                                             key={report.id} 
                                             className="flex items-center justify-between p-3.5 bg-white border border-slate-100 rounded-2xl hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all group"
                                         >
                                             <div className="flex items-center gap-4 flex-1 min-w-0">
                                                 <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all shrink-0">
                                                     <FileText size={18} />
                                                 </div>
                                                 <div className="flex-1 min-w-0">
                                                     <h4 className="font-bold text-slate-800 text-sm truncate group-hover:text-primary transition-colors">{report.title}</h4>
                                                     <div className="flex items-center gap-2">
                                                         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{report.period}</span>
                                                         <div className="w-1 h-1 rounded-full bg-slate-200" />
                                                         <span className="text-[9px] font-black text-primary/40 uppercase tracking-widest">{report.category}</span>
                                                     </div>
                                                 </div>
                                             </div>
                                             
                                             <div className="flex items-center gap-1.5 ml-4">
                                                 {report.documents && report.documents.map((doc, idx) => (
                                                     <div key={idx} className="flex gap-1">
                                                         <Button 
                                                             variant="ghost" 
                                                             size="icon" 
                                                             title={`Visualizar ${doc.name}`}
                                                             className="h-8 w-8 text-primary hover:bg-primary/5 rounded-lg transition-all"
                                                             onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 setPreviewDoc(doc);
                                                             }}
                                                         >
                                                             <ExternalLink size={14} />
                                                         </Button>
                                                         <Button 
                                                             variant="ghost" 
                                                             size="icon" 
                                                             title={`Baixar ${doc.name}`}
                                                             className="h-8 w-8 text-slate-300 hover:text-slate-600 rounded-lg transition-all"
                                                             onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 const link = document.createElement('a');
                                                                 link.href = doc.url;
                                                                 link.download = doc.name;
                                                                 link.click();
                                                             }}
                                                         >
                                                             <Upload size={14} className="rotate-180" />
                                                         </Button>
                                                     </div>
                                                 ))}
                                             </div>
                                         </div>
                                     ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Create Report Modal */}
                <AnimatePresence>
                    {isReportModalOpen && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-6"
                            onClick={() => !saving && setIsReportModalOpen(false)}
                        >
                            <motion.div 
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary">
                                            <FileText size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-900">Novo Relatório</h3>
                                            <p className="text-sm text-slate-500">Para: {selectedClient.name}</p>
                                        </div>
                                    </div>
                                    <button 
                                        disabled={saving}
                                        onClick={() => setIsReportModalOpen(false)} 
                                        className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                                <form onSubmit={(e) => handleSaveReport(e, false)} className="p-8 space-y-6">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tipo / Pasta</label>
                                            <select 
                                                required
                                                value={reportCategory}
                                                onChange={(e) => setReportCategory(e.target.value)}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none appearance-none cursor-pointer"
                                            >
                                                {REPORT_CATEGORIES.map(cat => (
                                                    <option key={cat} value={cat}>{cat}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Título do Relatório</label>
                                            <input 
                                                required
                                                type="text" 
                                                placeholder="Ex: Fluxo de Caixa Mensal" 
                                                value={reportTitle}
                                                onChange={(e) => setReportTitle(e.target.value)}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none" 
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Período (Ex: Abril / 2026)</label>
                                            <input 
                                                required
                                                type="text" 
                                                placeholder="Abril 2026" 
                                                value={reportPeriod}
                                                onChange={(e) => setReportPeriod(e.target.value)}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none" 
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Documentos (PDF, DOC)</label>
                                                <span className="text-[10px] font-bold text-primary">{filesToUpload.length} anexado(s)</span>
                                            </div>
                                            
                                            <div className="space-y-3">
                                                {filesToUpload.map((file, idx) => (
                                                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                                        <div className="flex items-center gap-2 overflow-hidden">
                                                            <FileText size={16} className="text-slate-400 shrink-0" />
                                                            <span className="text-xs font-medium text-slate-700 truncate">{file.name}</span>
                                                        </div>
                                                        <button 
                                                            type="button"
                                                            onClick={() => setFilesToUpload(prev => prev.filter((_, i) => i !== idx))}
                                                            className="text-slate-400 hover:text-rose-500 transition-colors"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                ))}

                                                <div className="relative group">
                                                    <input 
                                                        type="file" 
                                                        multiple
                                                        onChange={(e) => {
                                                            if (e.target.files) {
                                                                const newFiles = Array.from(e.target.files);
                                                                setFilesToUpload(prev => [...prev, ...newFiles]);
                                                            }
                                                        }}
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                        accept=".pdf,.doc,.docx"
                                                    />
                                                    <div className="w-full px-4 py-6 bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 group-hover:border-primary/30 transition-colors">
                                                        <Upload size={20} className="text-slate-300 group-hover:text-primary transition-colors" />
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">
                                                            {filesToUpload.length > 0 ? 'Adicionar outro documento' : 'Clique para selecionar arquivo'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 pt-4">
                                        <div className="flex gap-3">
                                            <Button 
                                                type="button"
                                                variant="outline" 
                                                className="flex-1 rounded-xl h-12" 
                                                onClick={(e) => handleSaveReport(e, true)}
                                                disabled={saving || filesToUpload.length === 0}
                                            >
                                                {saving ? <Loader2 size={18} className="animate-spin" /> : 'Salvar e Anexar Outro'}
                                            </Button>
                                            <Button 
                                                type="submit"
                                                variant="primary" 
                                                className="flex-1 rounded-xl h-12 shadow-lg shadow-primary/20 font-bold"
                                                disabled={saving || filesToUpload.length === 0}
                                            >
                                                {saving ? (
                                                    <Loader2 size={18} className="animate-spin" />
                                                ) : (
                                                    'Concluir e Publicar'
                                                )}
                                            </Button>
                                        </div>
                                        <Button 
                                            type="button"
                                            variant="ghost" 
                                            className="w-full rounded-xl text-slate-400 hover:text-slate-600" 
                                            onClick={() => setIsReportModalOpen(false)}
                                            disabled={saving}
                                        >
                                            Cancelar
                                        </Button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-12">
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
                        <h1 className="text-3xl text-slate-900 font-bold tracking-tight">Gestão de Clientes</h1>
                        <p className="text-slate-500 mt-1 font-medium">Cadastre e acompanhe o fluxo financeiro de seus clientes.</p>
                    </div>
                </div>
                <Button variant="primary" onClick={() => setIsModalOpen(true)} className="rounded-xl h-12 px-6">
                    <UserPlus size={20} className="mr-2" /> Novo Cliente
                </Button>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: 'Total de Clientes', value: clients.length, icon: Users, color: 'text-blue-500 bg-blue-50' },
                    { label: 'Clientes Ativos', value: clients.filter(c => c.status === 'Ativo').length, icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-50' },
                    { label: 'Relatórios Pendentes', value: '5', icon: Clock, color: 'text-amber-500 bg-amber-50' },
                ].map((item, i) => (
                    <Card key={i} className="p-6 flex items-center gap-4 bg-white border-slate-100 shadow-sm">
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", item.color)}>
                            <item.icon size={24} />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400">{item.label}</p>
                            <p className="text-2xl font-bold text-slate-900">{item.value}</p>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Filters & Table */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="relative w-full sm:w-80">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar cliente ou empresa..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                        />
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button variant="outline" className="flex-1 sm:flex-none border-slate-200 text-slate-600">
                            <Filter size={18} className="mr-2" /> Filtros
                        </Button>
                    </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm min-h-[200px] flex flex-col">
                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                            <Loader2 size={32} className="animate-spin text-primary" />
                            <p className="text-sm font-medium">Carregando clientes...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-100">
                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente / Empresa</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Contato</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Último Relatório</th>
                                        <th className="px-6 py-4 text-right"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClients.map((client) => (
                                        <tr 
                                            key={client.id} 
                                            onClick={() => {
                                                setSelectedClient(client);
                                                setGlobalSelectedClient(client.id, client.name);
                                                setCurrentCategory(null);
                                            }}
                                            className="group hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 cursor-pointer"
                                        >
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-sm shrink-0">
                                                        {client.name?.split(' ').map(n => n[0]).join('')}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-800">{client.name}</p>
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                                            <Building2 size={12} />
                                                            {client.companyName || 'Empresa não informada'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                                                        <Mail size={12} className="text-slate-300" />
                                                        {client.email}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                                                        <Phone size={12} className="text-slate-300" />
                                                        {client.phone}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col gap-1">
                                                    <span className={cn(
                                                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit",
                                                        client.status === 'Ativo' ? "bg-emerald-50 text-emerald-600" : 
                                                        client.status === 'Pendente' ? "bg-amber-50 text-amber-600" : 
                                                        "bg-slate-50 text-slate-600"
                                                    )}>
                                                        {client.status || 'Pendente'}
                                                    </span>
                                                    {client.planId && (
                                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-50 rounded-md w-fit">
                                                            {client.planId}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <p className="text-xs font-bold text-slate-600">{client.lastReport || 'Sem relatórios'}</p>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full text-slate-400 hover:text-primary">
                                                        <ExternalLink size={16} />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600">
                                                        <MoreVertical size={16} />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {!loading && filteredClients.length === 0 && (
                                <div className="p-12 text-center text-slate-400 italic">
                                    Nenhum cliente encontrado.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Create Client Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <>
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !saving && setIsModalOpen(false)}
                            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
                        >
                            <motion.div 
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
                            >
                                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white relative">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                                            <UserPlus size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-900">Novo Cliente</h3>
                                            <p className="text-sm text-slate-500">Insira os dados cadastrais básicos.</p>
                                        </div>
                                    </div>
                                    <button 
                                        disabled={saving}
                                        onClick={() => setIsModalOpen(false)} 
                                        className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors disabled:opacity-50"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                                <form onSubmit={handleSave} className="p-8 space-y-6">
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nome Completo</label>
                                                <input 
                                                    required
                                                    type="text" 
                                                    placeholder="Ex: João Silva" 
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none" 
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Empresa (Opcional)</label>
                                                <input 
                                                    type="text" 
                                                    placeholder="Ex: Tech Corp" 
                                                    value={company}
                                                    onChange={(e) => setCompany(e.target.value)}
                                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none" 
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">E-mail</label>
                                            <input 
                                                required
                                                type="email" 
                                                placeholder="email@exemplo.com" 
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none" 
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Telefone / WhatsApp</label>
                                            <input 
                                                type="text" 
                                                placeholder="(00) 00000-0000" 
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none" 
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Plano de Serviço</label>
                                            <select 
                                                value={planId}
                                                onChange={(e) => setPlanId(e.target.value)}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none appearance-none"
                                            >
                                                <option value="essencial">Plano Essencial</option>
                                                <option value="profissional">Plano Profissional</option>
                                                <option value="premium">Plano Premium (Consultoria)</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <Button 
                                            type="button"
                                            variant="ghost" 
                                            className="flex-1 rounded-xl h-12" 
                                            onClick={() => setIsModalOpen(false)}
                                            disabled={saving}
                                        >
                                            Cancelar
                                        </Button>
                                        <Button 
                                            type="submit"
                                            variant="primary" 
                                            className="flex-1 rounded-xl h-12 shadow-lg shadow-primary/20"
                                            disabled={saving}
                                        >
                                            {saving ? (
                                                <>
                                                    <Loader2 size={18} className="mr-2 animate-spin" />
                                                    Salvando...
                                                </>
                                            ) : (
                                                'Salvar Cliente'
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

