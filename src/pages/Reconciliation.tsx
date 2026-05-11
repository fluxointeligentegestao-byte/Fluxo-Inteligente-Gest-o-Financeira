import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, onSnapshot, updateDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useClient } from '../context/ClientContext';
import { base64ToURL, base64ToBlob, downloadFile } from '../lib/pdfUtils';
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
    ChevronLeft,
    FileText,
    ExternalLink,
    Eye,
    Plus,
    Trash2
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { addDoc, deleteDoc } from 'firebase/firestore';

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
    docNumber?: string;
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
        interest?: number;
        penalty?: number;
        discount?: number;
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
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().substring(0, 10));
    const [endDate, setEndDate] = useState(new Date().toISOString().substring(0, 10));
    
    const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
    const [systemTransactions, setSystemTransactions] = useState<SystemTransaction[]>([]);
    const [dailySummary, setDailySummary] = useState({
        initial: 0,
        inflow: 0,
        outflow: 0,
        final: 0,
        conciliatedTotal: 0,
        selectedTotal: 0
    });
    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [filterType, setFilterType] = useState<'all' | 'conciliated' | 'pending'>('all');
    const [filterCategory, setFilterCategory] = useState<'all' | 'receita' | 'despesa'>('all');
    const [expectedBankBalance, setExpectedBankBalance] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [isReconciling, setIsReconciling] = useState(false);
    
    // Manual reconciliation state
    const [selectedBankRowId, setSelectedBankRowId] = useState<string | null>(null);
    const [selectedSystemRowId, setSelectedSystemRowId] = useState<string | null>(null);

    // PDF Statements state
    const [bankStatements, setBankStatements] = useState<any[]>([]);
    const [isPdfUploading, setIsPdfUploading] = useState(false);
    const [viewingPdf, setViewingPdf] = useState<string | null>(null);
    const [viewingPdfUrl, setViewingPdfUrl] = useState<string | null>(null);

    // Revoke blob URL on unmount or when viewingPdf changes
    useEffect(() => {
        if (viewingPdf) {
            const url = base64ToURL(viewingPdf);
            setViewingPdfUrl(url);
            return () => {
                URL.revokeObjectURL(url);
            };
        } else {
            setViewingPdfUrl(null);
        }
    }, [viewingPdf]);

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
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'banks');
        });
        return () => unsub();
    }, [selectedClientId]);

    // Load Bank Statements (PDFs)
    useEffect(() => {
        if (!selectedClientId || !selectedBankId) {
            setBankStatements([]);
            return;
        }
        const unsub = onSnapshot(query(
            collection(db, 'bankStatements'),
            where('clientId', '==', selectedClientId),
            where('bankId', '==', selectedBankId)
        ), (snap) => {
            setBankStatements(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'bankStatements');
        });
        return () => unsub();
    }, [selectedClientId, selectedBankId]);

    const formatDateBr = (dateIso: string) => {
        if (!dateIso) return '';
        const parts = dateIso.split('-');
        if (parts.length !== 3) return dateIso;
        const [y, m, d] = parts;
        return `${d}/${m}/${y}`;
    };

    // Load System Transactions for the selected period (Real-time)
    useEffect(() => {
        if (!selectedClientId || !selectedBankId || !startDate || !endDate) return;
        
        console.log("Reconciliation: Subscribing to transactions for client", selectedClientId);
        setLoading(true);

        const q = query(
            collection(db, 'transactions'),
            where('clientId', '==', selectedClientId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            try {
                const allTrans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemTransaction));
                const selectedBank = banks.find(b => b.id === selectedBankId);
                const initDate = selectedBank?.initialBalanceDate || '1900-01-01';

                const allSettledInBank = allTrans.filter(t => t.settlement?.bankId === selectedBankId);

                // 1. Transactions settled BEFORE startDate (to get Initial Balance of the period)
                const beforeDate = allSettledInBank.filter(t => 
                    t.settlement!.paymentDate < startDate &&
                    t.settlement!.paymentDate >= initDate
                );

                let runningSettledBalance = selectedBank?.initialBalance || 0;
                let runningConciliatedBalance = selectedBank?.initialBalance || 0;

                beforeDate.forEach(t => {
                    const val = t.settlement?.paidValue || t.originalValue || 0;
                    runningSettledBalance += (t.type === 'receita' ? val : -val);
                    if (t.status === 'Conciliado' || t.settlement?.isConciled) {
                        runningConciliatedBalance += (t.type === 'receita' ? val : -val);
                    }
                });

                // 2. Transactions settled WITHIN RANGE [startDate, endDate]
                const settledInRange = allSettledInBank.filter(t => 
                    t.settlement!.paymentDate >= startDate &&
                    t.settlement!.paymentDate <= endDate
                );

                // Grid Filter: Pending OR settled WITHIN RANGE in this bank
                const filteredForGrid = allTrans.filter(t => {
                    const isActuallyConciled = t.status === 'Conciliado' || t.settlement?.isConciled;
                    const isPending = !isActuallyConciled && (t.status === 'Pendente' || t.status === 'Pago' || t.status === 'Recebido');
                    const isSettledInRangeInThisBank = t.settlement?.bankId === selectedBankId && 
                        t.settlement!.paymentDate >= startDate && 
                        t.settlement!.paymentDate <= endDate;
                    
                    if (t.settlement?.bankId && t.settlement.bankId !== selectedBankId) return false;
                    return isPending || isSettledInRangeInThisBank;
                });

                // Sort
                filteredForGrid.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
                setSystemTransactions(filteredForGrid);

                // 3. Period Summary
                let inflowSettled = 0;
                let outflowSettled = 0;
                let inflowConciliated = 0;
                let outflowConciliated = 0;
                
                settledInRange.forEach(t => {
                    const val = t.settlement?.paidValue || t.originalValue || 0;
                    if (t.type === 'receita') inflowSettled += val;
                    else outflowSettled += val;
                    
                    if (t.status === 'Conciliado' || t.settlement?.isConciled) {
                        if (t.type === 'receita') inflowConciliated += val;
                        else outflowConciliated += val;
                    }
                });

                setDailySummary(prev => ({
                    ...prev,
                    initial: runningSettledBalance,
                    inflow: inflowSettled,
                    outflow: outflowSettled,
                    final: runningSettledBalance + inflowSettled - outflowSettled,
                    conciliatedTotal: runningConciliatedBalance + inflowConciliated - outflowConciliated
                }));

            } catch (error) {
                console.error("Error processing real-time transactions:", error);
            } finally {
                setLoading(false);
            }
        }, (error) => {
            console.error("Error listening to transactions:", error);
            handleFirestoreError(error, OperationType.LIST, 'transactions');
            setLoading(false);
        });

        return () => unsubscribe();
    }, [selectedClientId, selectedBankId, startDate, endDate, banks]);

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
                    
                    // Normalize date to YYYY-MM-DD
                    let rawDate = (row.Data || row.Date || '').toString();
                    let normalizedDate = rawDate;
                    if (rawDate.includes('/')) {
                        const parts = rawDate.split('/');
                        if (parts.length === 3) {
                            if (parts[0].length === 4) { // YYYY/MM/DD
                                normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                            } else { // DD/MM/YYYY
                                normalizedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                            }
                        }
                    }

                    return {
                        id: `bank-${index}`,
                        date: normalizedDate,
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

            // Simple match: prioritized already settled paidValue, fallback to originalValue
            const match = newSystemTrans.find(st => {
                const effectiveValue = st.settlement?.paidValue || st.originalValue || 0;
                return st.type === bt.type && 
                    Math.abs(effectiveValue - bt.value) < 0.01 &&
                    st.status !== 'Conciliado' && !st.settlement?.isConciled; // Only match if not yet conciled
            });

            if (match) {
                bt.conciliatedId = match.id;
                const idx = newSystemTrans.findIndex(s => s.id === match.id);
                if (idx !== -1) newSystemTrans[idx] = { ...newSystemTrans[idx], status: 'Conciliado' };
            }
        });

        setBankTransactions(newBankTrans);
        setSystemTransactions(newSystemTrans);
        setSelectedBankRowId(null);
        setSelectedSystemRowId(null);
    };

    const handleManualMatch = () => {
        if (!selectedBankRowId || !selectedSystemRowId) return;

        const bt = bankTransactions.find(b => b.id === selectedBankRowId);
        const st = systemTransactions.find(s => s.id === selectedSystemRowId);

        if (!bt || !st) return;

        if (bt.type !== st.type) {
            alert('Não é possível conciliar uma entrada com uma saída.');
            return;
        }

        const newBankTrans = bankTransactions.map(b => 
            b.id === selectedBankRowId ? { ...b, conciliatedId: selectedSystemRowId } : b
        );
        const newSystemTrans = systemTransactions.map(s => 
            s.id === selectedSystemRowId ? { ...s, status: 'Conciliado' } : s
        );

        setBankTransactions(newBankTrans);
        setSystemTransactions(newSystemTrans);
        setSelectedBankRowId(null);
        setSelectedSystemRowId(null);
    };

    const handleQuickSettle = async (transaction: SystemTransaction) => {
        if (!selectedBankId) {
            alert('Selecione uma conta bancária primeiro.');
            return;
        }
        if (!confirm(`Deseja liquidar este título manualmente como ${transaction.type === 'receita' ? 'Recebido' : 'Pago'} em ${formatDateBr(endDate)}?`)) return;

        try {
            const transRef = doc(db, 'transactions', transaction.id);
            await updateDoc(transRef, {
                status: transaction.type === 'receita' ? 'Recebido' : 'Pago',
                settlement: {
                    bankId: selectedBankId,
                    paymentDate: endDate,
                    paidValue: transaction.originalValue,
                    settledAt: serverTimestamp(),
                    isConciled: false // Baixa manual na conciliação não concilia automaticamente
                },
                updatedAt: serverTimestamp()
            });
            alert('Lançamento liquidado (baixado) com sucesso! Note que ele só afetará o Saldo do Banco após ser conciliado.');
        } catch (error) {
            console.error("Error settling:", error);
            alert('Erro ao liquidar.');
        }
    };

    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedClientId || !selectedBankId) return;

        setIsPdfUploading(true);
        // In a real app, you would upload to storage. 
        // Here we'll simulate by converting to Base64 and storing in Firestore
        // Note: Base64 in Firestore has limits, but for this demo/applet it works for small PDFs.
        // For larger files, the system would typically use a storage bucket.
        
        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = event.target?.result as string;
                const monthYear = endDate.substring(0, 7); // YYYY-MM

                await addDoc(collection(db, 'bankStatements'), {
                    clientId: selectedClientId,
                    bankId: selectedBankId,
                    monthYear,
                    pdfContent: base64,
                    fileName: file.name,
                    uploadDate: new Date().toISOString(),
                    refDate: endDate
                });
                
                alert('Extrato PDF anexado com sucesso!');
                setIsPdfUploading(false);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error("Error uploading PDF:", error);
            alert('Erro ao anexar PDF.');
            setIsPdfUploading(false);
        }
    };

    const handleDeleteStatement = async (id: string) => {
        if (!confirm('Excluir este extrato?')) return;
        try {
            await deleteDoc(doc(db, 'bankStatements', id));
        } catch (error) {
            console.error("Error deleting statement:", error);
        }
    };

    const handleUnreconcile = async (transaction: SystemTransaction) => {
        if (!confirm('Deseja desconciliar este título? Ele continuará como liquidado no sistema, mas deixará de afetar o saldo do banco.')) return;
        
        try {
            await runTransaction(db, async (txn) => {
                const transRef = doc(db, 'transactions', transaction.id);
                const bankId = transaction.settlement?.bankId;
                
                if (bankId) {
                    const bankRef = doc(db, 'banks', bankId);
                    const bankDoc = await txn.get(bankRef);
                    if (bankDoc.exists()) {
                        const currentBalance = bankDoc.data().balance || 0;
                        const val = transaction.settlement?.paidValue || transaction.originalValue || 0;
                        const adjustment = transaction.type === 'receita' ? -val : val;
                        txn.update(bankRef, { balance: currentBalance + adjustment });
                    }
                }

                txn.update(transRef, {
                    'settlement.isConciled': false,
                    updatedAt: serverTimestamp()
                });
            });
            alert('Título desconciliado com sucesso! Ele permanece como liquidado.');
        } catch (error) {
            console.error("Error unreconciling:", error);
            alert('Erro ao desconciliar.');
        }
    };

    const handleConfirmReconciliation = async () => {
        if (!selectedBankId) return;
        setIsReconciling(true);
        
        try {
            await runTransaction(db, async (txn) => {
                const bankRef = doc(db, 'banks', selectedBankId);
                const bankDoc = await txn.get(bankRef);
                if (!bankDoc.exists()) throw new Error("Banco não encontrado");
                
                let balanceChange = 0;

                for (const bt of bankTransactions) {
                    if (bt.conciliatedId) {
                        const transRef = doc(db, 'transactions', bt.conciliatedId);
                        const transDoc = await txn.get(transRef);
                        const transactionData = transDoc.exists() ? transDoc.data() : null;
                        
                        const isAlreadyConciled = transactionData?.status === 'Conciliado' || transactionData?.settlement?.isConciled;
                        if (isAlreadyConciled) continue; // Skip if already conciled

                        balanceChange += (bt.type === 'receita' ? bt.value : -bt.value);

                        txn.update(transRef, {
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

                const currentBalance = bankDoc.data().balance || 0;
                txn.update(bankRef, { balance: currentBalance + balanceChange });
            });

            alert('Conciliação gravada com sucesso! O Saldo do Banco foi atualizado.');
            setBankTransactions([]);
        } catch (error) {
            console.error("Error confirming reconciliation:", error);
            alert('Erro ao gravar conciliação.');
        } finally {
            setIsReconciling(false);
        }
    };

    const toggleConciliation = async (st: SystemTransaction) => {
        if (!selectedBankId) return;
        const isReconciled = st.status === 'Conciliado' || st.settlement?.isConciled;
        const effectiveValueForSettlement = st.settlement?.paidValue || st.originalValue;
        
        try {
            await runTransaction(db, async (txn) => {
                const transRef = doc(db, 'transactions', st.id);
                const bankRef = doc(db, 'banks', selectedBankId);
                const bankDoc = await txn.get(bankRef);
                
                if (!bankDoc.exists()) throw new Error("Banco não encontrado");
                const currentBalance = bankDoc.data().balance || 0;
                const adjustment = st.type === 'receita' ? effectiveValueForSettlement : -effectiveValueForSettlement;

                if (isReconciled) {
                    // Se já estava conciliado, apenas remove o flag de conciliação e ajusta o saldo do banco
                    // Mantém a baixa (status Recebido/Pago e os dados do settlement)
                    txn.update(transRef, {
                        'settlement.isConciled': false,
                        updatedAt: serverTimestamp()
                    });
                    txn.update(bankRef, { balance: currentBalance - adjustment });
                } else {
                    // Se não estava conciliado, marca como conciliado.
                    // Se já estava baixado (settlement existe), preservamos os dados e só mudamos o flag.
                    if (st.settlement) {
                        txn.update(transRef, {
                            'settlement.isConciled': true,
                            'settlement.bankId': selectedBankId, // Garante que é o banco selecionado
                            updatedAt: serverTimestamp()
                        });
                    } else {
                        // Se era Pendente, realiza a baixa e a conciliação simultaneamente
                        txn.update(transRef, {
                            status: st.type === 'receita' ? 'Recebido' : 'Pago',
                            settlement: {
                                bankId: selectedBankId,
                                paymentDate: endDate,
                                paidValue: effectiveValueForSettlement,
                                settledAt: serverTimestamp(),
                                isConciled: true
                            },
                            updatedAt: serverTimestamp()
                        });
                    }
                    txn.update(bankRef, { balance: currentBalance + adjustment });
                }
            });
        } catch (error) {
            console.error("Error toggling conciliation:", error);
            alert('Erro ao processar conciliação.');
        }
    };

    const toggleRowSelection = (id: string, value: number, type: 'receita' | 'despesa') => {
        const isSelected = selectedRows.includes(id);
        const newSelection = isSelected 
            ? selectedRows.filter(rid => rid !== id)
            : [...selectedRows, id];
        
        setSelectedRows(newSelection);
        
        const amount = (type === 'receita' ? value : -value);
        setDailySummary(prev => ({
            ...prev,
            selectedTotal: isSelected ? prev.selectedTotal - amount : prev.selectedTotal + amount
        }));
    };

    const filteredTransactions = systemTransactions.filter(st => {
        const isConciled = st.status === 'Conciliado' || st.settlement?.isConciled;
        const isPending = st.status === 'Pendente' || ((st.status === 'Pago' || st.status === 'Recebido') && !st.settlement?.isConciled);

        const matchesType = filterType === 'all' || 
            (filterType === 'conciliated' && isConciled) ||
            (filterType === 'pending' && isPending);
        
        const matchesCategory = filterCategory === 'all' || st.type === filterCategory;
        
        return matchesType && matchesCategory;
    });

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
        <div className="flex bg-slate-50 -m-6 min-h-[calc(100vh-64px)] overflow-hidden">
            {/* Sidebar Filters */}
            <aside className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col gap-6 overflow-y-auto no-scrollbar">
                <div className="flex items-center gap-3 pb-2 border-b border-slate-50">
                    <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                        <Filter size={20} />
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Filtros</h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Personalizar busca</p>
                    </div>
                </div>

                {/* Bank Selector */}
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Banco / Conta*</label>
                    <select 
                        value={selectedBankId}
                        onChange={(e) => setSelectedBankId(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    >
                        <option value="">Selecionar Conta</option>
                        {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>

                {/* Date Ranges */}
                <div className="space-y-4 pt-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Período de Baixa</label>
                    <div className="space-y-3">
                        <div className="relative">
                            <CalendarIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input 
                                type="date" 
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 rounded-xl text-[10px] font-bold text-slate-700 border border-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center justify-center">
                            <div className="h-[1px] flex-1 bg-slate-100" />
                            <span className="px-2 text-[8px] font-black text-slate-300 uppercase">Até</span>
                            <div className="h-[1px] flex-1 bg-slate-100" />
                        </div>
                        <div className="relative">
                            <CalendarIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input 
                                type="date" 
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 rounded-xl text-[10px] font-bold text-slate-700 border border-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            />
                        </div>
                    </div>
                </div>

                {/* Status Switchers */}
                <div className="space-y-4 pt-4 border-t border-slate-50">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Conciliados</span>
                        <button 
                            onClick={() => setFilterType(filterType === 'conciliated' ? 'all' : 'conciliated')}
                            className={cn(
                                "w-10 h-5 rounded-full relative transition-colors",
                                filterType === 'conciliated' ? "bg-emerald-500" : "bg-slate-200"
                            )}
                        >
                            <div className={cn(
                                "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                                filterType === 'conciliated' ? "left-6" : "left-1"
                            )} />
                        </button>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Pendentes</span>
                        <button 
                            onClick={() => setFilterType(filterType === 'pending' ? 'all' : 'pending')}
                            className={cn(
                                "w-10 h-5 rounded-full relative transition-colors",
                                filterType === 'pending' ? "bg-amber-500" : "bg-slate-200"
                            )}
                        >
                            <div className={cn(
                                "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                                filterType === 'pending' ? "left-6" : "left-1"
                            )} />
                        </button>
                    </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-50">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-emerald-500 uppercase">Receitas</span>
                        <button 
                            onClick={() => setFilterCategory(filterCategory === 'receita' ? 'all' : 'receita')}
                            className={cn(
                                "w-10 h-5 rounded-full relative transition-colors",
                                filterCategory === 'receita' ? "bg-emerald-500" : "bg-slate-200"
                            )}
                        >
                            <div className={cn(
                                "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                                filterCategory === 'receita' ? "left-6" : "left-1"
                            )} />
                        </button>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-rose-500 uppercase">Despesas</span>
                        <button 
                            onClick={() => setFilterCategory(filterCategory === 'despesa' ? 'all' : 'despesa')}
                            className={cn(
                                "w-10 h-5 rounded-full relative transition-colors",
                                filterCategory === 'despesa' ? "bg-rose-500" : "bg-slate-200"
                            )}
                        >
                            <div className={cn(
                                "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                                filterCategory === 'despesa' ? "left-6" : "left-1"
                            )} />
                        </button>
                    </div>
                </div>

                {/* PDF Statement Action */}
                {bankStatements.length > 0 && (
                    <div className="space-y-2 pt-4 border-t border-slate-50">
                        <Button 
                            variant="ghost"
                            onClick={() => setViewingPdf(bankStatements[0].pdfContent)}
                            className="w-full justify-start gap-3 bg-primary/5 hover:bg-primary/10 text-primary border border-primary/10 py-3 rounded-xl"
                        >
                            <Eye size={18} />
                            <span className="text-[10px] font-black uppercase tracking-tight">Mostrar Extrato PDF</span>
                        </Button>
                    </div>
                )}

                {/* Import section */}
                <div className="mt-auto pt-6 border-t border-slate-50 space-y-3">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Importar Extratos</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col items-center justify-center p-3 bg-primary/5 hover:bg-primary/10 text-primary border border-primary/10 rounded-xl cursor-pointer transition-all group">
                            <Upload size={16} className="mb-1 group-hover:scale-110 transition-transform" />
                            <span className="text-[8px] font-black uppercase">CSV</span>
                            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                        </label>
                        <label className="flex flex-col items-center justify-center p-3 bg-rose-50 hover:bg-rose-100 text-rose-500 border border-rose-100 rounded-xl cursor-pointer transition-all group">
                            <FileText size={16} className="mb-1 group-hover:scale-110 transition-transform" />
                            <span className="text-[8px] font-black uppercase">PDF</span>
                            <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" />
                        </label>
                    </div>
                </div>

                <Button 
                    onClick={() => {}} 
                    disabled={!selectedBankId || loading}
                    className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20"
                >
                    {loading ? <RefreshCcw size={16} className="animate-spin" /> : <Search size={16} />} 
                    APLICAR FILTRO
                </Button>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden relative">
                {/* Top Toolbar (Sankhya Style) */}
                <header className="bg-slate-100 border-b border-slate-200 p-2 flex items-center gap-4">
                    <div className="flex bg-white rounded-lg border border-slate-200 overflow-hidden text-[10px]">
                        <div className="px-3 py-1.5 border-r border-slate-100 bg-slate-50 font-bold text-slate-500 uppercase tracking-tighter">Período</div>
                        <div className="px-4 py-1.5 font-black text-slate-700 min-w-[100px]">{formatDateBr(startDate)} - {formatDateBr(endDate)}</div>
                    </div>

                    <div className="flex bg-white rounded-lg border border-slate-200 overflow-hidden text-[10px]">
                        <div className="px-3 py-1.5 border-r border-slate-100 bg-slate-50 font-bold text-slate-500 uppercase tracking-tighter" title="Soma de todos os títulos baixados (pagos/recebidos)">Saldo Acumulado</div>
                        <div className={cn(
                            "px-4 py-1.5 font-black min-w-[120px]",
                            dailySummary.final >= 0 ? "text-emerald-600" : "text-rose-600"
                        )}>{formatCurrency(dailySummary.final)}</div>
                    </div>

                    <div className="flex bg-white rounded-lg border border-slate-200 overflow-hidden text-[10px]">
                        <div className="px-3 py-1.5 border-r border-slate-100 bg-slate-50 font-bold text-slate-500 uppercase tracking-tighter" title="Soma apenas dos títulos já conciliados com o extrato">Banco (Conciliado)</div>
                        <div className={cn(
                            "px-4 py-1.5 font-black min-w-[120px]",
                            dailySummary.conciliatedTotal >= 0 ? "text-emerald-600" : "text-rose-600"
                        )}>{formatCurrency(dailySummary.conciliatedTotal)}</div>
                    </div>

                    <div className="flex bg-white rounded-lg border border-slate-200 overflow-hidden text-[10px] ml-auto">
                        <div className="px-3 py-1.5 border-r border-slate-100 bg-slate-50 font-bold text-slate-500 uppercase tracking-tighter">Diferença</div>
                        <div className={cn(
                            "px-4 py-1.5 font-black min-w-[100px]",
                            (dailySummary.final - dailySummary.conciliatedTotal) === 0 ? "text-slate-400" : "text-amber-600"
                        )}>{formatCurrency(dailySummary.final - dailySummary.conciliatedTotal)}</div>
                    </div>

                    <div className="h-6 w-[1px] bg-slate-200 mx-2" />

                    <div className="flex gap-1">
                        <button 
                            onClick={handleAutoMatch}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-[9px] font-black uppercase flex items-center gap-1.5 transition-all shadow-sm"
                        >
                            <RefreshCcw size={12} /> Auto-Merge
                        </button>
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                    </div>
                </header>

                {/* Main Grid Wrapper */}
                <div className="flex-1 bg-white overflow-hidden relative flex flex-col">
                    {/* Grid Header */}
                    <div className="bg-slate-50 border-b border-slate-200 overflow-x-auto no-scrollbar">
                        <table className="w-full text-left table-fixed border-collapse">
                            <thead>
                                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                    <th className="w-10 py-3 px-4 text-center">Sel</th>
                                    <th className="w-24 py-3 px-4">Núm. Único</th>
                                    <th className="w-32 py-3 px-4">Tipo</th>
                                    <th className="w-24 py-3 px-4 text-center">Conciliado</th>
                                    <th className="w-32 py-3 px-4">Dt. Conciliação</th>
                                    <th className="w-24 py-3 px-4">Rec/Desp</th>
                                    <th className="w-48 py-3 px-4">Favorecido / Histórico</th>
                                    <th className="w-32 py-3 px-4 text-right">Valor</th>
                                    <th className="w-32 py-3 px-4">Dt. Lançamento</th>
                                    <th className="w-12 py-3 px-2"></th>
                                </tr>
                            </thead>
                        </table>
                    </div>

                    {/* Grid Body */}
                    <div className="flex-1 overflow-y-auto no-scrollbar bg-slate-50/20">
                        <table className="w-full text-left table-fixed border-collapse">
                            <tbody className="divide-y divide-slate-100">
                                        {filteredTransactions.map((st) => {
                                            const isConciled = st.status === 'Conciliado' || st.settlement?.isConciled;
                                            const isSelected = selectedRows.includes(st.id);
                                            const effectiveValue = st.settlement?.paidValue || st.originalValue || 0;
                                            
                                            return (
                                                <tr 
                                                    key={st.id} 
                                                    className={cn(
                                                        "text-[10px] transition-colors hover:bg-slate-50/80 group",
                                                        isConciled ? "bg-emerald-50/30" : "bg-white",
                                                        isSelected && "bg-primary/5"
                                                    )}
                                                >
                                                    <td className="w-10 py-2.5 px-4 text-center">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isSelected}
                                                            onChange={() => toggleRowSelection(st.id, effectiveValue, st.type)}
                                                            className="w-3.5 h-3.5 rounded border-slate-200 text-primary focus:ring-primary/20"
                                                        />
                                                    </td>
                                            <td className="w-24 py-2.5 px-4 font-bold text-slate-400">{st.docNumber || `ID-${st.id.substring(0,4)}`}</td>
                                            <td className="w-32 py-2.5 px-4 font-black text-slate-500 uppercase tracking-tighter">Financeiro</td>
                                            <td className="w-24 py-2.5 px-4 text-center">
                                                <button 
                                                    onClick={() => toggleConciliation(st)}
                                                    className={cn(
                                                        "w-8 h-4 rounded-full relative transition-all mx-auto",
                                                        isConciled ? "bg-emerald-500" : "bg-slate-200"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all",
                                                        isConciled ? "left-4.5" : "left-0.5"
                                                    )} />
                                                </button>
                                            </td>
                                            <td className="w-32 py-2.5 px-4 font-bold text-emerald-600">
                                                {isConciled ? st.settlement?.paymentDate : '--/--/----'}
                                            </td>
                                            <td className="w-24 py-2.5 px-4 font-black uppercase text-[9px]">
                                                <span className={st.type === 'receita' ? 'text-emerald-500' : 'text-rose-500'}>
                                                    {st.type === 'receita' ? 'Receita' : 'Despesa'}
                                                </span>
                                            </td>
                                            <td className="w-48 py-2.5 px-4 truncate font-bold text-slate-600" title={st.partnerName || st.description}>
                                                {st.partnerName || st.description}
                                            </td>
                                            <td className={cn(
                                                "w-32 py-2.5 px-4 text-right font-black flex flex-col items-end gap-0.5",
                                                st.type === 'receita' ? 'text-emerald-600' : 'text-rose-600'
                                            )}>
                                                <span 
                                                    className="cursor-help"
                                                    title={st.settlement ? `Original: ${formatCurrency(st.originalValue)}${st.settlement.interest ? `\nJuros: ${formatCurrency(st.settlement.interest)}` : ''}${st.settlement.penalty ? `\nMulta: ${formatCurrency(st.settlement.penalty)}` : ''}${st.settlement.discount ? `\nDesconto: ${formatCurrency(st.settlement.discount)}` : ''}` : undefined}
                                                >
                                                    {formatCurrency(effectiveValue)}
                                                </span>
                                                {st.settlement && (st.settlement.interest || st.settlement.penalty || st.settlement.discount) && (
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[7px] font-black text-slate-400 uppercase leading-none bg-slate-100 px-1 py-0.5 rounded">
                                                            C/ Ajustes
                                                        </span>
                                                        <div className="flex gap-1 mt-0.5">
                                                            {st.settlement.interest ? <span className="text-[6px] text-amber-600 font-bold uppercase">Juros</span> : null}
                                                            {st.settlement.penalty ? <span className="text-[6px] text-rose-500 font-bold uppercase">Multa</span> : null}
                                                            {st.settlement.discount ? <span className="text-[6px] text-emerald-500 font-bold uppercase">Desc</span> : null}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="w-32 py-2.5 px-4 font-bold text-slate-400">
                                                {new Date(st.dueDate).toLocaleDateString('pt-BR')}
                                            </td>
                                            <td className="w-12 py-2.5 px-2 text-right">
                                                <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                                                    <button onClick={() => toggleConciliation(st)} className="p-1 hover:bg-slate-200 rounded">
                                                        <Check size={12} className="text-slate-400" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        
                        {filteredTransactions.length === 0 && (
                            <div className="flex flex-col items-center justify-center p-20 opacity-30">
                                <Search size={40} className="mb-3" />
                                <p className="text-xs font-black uppercase">Nenhum lançamento encontrado</p>
                            </div>
                        )}
                    </div>

                    {/* Grid Footer (Sankhya Totals) */}
                    <footer className="bg-white border-t border-slate-200 p-2 flex items-center justify-between text-[10px] font-black whitespace-nowrap overflow-x-auto no-scrollbar">
                        <div className="flex items-center gap-6">
                            <div className="flex gap-2 items-center">
                                <span className="text-slate-400 uppercase tracking-tighter">Crédito:</span>
                                <span className="text-emerald-600">{formatCurrency(dailySummary.inflow)}</span>
                            </div>
                            <div className="flex gap-2 items-center">
                                <span className="text-slate-400 uppercase tracking-tighter">Débito:</span>
                                <span className="text-rose-600">{formatCurrency(dailySummary.outflow)}</span>
                            </div>
                            <div className="flex gap-2 items-center">
                                <span className="text-slate-400 uppercase tracking-tighter">Líquido:</span>
                                <span className="text-slate-700">{formatCurrency(dailySummary.inflow - dailySummary.outflow)}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="flex gap-2 items-center">
                                <span className="text-slate-400 uppercase tracking-tighter">Conciliado:</span>
                                <span className="text-emerald-500">{formatCurrency(dailySummary.conciliatedTotal)}</span>
                            </div>
                            <div className="flex gap-2 items-center bg-primary/5 px-3 py-1.5 rounded-lg">
                                <span className="text-primary uppercase tracking-tighter">Selecionado:</span>
                                <span className="text-primary">{formatCurrency(dailySummary.selectedTotal)}</span>
                            </div>
                        </div>
                    </footer>
                </div>

                {/* PDF Viewer Portal (Modal-like) */}
                <AnimatePresence>
                    {viewingPdf && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                        >
                            <div className="bg-white rounded-[2rem] w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden relative">
                                <button 
                                    onClick={() => setViewingPdf(null)}
                                    className="absolute top-6 right-6 p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors z-10"
                                >
                                    <X size={20} />
                                </button>
                                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                        <FileText size={18} className="text-rose-500" /> Visualização de Extrato PDF
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        {viewingPdf && (
                                            <>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => {
                                                        const url = base64ToURL(viewingPdf);
                                                        window.open(url, '_blank');
                                                    }}
                                                    className="text-[10px] font-black uppercase text-primary hover:bg-primary/5"
                                                >
                                                    <ExternalLink size={16} className="mr-2" /> Nova Aba
                                                </Button>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => {
                                                        downloadFile(viewingPdf, `Extrato_${selectedBankId}_${endDate}.pdf`);
                                                    }}
                                                    className="text-[10px] font-black uppercase text-slate-500 hover:text-primary"
                                                >
                                                    <Download size={16} className="mr-2" /> Baixar
                                                </Button>
                                            </>
                                        )}
                                        <button 
                                            onClick={() => setViewingPdf(null)}
                                            className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors z-10"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 bg-slate-50 p-4">
                                    {viewingPdfUrl ? (
                                        <div className="w-full h-full relative border border-slate-200 rounded-2xl overflow-hidden shadow-inner bg-white">
                                            <iframe 
                                                src={viewingPdfUrl} 
                                                className="w-full h-full border-none"
                                                title="PDF Preview"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                                            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                                            <p className="text-[10px] font-black uppercase tracking-widest">Processando documento...</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
};

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(' ');
}
