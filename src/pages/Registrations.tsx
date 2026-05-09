import React, { useState, useEffect } from 'react';
import { 
    FolderTree, 
    Building2, 
    Library, 
    Users2, 
    Wallet,
    Plus,
    Search,
    Edit3,
    Trash2,
    Save,
    X,
    ChevronDown,
    ChevronRight,
    ArrowLeft,
    Database,
    ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useClient } from '../context/ClientContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
    collection, 
    addDoc, 
    getDocs, 
    updateDoc, 
    deleteDoc, 
    doc, 
    query, 
    where,
    orderBy,
    onSnapshot,
    serverTimestamp 
} from 'firebase/firestore';

import { 
    UNIVERSAL_CHART_OF_ACCOUNTS, 
    UNIVERSAL_COST_CENTERS, 
    UNIVERSAL_PAYMENT_METHODS 
} from '../constants/financial';

const BRAZILIAN_BANKS = [
    { code: '001', name: 'Banco do Brasil S.A.' },
    { code: '341', name: 'Itaú Unibanco S.A.' },
    { code: '237', name: 'Banco Bradesco S.A.' },
    { code: '033', name: 'Banco Santander (Brasil) S.A.' },
    { code: '104', name: 'Caixa Econômica Federal' },
    { code: '260', name: 'Nubank' },
    { code: '077', name: 'Banco Inter' },
    { code: '336', name: 'C6 Bank' },
    { code: '422', name: 'Banco Safra S.A.' },
    { code: '655', name: 'Banco Votorantim S.A.' },
    { code: '212', name: 'Banco Original S.A.' },
    { code: '633', name: 'Banco Rendimento S.A.' },
    { code: '999', name: 'Caixa Interno (Espécie)' }
].sort((a,b) => a.name.localeCompare(b.name));

interface RegistrationsProps {
    setActiveTab: (tab: string) => void;
    onBack?: () => void;
}

export type RegistrationType = 'accounts' | 'costCenters' | 'banks' | 'partners' | 'methods';

