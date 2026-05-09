import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, onSnapshot, updateDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useClient } from '../context/ClientContext';
import { 
    Download, 
    Upload, 
    Search, 
    Filter, 
    CheckCircle2, 
    AlertCircle, 
    ArrowRightLeft, 
    Calendar as CalendarIcon,
    ArrowUpRight,
    ArrowDownLeft,
    Banknote,
    RefreshCcw,
    RotateCcw,
    X,
    Check,
    ChevronLeft
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import Papa from 'papaparse';

interface BankTransaction {
    id?: string;
    date: string;
    description: string;
    value: number;
    type: 'receita' | 'despesa';
    conciliatedId?: string | null;
}

interface SystemTransaction {
    id: string;
    dueDate: string;
    originalValue: number;
    partnerName: string;
    type: 'receita' | 'despesa';
    status: string;
    description?: string;
    accountId?: string;
    settlement?: {
        bankId: string;
        paymentDate: string;
        paidValue: number;
        isConciled?: boolean;
    };
}

interface ReconciliationProps {
    setActiveTab: (tab: string) => void;
    onBack?: () => void;
}

export const Reconciliation = ({ setActiveTab, onBack }: ReconciliationProps) => {
    const { profile, user, isAdmin } = useAuth();
    const { selectedClientId, selectedClientName } = useClient();

    const [banks, setBanks] = useState<any[]>([]);
    const [selectedBankId, setSelectedBankId] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().substring(0, 10)); // YYYY-MM-DD
    
    const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
    const [systemTransactions, setSystemTransactions] = useState<SystemTransaction[]>([]);
    const [dailySummary, setDailySummary] = useState({
        initial: 0,
        inflow: 0,
        outflow: 0,
        final: 0
    });
    const [loading, setLoading] = useState(false);
    const [isReconciling, setIsReconciling] = useState(false);

    // Load Banks
    useEffect(() => {
        if (!selectedClientId) {
            setBanks([]);
            return;
        }
        const unsub = onSnapshot(query(
            collection(db, 'banks'),
            where('clientId', '==', selectedClientId)
        ), (snap) => {
            setBanks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsub();
    }, [selectedClientId]);

    // Load System Transactions for the selected period
    const loadSystemTransactions = async () => {
        if (!selectedBankId || !selectedDate) return;
        setLoading(true);
        
        try {
            // 1. Calculate Initial Balance (Total settled before selectedDate + Bank initialBalance)
            const selectedBank = banks.find(b => b.id === selectedBankId);
            let runningBalance = selectedBank?.initialBalance || 0;
            const initDate = selectedBank?.initialBalanceDate || '1900-01-01';

            // Get all transactions settled BEFORE selectedDate and AFTER/ON initialBalanceDate
            const qAllBefore = query(
                collection(db, 'transactions'),
                where('clientId', '==', selectedClientId),
                where('status', 'in', ['Pago', 'Recebido'])
            );
            const snapAll = await getDocs(qAllBefore);
            const allSettled = snapAll.docs.map(doc => doc.data());

            const beforeDate = allSettled.filter(t => 
                t.settlement?.bankId === selectedBankId && 
                t.settlement?.paymentDate < selectedDate &&
                t.settlement?.paymentDate >= initDate
            );

            beforeDate.forEach(t => {
                const val = t.settlement?.paidValue || t.originalValue || 0;
                runningBalance += (t.type === 'receita' ? val : -val);
            });

            // 2. Get transactions for the SPECIFIC day
            // We search for transactions with dueDate on this day OR already settled on this day
            const qToday = query(
                collection(db, 'transactions'),
                where('clientId', '==', selectedClientId),
                where('dueDate', '==', selectedDate)
            );
            
            const snapToday = await getDocs(qToday);
            const listToday = snapToday.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemTransaction));
            
            // Also include anything settled today regardless of dueDate
            const settledToday = allSettled.filter(t => 
                t.settlement?.paymentDate === selectedDate && 
                t.settlement?.bankId === selectedBankId
            );
            
            // Merge and dedup
            const combined = [...listToday];
            settledToday.forEach(st => {
                // Find st in allDocs to get its ID (we only have data above)
                const doc = snapAll.docs.find(d => d.data().settlement?.settledAt === st.settlement?.settledAt && d.data().settlement?.paidValue === st.settlement?.paidValue);
                if (doc && !combined.find(c => c.id === doc.id)) {
                    combined.push({ id: doc.id, ...doc.data() } as SystemTransaction);
                }
            });

            // Filter for UI
            const filteredSystem = combined.filter(t => {
                const trans = t as any;
                if (['Pago', 'Recebido'].includes(trans.status)) {
                    return trans.settlement?.bankId === selectedBankId;
                }
                return true; 
            });

            setSystemTransactions(filteredSystem);

            // 3. Calculate Today's Summary
            let inflow = 0;
            let outflow = 0;
            settledToday.forEach(t => {
                const val = t.settlement?.paidValue || t.originalValue || 0;
                if (t.type === 'receita') inflow += val;
                else outflow += val;
            });

            setDailySummary({
                initial: runningBalance,
                inflow,
                outflow,
                final: runningBalance + inflow - outflow
            });

        } catch (error) {
            console.error("Error loading system transactions:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                // Adapt this to common bank CSV structures
                // Expected columns: Date/Data, Description/Descrição, Value/Valor
                const parsed: BankTransaction[] = results.data.map((row: any, index) => {
                    const valueStr = (row.Valor || row.Value || '0').toString().replace('.', '').replace(',', '.');
                    const value = parseFloat(valueStr);
                    return {
                        id: `bank-${index}`,
                        date: row.Data || row.Date || '',
                        description: row.Descrição || row.Description || '',
                        value: Math.abs(value),
                        type: (value >= 0 ? 'receita' : 'despesa') as 'receita' | 'despesa',
                        conciliatedId: null
                    };
                }).filter(t => t.date && t.value > 0);

                setBankTransactions(parsed);
            }
        });
    };

    const handleAutoMatch = () => {
        const newBankTrans = [...bankTransactions];
        const newSystemTrans = [...systemTransactions];

        newBankTrans.forEach(bt => {
            if (bt.conciliatedId) return;

            // Simple match: same type, same value, same date (or close)
            const match = newSystemTrans.find(st => 
                st.type === bt.type && 
                Math.abs(st.originalValue - bt.value) < 0.01 &&
                st.status === 'Pendente' // Only match with pending
            );

            if (match) {
                bt.conciliatedId = match.id;
                const idx = newSystemTrans.findIndex(s => s.id === match.id);
                if (idx !== -1) newSystemTrans[idx] = { ...newSystemTrans[idx], status: 'Conciliado' };
            }
        });

        setBankTransactions(newBankTrans);
        setSystemTransactions(newSystemTrans);
    };

    const handleUnreconcile = async (transaction: SystemTransaction) => {
        if (!confirm('Deseja desconciliar este título? Ele voltará para o status Pendente.')) return;
        
        try {
            const transRef = doc(db, 'transactions', transaction.id);
            await updateDoc(transRef, {
                status: 'Pendente',
                settlement: null, // Removes bank link and reconciliation info
                updatedAt: serverTimestamp()
            });
            alert('Título desconciliado com sucesso!');
            loadSystemTransactions();
        } catch (error) {
            console.error("Error unreconciling:", error);
            alert('Erro ao desconciliar.');
        }
    };

    const handleConfirmReconciliation = async () => {
        if (!selectedBankId) return;
        setIsReconciling(true);
        
        try {
            // Update matched transactions in Firestore
            for (const bt of bankTransactions) {
                if (bt.conciliatedId) {
                    const transRef = doc(db, 'transactions', bt.conciliatedId);
                    
                    // Update as settled
                    await updateDoc(transRef, {
                        status: bt.type === 'receita' ? 'Recebido' : 'Pago',
                        settlement: {
                            bankId: selectedBankId,
                            paymentDate: bt.date,
                            paidValue: bt.value,
                            settledAt: serverTimestamp(),
                            isConciled: true
                        },
                        updatedAt: serverTimestamp()
                    });
                }
            }
            alert('Conciliação gravada com sucesso!');
            setBankTransactions([]);
            loadSystemTransactions();
        } catch (error) {
            console.error("Error confirming reconciliation:", error);
            alert('Erro ao gravar conciliação.');
        } finally {
            setIsReconciling(false);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-sm">
                <AlertCircle size={48} className="text-amber-500 mb-4" />
                <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Restrito</h2>
                <p className="text-slate-500 text-sm max-w-md">Você não tem permissões administrativas para acessar a ferramenta de conciliação bancária.</p>
                <Button onClick={() => setActiveTab('dashboard')} className="mt-6">Voltar para Dashboard</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2">
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
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                            {isAdmin ? `Conciliação: ${selectedClientName || 'Nenhum Cliente'}` : 'Conciliação Bancária'}
                        </h1>
                        <p className="text-slate-500 text-sm font-medium">Sincronize seu extrato bancário com os lançamentos do sistema</p>
                    </div>
                </div>
                {selectedClientId && (
                    <div className="flex gap-3">
                        <Button 
                            onClick={loadSystemTransactions} 
                            disabled={!selectedBankId || loading}
                            variant="soft"
                            className="rounded-2xl"
                        >
                            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
                            Carregar Lançamentos
                        </Button>
                    </div>
                )}
            </header>

            {!selectedClientId && isAdmin && (
                <Card className="p-12 text-center bg-white border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                    <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Banknote size={32} />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Nenhum Cliente Selecionado</h3>
                    <p className="text-slate-400 text-xs font-medium max-w-xs mx-auto mt-2">
                        Selecione um cliente no Monitor Geral para realizar a conciliação bancária.
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

            {selectedClientId && (
                <>
                {/* Filters and Controls */}
            <Card className="p-6 border-none shadow-sm shadow-slate-200/50">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Banco / Conta</label>
                        <select 
                            value={selectedBankId}
                            onChange={(e) => setSelectedBankId(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20"
                        >
                            <option value="">Selecione um banco...</option>
                            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data de Referência</label>
                        <input 
                            type="date" 
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-primary/20"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Importar Extrato (CSV)</label>
                        <div className="relative">
                            <input 
                                type="file" 
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="hidden" 
                                id="statement-upload"
                            />
                            <label 
                                htmlFor="statement-upload"
                                className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-primary/5 hover:bg-primary/10 text-primary rounded-2xl text-xs font-black uppercase tracking-widest cursor-pointer transition-colors"
                            >
                                <Upload size={16} /> Importar Arquivo
                            </label>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button 
                            className="flex-1 rounded-2xl bg-emerald-500 hover:bg-emerald-600 shadow-md shadow-emerald-100"
                            onClick={handleAutoMatch}
                            disabled={bankTransactions.length === 0 || systemTransactions.length === 0}
                        >
                            <RefreshCcw size={16} /> Auto-Merge
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-5 border-none shadow-sm shadow-slate-200/50 bg-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                        <Banknote size={40} />
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest leading-none">
                            {banks.find(b => b.id === selectedBankId)?.name || 'Nenhum Banco'}
                        </p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em] pb-2 border-b border-slate-50">Saldo Inicial</p>
                    </div>
                    <h4 className="text-xl font-black text-slate-700 mt-3">{formatCurrency(dailySummary.initial)}</h4>
                    <p className="text-[9px] font-bold text-slate-300 uppercase mt-1">Ref: {new Date(selectedDate).toLocaleDateString('pt-BR')}</p>
                </Card>
                <Card className="p-5 border-none shadow-sm shadow-slate-200/50 bg-white">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest leading-none mb-2">Total Entradas</p>
                    <div className="flex items-center gap-2">
                            <ArrowUpRight size={16} className="text-emerald-500" />
                            <h4 className="text-xl font-black text-emerald-600">{formatCurrency(dailySummary.inflow)}</h4>
                    </div>
                </Card>
                <Card className="p-5 border-none shadow-sm shadow-slate-200/50 bg-white">
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest leading-none mb-2">Total Saídas</p>
                    <div className="flex items-center gap-2">
                            <ArrowDownLeft size={16} className="text-rose-500" />
                            <h4 className="text-xl font-black text-rose-600">{formatCurrency(dailySummary.outflow)}</h4>
                    </div>
                </Card>
                <Card className="p-5 border-none shadow-sm shadow-slate-200/50 bg-slate-900 text-white">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Saldo Final</p>
                    <h4 className="text-xl font-black">{formatCurrency(dailySummary.final)}</h4>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full mt-3 overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: '60%' }}></div>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bank Statement Side */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Banknote size={14} /> Extrato Bancário ({bankTransactions.length})
                        </h3>
                        {bankTransactions.length > 0 && (
                            <button onClick={() => setBankTransactions([])} className="text-[10px] text-slate-400 hover:text-rose-500 font-bold uppercase">Limpar</button>
                        )}
                    </div>
                    
                    <Card className="p-0 border-none min-h-[400px] max-h-[600px] overflow-y-auto">
                        {bankTransactions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[400px] text-center p-8 opacity-40">
                                <Search size={32} className="mb-2" />
                                <p className="text-xs font-bold uppercase tracking-wider">Nenhum dado importado</p>
                            </div>
                        ) : (
                            <table className="w-full text-left text-xs border-separate border-spacing-y-2 px-3">
                                <thead className="sticky top-0 bg-white z-10">
                                    <tr className="text-slate-400 font-black uppercase tracking-widest text-[9px]">
                                        <th className="py-4 px-2">Data</th>
                                        <th className="py-4 px-2">Descrição</th>
                                        <th className="py-4 px-2 text-right">Valor</th>
                                        <th className="py-4 px-2 text-center w-10">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bankTransactions.map((bt) => (
                                        <tr key={bt.id} className={cn(
                                            "bg-slate-50/50 hover:bg-slate-50 transition-colors rounded-xl",
                                            bt.conciliatedId && "opacity-50"
                                        )}>
                                            <td className="py-3 px-2 font-bold whitespace-nowrap">{new Date(bt.date).toLocaleDateString('pt-BR')}</td>
                                            <td className="py-3 px-2">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-700 truncate max-w-[150px]">{bt.description}</span>
                                                    <span className={cn(
                                                        "text-[8px] font-black uppercase tracking-tight",
                                                        bt.type === 'receita' ? 'text-emerald-500' : 'text-rose-500'
                                                    )}>{bt.type}</span>
                                                </div>
                                            </td>
                                            <td className={cn(
                                                "py-3 px-2 text-right font-black",
                                                bt.type === 'receita' ? 'text-emerald-600' : 'text-rose-600'
                                            )}>
                                                {formatCurrency(bt.value)}
                                            </td>
                                            <td className="py-3 px-2 text-center">
                                                {bt.conciliatedId ? (
                                                    <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-sm shadow-emerald-100">
                                                        <Check size={14} strokeWidth={3} />
                                                    </div>
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center mx-auto">
                                                        <X size={14} />
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </Card>
                </div>

                {/* System Side */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Search size={14} /> Sistema ({systemTransactions.length})
                        </h3>
                    </div>

                    <Card className="p-0 border-none min-h-[400px] max-h-[600px] overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center h-[400px]">
                                <RefreshCcw size={32} className="animate-spin text-primary/30" />
                            </div>
                        ) : systemTransactions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[400px] text-center p-8 opacity-40">
                                <CalendarIcon size={32} className="mb-2" />
                                <p className="text-xs font-bold uppercase tracking-wider">Clique em carregar para buscar</p>
                            </div>
                        ) : (
                            <table className="w-full text-left text-xs border-separate border-spacing-y-2 px-3">
                                <thead className="sticky top-0 bg-white z-10">
                                    <tr className="text-slate-400 font-black uppercase tracking-widest text-[9px]">
                                        <th className="py-4 px-2">Vencimento</th>
                                        <th className="py-4 px-2">Favorecido</th>
                                        <th className="py-4 px-2 text-right">Valor</th>
                                        <th className="py-4 px-2 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {systemTransactions.map((st) => (
                                        <tr key={st.id} className={cn(
                                            "bg-slate-50/50 hover:bg-slate-50 transition-colors rounded-xl",
                                            st.status === 'Conciliado' && "ring-2 ring-emerald-500/20 bg-emerald-50/10"
                                        )}>
                                            <td className="py-3 px-2 font-bold whitespace-nowrap">{new Date(st.dueDate).toLocaleDateString('pt-BR')}</td>
                                            <td className="py-3 px-2">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-700 truncate max-w-[150px]">{st.partnerName}</span>
                                                    <span className={cn(
                                                        "text-[8px] font-black uppercase tracking-tight",
                                                        st.type === 'receita' ? 'text-emerald-500' : 'text-rose-500'
                                                    )}>{st.type}</span>
                                                </div>
                                            </td>
                                            <td className={cn(
                                                "py-3 px-2 text-right font-black",
                                                st.type === 'receita' ? 'text-emerald-600' : 'text-rose-600'
                                            )}>
                                                {formatCurrency(st.originalValue)}
                                            </td>
                                            <td className="py-3 px-2 text-center">
                                                <div className="flex flex-col items-center gap-1.5">
                                                    <span className={cn(
                                                        "px-2.5 py-1 rounded-full font-black uppercase text-[8px] tracking-widest shadow-sm",
                                                        st.status === 'Pendente' ? "bg-amber-100 text-amber-600" : 
                                                        (st.status === 'Conciliado' || st.status === 'Recebido' || st.status === 'Pago') ? "bg-emerald-500 text-white" :
                                                        "bg-slate-100 text-slate-500"
                                                    )}>
                                                        {st.status === 'Conciliado' || st.settlement?.isConciled ? 'Conciliado' : st.status}
                                                    </span>
                                                    
                                                    {/* Show Unreconcile button for ANY transaction that is already settled in this bank */}
                                                    {(st.status === 'Recebido' || st.status === 'Pago' || st.status === 'Conciliado') && (
                                                        <button 
                                                            onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                if (st.status === 'Conciliado') {
                                                                    // Simple local un-match
                                                                    const newSystemTrans = [...systemTransactions];
                                                                    const idx = newSystemTrans.findIndex(s => s.id === st.id);
                                                                    if (idx !== -1) {
                                                                        newSystemTrans[idx] = { ...newSystemTrans[idx], status: 'Pendente' };
                                                                        setSystemTransactions(newSystemTrans);
                                                                        // Also unmatch from bank transactions side
                                                                        const newBankTrans = [...bankTransactions];
                                                                        const bIdx = newBankTrans.findIndex(b => b.conciliatedId === st.id);
                                                                        if (bIdx !== -1) newBankTrans[bIdx].conciliatedId = null;
                                                                        setBankTransactions(newBankTrans);
                                                                    }
                                                                } else {
                                                                    handleUnreconcile(st);
                                                                }
                                                            }}
                                                            className="flex items-center gap-1 mt-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 border border-rose-100/50"
                                                            title="Desconciliar Lançamento"
                                                        >
                                                            <RotateCcw size={10} />
                                                            {st.status === 'Conciliado' ? 'Desfazer Match' : 'Desconciliar'}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </Card>
                </div>
            </div>

            {/* Actions Bar */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 lg:left-[calc(50%+144px)]">
                <Card className="p-4 bg-white border-slate-200 shadow-2xl flex items-center justify-between gap-4">
                    <div className="flex-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Matcheados</p>
                        <p className="text-xl font-black text-emerald-500">
                            {bankTransactions.filter(b => b.conciliatedId).length} <span className="text-xs font-bold text-slate-400">ítens prontos</span>
                        </p>
                    </div>
                    <Button 
                        onClick={handleConfirmReconciliation} 
                        disabled={isReconciling || bankTransactions.filter(b => b.conciliatedId).length === 0}
                        className="py-6 px-8 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-widest shadow-xl shadow-slate-200 transition-all active:scale-95"
                    >
                        {isReconciling ? <RefreshCcw size={20} className="animate-spin" /> : 'Confirmar e Gravar'}
                    </Button>
                </Card>
            </div>
            
            {/* Spacing for FAB */}
            <div className="h-24" />
            </>
            )}
        </div>
    );
};

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(' ');
}
