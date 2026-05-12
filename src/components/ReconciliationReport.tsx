import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
    Download, 
    Calendar, 
    CheckCircle2, 
    AlertCircle, 
    Banknote, 
    Search,
    ChevronRight,
    ArrowUpRight,
    ArrowDownLeft,
    Check,
    X,
    Eye,
    Printer
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { cn, formatCurrency } from '../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BankSummary {
    id: string;
    name: string;
    initialBalance: number;
    initialDate: string;
    totalIn: number;
    totalOut: number;
    finalBalance: number;
    finalDate: string;
    isFullyConciled: boolean;
    pendingCount: number;
    statementBalance: number;
    transactions: any[];
}

interface ReconciliationReportProps {
    clientId: string;
    clientName: string;
    readOnly?: boolean;
}

export const ReconciliationReport = ({ clientId, clientName, readOnly = false }: ReconciliationReportProps) => {
    const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
    const [loading, setLoading] = useState(false);
    const [summaries, setSummaries] = useState<BankSummary[]>([]);
    const [saving, setSaving] = useState<string | null>(null);

    useEffect(() => {
        loadReportData();
    }, [currentMonth, clientId]);

    const loadReportData = async () => {
        setLoading(true);
        try {
            // 1. Get all banks
            const banksRef = query(collection(db, 'banks'), where('clientId', '==', clientId));
            const banksSnap = await getDocs(banksRef);
            const banks = banksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 2. Get statement balances for this month
            const reconRef = collection(db, `bankReconciliations/${clientId}/${currentMonth}`);
            const reconSnap = await getDocs(reconRef);
            const reconData = reconSnap.docs.reduce((acc, doc) => {
                acc[doc.id] = doc.data().statementBalance || 0;
                return acc;
            }, {} as Record<string, number>);

            // 3. Get all transactions 
            const transRef = collection(db, 'transactions');
            const q = query(
                transRef,
                where('clientId', '==', clientId),
                where('status', 'in', ['Pago', 'Recebido', 'Conciliado']),
                orderBy('settlement.paymentDate', 'asc')
            );
            const transSnap = await getDocs(q);
            const allTransactions = transSnap.docs.map(doc => doc.data());

            // 4. Get pending transactions 
            const qPending = query(
                transRef,
                where('clientId', '==', clientId),
                where('status', '==', 'Pendente')
            );
            const pendingSnap = await getDocs(qPending);
            const allPending = pendingSnap.docs.map(doc => doc.data());

            // 5. Processing Month Boundaries
            const [year, month] = currentMonth.split('-').map(Number);
            const startDate = `${currentMonth}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${currentMonth}-${lastDay}`;

            const bankSummaries: BankSummary[] = await Promise.all(banks.map(async (bank: any) => {
                const bankInitialBalance = bank.initialBalance || 0;
                const bankInitialDate = bank.initialBalanceDate || '1900-01-01';

                // Balance before the start of this month
                const beforeMonth = allTransactions.filter(t => 
                    t.settlement?.bankId === bank.id && 
                    t.settlement?.paymentDate < startDate &&
                    t.settlement?.paymentDate >= bankInitialDate
                );

                const balanceAtStart = beforeMonth.reduce((acc, t) => {
                    const val = t.settlement?.paidValue || 0;
                    return acc + (t.type === 'receita' ? val : -val);
                }, bankInitialBalance);

                // Transactions IN this month
                const thisMonthTransactions = allTransactions.filter(t => 
                    t.settlement?.bankId === bank.id && 
                    t.settlement?.paymentDate >= startDate &&
                    t.settlement?.paymentDate <= endDate
                );

                let totalIn = 0;
                let totalOut = 0;
                thisMonthTransactions.forEach(t => {
                    const val = t.settlement?.paidValue || 0;
                    if (t.type === 'receita') totalIn += val;
                    else totalOut += val;
                });

                // Pending check
                const pendingThisMonth = allPending.filter(t => 
                    t.dueDate >= startDate && 
                    t.dueDate <= endDate &&
                    (t.settlement?.bankId === bank.id || !t.settlement?.bankId)
                ).length;

                return {
                    id: bank.id,
                    name: bank.name,
                    initialBalance: balanceAtStart,
                    initialDate: startDate,
                    totalIn,
                    totalOut,
                    finalBalance: balanceAtStart + totalIn - totalOut,
                    finalDate: endDate,
                    isFullyConciled: pendingThisMonth === 0,
                    pendingCount: pendingThisMonth,
                    statementBalance: reconData[bank.id] || 0,
                    transactions: thisMonthTransactions
                };
            }));

            setSummaries(bankSummaries);
        } catch (error) {
            console.error("Error generating reconciliation report:", error);
            handleFirestoreError(error, OperationType.GET, 'multiple-collections-reconciliation');
        } finally {
            setLoading(false);
        }
    };

    const updateStatementBalance = async (bankId: string, value: number) => {
        setSaving(bankId);
        try {
            const docRef = doc(db, `bankReconciliations/${clientId}/${currentMonth}`, bankId);
            await setDoc(docRef, { statementBalance: value }, { merge: true });
            
            setSummaries(prev => prev.map(s => s.id === bankId ? { ...s, statementBalance: value } : s));
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `bankReconciliations/${clientId}/${currentMonth}/${bankId}`);
            console.error("Error saving statement balance:", error);
        } finally {
            setSaving(null);
        }
    };

    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const [isPreviewing, setIsPreviewing] = useState(false);
    const [selectedBankForPreview, setSelectedBankForPreview] = useState<BankSummary | null>(null);

    const generatePDF = (specificBank?: BankSummary, action: 'download' | 'preview' = 'download') => {
        if (action === 'preview') {
            setSelectedBankForPreview(specificBank || null);
            setIsPreviewing(true);
            return;
        }

        const doc = new jsPDF();
        const dateObj = new Date(currentMonth + '-01');
        const monthName = dateObj.toLocaleDateString('pt-BR', { month: 'long' });
        const year = currentMonth.split('-')[0];

        // LOGO FLUXO INTELIGENTE (Safe drawing)
        const drawLogo = (doc: any, x: number, y: number) => {
            doc.setFontSize(22);
            doc.setTextColor(0, 75, 141);
            doc.setFont("helvetica", "bold");
            doc.text('Fluxo', x, y);
            
            const fluxowidth = doc.getTextWidth('Fluxo');
            doc.setTextColor(34, 197, 94);
            doc.text('Inteligente', x + fluxowidth + 2, y);
            
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.setFont("helvetica", "bold");
            doc.text('GESTÃO FINANCEIRA BPO PREMIUM', x, y + 8);
            
            doc.setDrawColor(34, 197, 94);
            doc.setLineWidth(0.5);
            doc.line(x, y + 10, x + 80, y + 10);
        };

        const renderBankPage = (s: BankSummary, isFirstPage: boolean) => {
            if (!isFirstPage) doc.addPage();
            
            let currentY = 25;
            drawLogo(doc, 14, currentY);
            currentY += 25;

            doc.setFontSize(14);
            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "bold");
            doc.text('EXTRATO DE CONCILIACAO BANCARIA', 14, currentY);
            
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139);
            doc.text(`CLIENTE: ${clientName.toUpperCase()}`, 14, currentY + 8);
            doc.text(`PERIODO: ${monthName.toUpperCase()} / ${year}`, 14, currentY + 13);
            doc.text(`CONTA: ${s.name.toUpperCase()}`, 14, currentY + 18);
            doc.text(`EMISSAO: ${new Date().toLocaleDateString('pt-BR')} AS ${new Date().toLocaleTimeString('pt-BR')}`, 14, currentY + 23);

            currentY += 35;
            const diff = s.finalBalance - s.statementBalance;
            const isOk = Math.abs(diff) < 0.01;

            doc.setDrawColor(241, 245, 249);
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(14, currentY, 182, 30, 3, 3, 'FD');

            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.text(`Saldos do Sistema (Controle Interno)`, 20, currentY + 8);
            
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "bold");
            doc.text(`INICIAL: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.initialBalance)}`, 20, currentY + 18);
            doc.text(`ENTRADAS: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.totalIn)}`, 75, currentY + 18);
            doc.text(`SAIDAS: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.totalOut)}`, 130, currentY + 18);
            doc.text(`FINAL: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.finalBalance)}`, 185, currentY + 18, { align: 'right' });

            currentY += 38;

            const transData = s.transactions.map(t => [
                new Date(t.settlement?.paymentDate).toLocaleDateString('pt-BR'),
                t.description.substring(0, 50),
                t.type === 'receita' ? 'Entrada' : 'Saida',
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.settlement?.paidValue || 0)
            ]);

            if (transData.length > 0) {
                autoTable(doc, {
                    startY: currentY,
                    head: [['Data', 'Descricao', 'Tipo', 'Valor']],
                    body: transData,
                    theme: 'striped',
                    headStyles: { fillColor: [0, 75, 141], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
                    styles: { fontSize: 7, cellPadding: 2 },
                    columnStyles: { 3: { halign: 'right' } },
                    margin: { left: 14, right: 14 }
                });
                currentY = (doc as any).lastAutoTable.finalY + 15;
            } else {
                doc.setFontSize(7);
                doc.setTextColor(148, 163, 184);
                doc.text('Nenhuma transacao registrada neste periodo.', 20, currentY + 5);
                currentY += 15;
            }

            if (currentY > 260) { doc.addPage(); currentY = 20; }
            doc.setDrawColor(241, 245, 249);
            doc.line(14, currentY, 196, currentY);
            currentY += 8;
            doc.setFontSize(9);
            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "bold");
            doc.text('RESUMO DA CONCILIACAO:', 14, currentY);
            
            currentY += 8;
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "normal");
            doc.text(`SALDO NO SISTEMA:`, 14, currentY);
            doc.text(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.finalBalance), 140, currentY, { align: 'right' });
            
            currentY += 6;
            doc.text(`SALDO NO EXTRATO BANCARIO:`, 14, currentY);
            doc.text(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.statementBalance), 140, currentY, { align: 'right' });
            
            currentY += 8;
            doc.setFillColor(isOk ? 236 : 254, isOk ? 253 : 242, isOk ? 245 : 242);
            doc.roundedRect(14, currentY - 5, 182, 10, 2, 2, 'F');
            doc.setTextColor(isOk ? 5 : 225, isOk ? 150 : 29, isOk ? 105 : 72);
            doc.setFont("helvetica", "bold");
            doc.text(`DIFERENCA APURADA:`, 20, currentY + 1.5);
            doc.text(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(diff), 180, currentY + 1.5, { align: 'right' });

            currentY += 20;
            if (currentY > 240) { doc.addPage(); currentY = 20; }
            doc.setFillColor(2, 44, 34);
            doc.roundedRect(14, currentY, 182, 30, 4, 4, 'F');
            doc.setFontSize(10);
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.text('CERTIFICADO DE CONCILIACAO BPO FINANCEIRO', 22, currentY + 10);
            doc.setFontSize(7);
            doc.setTextColor(167, 243, 208);
            doc.setFont("helvetica", "normal");
            doc.text(['Declaramos que todos os saldos foram conferidos.', 'A Fluxo Inteligente garante a integridade dos dados.', 'Documento gerado para fins gerenciais.'], 22, currentY + 18);
        };

        if (specificBank) {
            renderBankPage(specificBank, true);
        } else {
            summaries.forEach((s, idx) => renderBankPage(s, idx === 0));
        }

        const reportFileName = specificBank ? `Conciliacao_${specificBank.name}_${currentMonth}` : `Relatorio_Geral_${currentMonth}`;
        doc.save(`${reportFileName.replace(/\s+/g, '_')}.pdf`);
    };


    const totalFinal = summaries.reduce((acc, s) => acc + s.finalBalance, 0);

    return (
        <div className="space-y-8">
            <Card className="p-8 border-none bg-slate-50/50">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                            <CheckCircle2 size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">📋 Relatório de Conciliação</h2>
                            <p className="text-sm text-slate-500 mt-1">Gere o extrato consolidado para conferência de saldos bancários.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <input 
                            type="month" 
                            value={currentMonth}
                            onChange={(e) => setCurrentMonth(e.target.value)}
                            className={cn(
                                "px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all",
                                readOnly && "no-print"
                            )}
                        />
                        <Button 
                            variant="outline"
                            onClick={() => generatePDF(undefined, 'preview')}
                            disabled={loading || summaries.length === 0}
                            className="rounded-2xl h-12 px-6 border-slate-200 text-slate-600 font-bold hover:bg-slate-50 no-print"
                        >
                            <Eye size={18} className="mr-2" /> Visualizar
                        </Button>
                        <Button 
                            onClick={() => generatePDF(undefined, 'download')}
                            disabled={loading || summaries.length === 0}
                            className="rounded-2xl h-12 px-6 shadow-xl shadow-primary/20 bg-slate-900 no-print"
                        >
                            <Download size={18} className="mr-2" /> Baixar PDF
                        </Button>
                        {readOnly && (
                            <Button 
                                variant="outline"
                                onClick={() => window.print()}
                                className="rounded-2xl h-12 px-6 border-slate-200 text-slate-600 font-bold hover:bg-slate-50 no-print"
                            >
                                <Printer size={18} className="mr-2" /> Imprimir
                            </Button>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-32 bg-white rounded-3xl border border-slate-100 animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {summaries.map((summary) => (
                            <Card key={summary.id} className="p-6 bg-white border-slate-100 shadow-sm rounded-3xl overflow-hidden hover:border-primary/20 transition-all">
                                <div className="flex flex-col lg:flex-row gap-8">
                                    {/* Bank Info */}
                                    <div className="lg:w-1/4">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                                                <Banknote size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">{summary.name}</h3>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Saldo Conciliado</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {summary.isFullyConciled ? (
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 w-fit">
                                                    <Check size={12} strokeWidth={3} /> Tudo ok
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-100 w-fit">
                                                    <AlertCircle size={12} /> {summary.pendingCount} Pendentes
                                                </div>
                                            )}
                                            <Button 
                                                variant="ghost" 
                                                size="sm"
                                                onClick={() => generatePDF(summary, 'preview')}
                                                className="h-7 px-2 text-[8px] font-black uppercase tracking-widest hover:bg-slate-100 rounded-lg text-slate-500"
                                            >
                                                <Eye size={10} className="mr-1" /> Ver
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="sm"
                                                onClick={() => generatePDF(summary, 'download')}
                                                className="h-7 px-2 text-[8px] font-black uppercase tracking-widest hover:bg-slate-100 rounded-lg"
                                            >
                                                <Download size={10} className="mr-1" /> PDF
                                            </Button>
                                        </div>
                                    </div>

                                    {/* System Balances */}
                                    <div className="flex-1 grid grid-cols-2 gap-6 pb-6 lg:pb-0 lg:border-r lg:border-slate-50 pr-6">
                                        <div>
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Saldo Sistema (Início)</p>
                                            <div className="text-sm font-black text-slate-700">
                                                {formatCurrency(summary.initialBalance)}
                                            </div>
                                            <p className="text-[9px] font-bold text-slate-300 mt-1">{safeDate(summary.initialDate)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Saldo Sistema (Final)</p>
                                            <div className="text-sm font-black text-slate-900">
                                                {formatCurrency(summary.finalBalance)}
                                            </div>
                                            <p className="text-[9px] font-bold text-slate-300 mt-1">{safeDate(summary.finalDate)}</p>
                                        </div>
                                        <div className="text-emerald-600">
                                            <p className="text-[8px] font-black text-emerald-900/40 uppercase tracking-[0.2em] mb-1 flex items-center gap-1"> <ArrowUpRight size={10} /> Entradas</p>
                                            <div className="text-sm font-black">
                                                {formatCurrency(summary.totalIn)}
                                            </div>
                                        </div>
                                        <div className="text-rose-600">
                                            <p className="text-[8px] font-black text-rose-900/40 uppercase tracking-[0.2em] mb-1 flex items-center gap-1"> <ArrowDownLeft size={10} /> Saídas</p>
                                            <div className="text-sm font-black">
                                                {formatCurrency(summary.totalOut)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Comparison Section */}
                                    <div className="lg:w-1/3 bg-slate-50/50 -m-6 p-6 flex flex-col justify-center gap-4">
                                        <div>
                                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Saldo do Extrato Bancário</label>
                                            {readOnly ? (
                                                <div className="w-full px-4 py-3 bg-white border border-slate-100 rounded-2xl text-sm font-black text-slate-900">
                                                    {formatCurrency(summary.statementBalance)}
                                                </div>
                                            ) : (
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                                                    <input 
                                                        type="number" 
                                                        step="0.01"
                                                        defaultValue={summary.statementBalance}
                                                        onBlur={(e) => updateStatementBalance(summary.id, parseFloat(e.target.value) || 0)}
                                                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-900 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                                                        placeholder="0,00"
                                                    />
                                                    {saving === summary.id && (
                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                            <div className="w-3 h-3 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-2 border-t border-slate-100">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase">Diferença:</span>
                                                <span className="text-xs font-black">
                                                    {formatCurrency(summary.finalBalance - summary.statementBalance)}
                                                </span>
                                            </div>
                                            {Math.abs(summary.finalBalance - summary.statementBalance) < 0.01 ? (
                                                <p className="text-[8px] text-emerald-500 font-bold uppercase mt-1">Conferência validada ✓</p>
                                            ) : (
                                                <p className="text-[8px] text-rose-400 font-bold uppercase mt-1">Ajuste necessário no sistema</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Transaction List Detailed */}
                                <div className="mt-8 pt-8 border-t border-slate-50">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Search size={14} /> Títulos Conciliados no Período
                                    </h4>
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                        {summary.transactions.length > 0 ? summary.transactions.map((t, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl hover:bg-slate-50 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        t.type === 'receita' ? "bg-emerald-500" : "bg-rose-500"
                                                    )} />
                                                    <div>
                                                        <p className="text-[11px] font-bold text-slate-900 leading-tight">{t.description}</p>
                                                        <p className="text-[9px] font-medium text-slate-400">{new Date(t.settlement?.paymentDate).toLocaleDateString('pt-BR')}</p>
                                                    </div>
                                                </div>
                                                <span className={cn(
                                                    "text-[11px] font-black",
                                                    t.type === 'receita' ? "text-emerald-600" : "text-rose-600"
                                                )}>
                                                    {t.type === 'receita' ? '+' : '-'} {formatCurrency(t.settlement?.paidValue || 0)}
                                                </span>
                                            </div>
                                        )) : (
                                            <div className="text-center py-6">
                                                <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Nenhuma transação conciliada</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </Card>

            <Card className="p-8 bg-emerald-900 text-white border-none rounded-[2.5rem] shadow-2xl shadow-emerald-900/20">
                <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="w-20 h-20 bg-white/10 rounded-3xl flex items-center justify-center backdrop-blur-xl">
                        <CheckCircle2 size={40} className="text-emerald-400" />
                    </div>
                    <div className="flex-1 text-center md:text-left">
                        <h3 className="text-xl font-black uppercase tracking-tight mb-2">Saldos 100% Conciliados</h3>
                        <p className="text-emerald-100/60 text-sm leading-relaxed max-w-2xl">
                            O total geral de todas as contas é {formatCurrency(totalFinal)}. 
                            Esta demonstração profissional certifica que todos os lançamentos batem com as movimentações bancárias reais.
                        </p>
                    </div>
                    <Button 
                        variant="outline" 
                        onClick={() => generatePDF(undefined, 'download')}
                        className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-2xl px-6 h-12"
                    >
                        Gerar Extrato Oficial
                    </Button>
                </div>
            </Card>

            {/* Report Preview Modal (High-Fidelity React Version) */}
            {isPreviewing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-100 w-full max-w-5xl h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative scale-in-95 animate-in">
                        <div className="flex items-center justify-between p-4 px-8 bg-white border-b border-slate-100 flex-shrink-0">
                            <div>
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Pré-visualização do Relatório Profissional</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Documento Gerado com Base nos Dados Bancários</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button 
                                    onClick={() => generatePDF(selectedBankForPreview || undefined, 'download')}
                                    className="rounded-2xl h-10 px-6 text-xs bg-slate-900 shadow-xl shadow-slate-900/20"
                                >
                                    <Download size={14} className="mr-2" /> Baixar PDF Oficial
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => {
                                        setIsPreviewing(false);
                                        setSelectedBankForPreview(null);
                                    }}
                                    className="rounded-full w-10 h-10 text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                                >
                                    <X size={24} />
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar bg-slate-200/50">
                            <ReportDocument 
                                clientName={clientName}
                                month={new Date(currentMonth + '-01').toLocaleDateString('pt-BR', { month: 'long' })}
                                year={currentMonth.split('-')[0]}
                                banks={selectedBankForPreview ? [selectedBankForPreview] : summaries}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Report Preview Components ---

const safeDate = (date: any) => {
    try {
        if (!date) return 'Data não disponível';
        const d = new Date(date);
        if (isNaN(d.getTime())) return 'Data inválida';
        return d.toLocaleDateString('pt-BR');
    } catch {
        return 'Erro na data';
    }
};

const ReportDocument = ({ 
    clientName, 
    month, 
    year, 
    banks 
}: { 
    clientName: string, 
    month: string, 
    year: string, 
    banks: BankSummary[] 
}) => {
    return (
        <div className="bg-white min-h-full p-8 md:p-12 shadow-inner font-sans text-slate-900 mx-auto max-w-[800px]">
            {banks.map((bank, idx) => (
                <div key={bank.id} className={cn("report-page", idx > 0 && "mt-12 pt-12 border-t-2 border-dashed border-slate-200")}>
                    {/* Header */}
                    <div className="flex justify-between items-start mb-10">
                        <div>
                            <div className="flex items-baseline gap-1.5 mb-1">
                                <span className="text-2xl font-black text-[#004b8d]">Fluxo</span>
                                <span className="text-2xl font-black text-[#22c55e]">Inteligente</span>
                            </div>
                            <p className="text-[9px] font-black text-slate-400 tracking-widest uppercase">Gestão Financeira BPO Premium</p>
                            <div className="h-0.5 w-32 bg-[#22c55e] mt-2" />
                        </div>
                        <div className="text-right">
                            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Extrato de Conciliação</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{month} / {year}</p>
                        </div>
                    </div>

                    {/* Metadata */}
                    <div className="grid grid-cols-2 gap-8 mb-10 pb-6 border-b border-slate-100">
                        <div className="space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase">Cliente</p>
                            <p className="text-xs font-bold text-slate-900 truncate">{clientName.toUpperCase()}</p>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="text-[9px] font-black text-slate-400 uppercase">Conta Bancária</p>
                            <p className="text-xs font-bold text-slate-800">{bank.name.toUpperCase()}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase">Período Referência</p>
                            <p className="text-xs font-bold text-slate-900">{month.toUpperCase()} / {year}</p>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="text-[9px] font-black text-slate-400 uppercase">Data de Emissão</p>
                            <p className="text-xs font-bold text-slate-900">{safeDate(new Date())} às {new Date().toLocaleTimeString('pt-BR')}</p>
                        </div>
                    </div>

                    {/* Summary Card */}
                    <div className="bg-slate-50 rounded-2xl p-6 mb-8 border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">Saldos do Sistema (Controle Interno)</p>
                        <div className="grid grid-cols-4 gap-4">
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Inicial</p>
                                <p className="text-xs font-black text-slate-900">{formatCurrency(bank.initialBalance)}</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Entradas</p>
                                <p className="text-xs font-black text-emerald-600">+{formatCurrency(bank.totalIn)}</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Saídas</p>
                                <p className="text-xs font-black text-rose-600">-{formatCurrency(bank.totalOut)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Final</p>
                                <p className="text-xs font-black text-slate-900">{formatCurrency(bank.finalBalance)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Transactions Table */}
                    <div className="mb-8">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[#004b8d] text-white">
                                    <th className="py-2 px-4 text-[9px] font-bold uppercase rounded-tl-lg">Data</th>
                                    <th className="py-2 px-4 text-[9px] font-bold uppercase">Descrição</th>
                                    <th className="py-2 px-4 text-[9px] font-bold uppercase">Tipo</th>
                                    <th className="py-2 px-4 text-[9px] font-bold uppercase text-right rounded-tr-lg">Valor</th>
                                </tr>
                            </thead>
                            <tbody className="text-[10px]">
                                {bank.transactions.map((t, i) => (
                                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                                        <td className="py-2 px-4 text-slate-500">{safeDate(t.settlement?.paymentDate)}</td>
                                        <td className="py-2 px-4 font-bold text-slate-800">{t.description}</td>
                                        <td className="py-2 px-4">
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[8px] font-bold uppercase",
                                                t.type === 'receita' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                                            )}>
                                                {t.type === 'receita' ? 'Entrada' : 'Saída'}
                                            </span>
                                        </td>
                                        <td className={cn(
                                            "py-2 px-4 text-right font-black",
                                            t.type === 'receita' ? "text-emerald-600" : "text-rose-600"
                                        )}>
                                            {formatCurrency(t.settlement?.paidValue || 0)}
                                        </td>
                                    </tr>
                                ))}
                                {bank.transactions.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="py-8 text-center text-slate-400 font-bold uppercase text-[9px]">Nenhuma transação conciliada no período</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Reconciliation Summary */}
                    <div className="mb-10 pt-6 border-t border-slate-200">
                        <h3 className="text-[10px] font-black text-slate-900 uppercase mb-4 tracking-widest">Resumo da Conciliação</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500 font-bold">Saldo Final no Sistema:</span>
                                <span className="font-black text-slate-900">{formatCurrency(bank.finalBalance)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500 font-bold">Saldo no Extrato Bancário:</span>
                                <span className="font-black text-slate-900">{formatCurrency(bank.statementBalance)}</span>
                            </div>
                            <div className={cn(
                                "flex justify-between items-center p-3 rounded-xl",
                                Math.abs(bank.finalBalance - bank.statementBalance) < 0.01 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                            )}>
                                <span className="text-[10px] font-black uppercase tracking-widest">Diferença Apurada:</span>
                                <span className="text-sm font-black underline decoration-2 underline-offset-4">
                                    {formatCurrency(bank.finalBalance - bank.statementBalance)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Certification Wrapper */}
                    <div className="bg-[#022c22] rounded-3xl p-8 text-white relative overflow-hidden">
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-[#22c55e] rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                    <Check className="text-white" size={24} strokeWidth={4} />
                                </div>
                                <h4 className="text-sm font-black uppercase tracking-tight">Certificado de Conciliação BPO Financeiro</h4>
                            </div>
                            <p className="text-[11px] leading-relaxed text-emerald-100 max-w-lg">
                                Declaramos sob responsabilidade da <strong>Fluxo Inteligente</strong> que todos os lançamentos acima 
                                foram devidamente conferidos e batidos com os extratos bancários oficiais fornecidos pelo cliente. 
                                Este documento serve como atestado de conformidade para fins gerenciais e contábeis.
                            </p>
                        </div>
                        {/* Decorative background logo */}
                        <div className="absolute -bottom-10 -right-10 opacity-10 pointer-events-none transform rotate-12 scale-150">
                            <span className="text-8xl font-black">FLUXO</span>
                        </div>
                    </div>

                    {/* Bank Footer */}
                    <div className="mt-12 flex justify-between items-center text-[8px] font-bold text-slate-400 uppercase tracking-widest pb-4 border-b border-slate-50">
                        <span>Fluxo Inteligente - Gestão Financeira Premium</span>
                        <span>ID do Cliente: {bank.id.substring(0,8)}</span>
                    </div>
                </div>
            ))}
        </div>
    );
};