export const Registrations = ({ setActiveTab, onBack }: RegistrationsProps) => {
    const { profile, isAdmin } = useAuth();
    const { selectedClientId, selectedClientName } = useClient();
    const [activeSubTab, setActiveSubTab] = useState<RegistrationType>('accounts');
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<any>(null);

    // Data states
    const [data, setData] = useState<any[]>([]);

    useEffect(() => {
        const isShared = activeSubTab === 'accounts' || activeSubTab === 'costCenters' || activeSubTab === 'methods';
        
        if (!selectedClientId && !isShared) {
            setData([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const colPath = activeSubTab === 'accounts' ? 'chartOfAccounts' :
                        activeSubTab === 'costCenters' ? 'costCenters' :
                        activeSubTab === 'banks' ? 'banks' :
                        activeSubTab === 'partners' ? 'partners' : 'paymentMethods';

        const clientIdToQuery = isShared ? 'global' : selectedClientId;

        const unsubscribe = onSnapshot(query(
            collection(db, colPath),
            where('clientId', '==', clientIdToQuery)
        ), (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setData(items);
            setLoading(false);
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, colPath);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [activeSubTab, selectedClientId]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    const handlePrepopulate = async () => {
        const confirmMsg = activeSubTab === 'accounts' ? 'Deseja carregar o Plano de Contas completo (conforme estrutura padrão de Serviços/Comércio)?' :
                          activeSubTab === 'banks' ? 'Deseja carregar a lista dos principais Bancos?' :
                          activeSubTab === 'costCenters' ? 'Deseja carregar Centros de Custo padrão?' :
                          'Deseja carregar Formas de Pagamento padrão?';
        
        if (!window.confirm(confirmMsg)) return;
        setLoading(true);
        
        let items: any[] = [];
        let colPath = '';

        if (activeSubTab === 'accounts') {
            colPath = 'chartOfAccounts';
            items = UNIVERSAL_CHART_OF_ACCOUNTS.map(acc => ({
                code: acc.code,
                name: acc.name,
                type: acc.type,
                group: acc.group
            }));
        } else if (activeSubTab === 'banks') {
            colPath = 'banks';
            const today = new Date().toISOString().substring(0, 10);
            items = [
                { name: 'Banco do Brasil S.A.', bankCode: '001', accountType: 'Corrente', balance: 0, initialBalance: 0, initialBalanceDate: today },
                { name: 'Itaú Unibanco S.A.', bankCode: '341', accountType: 'Corrente', balance: 0, initialBalance: 0, initialBalanceDate: today },
                { name: 'Banco Bradesco S.A.', bankCode: '237', accountType: 'Corrente', balance: 0, initialBalance: 0, initialBalanceDate: today },
                { name: 'Banco Santander (Brasil) S.A.', bankCode: '033', accountType: 'Corrente', balance: 0, initialBalance: 0, initialBalanceDate: today },
                { name: 'Caixa Econômica Federal', bankCode: '104', accountType: 'Corrente', balance: 0, initialBalance: 0, initialBalanceDate: today },
                { name: 'Nubank', bankCode: '260', accountType: 'Corrente', balance: 0, initialBalance: 0, initialBalanceDate: today },
                { name: 'Banco Inter', bankCode: '077', accountType: 'Corrente', balance: 0, initialBalance: 0, initialBalanceDate: today },
                { name: 'C6 Bank', bankCode: '336', accountType: 'Corrente', balance: 0, initialBalance: 0, initialBalanceDate: today },
                { name: 'Caixa Interno (Espécie)', bankCode: '999', accountType: 'Caixa', balance: 0, initialBalance: 0, initialBalanceDate: today }
            ];
        } else if (activeSubTab === 'costCenters') {
            colPath = 'costCenters';
            items = UNIVERSAL_COST_CENTERS.map(cc => ({
                name: cc.name,
                code: cc.id.toUpperCase()
            }));
        } else if (activeSubTab === 'methods') {
            colPath = 'paymentMethods';
            items = UNIVERSAL_PAYMENT_METHODS.map(m => ({
                name: m.name,
                code: m.id.toUpperCase()
            }));
        }

        try {
            const isShared = activeSubTab === 'accounts' || activeSubTab === 'costCenters' || activeSubTab === 'methods';
            const clientIdToSave = isShared ? 'global' : selectedClientId;
            const clientNameToSave = isShared ? 'GLOBAL' : selectedClientName;

            for (const item of items) {
                await addDoc(collection(db, colPath), {
                    ...item,
                    clientId: clientIdToSave,
                    clientName: clientNameToSave,
                    createdAt: serverTimestamp()
                });
            }
            alert('Dados carregados com sucesso!');
        } catch (error) {
            alert('Erro ao carregar dados.');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (dataToSave: any) => {
        const colPath = activeSubTab === 'accounts' ? 'chartOfAccounts' :
                        activeSubTab === 'costCenters' ? 'costCenters' :
                        activeSubTab === 'banks' ? 'banks' :
                        activeSubTab === 'partners' ? 'partners' : 'paymentMethods';

        console.log("Attempting to save registration:", { colPath, dataToSave, isEdit: !!selectedItem });

        try {
            if (activeSubTab === 'partners' && !dataToSave.name) {
                throw new Error('O nome do parceiro é obrigatório.');
            }

            if (selectedItem) {
                console.log("Updating existing item:", selectedItem.id);
                await updateDoc(doc(db, colPath, selectedItem.id), {
                    ...dataToSave,
                    updatedAt: serverTimestamp()
                });
            } else {
                console.log("Adding new item to:", colPath);
                const isShared = activeSubTab === 'accounts' || activeSubTab === 'costCenters' || activeSubTab === 'methods';
                const clientIdToSave = isShared ? 'global' : selectedClientId;
                const clientNameToSave = isShared ? 'GLOBAL' : selectedClientName;

                await addDoc(collection(db, colPath), {
                    ...dataToSave,
                    clientId: clientIdToSave,
                    clientName: clientNameToSave,
                    createdAt: serverTimestamp()
                });
            }
            alert('Registro salvo com sucesso!');
            setIsModalOpen(false);
            setSelectedItem(null);
        } catch (error: any) {
            console.error("Critical error in handleSave:", error);
            if (error.code === 'permission-denied' || error.message?.includes('permission-denied')) {
                alert('Erro de Permissão: Você não tem autorização para realizar esta operação. Verifique se seu e-mail de administrador foi validado.');
            } else {
                alert(`Erro ao salvar: ${error.message || 'Erro desconhecido'}`);
            }
            throw error;
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir?')) return;
        const colPath = activeSubTab === 'accounts' ? 'chartOfAccounts' :
                        activeSubTab === 'costCenters' ? 'costCenters' :
                        activeSubTab === 'banks' ? 'banks' :
                        activeSubTab === 'partners' ? 'partners' : 'paymentMethods';
        
        try {
            await deleteDoc(doc(db, colPath, id));
        } catch (error) {
            console.error("Error deleting registration:", error);
        }
    };

    const tabs = [
        { id: 'accounts', label: 'Plano de Contas', icon: FolderTree },
        { id: 'costCenters', label: 'Centro de Custos', icon: Building2 },
        { id: 'banks', label: 'Bancos', icon: Library },
        { id: 'partners', label: 'Fornecedores/Clientes', icon: Users2 },
        { id: 'methods', label: 'Formas de Pagamento', icon: Wallet },
    ];

    return (
        <div className="space-y-6 pb-12">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                            {isAdmin 
                                ? ( (activeSubTab === 'accounts' || activeSubTab === 'costCenters' || activeSubTab === 'methods')
                                    ? `Configuração Global: ${activeSubTab === 'accounts' ? 'Plano de Contas' : activeSubTab === 'costCenters' ? 'Centros de Custo' : 'Formas de Pagamento'}`
                                    : `Cadastros: ${selectedClientName || 'Nenhum Cliente Selecionado'}` )
                                : 'Cadastros Estruturais'
                            }
                        </h1>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Configure a base para seus relatórios e DRE</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {isAdmin && (activeSubTab === 'accounts' || activeSubTab === 'methods' || activeSubTab === 'costCenters' || activeSubTab === 'banks') && (
                        <Button 
                            variant="outline"
                            onClick={handlePrepopulate}
                            className="rounded-xl px-6 py-3 text-[11px] font-black uppercase tracking-widest bg-white border-slate-100 hidden md:flex"
                        >
                            <Database size={16} className="mr-2" /> {data.length === 0 ? 'Carregar Padrão' : 'Resetar Padrão'}
                        </Button>
                    )}
                    {(selectedClientId || activeSubTab === 'accounts' || activeSubTab === 'methods' || activeSubTab === 'costCenters') && (
                        <Button 
                            onClick={() => { setSelectedItem(null); setIsModalOpen(true); }}
                            className="rounded-xl px-6 py-3 text-[11px] font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                        >
                            <Plus size={16} className="mr-2" /> Novo Registro
                        </Button>
                    )}
                </div>
            </header>

            {(!selectedClientId && isAdmin && activeSubTab !== 'accounts' && activeSubTab !== 'costCenters' && activeSubTab !== 'methods') && (
                <Card className="p-12 text-center bg-white border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                    <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Users2 size={32} />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Nenhum Cliente Selecionado</h3>
                    <p className="text-slate-400 text-xs font-medium max-w-xs mx-auto mt-2">
                        Selecione um cliente no Monitor Geral para gerenciar seus cadastros estruturais.
                    </p>
                    <Button 
                        variant="primary" 
                        className="mt-8 rounded-xl px-8 py-3 text-[11px] font-black uppercase tracking-widest"
                        onClick={() => setActiveTab('dashboard')}
                    >
                        Ir para Monitor Geral
                    </Button>
                </Card>
            )}

            {(selectedClientId || activeSubTab === 'accounts' || activeSubTab === 'costCenters' || activeSubTab === 'methods') && (
                <>
                {/* Sub-tabs Navigation */}
            <div className="flex flex-wrap gap-2">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveSubTab(tab.id as RegistrationType)}
                        className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-[11px] uppercase tracking-widest border-2",
                            activeSubTab === tab.id 
                                ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200" 
                                : "bg-white text-slate-400 border-slate-50 hover:border-slate-200"
                        )}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* List View */}
            <Card className="p-0 border-none shadow-xl shadow-slate-200/20 overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-white/50 backdrop-blur-sm sticky top-0 z-10">
                    <div className="relative flex-1 max-w-md">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Pesquisar..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all placeholder:text-slate-300"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    {activeSubTab === 'accounts' ? 'Código / Conta' : 
                                     activeSubTab === 'banks' ? 'Banco' :
                                     activeSubTab === 'partners' ? 'Fornecedor / Cliente' :
                                     activeSubTab === 'methods' ? 'Forma de Pagamento' : 'Nome'}
                                </th>
                                {activeSubTab === 'accounts' && <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tipo</th>}
                                {activeSubTab === 'banks' && (
                                    <>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cód. / Tipo</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ag. / Conta</th>
                                    </>
                                )}
                                {activeSubTab === 'partners' && <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">CPF / CNPJ</th>}
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {(() => {
                                const isGlobalTab = activeSubTab === 'accounts' || activeSubTab === 'costCenters' || activeSubTab === 'methods';
                                const baseData = (data.length > 0 || !isGlobalTab) ? data : (
                                    activeSubTab === 'accounts' ? UNIVERSAL_CHART_OF_ACCOUNTS.map(a => ({...a, isVirtual: true})) :
                                    activeSubTab === 'costCenters' ? UNIVERSAL_COST_CENTERS.map(c => ({...c, isVirtual: true, name: c.name})) : 
                                    activeSubTab === 'methods' ? UNIVERSAL_PAYMENT_METHODS.map(m => ({...m, isVirtual: true})) : []
                                );

                                // Field mapping for virtual items if needed
                                const normalizedData = baseData.map(item => {
                                    if (item.isVirtual && activeSubTab === 'costCenters') {
                                        return { ...item, name: item.name };
                                    }
                                    return item;
                                });

                                const filtered = normalizedData
                                    .filter(item => 
                                        JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase())
                                    )
                                    .sort((a, b) => {
                                        if (activeSubTab === 'accounts') {
                                            return (a.code || '').localeCompare(b.code || '') || (a.name || '').localeCompare(b.name || '');
                                        }
                                        return (a.name || '').localeCompare(b.name || '');
                                    });

                                if (filtered.length > 0 && activeSubTab === 'accounts' && !searchTerm) {
                                    // Grouping for Plano de Contas
                                    const groups = Array.from(new Set(filtered.map(i => i.group || 'Geral'))).sort();
                                    return groups.map(group => (
                                        <React.Fragment key={group}>
                                            <tr className="bg-slate-50/50">
                                                <td colSpan={4} className="px-6 py-2">
                                                    <span className="text-[9px] font-black text-primary uppercase tracking-widest">{group}</span>
                                                </td>
                                            </tr>
                                            {filtered.filter(i => i.group === group).sort((a,b) => (a.code || '').localeCompare(b.code || '')).map(item => (
                                                <RegistrationRow key={item.id} item={item} type={activeSubTab} onEdit={setSelectedItem} onDelete={handleDelete} onOpenModal={() => setIsModalOpen(true)} formatCurrency={formatCurrency} />
                                            ))}
                                        </React.Fragment>
                                    ));
                                }

                                return filtered.map((item) => (
                                    <RegistrationRow key={item.id} item={item} type={activeSubTab} onEdit={setSelectedItem} onDelete={handleDelete} onOpenModal={() => setIsModalOpen(true)} formatCurrency={formatCurrency} />
                                ));
                            })()}
                            {!loading && data.length === 0 && (activeSubTab === 'banks' || activeSubTab === 'partners') && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum registro encontrado</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Modal de Cadastro */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
                            onClick={() => setIsModalOpen(false)}
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[2.5rem] p-8 md:p-10 w-full max-w-xl relative z-10 shadow-2xl overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-8">
                                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="mb-8">
                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                                    {selectedItem ? 'Editar Registro' : 'Novo Registro'}
                                </h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Prencha as informações abaixo</p>
                            </div>

                            <RegistrationForm 
                                type={activeSubTab} 
                                initialData={selectedItem} 
                                onSave={handleSave} 
                                onCancel={() => setIsModalOpen(false)} 
                            />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            </>
            )}
        </div>
    );
};

interface RegistrationRowProps {
    key?: string;
    item: any;
    type: RegistrationType;
    onEdit: (item: any) => void;
    onDelete: (id: string) => void;
    onOpenModal: () => void;
    formatCurrency: (val: number) => string;
}

const RegistrationRow = ({ item, type, onEdit, onDelete, onOpenModal, formatCurrency }: RegistrationRowProps) => {
    const parts = (item.code || '').split('.');
    const isLevel1 = parts.length === 1 && type === 'accounts';
    const isLevel2 = parts.length === 2 && type === 'accounts';
    const isLevel3 = parts.length === 3 && type === 'accounts';
    const indentation = type === 'accounts' ? (parts.length - 1) * 16 : 0;

    return (
        <tr className={cn(
            "hover:bg-slate-50/30 transition-colors group",
            isLevel1 ? "bg-slate-50/40" : ""
        )}>
            <td className="px-6 py-4">
                <div className="flex flex-col" style={{ paddingLeft: `${indentation}px` }}>
                    <div className="flex items-center gap-2">
                        <span className={cn(
                            "text-xs",
                            isLevel1 ? "font-black text-slate-900 uppercase" : 
                            isLevel2 ? "font-black text-slate-700" :
                            "font-bold text-slate-500"
                        )}>
                            {item.name}
                        </span>
                        {item.isVirtual && (
                            <span className="text-[7px] font-black bg-slate-100 text-slate-400 px-1 py-0.5 rounded uppercase tracking-tighter">Padrão</span>
                        )}
                    </div>
                    {item.code && <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-0.5">{item.code}</span>}
                </div>
            </td>
            {type === 'accounts' && (
                <td className="px-6 py-4 text-center">
                    {!isLevel1 && (
                        <span className={cn(
                            "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md",
                            item.type === 'receber' ? "bg-emerald-50 text-emerald-600" : 
                            item.type === 'pagar' ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-600"
                        )}>
                            {item.type === 'receber' ? 'Receita' : 
                             item.type === 'pagar' ? 'Despesa' : 'Misto'}
                        </span>
                    )}
                </td>
            )}
            {type === 'banks' && (
                <>
                    <td className="px-6 py-4">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-500 uppercase">{item.bankCode || '---'}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.accountType || '---'}</span>
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-500 uppercase">{item.agency || '---'}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.accountNumber || '---'}</span>
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-500 uppercase">{formatCurrency(item.initialBalance || 0)}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Saldo em {item.initialBalanceDate ? new Date(item.initialBalanceDate).toLocaleDateString('pt-BR') : '---'}</span>
                        </div>
                    </td>
                </>
            )}
            {type === 'partners' && (
                <td className="px-6 py-4">
                    <span className="text-[10px] font-bold text-slate-400">
                        {item.taxId || 'Não informado'}
                    </span>
                </td>
            )}
            <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!item.isVirtual ? (
                        <>
                            <button 
                                onClick={() => { onEdit(item); onOpenModal(); }}
                                className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                            >
                                <Edit3 size={16} />
                            </button>
                            <button 
                                onClick={() => onDelete(item.id)}
                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            >
                                <Trash2 size={16} />
                            </button>
                        </>
                    ) : (
                        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mr-2 italic">Carregue o padrão para editar</span>
                    )}
                </div>
            </td>
        </tr>
    );
};

interface FormProps {
    type: RegistrationType;
    initialData?: any;
    onSave: (data: any) => Promise<void>;
    onCancel: () => void;
}

export const RegistrationForm = ({ type, initialData, onSave, onCancel }: FormProps) => {
    const [formData, setFormData] = useState<any>({
        name: initialData?.name || '',
        code: initialData?.code || '',
        group: initialData?.group || '',
        type: initialData?.type || 'despesa',
        category: initialData?.category || '',
        bankCode: initialData?.bankCode || '',
        taxId: initialData?.taxId || '',
        contact: initialData?.contact || '',
        agency: initialData?.agency || '',
        accountNumber: initialData?.accountNumber || '',
        phone: initialData?.phone || '',
        accountType: initialData?.accountType || '',
        initialBalance: initialData?.initialBalance || 0,
        initialBalanceDate: initialData?.initialBalanceDate || new Date().toISOString().substring(0, 10),
    });

    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const maskCPFCNPJ = (value: string) => {
        const numbers = value.replace(/\D/g, '');
        if (numbers.length <= 11) {
            return numbers
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d{1,2})/, '$1-$2')
                .replace(/(-\d{2})\d+?$/, '$1');
        } else {
            return numbers
                .replace(/(\d{2})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1/$2')
                .replace(/(\d{4})(\d{1,2})/, '$1-$2')
                .replace(/(-\d{2})\d+?$/, '$1');
        }
    };

    const maskPhone = (value: string) => {
        const numbers = value.replace(/\D/g, '');
        if (numbers.length <= 10) {
            return numbers
                .replace(/(\d{2})(\d)/, '($1) $2')
                .replace(/(\d{4})(\d{4})/, '$1-$2')
                .replace(/(-\d{4})\d+?$/, '$1');
        } else {
            return numbers
                .replace(/(\d{2})(\d)/, '($1) $2')
                .replace(/(\d{5})(\d{4})/, '$1-$2')
                .replace(/(-\d{4})\d+?$/, '$1');
        }
    };

    const validateCPF = (cpf: string) => {
        const numbers = cpf.replace(/\D/g, '');
        if (numbers.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(numbers)) return false;
        
        let sum = 0;
        for (let i = 1; i <= 9; i++) sum += parseInt(numbers.substring(i-1, i)) * (11 - i);
        let remainder = (sum * 10) % 11;
        if ((remainder === 10) || (remainder === 11)) remainder = 0;
        if (remainder !== parseInt(numbers.substring(9, 10))) return false;
        
        sum = 0;
        for (let i = 1; i <= 10; i++) sum += parseInt(numbers.substring(i-1, i)) * (12 - i);
        remainder = (sum * 10) % 11;
        if ((remainder === 10) || (remainder === 11)) remainder = 0;
        if (remainder !== parseInt(numbers.substring(10, 11))) return false;
        
        return true;
    };

    const validateCNPJ = (cnpj: string) => {
        const numbers = cnpj.replace(/\D/g, '');
        if (numbers.length !== 14) return false;
        if (/^(\d)\1{13}$/.test(numbers)) return false;

        let length = numbers.length - 2;
        let digits = numbers.substring(0, length);
        let rev = numbers.substring(length);
        let sum = 0;
        let pos = length - 7;
        for (let i = length; i >= 1; i--) {
            sum += parseInt(digits.charAt(length - i)) * pos--;
            if (pos < 2) pos = 9;
        }
        let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
        if (result !== parseInt(rev.charAt(0))) return false;

        length = length + 1;
        digits = numbers.substring(0, length);
        sum = 0;
        pos = length - 7;
        for (let i = length; i >= 1; i--) {
            sum += parseInt(digits.charAt(length - i)) * pos--;
            if (pos < 2) pos = 9;
        }
        result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
        if (result !== parseInt(rev.charAt(1))) return false;

        return true;
    };

    useEffect(() => {
        setErrors({});
    }, [formData.name, formData.taxId, formData.contact]);

    const validate = () => {
        const newErrors: Record<string, string> = {};
        const cleanedName = (formData.name || '').trim();
        
        if (!cleanedName) {
            newErrors.name = 'O nome ou razão social é obrigatório';
        }

        if (type === 'partners') {
            const taxNumbers = (formData.taxId || '').replace(/\D/g, '');
            if (taxNumbers) {
                if (taxNumbers.length !== 11 && taxNumbers.length !== 14) {
                    newErrors.taxId = 'CPF/CNPJ deve ter 11 ou 14 dígitos';
                } else if (taxNumbers.length === 11) {
                    if (!validateCPF(taxNumbers)) newErrors.taxId = 'CPF inválido';
                } else if (taxNumbers.length === 14) {
                    if (!validateCNPJ(taxNumbers)) newErrors.taxId = 'CNPJ inválido';
                }
            }

            const phoneNumbers = (formData.contact || '').replace(/\D/g, '');
            if (phoneNumbers && phoneNumbers.length > 0 && phoneNumbers.length < 10) {
                newErrors.contact = 'Telefone precisa de DDD + número';
            }
        }

        setErrors(newErrors);
        const isValid = Object.keys(newErrors).length === 0;
        if (!isValid) {
            const firstError = Object.values(newErrors)[0];
            alert(`Atenção: ${firstError}`);
            console.warn("Validation failed:", newErrors);
        }
        return isValid;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!validate()) {
            return;
        }

        setLoading(true);
        try {
            // Clean empty strings and trim fields
            const dataToSave = { ...formData };
            Object.keys(dataToSave).forEach(key => {
                if (typeof dataToSave[key] === 'string') {
                    dataToSave[key] = dataToSave[key].trim();
                }
            });

            console.log("RegistrationForm submitting cleaned data:", dataToSave);
            await onSave(dataToSave);
        } catch (error: any) {
            console.error("Form submit error details:", error);
            const errorMsg = error?.message?.includes('permission-denied') 
                ? 'Sem permissão para salvar. Verifique se você é um administrador.' 
                : 'Não foi possível completar o salvamento. Verifique os dados e tente novamente.';
            alert(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Registro</label>
                    <input 
                        type="text" 
                        value={formData.name || ''}
                        onChange={(e) => {
                            const name = e.target.value;
                            const update: any = { name };
                            if (type === 'banks') {
                                const foundBank = BRAZILIAN_BANKS.find(b => b.name === name);
                                if (foundBank) {
                                    update.bankCode = foundBank.code;
                                }
                            }
                            setFormData({...formData, ...update});
                        }}
                        list={type === 'banks' ? 'banks-list' : undefined}
                        className={cn(
                            "w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all placeholder:text-slate-300",
                            errors.name && "border-rose-500 focus:border-rose-500 ring-rose-500/10"
                        )}
                        placeholder={type === 'banks' ? "Selecione ou digite o banco" : "Ex: Aluguel, Banco Itaú, etc."}
                    />
                    {type === 'banks' && (
                        <datalist id="banks-list">
                            {BRAZILIAN_BANKS.map(b => (
                                <option key={b.code} value={b.name} />
                            ))}
                        </datalist>
                    )}
                    {errors.name && <p className="text-[9px] font-bold text-rose-500 ml-1">{errors.name}</p>}
                </div>

                {type === 'accounts' && (
                    <>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Grupo / Categoria Pai</label>
                            <input 
                                type="text" 
                                value={formData.group || ''}
                                onChange={(e) => setFormData({...formData, group: e.target.value})}
                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all placeholder:text-slate-300"
                                placeholder="Ex: 1. RECEITAS OPERACIONAIS"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Código Contábil</label>
                            <input 
                                type="text" 
                                value={formData.code || ''}
                                onChange={(e) => setFormData({...formData, code: e.target.value})}
                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all placeholder:text-slate-300"
                                placeholder="Ex: 3.1.1"
                            />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo</label>
                             <select 
                                 value={formData.type || ''}
                                 onChange={(e) => setFormData({...formData, type: e.target.value})}
                                 className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all"
                             >
                                 <option value="receber">Receita</option>
                                 <option value="pagar">Despesa (Custo/Gasto)</option>
                                 <option value="mixed">Misto (Financeiro)</option>
                             </select>
                         </div>
                    </>
                )}

                {type === 'banks' && (
                    <>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cód. Banco</label>
                            <input 
                                type="text" 
                                value={formData.bankCode || ''}
                                onChange={(e) => setFormData({...formData, bankCode: e.target.value})}
                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all placeholder:text-slate-300"
                                placeholder="Ex: 001"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Conta</label>
                            <select 
                                value={formData.accountType || ''}
                                onChange={(e) => setFormData({...formData, accountType: e.target.value})}
                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all"
                            >
                                <option value="">Selecione...</option>
                                <option value="Corrente">Corrente</option>
                                <option value="Poupança">Poupança</option>
                                <option value="Caixa">Caixa / Espécie</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Agência</label>
                            <input 
                                type="text" 
                                value={formData.agency || ''}
                                onChange={(e) => setFormData({...formData, agency: e.target.value})}
                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all placeholder:text-slate-300"
                                placeholder="0000-0"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nº da Conta</label>
                            <input 
                                type="text" 
                                value={formData.accountNumber || ''}
                                onChange={(e) => {
                                    let val = e.target.value.replace(/\D/g, '');
                                    if (val.length > 1) {
                                        val = val.replace(/(\d+)(\d{1})$/, "$1-$2");
                                    }
                                    setFormData({...formData, accountNumber: val});
                                }}
                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all placeholder:text-slate-300"
                                placeholder="00000-0"
                            />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone / Contato</label>
                            <input 
                                type="text" 
                                value={formData.phone || ''}
                                onChange={(e) => {
                                    let val = e.target.value.replace(/\D/g, '');
                                    if (val.length > 11) val = val.substring(0, 11);
                                    if (val.length > 2 && val.length <= 6) {
                                        val = val.replace(/^(\d{2})(\d+)/, "($1) $2");
                                    } else if (val.length > 6 && val.length <= 10) {
                                        val = val.replace(/^(\d{2})(\d{4})(\d+)/, "($1) $2-$3");
                                    } else if (val.length > 10) {
                                        val = val.replace(/^(\d{2})(\d{5})(\d+)/, "($1) $2-$3");
                                    } else if (val.length > 0) {
                                        val = val.replace(/^(\d+)/, "($1");
                                    }
                                    setFormData({...formData, phone: val});
                                }}
                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all placeholder:text-slate-300"
                                placeholder="(00) 00000-0000"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Saldo Inicial (R$)</label>
                            <input 
                                type="text" 
                                value={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(formData.initialBalance || 0)}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    setFormData({...formData, initialBalance: parseFloat(val || '0') / 100});
                                }}
                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all placeholder:text-slate-300"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data do Saldo Inicial</label>
                            <input 
                                type="date" 
                                value={formData.initialBalanceDate || ''}
                                onChange={(e) => setFormData({...formData, initialBalanceDate: e.target.value})}
                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all"
                            />
                        </div>
                    </>
                )}

                {type === 'partners' && (
                    <>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CPF / CNPJ</label>
                            <input 
                                type="text" 
                                value={formData.taxId || ''}
                                onChange={(e) => setFormData({...formData, taxId: maskCPFCNPJ(e.target.value)})}
                                className={cn(
                                    "w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all placeholder:text-slate-300",
                                    errors.taxId && "border-rose-500 focus:border-rose-500 ring-rose-500/10"
                                )}
                                placeholder="000.000.000-00"
                            />
                            {errors.taxId && <p className="text-[9px] font-bold text-rose-500 ml-1">{errors.taxId}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone (Contato)</label>
                            <input 
                                type="text" 
                                value={formData.contact || ''}
                                onChange={(e) => setFormData({...formData, contact: maskPhone(e.target.value)})}
                                className={cn(
                                    "w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all placeholder:text-slate-300",
                                    errors.contact && "border-rose-500 focus:border-rose-500 ring-rose-500/10"
                                )}
                                placeholder="(00) 00000-0000"
                            />
                            {errors.contact && <p className="text-[9px] font-bold text-rose-500 ml-1">{errors.contact}</p>}
                        </div>
                    </>
                )}
            </div>

            <div className="flex items-center gap-3 pt-4">
                <Button 
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded-xl py-4 text-[11px] font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                >
                    <Save size={16} className="mr-2" /> 
                    {loading ? 'Salvando...' : 'Salvar Cadastro'}
                </Button>
                <Button 
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    className="rounded-xl py-4 px-6 text-[11px] font-black uppercase tracking-widest bg-white border-slate-100"
                >
                    Cancelar
                </Button>
            </div>
        </form>
    );
};
