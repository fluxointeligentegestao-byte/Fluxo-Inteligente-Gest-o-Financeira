import React, { useState, useEffect } from 'react';
import { 
    Plus, 
    Search, 
    Filter, 
    Download, 
    MoreHorizontal, 
    CreditCard, 
    ArrowUpCircle, 
    ArrowDownCircle,
    Calendar,
    FileText,
    User,
    Tag,
    Trash2,
    Edit3,
    X,
    Save,
    RotateCcw,
    CheckCircle2,
    Check,
    ChevronLeft,
    ChevronRight,
    ArrowUpDown,
    ArrowUp,
    ArrowDown
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { RegistrationForm, RegistrationType } from './Registrations';
import { 
    collection, 
    addDoc, 
    getDocs, 
    updateDoc, 
    deleteDoc, 
    doc, 
    query, 
    orderBy, 
    where,
    onSnapshot,
    serverTimestamp,
    Timestamp,
    runTransaction,
    getDoc
} from 'firebase/firestore';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { ChartAccount, CostCenter, UNIVERSAL_CHART_OF_ACCOUNTS, UNIVERSAL_COST_CENTERS, UNIVERSAL_PAYMENT_METHODS } from '../constants/financial';
import { useClient } from '../context/ClientContext';

interface TransactionsProps {
    setActiveTab: (tab: string) => void;
    onBack?: () => void;
}

interface FinancialTransaction {
    id: string;
    nfNumber: string;
    type: 'receita' | 'despesa';
    partnerName: string;
    partnerTaxId: string;
    accountId: string;
    costCenterId: string;
    dueDate: string;
    installment: string;
    originalValue: number;
    description: string;
    issueDate: string;
    observation: string;
    status: 'Pendente' | 'Pago' | 'Recebido' | 'Vencido' | 'Conciliado';
    settlement?: {
        paymentDate: string;
        paidValue: number;
        bankId: string;
        paymentMethodId: string;
        settledAt: any;
        isConciled?: boolean;
        interest?: number;
        penalty?: number;
        discount?: number;
    };
    createdAt: any;
}

export const Transactions = ({ setActiveTab, onBack }: TransactionsProps) => {
    const { profile, user, isAdmin, loading: authLoading } = useAuth();
    const { selectedClientId, selectedClientName, clients, setSelectedClient } = useClient();
    
    const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [costCenters, setCostCenters] = useState<any[]>([]);
    const [partners, setPartners] = useState<any[]>([]);
    const [banks, setBanks] = useState<any[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
    
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
    const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [filters, setFilters] = useState({
        type: 'todos',
        partner: 'todos',
        category: 'todos',
        status: 'todos',
        dueDate: 'todos',
        value: 'todos'
    });
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'dueDate', direction: 'desc' });
    const [selectedTransaction, setSelectedTransaction] = useState<FinancialTransaction | null>(null);
    const [revertingSettlementId, setRevertingSettlementId] = useState<string | null>(null);

    // Fallbacks for empty lists (Universal Defaults)
    const effectiveAccounts = accounts.length > 0 ? accounts : UNIVERSAL_CHART_OF_ACCOUNTS;
    const effectiveCostCenters = costCenters.length > 0 ? costCenters : UNIVERSAL_COST_CENTERS;
    const effectiveMethods = paymentMethods.length > 0 ? paymentMethods : UNIVERSAL_PAYMENT_METHODS;

    // Dynamic Options for Filters
    const filterOptions = {
        partners: Array.from(new Set(transactions.map(t => t.partnerName))).filter((p): p is string => Boolean(p)).sort(),
        categories: Array.from(new Set(transactions.map(t => effectiveAccounts.find(a => a.id === t.accountId)?.name))).filter((c): c is string => Boolean(c)).sort(),
        dueDates: Array.from(new Set(transactions.map(t => t.dueDate))).filter((d): d is string => Boolean(d)).sort().reverse(),
        values: Array.from(new Set(transactions.map(t => t.originalValue))).filter((v): v is number => typeof v === 'number').sort((a, b) => b - a)
    };

    // Helper to calculate dynamic status
    const getDynamicStatus = (t: FinancialTransaction) => {
        if (t.status === 'Conciliado') return 'Conciliado';
        
        if (t.status === 'Pago' || t.status === 'Recebido') {
            return t.type === 'receita' ? 'Recebido' : 'Pago';
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const dueDate = new Date(t.dueDate);
        dueDate.setHours(0, 0, 0, 0);

        if (dueDate.getTime() < today.getTime()) return 'Vencido';
        if (dueDate.getTime() === today.getTime()) return 'Vence hoje';
        return 'à vencer';
    };

    // Settlement state
    const [settlementData, setSettlementData] = useState({
        paymentDate: new Date().toISOString().substring(0, 10),
        interest: 0,
        penalty: 0,
        discount: 0,
        paidValue: 0,
        bankId: '',
        paymentMethodId: ''
    });

    // Form states
    const [formData, setFormData] = useState<Partial<FinancialTransaction>>({
        type: 'despesa',
        status: 'Pendente',
        issueDate: new Date().toISOString().substring(0, 10),
        dueDate: new Date().toISOString().substring(0, 10),
        installment: '1/1',
        originalValue: 0,
        nfNumber: '',
        partnerName: '',
        partnerTaxId: '',
        accountId: '',
        costCenterId: '',
        description: '',
        observation: ''
    });

    const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>('');

    useEffect(() => {
        const unsubAcc = onSnapshot(query(
            collection(db, 'chartOfAccounts'),
            where('clientId', '==', 'global')
        ), (snap) => {
            setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubCC = onSnapshot(query(
            collection(db, 'costCenters'),
            where('clientId', '==', 'global')
        ), (snap) => {
            setCostCenters(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubMethods = onSnapshot(query(
            collection(db, 'paymentMethods'),
            where('clientId', '==', 'global')
        ), (snap) => {
            setPaymentMethods(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubAcc();
            unsubCC();
            unsubMethods();
        };
    }, []);

    useEffect(() => {
        if (!selectedClientId) {
            setTransactions([]);
            setPartners([]);
            setBanks([]);
            setLoading(false);
            return;
        }

        const unsubTrans = onSnapshot(query(
            collection(db, 'transactions'), 
            where('clientId', '==', selectedClientId),
            orderBy('dueDate', 'desc')
        ), (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialTransaction));
            setTransactions(list);
            setLoading(false);
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'transactions');
            setLoading(false);
        });

        const unsubPartners = onSnapshot(query(
            collection(db, 'partners'),
            where('clientId', '==', selectedClientId)
        ), (snap) => {
            setPartners(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'partners');
        });

        const unsubBanks = onSnapshot(query(
            collection(db, 'banks'),
            where('clientId', '==', selectedClientId)
        ), (snap) => {
            setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'banks');
        });

        return () => {
            unsubTrans();
            unsubPartners();
            unsubBanks();
        };
    }, [selectedClientId]);

    // Reset invalid account when type changes or update category code
    useEffect(() => {
        if (effectiveAccounts.length > 0) {
            const mappedType = formData.type === 'receita' ? 'receber' : 'pagar';
            
            if (formData.accountId) {
                const acc = effectiveAccounts.find(a => a.id === formData.accountId);
                if (acc) {
                    if (acc.type !== mappedType && acc.type !== 'mixed') {
                        setFormData(prev => ({ ...prev, accountId: '', description: '' }));
                        setSelectedCategoryCode('');
                    } else if (acc.code) {
                        // If editing, find the parent level 2 code
                        const parts = acc.code.split('.');
                        if (parts.length >= 2) {
                            setSelectedCategoryCode(`${parts[0]}.${parts[1]}`);
                        }
                    }
                }
            } else {
                setSelectedCategoryCode('');
            }
        }
    }, [formData.type, effectiveAccounts, formData.accountId]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.accountId || !formData.originalValue || !formData.partnerName) {
            alert('Por favor, preencha Favorecido, Categoria e Valor.');
            return;
        }

        // Validate if partner is registered
        const partnerExists = partners.some(p => p.name === formData.partnerName);
        if (!partnerExists) {
            alert('Erro: Este Fornecedor/Cliente não está cadastrado. Você precisa cadastrá-lo previamente para utilizá-lo no lançamento.');
            return;
        }

        try {
            if (selectedTransaction) {
                await updateDoc(doc(db, 'transactions', selectedTransaction.id), {
                    ...formData,
                    updatedAt: serverTimestamp()
                });
            } else {
                await addDoc(collection(db, 'transactions'), {
                    ...formData,
                    clientId: selectedClientId,
                    clientName: selectedClientName,
                    createdAt: serverTimestamp()
                });
            }
            setIsModalOpen(false);
            resetForm();
            alert('Lançamento salvo com sucesso!');
        } catch (error) {
            console.error("Error saving transaction:", error);
            alert('Erro ao salvar lançamento. Verifique suas permissões.');
        }
    };

    const handleQuickPartnerSave = async (partnerData: any) => {
        console.log("Saving quick partner:", partnerData);
        try {
            await addDoc(collection(db, 'partners'), {
                ...partnerData,
                clientId: selectedClientId,
                clientName: selectedClientName,
                createdAt: serverTimestamp()
            });
            alert('Parceiro cadastrado com sucesso!');
            setIsPartnerModalOpen(false);
            // Autofill the saved partner
            setFormData(prev => ({
                ...prev,
                partnerName: partnerData.name,
                partnerTaxId: partnerData.taxId || ''
            }));
        } catch (error) {
            console.error("Error saving quick partner:", error);
            // Rethrow so RegistrationForm can handle the error alert
            throw error;
        }
    };

    const [deletingId, setDeletingId] = useState<string | null>(null);

    const openSettlement = (t: FinancialTransaction) => {
        setSelectedTransaction(t);
        setSettlementData({
            paymentDate: new Date().toISOString().substring(0, 10),
            interest: 0,
            penalty: 0,
            discount: 0,
            paidValue: t.originalValue,
            bankId: '',
            paymentMethodId: ''
        });
        setIsSettlementModalOpen(true);
    };

    const handleSettlementConfirm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTransaction || !settlementData.bankId) {
            alert('Por favor, selecione a conta bancária.');
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const transRef = doc(db, 'transactions', selectedTransaction.id);
                
                // Update transaction only - do NOT update bank balance here
                // Bank balance is updated only on conciliation
                transaction.update(transRef, {
                    status: selectedTransaction.type === 'receita' ? 'Recebido' : 'Pago',
                    settlement: {
                        ...settlementData,
                        isConciled: false, // Explicitly not conciled on simple settle
                        settledAt: serverTimestamp()
                    },
                    updatedAt: serverTimestamp()
                });
            });

            setIsSettlementModalOpen(false);
            alert('Baixa realizada com sucesso! O título agora consta como liquidado no sistema.');
        } catch (error) {
            console.error("Error settling transaction:", error);
            alert('Erro ao realizar baixar. Verifique os dados.');
        }
    };

    const handleRevertSettlement = async (transaction: FinancialTransaction) => {
        if (!transaction.settlement?.bankId) {
            alert('Erro: Dados da baixa não encontrados.');
            return;
        }

        // Warning: if it's already conciled, it shouldn't be reverted here probably, 
        // but we allow it and only update transaction since 'baixar' didn't affect bank balance
        const wasConciled = transaction.settlement?.isConciled;
        if (wasConciled) {
            alert('Erro: Este título já está conciliado. Para estornar a baixa, primeiro desconcilie na ferramenta de Conciliação Bancária.');
            return;
        }

        try {
            await runTransaction(db, async (firestoreTransaction) => {
                const transRef = doc(db, 'transactions', transaction.id);
                
                // Update transaction back to Pendente and remove settlement info
                // We don't touch bank balance because 'Baixar' didn't touch it
                firestoreTransaction.update(transRef, {
                    status: 'Pendente',
                    settlement: null,
                    updatedAt: serverTimestamp()
                });
            });

            setRevertingSettlementId(null);
            alert('Baixa estornada com sucesso! O título voltou para Pendente.');
        } catch (error) {
            console.error("Error reverting settlement:", error);
            alert('Erro ao estornar baixa.');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteDoc(doc(db, 'transactions', id));
            setDeletingId(null);
            // Using a simple notification instead of alert
        } catch (error) {
            console.error("Error deleting:", error);
            handleFirestoreError(error, OperationType.DELETE, `transactions/${id}`);
        }
    };

    const resetForm = () => {
        setSelectedTransaction(null);
        setSelectedCategoryCode('');
        setFormData({
            type: 'despesa',
            status: 'Pendente',
            issueDate: new Date().toISOString().substring(0, 10),
            dueDate: new Date().toISOString().substring(0, 10),
            installment: '1/1',
            originalValue: 0,
            nfNumber: '',
            partnerName: '',
            partnerTaxId: '',
            accountId: '',
            costCenterId: '',
            description: '',
            observation: ''
        });
    };

    const openEdit = (t: FinancialTransaction) => {
        setSelectedTransaction(t);
        setFormData(t);
        setIsModalOpen(true);
    };

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const filtered = transactions.filter(t => {
        const acc = effectiveAccounts.find(a => a.id === t.accountId);
        const cc = effectiveCostCenters.find(c => c.id === t.costCenterId);

        const matchesSearch = !searchTerm || 
            t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.partnerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.nfNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            acc?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            acc?.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            cc?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            cc?.code?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const dynamicStatus = getDynamicStatus(t);
        const categoryName = acc?.name;

        const matchesType = filters.type === 'todos' || t.type === filters.type;
        const matchesPartner = filters.partner === 'todos' || t.partnerName === filters.partner;
        const matchesCategory = filters.category === 'todos' || categoryName === filters.category;
        const matchesStatus = filters.status === 'todos' || dynamicStatus.toLowerCase() === filters.status.toLowerCase();
        const matchesDueDate = filters.dueDate === 'todos' || t.dueDate === filters.dueDate;
        const matchesValue = filters.value === 'todos' || t.originalValue.toString() === filters.value;

        const matchesDateRange = (!startDate || t.dueDate >= startDate) && (!endDate || t.dueDate <= endDate);

        return matchesSearch && matchesType && matchesPartner && matchesCategory && matchesStatus && matchesDueDate && matchesValue && matchesDateRange;
    }).sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortConfig.key) {
            case 'dueDate':
                aValue = a.dueDate;
                bValue = b.dueDate;
                break;
            case 'type':
                aValue = a.type;
                bValue = b.type;
                break;
            case 'partnerName':
                aValue = a.partnerName?.toLowerCase() || '';
                bValue = b.partnerName?.toLowerCase() || '';
                break;
            case 'category':
                aValue = effectiveAccounts.find(acc => acc.id === a.accountId)?.name?.toLowerCase() || '';
                bValue = effectiveAccounts.find(acc => acc.id === b.accountId)?.name?.toLowerCase() || '';
                break;
            case 'originalValue':
                aValue = a.originalValue;
                bValue = b.originalValue;
                break;
            case 'status':
                aValue = getDynamicStatus(a).toLowerCase();
                bValue = getDynamicStatus(b).toLowerCase();
                break;
            default:
                return 0;
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    return (
        <div className="space-y-6 pb-12">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div>
                        <div className="flex flex-col md:flex-row md:items-center gap-3">
                            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                                {isAdmin ? 'Controle de Lançamentos' : 'Gestão de Lançamentos'}
                            </h1>
                            {isAdmin && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border border-primary/10 rounded-xl ml-2">
                                    <User size={12} className="text-primary" />
                                    <select 
                                        value={selectedClientId || ''}
                                        onChange={(e) => {
                                            const client = clients.find(c => c.id === e.target.value);
                                            setSelectedClient(e.target.value || null, client?.name || null);
                                        }}
                                        className="bg-transparent border-none text-[10px] font-black text-primary uppercase focus:ring-0 outline-none cursor-pointer pr-4 min-w-[200px]"
                                    >
                                        <option value="" className="text-slate-900">Selecionar Cliente...</option>
                                        {clients.map(c => (
                                            <option key={c.id} value={c.id} className="text-slate-900">
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Controle de Contas a Pagar e Receber</p>
                    </div>
                </div>
                {(!isAdmin || selectedClientId) && (
                    <Button 
                        onClick={() => { resetForm(); setIsModalOpen(true); }}
                        className="rounded-xl px-6 py-3 text-[11px] font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                    >
                        <Plus size={16} className="mr-2" /> Novo Lançamento
                    </Button>
                )}
            </header>

            {!selectedClientId && isAdmin && (
                <Card className="p-12 text-center bg-white border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                    <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-6">
                        <User size={32} />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Nenhum Cliente Selecionado</h3>
                    <p className="text-slate-400 text-xs font-medium max-w-xs mx-auto mt-2 pb-8">
                        Selecione um cliente no topo da página para gerenciar seus lançamentos financeiros.
                    </p>
                </Card>
            )}

            {(!isAdmin || selectedClientId) && (
                <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-5 border-none shadow-xl shadow-slate-200/20 bg-white">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Total a Receber</p>
                    <h3 className="text-xl font-black text-emerald-600">
                        {formatCurrency(transactions.filter(t => t.type === 'receita').reduce((acc, t) => acc + (t.originalValue || 0), 0))}
                    </h3>
                </Card>
                <Card className="p-5 border-none shadow-xl shadow-slate-200/20 bg-white">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Total a Pagar</p>
                    <h3 className="text-xl font-black text-rose-600">
                        {formatCurrency(transactions.filter(t => t.type === 'despesa').reduce((acc, t) => acc + (t.originalValue || 0), 0))}
                    </h3>
                </Card>
            </div>

            <Card className="p-0 border-none shadow-xl shadow-slate-200/20 overflow-hidden bg-white">
                <div className="p-6 border-b border-slate-50 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 flex-1">
                            <div className="relative flex-1 max-w-md">
                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                                <input 
                                    type="text" 
                                    placeholder="Buscar por descrição..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20 transition-all"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">De</span>
                                    <input 
                                        type="date" 
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="bg-transparent border-none text-[10px] font-black text-slate-700 uppercase focus:ring-0 outline-none cursor-pointer"
                                    />
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Até</span>
                                    <input 
                                        type="date" 
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="bg-transparent border-none text-[10px] font-black text-slate-700 uppercase focus:ring-0 outline-none cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button 
                                variant="outline" 
                                onClick={() => {
                                    setSearchTerm('');
                                    setStartDate('');
                                    setEndDate('');
                                    setFilters({ type: 'todos', partner: 'todos', category: 'todos', status: 'todos', dueDate: 'todos', value: 'todos' });
                                }}
                                className="rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest bg-white border-slate-100 text-slate-400 hover:text-primary"
                            >
                                Limpar Tudo
                            </Button>
                        </div>
                    </div>
                </div>
                    
                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer group/sort" onClick={() => handleSort('dueDate')}>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1">
                                            <span>Vencimento</span>
                                            {sortConfig.key === 'dueDate' ? (
                                                sortConfig.direction === 'asc' ? <ArrowUp size={10} className="text-primary" /> : <ArrowDown size={10} className="text-primary" />
                                            ) : (
                                                <ArrowUpDown size={10} className="text-slate-300 opacity-0 group-hover/sort:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                        <select 
                                            value={filters.dueDate}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => setFilters({...filters, dueDate: e.target.value})}
                                            className="bg-transparent border-none p-0 text-[9px] text-primary font-bold outline-none cursor-pointer"
                                        >
                                            <option value="todos">Todos</option>
                                            {filterOptions.dueDates.map(date => (
                                                <option key={date} value={date}>{new Date(date as string).toLocaleDateString('pt-BR')}</option>
                                            ))}
                                        </select>
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer group/sort" onClick={() => handleSort('type')}>
                                    <div className="flex flex-col items-center gap-1">
                                        <div className="flex items-center gap-1">
                                            <span>Tipo</span>
                                            {sortConfig.key === 'type' ? (
                                                sortConfig.direction === 'asc' ? <ArrowUp size={10} className="text-primary" /> : <ArrowDown size={10} className="text-primary" />
                                            ) : (
                                                <ArrowUpDown size={10} className="text-slate-300 opacity-0 group-hover/sort:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                        <select 
                                            value={filters.type}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => setFilters({...filters, type: e.target.value})}
                                            className="bg-transparent border-none p-0 text-[10px] text-primary font-bold outline-none cursor-pointer text-center"
                                        >
                                            <option value="todos">Todos</option>
                                            <option value="receita">Receita</option>
                                            <option value="despesa">Despesa</option>
                                        </select>
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer group/sort" onClick={() => handleSort('partnerName')}>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1">
                                            <span>Favorecido</span>
                                            {sortConfig.key === 'partnerName' ? (
                                                sortConfig.direction === 'asc' ? <ArrowUp size={10} className="text-primary" /> : <ArrowDown size={10} className="text-primary" />
                                            ) : (
                                                <ArrowUpDown size={10} className="text-slate-300 opacity-0 group-hover/sort:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                        <select 
                                            value={filters.partner}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => setFilters({...filters, partner: e.target.value})}
                                            className="bg-transparent border-none p-0 text-[10px] text-primary font-bold outline-none cursor-pointer max-w-[150px] truncate"
                                        >
                                            <option value="todos">Todos</option>
                                            {filterOptions.partners.map(p => (
                                                <option key={String(p)} value={String(p)}>{String(p)}</option>
                                            ))}
                                        </select>
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer group/sort" onClick={() => handleSort('category')}>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1">
                                            <span>Categoria</span>
                                            {sortConfig.key === 'category' ? (
                                                sortConfig.direction === 'asc' ? <ArrowUp size={10} className="text-primary" /> : <ArrowDown size={10} className="text-primary" />
                                            ) : (
                                                <ArrowUpDown size={10} className="text-slate-300 opacity-0 group-hover/sort:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                        <select 
                                            value={filters.category}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => setFilters({...filters, category: e.target.value})}
                                            className="bg-transparent border-none p-0 text-[10px] text-primary font-bold outline-none cursor-pointer"
                                        >
                                            <option value="todos">Todos</option>
                                            {filterOptions.categories.map(c => (
                                                <option key={String(c)} value={String(c)}>{String(c)}</option>
                                            ))}
                                        </select>
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right cursor-pointer group/sort" onClick={() => handleSort('originalValue')}>
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-1">
                                            <span>Valor</span>
                                            {sortConfig.key === 'originalValue' ? (
                                                sortConfig.direction === 'asc' ? <ArrowUp size={10} className="text-primary" /> : <ArrowDown size={10} className="text-primary" />
                                            ) : (
                                                <ArrowUpDown size={10} className="text-slate-300 opacity-0 group-hover/sort:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                        <select 
                                            value={filters.value}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => setFilters({...filters, value: e.target.value})}
                                            className="bg-transparent border-none p-0 text-[10px] text-primary font-bold outline-none cursor-pointer text-right"
                                        >
                                            <option value="todos">Todos</option>
                                            {filterOptions.values.map(v => (
                                                <option key={v} value={v.toString()}>{formatCurrency(v as number)}</option>
                                            ))}
                                        </select>
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer group/sort" onClick={() => handleSort('status')}>
                                    <div className="flex flex-col items-center gap-1">
                                        <div className="flex items-center gap-1">
                                            <span>Status</span>
                                            {sortConfig.key === 'status' ? (
                                                sortConfig.direction === 'asc' ? <ArrowUp size={10} className="text-primary" /> : <ArrowDown size={10} className="text-primary" />
                                            ) : (
                                                <ArrowUpDown size={10} className="text-slate-300 opacity-0 group-hover/sort:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                        <select 
                                            value={filters.status}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => setFilters({...filters, status: e.target.value})}
                                            className="bg-transparent border-none p-0 text-[10px] text-primary font-bold outline-none cursor-pointer text-center"
                                        >
                                            <option value="todos">Todos</option>
                                            <option value="à vencer">À Vencer</option>
                                            <option value="vence hoje">Hoje</option>
                                            <option value="vencido">Vencido</option>
                                            <option value="pago">Pago</option>
                                            <option value="recebido">Recebido</option>
                                            <option value="conciliado">Conciliado</option>
                                        </select>
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filtered.map((t) => (
                                <tr key={t.id} className="hover:bg-slate-50/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} className="text-slate-300" />
                                            <span className="text-xs font-black text-slate-600">
                                                {new Date(t.dueDate).toLocaleDateString('pt-BR')}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex justify-center">
                                            {t.type === 'receita' ? (
                                                <div className="p-1.5 bg-emerald-50 text-emerald-500 rounded-lg" title="Receita">
                                                    <ArrowUpCircle size={16} />
                                                </div>
                                            ) : (
                                                <div className="p-1.5 bg-rose-50 text-rose-500 rounded-lg" title="Despesa">
                                                    <ArrowDownCircle size={16} />
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-black text-slate-800 uppercase">{t.partnerName || 'N/A'}</span>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400">{t.description || 'Sem descrição'}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                                                {effectiveAccounts.find(a => a.id === t.accountId)?.name || '---'}
                                            </span>
                                            {t.costCenterId && (
                                                <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
                                                    CC: {(() => {
                                                        const cc = effectiveCostCenters.find(c => c.id === t.costCenterId);
                                                        return cc ? (cc.code ? `${cc.code} - ${cc.name}` : cc.name) : '---';
                                                    })()}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex flex-col items-end">
                                            <span className={cn(
                                                "text-xs font-black",
                                                t.type === 'receita' ? "text-emerald-600" : "text-rose-600"
                                            )}>
                                                {t.type === 'receita' ? '+' : '-'} {formatCurrency(t.settlement?.paidValue || t.originalValue)}
                                            </span>
                                            {t.settlement && (t.settlement.interest || t.settlement.penalty || t.settlement.discount) && (
                                                <span className="text-[7px] font-bold text-slate-400 uppercase leading-none mt-1">
                                                    Original: {formatCurrency(t.originalValue)}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {(() => {
                                            const dynamicStatus = getDynamicStatus(t);
                                            return (
                                                <span className={cn(
                                                    "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md whitespace-nowrap",
                                                    dynamicStatus === 'Recebido' && "bg-emerald-50 text-emerald-600",
                                                    dynamicStatus === 'Pago' && "bg-slate-50 text-slate-600",
                                                    dynamicStatus === 'Conciliado' && "bg-indigo-50 text-indigo-600",
                                                    dynamicStatus === 'Vencido' && "bg-rose-50 text-rose-600",
                                                    dynamicStatus === 'Vence hoje' && "bg-amber-50 text-amber-600",
                                                    dynamicStatus === 'à vencer' && "bg-sky-50 text-sky-600",
                                                )}>
                                                    {dynamicStatus}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1.5 min-w-[100px]">
                                            {authLoading ? (
                                                <span className="text-[8px] font-bold text-slate-300 animate-pulse uppercase">Validando...</span>
                                            ) : isAdmin ? (
                                                <>
                                                    {revertingSettlementId === t.id ? (
                                                        <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-1">
                                                            <button 
                                                                onClick={() => handleRevertSettlement(t)} 
                                                                className="px-2.5 py-1.5 bg-amber-500 text-white text-[9px] font-black uppercase rounded-lg shadow-lg shadow-amber-100 hover:bg-amber-600 transition-colors"
                                                            >
                                                                Confirmar Estorno
                                                            </button>
                                                            <button 
                                                                onClick={() => setRevertingSettlementId(null)} 
                                                                className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ) : deletingId === t.id ? (
                                                        <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-1">
                                                            <button 
                                                                onClick={() => handleDelete(t.id)} 
                                                                className="px-2.5 py-1.5 bg-rose-500 text-white text-[9px] font-black uppercase rounded-lg shadow-lg shadow-rose-100 hover:bg-rose-600 transition-colors"
                                                            >
                                                                Confirmar Exclusão
                                                            </button>
                                                            <button 
                                                                onClick={() => setDeletingId(null)} 
                                                                className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1">
                                                            {(t.status === 'Pendente' || t.status === 'Vencido') ? (
                                                                <button onClick={() => openSettlement(t)} className="p-2 text-emerald-500 hover:text-emerald-600 transition-colors hover:bg-emerald-50 rounded-lg" title="Baixar Título">
                                                                    <CheckCircle2 size={18} />
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => setRevertingSettlementId(t.id)} className="p-2 text-amber-500 hover:text-amber-600 transition-colors hover:bg-amber-50 rounded-lg" title="Estornar Baixa">
                                                                    <RotateCcw size={18} />
                                                                </button>
                                                            )}
                                                            <button onClick={() => openEdit(t)} className="p-2 text-slate-400 hover:text-primary transition-colors hover:bg-primary/5 rounded-lg" title="Editar">
                                                                <Edit3 size={18} />
                                                            </button>
                                                            <button onClick={() => setDeletingId(t.id)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors hover:bg-rose-50 rounded-lg" title="Excluir">
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-[9px] font-black text-slate-300 uppercase italic">Apenas Admin</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsModalOpen(false)}
                            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" 
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[2.5rem] p-8 md:p-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto relative z-10 shadow-2xl"
                        >
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                                        {selectedTransaction ? 'Editar Lançamento' : 'Novo Lançamento'}
                                    </h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Preencha os dados do documento financeiro</p>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Informações Básicas */}
                                <div className="space-y-4 md:col-span-1 border-r border-slate-50 pr-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Lançamento</label>
                                        <div className="flex gap-4">
                                            <button 
                                                type="button"
                                                onClick={() => setFormData({...formData, type: 'receita'})}
                                                className={cn(
                                                    "flex-1 py-4 px-4 min-w-[140px] rounded-2xl text-[12px] font-black uppercase tracking-tight border-2 transition-all whitespace-nowrap flex items-center justify-center gap-2",
                                                    formData.type === 'receita' ? "bg-emerald-500 border-emerald-500 text-white shadow-xl shadow-emerald-200" : "bg-white border-slate-100 text-slate-400 hover:border-emerald-100"
                                                )}
                                            >
                                                <ArrowUpCircle size={18} /> RECEBER
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => setFormData({...formData, type: 'despesa'})}
                                                className={cn(
                                                    "flex-1 py-4 px-4 min-w-[140px] rounded-2xl text-[12px] font-black uppercase tracking-tight border-2 transition-all whitespace-nowrap flex items-center justify-center gap-2",
                                                    formData.type === 'despesa' ? "bg-rose-500 border-rose-500 text-white shadow-xl shadow-rose-200" : "bg-white border-slate-100 text-slate-400 hover:border-rose-100"
                                                )}
                                            >
                                                <ArrowDownCircle size={18} /> PAGAR
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data de Emissão (Competência)</label>
                                        <input 
                                            type="date" 
                                            value={formData.issueDate || ''}
                                            onChange={(e) => setFormData({...formData, issueDate: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data de Vencimento</label>
                                        <input 
                                            type="date" 
                                            value={formData.dueDate || ''}
                                            onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nº Nota Fiscal</label>
                                        <input 
                                            type="text" 
                                            value={formData.nfNumber || ''}
                                            onChange={(e) => setFormData({...formData, nfNumber: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20"
                                        />
                                    </div>
                                </div>

                                {/* Classificação */}
                                <div className="space-y-4 md:col-span-1 border-r border-slate-50 pr-6">
                                    <div className="space-y-1.5 text-left">
                                        <div className="flex items-center justify-between ml-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Favorecido / Cliente</label>
                                            <button 
                                                type="button"
                                                onClick={() => setIsPartnerModalOpen(true)}
                                                className="px-2 py-1 bg-primary/5 text-[9px] font-black text-primary uppercase tracking-widest hover:bg-primary/10 border border-primary/20 rounded-lg transition-all flex items-center gap-1"
                                            >
                                                <Plus size={10} /> Novo
                                            </button>
                                        </div>
                                        <select 
                                            value={formData.partnerName || ''}
                                            onChange={(e) => {
                                                const p = partners.find(part => part.name === e.target.value);
                                                setFormData({...formData, partnerName: e.target.value, partnerTaxId: p?.taxId || ''});
                                            }}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20"
                                        >
                                            <option value="">Selecione...</option>
                                            {partners
                                                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                                .map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CPF / CNPJ</label>
                                        <input 
                                            type="text" 
                                            value={formData.partnerTaxId || ''}
                                            readOnly
                                            className="w-full px-4 py-3 bg-slate-100 rounded-xl text-xs font-bold text-slate-500 outline-none border border-transparent cursor-not-allowed"
                                            placeholder="Automático"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Grupo / Categoria (Nível 1 e 2)</label>
                                        <select 
                                            value={selectedCategoryCode}
                                            onChange={(e) => {
                                                const code = e.target.value;
                                                setSelectedCategoryCode(code);
                                                // If selecting a category, reset detailed account
                                                setFormData(prev => ({ ...prev, accountId: '' }));
                                            }}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20"
                                        >
                                            <option value="">Selecione a Categoria...</option>
                                            {(() => {
                                                const mappedType = formData.type === 'receita' ? 'receber' : 'pagar';
                                                const baseAccounts = effectiveAccounts
                                                    .filter(acc => {
                                                        const isCorrectType = !formData.type || 
                                                            acc.type === formData.type || 
                                                            acc.type === mappedType ||     
                                                            acc.type === 'mixed';
                                                        
                                                        const parts = (acc.code || '').split('.');
                                                        // Show Level 1 (headers) and Level 2 (categories)
                                                        return isCorrectType && parts.length <= 2;
                                                    })
                                                    .sort((a, b) => (a.code || '').localeCompare(b.code || ''));

                                                return baseAccounts.map(acc => {
                                                    const isHeader = (acc.code || '').split('.').length === 1;
                                                    return (
                                                        <option 
                                                            key={acc.id} 
                                                            value={acc.code || acc.id}
                                                            className={isHeader ? "font-black bg-slate-100" : "pl-4"}
                                                        >
                                                            {isHeader ? '--- ' : '   '}{acc.code ? `${acc.code} - ` : ''}{acc.name}
                                                        </option>
                                                    );
                                                });
                                            })()}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição / Conta Detalhada (Nível 3)</label>
                                        <select 
                                            disabled={!selectedCategoryCode}
                                            value={formData.accountId || ''}
                                            onChange={(e) => {
                                                const acc = effectiveAccounts.find(a => a.id === e.target.value);
                                                setFormData({
                                                    ...formData, 
                                                    accountId: e.target.value,
                                                    description: acc ? acc.name : ''
                                                });
                                            }}
                                            className={cn(
                                                "w-full px-4 py-3 rounded-xl text-xs font-bold outline-none border border-transparent focus:border-primary/20",
                                                !selectedCategoryCode ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-slate-50 text-slate-700"
                                            )}
                                        >
                                            <option value="">Selecione a Conta Detalhada...</option>
                                            {selectedCategoryCode && effectiveAccounts
                                                .filter(acc => {
                                                    // Logic: Show Level 3 items that start with selected Level 2 code
                                                    // OR if selected Level 2 has NO children at Level 3, show the Level 2 itself as a leaf.
                                                    
                                                    const isChild = acc.code && acc.code.startsWith(selectedCategoryCode + '.') && acc.code.split('.').length === selectedCategoryCode.split('.').length + 1;
                                                    if (isChild) return true;

                                                    // If no children exist for this code, and this is the specific code selected
                                                    if (acc.code === selectedCategoryCode || acc.id === selectedCategoryCode) {
                                                        const hasAnyChildren = effectiveAccounts.some(other => 
                                                            other.code && other.code !== acc.code && other.code.startsWith((acc.code || acc.id) + '.')
                                                        );
                                                        return !hasAnyChildren;
                                                    }
                                                    return false;
                                                })
                                                .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
                                                .map(acc => <option key={acc.id} value={acc.id}>{acc.code ? `${acc.code} - ` : ''}{acc.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Valores e Datas */}
                                <div className="space-y-4 md:col-span-1">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-1.5 col-span-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Original (R$)</label>
                                            <input 
                                                type="text" 
                                                value={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(formData.originalValue || 0)}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/\D/g, '');
                                                    setFormData({...formData, originalValue: parseFloat(val || '0') / 100});
                                                }}
                                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20 transition-all"
                                                placeholder="0,00"
                                            />
                                        </div>
                                        <div className="space-y-1.5 col-span-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Parcela</label>
                                            <input 
                                                type="text" 
                                                value={formData.installment || '1/1'}
                                                onChange={(e) => setFormData({...formData, installment: e.target.value})}
                                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Centro de Custo</label>
                                        <select 
                                            value={formData.costCenterId || ''}
                                            onChange={(e) => setFormData({...formData, costCenterId: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20"
                                        >
                                            <option value="">Selecione...</option>
                                            {effectiveCostCenters
                                                .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
                                                .map(cc => <option key={cc.id} value={cc.id}>{cc.code ? `${cc.code} - ` : ''}{cc.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observações</label>
                                        <textarea 
                                            value={formData.observation || ''}
                                            onChange={(e) => setFormData({...formData, observation: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20 h-20 resize-none"
                                        />
                                    </div>
                                </div>

                                <div className="md:col-span-3 flex items-center gap-3 pt-6">
                                    <Button type="submit" className="flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-primary/20">
                                        <Save size={16} className="mr-2" /> {selectedTransaction ? 'Atualizar Lançamento' : 'Confirmar Lançamento'}
                                    </Button>
                                    <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="px-8 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-white border-slate-100">
                                        Cancelar
                                    </Button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modal de Baixa (Liquidação) */}
            <AnimatePresence>
                {isSettlementModalOpen && selectedTransaction && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsSettlementModalOpen(false)}
                            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" 
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[2.5rem] p-6 md:p-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto relative z-10 shadow-2xl"
                        >
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                                        Baixa de Titulo - {selectedTransaction.type === 'receita' ? 'Recebimento' : 'Pagamento'}
                                    </h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Efetive o lançamento no caixa/banco</p>
                                </div>
                                <button onClick={() => setIsSettlementModalOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleSettlementConfirm} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data do Pagamento</label>
                                        <input 
                                            type="date" 
                                            value={settlementData.paymentDate || ''}
                                            onChange={(e) => setSettlementData({...settlementData, paymentDate: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5 md:col-span-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Forma de Pagamento</label>
                                        <select 
                                            value={settlementData.paymentMethodId || ''}
                                            onChange={(e) => setSettlementData({...settlementData, paymentMethodId: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20"
                                            required
                                        >
                                            <option value="">Selecione...</option>
                                            {effectiveMethods.map(m => <option key={m.id} value={m.id}>{m.code ? `${m.code} - ` : ''}{m.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="space-y-1.5 md:col-span-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Conta Bancária / Caixa (Destino/Origem)</label>
                                        <select 
                                            value={settlementData.bankId || ''}
                                            onChange={(e) => setSettlementData({...settlementData, bankId: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20"
                                            required
                                        >
                                            <option value="">Selecione a conta...</option>
                                            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 md:col-span-2">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Juros (+)</label>
                                            <input 
                                                type="text" 
                                                value={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(settlementData.interest || 0)}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value.replace(/\D/g, '') || '0') / 100;
                                                    const newValue = (selectedTransaction.originalValue + val + settlementData.penalty) - settlementData.discount;
                                                    setSettlementData({...settlementData, interest: val, paidValue: newValue});
                                                }}
                                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent border-slate-100 placeholder:text-slate-200"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Multa (+)</label>
                                            <input 
                                                type="text" 
                                                value={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(settlementData.penalty || 0)}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value.replace(/\D/g, '') || '0') / 100;
                                                    const newValue = (selectedTransaction.originalValue + settlementData.interest + val) - settlementData.discount;
                                                    setSettlementData({...settlementData, penalty: val, paidValue: newValue});
                                                }}
                                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent border-slate-100 placeholder:text-slate-200"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 md:col-span-2">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest ml-1">Desconto (-)</label>
                                            <input 
                                                type="text" 
                                                value={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(settlementData.discount || 0)}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value.replace(/\D/g, '') || '0') / 100;
                                                    const newValue = (selectedTransaction.originalValue + settlementData.interest + settlementData.penalty) - val;
                                                    setSettlementData({...settlementData, discount: val, paidValue: newValue});
                                                }}
                                                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent border-slate-100 placeholder:text-slate-200"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1 text-right pr-1">Valor Final Efetivo</label>
                                            <div className="w-full px-4 py-3 bg-emerald-50 rounded-xl text-xs font-black text-emerald-600 border border-emerald-100 flex items-center justify-end">
                                                {formatCurrency(settlementData.paidValue)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 pt-6">
                                    <Button type="submit" className="flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-emerald-500 hover:bg-emerald-600 shadow-xl shadow-emerald-200">
                                        <Check size={16} className="mr-2" /> Confirmar Baixa
                                    </Button>
                                    <Button type="button" variant="outline" onClick={() => setIsSettlementModalOpen(false)} className="px-8 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-white border-slate-100 text-slate-400">
                                        Cancelar
                                    </Button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isPartnerModalOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsPartnerModalOpen(false)}
                            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" 
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[2.5rem] p-6 md:p-10 w-full max-w-xl max-h-[90vh] overflow-y-auto relative z-10 shadow-2xl"
                        >
                            <RegistrationForm 
                                type="partners"
                                onSave={handleQuickPartnerSave}
                                onCancel={() => setIsPartnerModalOpen(false)}
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
