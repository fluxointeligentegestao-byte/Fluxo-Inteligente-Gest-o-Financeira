import React, { useState, useEffect } from 'react';
import { 
    FileText, 
    Upload, 
    Filter, 
    Search, 
    MoreVertical, 
    CheckCircle2, 
    Clock, 
    AlertCircle, 
    X,
    FolderOpen,
    Eye,
    Trash2,
    ArrowLeft,
    ChevronRight,
    ChevronLeft
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    onSnapshot, 
    serverTimestamp,
    deleteDoc,
    doc,
    orderBy
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface ClientDocument {
    id: string;
    clientId: string;
    clientName: string;
    name: string;
    url: string;
    type: string;
    status: 'pending' | 'processed' | 'rejected';
    createdAt: any;
}

const DOC_TYPES = [
    'Contas a Pagar',
    'Contas a Receber',
    'Extratos Bancários',
    'Notas Fiscais',
    'Folha de Pagamento',
    'Outros'
];

export const Documents = ({ setActiveTab, onBack }: { setActiveTab?: (tab: string) => void, onBack?: () => void }) => {
    const { profile, user, isAdmin } = useAuth();
    const [documents, setDocuments] = useState<ClientDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [currentTypeFilter, setCurrentTypeFilter] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    
    // Upload Form State
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<{name: string, url: string} | null>(null);
    const [docType, setDocType] = useState('Outros');

    useEffect(() => {
        if (!user) return;

        let q;
        if (isAdmin) {
            q = query(collection(db, 'clientDocuments'), orderBy('createdAt', 'desc'));
        } else {
            q = query(
                collection(db, 'clientDocuments'), 
                where('clientId', '==', user.uid)
            );
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as ClientDocument[];
            
            // Manual sort for non-admin
            if (!isAdmin) {
                docList.sort((a, b) => {
                    const dateA = a.createdAt?.seconds || 0;
                    const dateB = b.createdAt?.seconds || 0;
                    return dateB - dateA;
                });
            }

            setDocuments(docList);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching documents:', error);
            handleFirestoreError(error, OperationType.LIST, 'clientDocuments');
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, profile?.role]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            setSelectedFile({
                name: file.name,
                url: event.target?.result as string
            });
        };
        reader.readAsDataURL(file);
    };

    const handleUpload = async () => {
        if (!selectedFile || !user) return;

        setUploading(true);
        try {
            await addDoc(collection(db, 'clientDocuments'), {
                clientId: user.uid,
                clientName: profile?.name || 'Cliente',
                name: selectedFile.name,
                url: selectedFile.url,
                type: docType,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            setIsUploadModalOpen(false);
            setSelectedFile(null);
            setDocType('Outros');
        } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, 'clientDocuments');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Deseja realmente remover este documento?')) return;
        try {
            await deleteDoc(doc(db, 'clientDocuments', id));
        } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, 'clientDocuments');
        }
    };

    const filteredDocs = documents.filter(doc => {
        const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             doc.clientName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
        const matchesType = !currentTypeFilter || doc.type === currentTypeFilter;
        return matchesSearch && matchesStatus && matchesType;
    });

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="flex items-center gap-4">
                    {onBack && (
                        <button 
                            onClick={onBack}
                            className="p-2 -ml-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all no-print"
                        >
                            <ChevronLeft size={24} />
                        </button>
                    )}
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="px-3 py-1 bg-primary/5 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">
                                {isAdmin ? 'Gestão de Arquivos' : 'Área de Envio'}
                            </span>
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fluxo de Documentos</span>
                        </div>
                        <h1 className="text-4xl text-slate-900 font-black tracking-tight uppercase">
                            {isAdmin ? 'Documentos dos Clientes' : 'Central de Documentos'}
                        </h1>
                        <p className="text-slate-500 mt-2 font-medium">
                            {isAdmin 
                                ? 'Organização de fluxos e integração para contabilidade.'
                                : 'Envie seus comprovantes e extratos para processamento operacional.'}
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    {currentTypeFilter && (
                        <Button 
                            variant="ghost" 
                            onClick={() => setCurrentTypeFilter(null)}
                            className="text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/5"
                        >
                             Todas Pastas
                        </Button>
                    )}
                    <Button 
                        variant="primary" 
                        onClick={() => setIsUploadModalOpen(true)}
                        className="rounded-2xl px-6 shadow-lg shadow-primary/20"
                    >
                        <Upload size={18} className="mr-2" /> Enviar
                    </Button>
                </div>
            </div>

            {/* Folder View */}
            {!currentTypeFilter && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {DOC_TYPES.map((type) => {
                        const typeDocs = documents.filter(d => d.type === type);
                        return (
                            <Card 
                                key={type} 
                                onClick={() => setCurrentTypeFilter(type)}
                                className="p-6 bg-white border-slate-100 hover:border-primary/20 hover:shadow-xl transition-all group cursor-pointer active:scale-[0.98] relative overflow-hidden rounded-3xl"
                            >
                                <div className="absolute top-0 left-0 w-1 h-full bg-primary/5 group-hover:bg-primary transition-colors" />
                                <div className="flex items-center justify-between mb-6">
                                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all shadow-inner">
                                        <div className="relative">
                                            <FileText size={24} />
                                            {typeDocs.length > 0 && (
                                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-white text-[9px] flex items-center justify-center rounded-full border-2 border-white font-black">
                                                    {typeDocs.length}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronRight size={16} className="text-slate-200 group-hover:text-primary transition-colors" />
                                </div>
                                <h3 className="text-sm font-black text-slate-900 group-hover:text-primary transition-colors uppercase tracking-tight leading-none">{type}</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                                    {typeDocs.length === 0 ? 'Vazio' : `${typeDocs.length} arquivos`}
                                </p>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Filters & Table View (When folder is selected or always for searching) */}
            {(currentTypeFilter || searchQuery) && (
                <Card className="rounded-[2.5rem] overflow-hidden border-slate-100 shadow-xl shadow-slate-200/20 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="p-4 bg-slate-50/50 border-b border-slate-100 space-y-4">
                        <div className="flex flex-col gap-4 text-left">
                            <div className="flex flex-wrap items-center gap-3">
                                {currentTypeFilter && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-xl text-[9px] font-black uppercase tracking-widest">
                                        <FolderOpen size={12} /> {currentTypeFilter}
                                        <button onClick={() => setCurrentTypeFilter(null)} className="ml-1 hover:text-slate-900">
                                            <X size={12} />
                                        </button>
                                    </div>
                                )}
                                <div className="relative flex-1 min-w-[200px] group">
                                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
                                    <input 
                                        type="text" 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Buscar arquivo..." 
                                        className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all shadow-sm"
                                    />
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide no-scrollbar">
                                {['all', 'pending', 'processed', 'rejected'].map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setStatusFilter(s)}
                                        className={cn(
                                            "whitespace-nowrap px-4 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all border",
                                            statusFilter === s 
                                                ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" 
                                                : "bg-white text-slate-400 border-slate-100 hover:text-slate-600 hover:bg-slate-50"
                                        )}
                                    >
                                        {s === 'all' ? 'Ver Todos' : s === 'pending' ? 'Pendentes' : s === 'processed' ? 'Vistos' : 'Recusados'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50/30">
                                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Documento</th>
                                {isAdmin && <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>}
                                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Categoria</th>
                                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                                <th className="px-6 py-4 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                                        Carregando...
                                    </td>
                                </tr>
                            ) : filteredDocs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-300">
                                         Vazio
                                    </td>
                                </tr>
                            ) : filteredDocs.map((docItem) => (
                                <tr 
                                    key={docItem.id} 
                                    onClick={() => window.open(docItem.url, '_blank')}
                                    className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                                >
                                    <td className="px-6 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all shadow-inner">
                                                <FileText size={16} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-900 group-hover:text-primary transition-colors truncate max-w-[150px] uppercase tracking-tight">{docItem.name}</span>
                                                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">PDF / Anexo</span>
                                            </div>
                                        </div>
                                    </td>
                                    {isAdmin && (
                                        <td className="px-6 py-3">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate block max-w-[100px]">
                                                {docItem.clientName}
                                            </span>
                                        </td>
                                    )}
                                    <td className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                        {docItem.type}
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="flex justify-center">
                                            {docItem.status === 'processed' ? (
                                                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/20" />
                                            ) : docItem.status === 'pending' ? (
                                                <div className="w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500/20" />
                                            ) : (
                                                <div className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500/20" />
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-8 text-[8px] px-2 font-black uppercase text-slate-400 hover:text-primary group-hover:opacity-100 opacity-0 transition-all"
                                            >
                                                Abrir <ChevronRight size={10} className="ml-1" />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg group-hover:opacity-100 opacity-0 transition-all"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(docItem.id);
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
            )}

            {/* Upload Modal */}
            <AnimatePresence>
                {isUploadModalOpen && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl"
                        >
                            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Enviar Documento</h3>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Upload de Novo Arquivo</p>
                                </div>
                                <button 
                                    onClick={() => setIsUploadModalOpen(false)}
                                    className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Tipo de Documento</label>
                                    <select 
                                        value={docType}
                                        onChange={(e) => setDocType(e.target.value)}
                                        className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                                    >
                                        {DOC_TYPES.map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Arquivo</label>
                                    <div className="relative">
                                        <input 
                                            type="file" 
                                            onChange={handleFileChange}
                                            id="file-upload"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                                        />
                                        <label 
                                            htmlFor="file-upload"
                                            className="flex flex-col items-center justify-center w-full p-10 border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50 hover:bg-slate-100 hover:border-primary/40 transition-all cursor-pointer group"
                                        >
                                            <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all shadow-inner mb-4">
                                                <Upload size={28} />
                                            </div>
                                            <span className="text-sm font-black text-slate-900 group-hover:text-primary transition-colors">
                                                {selectedFile ? selectedFile.name : 'Selecionar Arquivo'}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">PDF, Imagens ou Excel</span>
                                        </label>
                                    </div>
                                </div>

                                <Button 
                                    className="w-full py-6 rounded-[1.5rem] text-sm font-black uppercase tracking-widest shadow-xl shadow-primary/20" 
                                    onClick={handleUpload}
                                    disabled={!selectedFile || uploading}
                                >
                                    {uploading ? 'Enviando...' : 'Confirmar Envio'}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

