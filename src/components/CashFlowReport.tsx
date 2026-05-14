import React, { useState, useEffect, useRef } from 'react';
import { 
    TrendingUp, 
    TrendingDown, 
    AlertCircle, 
    CheckCircle2, 
    ArrowUpRight, 
    ArrowDownRight,
    Calendar,
    Target,
    BarChart3,
    PieChart,
    ChevronDown,
    ChevronRight,
    Printer,
    Download,
    Eye,
    FileText,
    X
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getYearMonth } from '../lib/dateUtils';
import { 
    collection, 
    query, 
    onSnapshot, 
    orderBy,
    where
} from 'firebase/firestore';
import { cn, formatCurrency } from '../lib/utils';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { 
    UNIVERSAL_CHART_OF_ACCOUNTS, 
    ChartAccount 
} from '../constants/financial';

interface FinancialEntry {
    id: string;
    date: string;
    description: string;
    type: 'pagar' | 'receber';
    category: string;
    accountId?: string;
    value: number;
    status: string;
    month: string;
}

interface CashFlowReportProps {
    clientId: string;
    clientName: string;
}

export const CashFlowReport = ({ clientId, clientName }: CashFlowReportProps) => {
    const reportRef = useRef<HTMLDivElement>(null);
    const [agendaEntries, setAgendaEntries] = useState<FinancialEntry[]>([]);
    const [transactionEntries, setTransactionEntries] = useState<FinancialEntry[]>([]);
    const [dbAccounts, setDbAccounts] = useState<ChartAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }); // YYYY-MM
    const [dateRange, setDateRange] = useState({
        startDate: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`,
        endDate: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        const unsubscribeAccounts = onSnapshot(query(
            collection(db, 'chartOfAccounts'), 
            where('clientId', '==', 'global'),
            orderBy('code', 'asc')
        ), (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChartAccount));
            setDbAccounts(list);
        });
        return () => unsubscribeAccounts();
    }, []);

    const effectiveAccounts = dbAccounts.length > 0 ? dbAccounts : UNIVERSAL_CHART_OF_ACCOUNTS;

    useEffect(() => {
        if (!clientId) return;

        setLoading(true);
        
        // Listener 1: Financial Agenda Entries
        const agendaPath = `financialAgenda/${clientId}/entries`;
        const qAgenda = query(collection(db, agendaPath), orderBy("date", "asc"));

        const unsubAgenda = onSnapshot(qAgenda, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as FinancialEntry));
            setAgendaEntries(items);
            if (loading) setLoading(false);
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, agendaPath);
            setLoading(false);
        });

        // Listener 2: System Transactions
        const qTransactions = query(
            collection(db, 'transactions'),
            where('clientId', '==', clientId)
        );

        const unsubTransactions = onSnapshot(qTransactions, (snapshot) => {
            const items = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    date: data.settlement?.paymentDate || data.dueDate,
                    description: data.description || data.partnerName || 'Transação',
                    type: data.type === 'receita' ? 'receber' : 'pagar',
                    category: data.category || '',
                    accountId: data.accountId,
                    value: data.settlement?.paidValue || data.originalValue,
                    status: data.status,
                    month: getYearMonth(data.settlement?.paymentDate || data.dueDate)
                } as FinancialEntry;
            });
            setTransactionEntries(items);
            if (loading) setLoading(false);
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'transactions');
            setLoading(false);
        });

        return () => {
            unsubAgenda();
            unsubTransactions();
        };
    }, [clientId]);

    const entries = [...agendaEntries, ...transactionEntries];

    if (loading) {
        return (
            <div className="h-64 flex items-center justify-center">
                <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    // Helper to get month name
    const getMonthName = (monthStr: string) => {
        const [year, month] = monthStr.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return date.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase();
    };

    // Calculate dates for logic
    const currentMonthStr = currentMonth;
    
    // Get next 3 months strings starting from the selected currentMonth
    const getNextNMonths = (n: number) => {
        const months = [];
        const [year, month] = currentMonth.split('-');
        for (let i = 1; i <= n; i++) {
            const d = new Date(parseInt(year), parseInt(month) - 1 + i, 1);
            months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        return months;
    };
    const nextThreeMonths = getNextNMonths(3);

    // Grouping Logic - Using N2 level from Chart of Accounts
    const categorizeEntry = (entry: FinancialEntry) => {
        const account = effectiveAccounts.find(a => a.id === entry.accountId);
        if (!account) return entry.category || 'Outros';

        const codeParts = (account.code || '').split('.');
        if (codeParts.length >= 2) {
            const n2Code = `${codeParts[0]}.${codeParts[1]}`;
            const n2Account = effectiveAccounts.find(a => a.code === n2Code);
            if (n2Account) return n2Account.name;
        }
        
        return account.name;
    };

    const getStandardCategories = (type: 'receber' | 'pagar') => {
        const n2Accounts = effectiveAccounts.filter(a => {
            const parts = (a.code || '').split('.');
            return parts.length === 2 && (a.type === type || a.type === 'mixed');
        });
        return n2Accounts.map(a => a.name);
    };

    const getMonthStats = (start: string, end?: string) => {
        let s = start;
        let e = end;
        if (!e) {
            // Assume start is YYYY-MM
            s = `${start}-01`;
            const [y, m] = start.split('-').map(Number);
            const lastDay = new Date(y, m, 0).getDate();
            e = `${start}-${String(lastDay).padStart(2, '0')}`;
        }
        
        const monthEntries = entries.filter(item => {
            const entryDate = item.date || item.month;
            return entryDate >= s && entryDate <= e!;
        });
        
        const stats: any = {
            in: {},
            out: {},
            totalInPrev: 0,
            totalInReal: 0,
            totalOutPrev: 0,
            totalOutReal: 0
        };

        // Pre-populate with standard categories to ensure correct order
        getStandardCategories('receber').forEach(cat => stats.in[cat] = { prev: 0, real: 0 });
        getStandardCategories('pagar').forEach(cat => stats.out[cat] = { prev: 0, real: 0 });

        monthEntries.forEach(e => {
            const cat = categorizeEntry(e);
            if (!cat) return;

            const isSettled = e.status === 'Pago' || e.status === 'Recebido' || e.status === 'Conciliado';
            
            if (e.type === 'receber') {
                if (!stats.in[cat]) stats.in[cat] = { prev: 0, real: 0 };
                
                const isDeduction = cat.toLowerCase().includes('devoluções') || 
                                   cat.toLowerCase().includes('abatimentos') || 
                                   cat.toLowerCase().includes('imposto') || 
                                   cat.toLowerCase().includes('simples');

                if (isDeduction) {
                    stats.in[cat].prev -= e.value;
                    if (isSettled) stats.in[cat].real -= e.value;
                } else {
                    stats.in[cat].prev += e.value;
                    if (isSettled) stats.in[cat].real += e.value;
                }
            } else {
                if (!stats.out[cat]) stats.out[cat] = { prev: 0, real: 0 };
                stats.out[cat].prev += e.value;
                if (isSettled) stats.out[cat].real += e.value;
            }
        });

        stats.totalInPrev = Object.values(stats.in).reduce((acc: number, curr: any) => acc + curr.prev, 0);
        stats.totalInReal = Object.values(stats.in).reduce((acc: number, curr: any) => acc + curr.real, 0);
        stats.totalOutPrev = Object.values(stats.out).reduce((acc: number, curr: any) => acc + curr.prev, 0);
        stats.totalOutReal = Object.values(stats.out).reduce((acc: number, curr: any) => acc + curr.real, 0);
        
        return stats;
    };

    const currentStats = getMonthStats(dateRange.startDate, dateRange.endDate);
    
    // Dynamic categories based on currentStats
    const getTopLevelCategories = (stats: any, type: 'receber' | 'pagar') => {
        const statsMap = type === 'receber' ? stats.in : stats.out;
        const std = getStandardCategories(type);
        const present = Object.keys(statsMap);
        
        return Array.from(new Set([...std, ...present])).sort((a, b) => {
            const aIdx = std.indexOf(a);
            const bIdx = std.indexOf(b);
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return a.localeCompare(b);
        });
    };

    const categoriesIn = getTopLevelCategories(currentStats, 'receber');
    const categoriesOut = getTopLevelCategories(currentStats, 'pagar');

    const projectionStats = nextThreeMonths.map(m => getMonthStats(m));

    // Dynamic Insights Logic
    const prevMonthStr = (() => {
        const [year, month] = currentMonthStr.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 2, 1);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    })();
    const prevStats = getMonthStats(prevMonthStr);

    const revenueGrowth = prevStats.totalInReal > 0 
        ? ((currentStats.totalInReal - prevStats.totalInReal) / prevStats.totalInReal) * 100 
        : 0;
    
    const expenseChange = prevStats.totalOutReal > 0
        ? ((currentStats.totalOutReal - prevStats.totalOutReal) / prevStats.totalOutReal) * 100
        : 0;
    
    const marginProjectionTrend = projectionStats.reduce((acc, curr) => acc + (curr.totalInPrev - curr.totalOutPrev), 0);

    const generatePDF = (action: 'download' | 'preview') => {
        if (action === 'preview') {
            setIsPreviewing(true);
            return;
        }

        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const [year, month] = currentMonthStr.split('-');
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
        const monthName = dateObj.toLocaleDateString('pt-BR', { month: 'long' });

        // Header Styling
        const drawHeader = (doc: any) => {
            doc.setFontSize(22);
            doc.setTextColor(0, 75, 141); // #004b8d
            doc.setFont("helvetica", "bold");
            doc.text('Fluxo', 14, 20);
            
            const fluxowidth = doc.getTextWidth('Fluxo');
            doc.setTextColor(34, 197, 94); // #22c55e
            doc.text('Inteligente', 14 + fluxowidth + 2, 20);
            
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text('GESTÃO FINANCEIRA BPO PREMIUM', 14, 28);
            
            doc.setFontSize(14);
            doc.setTextColor(15, 23, 42);
            doc.text('💰 RELATÓRIO DE FLUXO DE CAIXA', 14, 42);
            
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.text(`CLIENTE: ${clientName.toUpperCase()}`, 14, 50);
            doc.text(`MÊS DE REFERÊNCIA: ${monthName.toUpperCase()} / ${year}`, 14, 55);
            doc.text(`EMISSÃO: ${new Date().toLocaleString('pt-BR')}`, 14, 60);
        };

        drawHeader(doc);

        let currentY = 70;

        // Indicators Section (Flow Indicators)
        // Row 1: Cumulative Balance and Result
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, currentY, 58, 18, 2, 2, 'F');
        doc.setFontSize(6);
        doc.setTextColor(100, 116, 139);
        doc.text('SALDO INICIAL ACUMULADO', 17, currentY + 6);
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(formatCurrency(saldoInicial), 17, currentY + 13);

        doc.setFillColor(248, 250, 252);
        doc.roundedRect(76, currentY, 58, 18, 2, 2, 'F');
        doc.setFontSize(6);
        doc.setTextColor(100, 116, 139);
        doc.text('RESULTADO DO MÊS', 79, currentY + 6);
        doc.setFontSize(10);
        doc.setTextColor(resultMonthReal >= 0 ? 34 : 225, resultMonthReal >= 0 ? 197 : 29, resultMonthReal >= 0 ? 94 : 72);
        doc.text(formatCurrency(resultMonthReal), 79, currentY + 13);

        doc.setFillColor(15, 23, 42);
        doc.roundedRect(138, currentY, 58, 18, 2, 2, 'F');
        doc.setFontSize(6);
        doc.setTextColor(255, 255, 255);
        doc.text('SALDO FINAL EM CAIXA', 141, currentY + 6);
        doc.setFontSize(10);
        doc.text(formatCurrency(saldoFinal), 141, currentY + 13);

        currentY += 22;

        // Row 2: Secondary Indicators (Smaller Cards)
        // Revenue Trend
        doc.setFillColor(240, 253, 244); // emerald-50
        doc.roundedRect(14, currentY, 58, 15, 2, 2, 'F');
        doc.setFontSize(5);
        doc.setTextColor(5, 150, 105); // emerald-600
        doc.text('VARIAÇÃO DE RECEITA', 17, currentY + 5);
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.text(`${revenueGrowth >= 0 ? 'Crescimento' : 'Queda'} de ${Math.abs(revenueGrowth).toFixed(1)}% vs anterior`, 17, currentY + 11);

        // Expense Alert
        doc.setFillColor(expenseChange > 10 ? 254 : 248, expenseChange > 10 ? 242 : 250, expenseChange > 10 ? 242 : 252);
        doc.roundedRect(76, currentY, 58, 15, 2, 2, 'F');
        doc.setFontSize(5);
        doc.setTextColor(expenseChange > 10 ? 220 : 100, expenseChange > 10 ? 38 : 116, expenseChange > 10 ? 38 : 139);
        doc.text('VARIAÇÃO DE SAÍDAS', 79, currentY + 5);
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.text(`${expenseChange >= 0 ? 'Aumento' : 'Redução'} de ${Math.abs(expenseChange).toFixed(1)}% vs anterior`, 79, currentY + 11);

        // In/Out Distribution
        doc.setFillColor(239, 246, 255); // blue-50
        doc.roundedRect(138, currentY, 58, 15, 2, 2, 'F');
        doc.setFontSize(5);
        doc.setTextColor(37, 99, 235); // blue-600
        doc.text('PROJEÇÃO LÍQUIDA (90D)', 141, currentY + 5);
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.text(formatCurrency(marginProjectionTrend), 141, currentY + 11);

        currentY += 25;

        // Current Month Details Table
        const currentMonthData = [];
        
        // Entries
        categoriesIn.forEach(cat => {
            currentMonthData.push([
                cat,
                formatCurrency(currentStats.in[cat].prev),
                formatCurrency(currentStats.in[cat].real),
                formatVarPercent(currentStats.in[cat].prev, currentStats.in[cat].real)
            ]);
        });
        currentMonthData.push([{ content: 'TOTAL ENTRADAS', styles: { fontStyle: 'bold', fillColor: [240, 253, 244] } }, { content: formatCurrency(currentStats.totalInPrev), styles: { fontStyle: 'bold', fillColor: [240, 253, 244] } }, { content: formatCurrency(currentStats.totalInReal), styles: { fontStyle: 'bold', fillColor: [240, 253, 244] } }, { content: formatVarPercent(currentStats.totalInPrev, currentStats.totalInReal), styles: { fontStyle: 'bold', fillColor: [240, 253, 244] } }]);

        // Spacing Row
        currentMonthData.push(['', '', '', '']);

        // Expenses
        categoriesOut.forEach(cat => {
            currentMonthData.push([
                cat,
                formatCurrency(currentStats.out[cat].prev),
                formatCurrency(currentStats.out[cat].real),
                formatVarPercent(currentStats.out[cat].prev, currentStats.out[cat].real)
            ]);
        });
        currentMonthData.push([{ content: 'TOTAL SAÍDAS', styles: { fontStyle: 'bold', fillColor: [254, 242, 242] } }, { content: formatCurrency(currentStats.totalOutPrev), styles: { fontStyle: 'bold', fillColor: [254, 242, 242] } }, { content: formatCurrency(currentStats.totalOutReal), styles: { fontStyle: 'bold', fillColor: [254, 242, 242] } }, { content: formatVarPercent(currentStats.totalOutPrev, currentStats.totalOutReal), styles: { fontStyle: 'bold', fillColor: [254, 242, 242] } }]);

        autoTable(doc, {
            startY: currentY,
            head: [['Fluxo de Caixa - Mês Atual', 'Previsto', 'Realizado', 'Variação']],
            body: currentMonthData,
            theme: 'striped',
            headStyles: { fillColor: [26, 54, 93], fontSize: 8 },
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;

        // Projection table
        if (currentY > 220) {
            doc.addPage();
            currentY = 20;
            drawHeader(doc);
            currentY = 70;
        }

        const projectionData = [
            ['INDICADOR', ...nextThreeMonths.map(m => getMonthName(m)), 'TOTAL TRIMESTRE'],
            ['Entradas', ...projectionStats.map(s => formatCurrency(s.totalInPrev)), formatCurrency(projectionStats.reduce((acc, curr) => acc + curr.totalInPrev, 0))],
            ['Saídas', ...projectionStats.map(s => formatCurrency(s.totalOutPrev)), formatCurrency(projectionStats.reduce((acc, curr) => acc + curr.totalOutPrev, 0))],
            ['Líquido', ...projectionStats.map(s => formatCurrency(s.totalInPrev - s.totalOutPrev)), formatCurrency(projectionStats.reduce((acc, curr) => acc + (curr.totalInPrev - curr.totalOutPrev), 0))]
        ];

        autoTable(doc, {
            startY: currentY,
            head: [['PROJEÇÃO DE FLUXO DE CAIXA (PRÓXIMAS 90 DIAS)', '', '', '', '']],
            body: projectionData,
            theme: 'grid',
            headStyles: { fillColor: [0, 75, 141], fontSize: 8 },
            styles: { fontSize: 7, cellPadding: 3 },
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
        });

        doc.save(`Fluxo_Caixa_${clientName.replace(/\s+/g, '_')}_${currentMonthStr}.pdf`);
    };

    // Cumulative Balance Logic
    const getCumulativeBalanceUntil = (monthStr: string) => {
        const [uYear, uMonth] = monthStr.split('-').map(Number);
        const untilDate = new Date(uYear, uMonth - 1, 1);
        const previousEntries = entries.filter(e => {
            const entryMonth = getYearMonth(e.date || e.month);

            if (!entryMonth || !entryMonth.includes('-')) return false;

            const [eYear, eMonth] = entryMonth.split('-').map(Number);
            const entryDate = new Date(eYear, eMonth - 1, 1);
            return entryDate < untilDate && (e.status === 'Pago' || e.status === 'Recebido' || e.status === 'Conciliado');
        });
        const prevIn = previousEntries.filter(e => e.type === 'receber').reduce((acc, curr) => acc + curr.value, 0);
        const prevOut = previousEntries.filter(e => e.type === 'pagar').reduce((acc, curr) => acc + curr.value, 0);
        return prevIn - prevOut;
    };

    const saldoInicial = getCumulativeBalanceUntil(currentMonthStr);
    const resultMonthPrev = currentStats.totalInPrev - currentStats.totalOutPrev;
    const resultMonthReal = currentStats.totalInReal - currentStats.totalOutReal;
    const saldoFinal = saldoInicial + resultMonthReal;

    const opMargin = currentStats.totalInPrev > 0 ? (resultMonthPrev / currentStats.totalInPrev) * 100 : 0;
    const coverageRatio = currentStats.totalOutPrev > 0 ? currentStats.totalInPrev / currentStats.totalOutPrev : 0;
    
    // Inadimplência
    const overdueReceivables = entries.filter(e => e.type === 'receber' && e.status === 'Vencido');
    const totalOverdue = overdueReceivables.reduce((acc, curr) => acc + curr.value, 0);
    const inadimplenciaRate = currentStats.totalInPrev > 0 ? (totalOverdue / currentStats.totalInPrev) * 100 : 0;

    // Projected Totals (Next 4 months including current)
    const allAnalysedMonths = [currentMonthStr, ...nextThreeMonths];
    const analysedStats = allAnalysedMonths.map(m => getMonthStats(m));
    
    const projectedRevenue4m = analysedStats.reduce((acc, curr) => acc + curr.totalInPrev, 0);
    const projectedExpense4m = analysedStats.reduce((acc, curr) => acc + curr.totalOutPrev, 0);
    const projectedLiquid4m = projectedRevenue4m - projectedExpense4m;
    const projectedMargin4m = projectedRevenue4m > 0 ? (projectedLiquid4m / projectedRevenue4m) * 100 : 0;

    const formatVarPercent = (prev: number, real: number) => {
        if (prev === 0) return real === 0 ? '0,0%' : '100,0%';
        const p = ((real - prev) / Math.abs(prev)) * 100;
        return (p > 0 ? '+' : '') + p.toFixed(1).replace('.', ',') + '%';
    };

    const getStatusIcon = (indicator: string, value: number) => {
        if (indicator === 'margin') {
            if (value >= 10) return { label: 'Saudável', icon: <CheckCircle2 className="text-emerald-500" size={14} />, color: 'text-emerald-600' };
            if (value >= 0) return { label: 'Atenção', icon: <AlertCircle className="text-amber-500" size={14} />, color: 'text-amber-600' };
            return { label: 'Crítico', icon: <TrendingDown className="text-rose-500" size={14} />, color: 'text-rose-600' };
        }
        if (indicator === 'coverage') {
            if (value >= 1.2) return { label: 'Saudável', icon: <CheckCircle2 className="text-emerald-500" size={14} />, color: 'text-emerald-600' };
            if (value >= 1.0) return { label: 'Atenção', icon: <AlertCircle className="text-amber-500" size={14} />, color: 'text-amber-600' };
            return { label: 'Crítico', icon: <TrendingDown className="text-rose-500" size={14} />, color: 'text-rose-600' };
        }
        if (indicator === 'overdue') {
            if (value <= 5) return { label: 'Saudável', icon: <CheckCircle2 className="text-emerald-500" size={14} />, color: 'text-emerald-600' };
            if (value <= 15) return { label: 'Atenção', icon: <AlertCircle className="text-amber-500" size={14} />, color: 'text-amber-600' };
            return { label: 'Crítico', icon: <TrendingDown className="text-rose-500" size={14} />, color: 'text-rose-600' };
        }
        return { label: '-', icon: null, color: 'text-slate-400' };
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-700 report-container">
            {/* Action Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 no-print bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 px-4 py-1.5 rounded-2xl border border-slate-200">
                        <Calendar size={14} className="text-slate-400" />
                        <div className="flex items-center gap-2">
                            <input 
                                type="date"
                                value={dateRange.startDate}
                                onChange={(e) => setDateRange({...dateRange, startDate: e.target.value})}
                                className="bg-transparent text-[10px] font-black text-slate-600 uppercase tracking-widest outline-none cursor-pointer"
                            />
                            <span className="text-[10px] font-black text-slate-300">ATÉ</span>
                            <input 
                                type="date"
                                value={dateRange.endDate}
                                onChange={(e) => setDateRange({...dateRange, endDate: e.target.value})}
                                className="bg-transparent text-[10px] font-black text-slate-600 uppercase tracking-widest outline-none cursor-pointer"
                            />
                        </div>
                    </div>
                    
                    <span className="hidden md:inline text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">
                        Período Selecionado
                    </span>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => generatePDF('preview')}
                        className="rounded-2xl h-10 border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest px-6 hover:bg-slate-50 transition-all active:scale-95"
                    >
                        <Eye size={16} className="mr-2" /> Visualizar
                    </Button>
                    <Button 
                        variant="primary" 
                        size="sm" 
                        onClick={() => generatePDF('download')}
                        className="rounded-2xl h-10 bg-primary text-white text-[10px] font-black uppercase tracking-widest px-6 shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95"
                    >
                        <Download size={16} className="mr-2" /> Baixar PDF
                    </Button>
                </div>
            </div>

            {/* Main Report Body for Screen */}
            <div ref={reportRef} className="space-y-6">
                {/* INDICATORS SECTION */}
                <div className="bg-[#1a365d] rounded-[2.5rem] p-8 text-white shadow-xl shadow-slate-900/10">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-primary">
                            <BarChart3 size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight">💰 Indicadores de Fluxo de Caixa</h3>
                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.2em] mt-1">Análise de Performance e Saúde Financeira</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest bg-white/5 px-6 py-3 rounded-2xl border border-white/10">
                        <span className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-400" /> Saudável</span>
                        <span className="flex items-center gap-2"><AlertCircle size={12} className="text-amber-400" /> Atenção</span>
                        <span className="flex items-center gap-2"><TrendingDown size={12} className="text-rose-400" /> Crítico</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Operating Margin */}
                    <Card className="bg-white/5 border-white/10 p-5 rounded-3xl hover:bg-white/10 transition-colors group">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[9px] font-black text-white/50 uppercase tracking-[0.2em]">Margem Op. Caixa</p>
                            {getStatusIcon('margin', opMargin).icon}
                        </div>
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <h4 className="text-2xl font-black mb-1">{opMargin.toFixed(1)}%</h4>
                                <p className={cn("text-[9px] font-black uppercase", getStatusIcon('margin', opMargin).color)}>{getStatusIcon('margin', opMargin).label}</p>
                            </div>
                            <div className="w-12 h-12 rounded-full border-2 border-white/10 flex items-center justify-center text-[10px] font-mono group-hover:border-primary/50 transition-colors">
                                {opMargin > 0 ? <ArrowUpRight size={14} className="text-emerald-400" /> : <ArrowDownRight size={14} className="text-rose-400" />}
                            </div>
                        </div>
                    </Card>

                    {/* Coverage Ratio */}
                    <Card className="bg-white/5 border-white/10 p-5 rounded-3xl hover:bg-white/10 transition-colors group">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[9px] font-black text-white/50 uppercase tracking-[0.2em]">Índice de Cobertura</p>
                            {getStatusIcon('coverage', coverageRatio).icon}
                        </div>
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <h4 className="text-2xl font-black mb-1">{coverageRatio.toFixed(2)}x</h4>
                                <p className={cn("text-[9px] font-black uppercase", getStatusIcon('coverage', coverageRatio).color)}>{getStatusIcon('coverage', coverageRatio).label}</p>
                            </div>
                            <div className="px-3 py-1 bg-white/5 rounded-full text-[9px] font-bold text-white/40">In/Out</div>
                        </div>
                    </Card>

                    {/* Inadimplência */}
                    <Card className="bg-white/5 border-white/10 p-5 rounded-3xl hover:bg-white/10 transition-colors group">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[9px] font-black text-white/50 uppercase tracking-[0.2em]">Taxa Inadimplência</p>
                            {getStatusIcon('overdue', inadimplenciaRate).icon}
                        </div>
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <h4 className="text-2xl font-black mb-1">{inadimplenciaRate.toFixed(1)}%</h4>
                                <p className={cn("text-[9px] font-black uppercase", getStatusIcon('overdue', inadimplenciaRate).color)}>{getStatusIcon('overdue', inadimplenciaRate).label}</p>
                            </div>
                            <div className="text-white/40 text-right">
                                <p className="text-[8px] font-black uppercase leading-tight">Total Vencido</p>
                                <p className="text-[10px] font-mono font-bold text-rose-400">{formatCurrency(totalOverdue)}</p>
                            </div>
                        </div>
                    </Card>

                    {/* Projected Revenue 4 months */}
                    <Card className="bg-white/5 border-white/10 p-5 rounded-3xl hover:bg-white/10 transition-colors border-l-4 border-l-emerald-500/50">
                        <p className="text-[9px] font-black text-white/50 uppercase tracking-[0.2em] mb-4">Receita Proj. (4 meses)</p>
                        <h4 className="text-2xl font-black mb-1 text-emerald-400">{formatCurrency(projectedRevenue4m)}</h4>
                        <div className="flex items-center gap-2 mt-2">
                             <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                 <div className="h-full bg-emerald-500" style={{ width: '100%' }} />
                             </div>
                        </div>
                    </Card>

                    {/* Projected Expense 4 months */}
                    <Card className="bg-white/5 border-white/10 p-5 rounded-3xl hover:bg-white/10 transition-colors border-l-4 border-l-rose-500/50">
                        <p className="text-[9px] font-black text-white/50 uppercase tracking-[0.2em] mb-4">Despesa Proj. (4 meses)</p>
                        <h4 className="text-2xl font-black mb-1 text-rose-400">{formatCurrency(projectedExpense4m)}</h4>
                        <div className="flex items-center gap-2 mt-2">
                             <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                 <div className="h-full bg-rose-500" style={{ width: (projectedExpense4m / projectedRevenue4m * 100) + '%' }} />
                             </div>
                        </div>
                    </Card>

                    {/* Final Net Projected */}
                    <Card className="bg-primary/20 border-primary/30 p-5 rounded-3xl hover:bg-primary/30 transition-colors relative overflow-hidden">
                        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/5 rounded-full blur-2xl" />
                        <p className="text-[9px] font-black text-white uppercase tracking-[0.2em] mb-4">Res. Líquido Proj. (4m)</p>
                        <h4 className="text-2xl font-black mb-1 text-white">{formatCurrency(projectedLiquid4m)}</h4>
                        <div className="flex items-center justify-between text-[9px] font-black uppercase text-primary-foreground/60 mt-2">
                            <span>Margem Proj.</span>
                            <span className="text-white">{projectedMargin4m.toFixed(1)}%</span>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Footer Insights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 bg-slate-50 border-slate-100 rounded-3xl flex items-center gap-4">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", revenueGrowth >= 0 ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500")}>
                        {revenueGrowth >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Variação de Receita</p>
                        <p className="text-sm font-bold text-slate-900">{revenueGrowth >= 0 ? 'Crescimento' : 'Queda'} de {Math.abs(revenueGrowth).toFixed(1)}%</p>
                    </div>
                </Card>
                <Card className="p-6 bg-slate-50 border-slate-100 rounded-3xl flex items-center gap-4">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", expenseChange > 5 ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-500")}>
                        {expenseChange > 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Variação de Saídas</p>
                        <p className="text-sm font-bold text-slate-900">{expenseChange >= 0 ? 'Aumento' : 'Redução'} de {Math.abs(expenseChange).toFixed(1)}%</p>
                    </div>
                </Card>
                <Card className="p-6 bg-slate-50 border-slate-100 rounded-3xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/5 text-primary flex items-center justify-center">
                        <BarChart3 size={20} />
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Resultado Proj. (90d)</p>
                        <p className="text-sm font-bold text-slate-900">{formatCurrency(marginProjectionTrend)}</p>
                    </div>
                </Card>
            </div>

            {/* TABLES GRID */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* MÊS ATUAL */}
                <Card className="overflow-hidden border-slate-100 shadow-sm rounded-[2rem]">
                    <div className="bg-[#1a365d] p-4 flex items-center justify-between shrink-0">
                        <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                            Mês Atual ({getMonthName(currentMonthStr)})
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[500px]">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    <th className="py-3 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Categoria</th>
                                    <th className="py-3 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Previsto</th>
                                    <th className="py-3 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Realizado</th>
                                    <th className="py-3 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Var (%)</th>
                                </tr>
                            </thead>
                            <tbody className="text-[11px]">
                                <tr className="bg-emerald-50/30">
                                    <td colSpan={4} className="py-2 px-4 text-[10px] font-black text-emerald-700 uppercase tracking-widest">ENTRADAS</td>
                                </tr>
                                {categoriesIn.map(cat => (
                                    <tr key={cat} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="py-2.5 px-4 font-medium text-slate-600">{cat}</td>
                                        <td className="py-2.5 px-4 text-right font-mono text-slate-900">{formatCurrency(currentStats.in[cat].prev)}</td>
                                        <td className="py-2.5 px-4 text-right font-mono text-slate-900">{currentStats.in[cat].real !== 0 ? formatCurrency(currentStats.in[cat].real) : '-'}</td>
                                        <td className={cn("py-2.5 px-4 text-right font-bold", currentStats.in[cat].real >= currentStats.in[cat].prev ? "text-emerald-500" : "text-rose-500")}>
                                            {formatVarPercent(currentStats.in[cat].prev, currentStats.in[cat].real)}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-slate-50/80 font-black">
                                    <td className="py-3 px-4 text-emerald-600 uppercase tracking-tight">Total Entradas</td>
                                    <td className="py-3 px-4 text-right text-emerald-600">{formatCurrency(currentStats.totalInPrev)}</td>
                                    <td className="py-3 px-4 text-right text-emerald-600">{formatCurrency(currentStats.totalInReal)}</td>
                                    <td className="py-3 px-4 text-right text-emerald-600">{formatVarPercent(currentStats.totalInPrev, currentStats.totalInReal)}</td>
                                </tr>

                                <tr className="bg-rose-50/30">
                                    <td colSpan={4} className="py-2 px-4 text-[10px] font-black text-rose-700 uppercase tracking-widest">SAÍDAS</td>
                                </tr>
                                {categoriesOut.map(cat => (
                                    <tr key={cat} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="py-2.5 px-4 font-medium text-slate-600">{cat}</td>
                                        <td className="py-2.5 px-4 text-right font-mono text-slate-900">{formatCurrency(currentStats.out[cat].prev)}</td>
                                        <td className="py-2.5 px-4 text-right font-mono text-slate-900">{currentStats.out[cat].real !== 0 ? formatCurrency(currentStats.out[cat].real) : '-'}</td>
                                        <td className={cn("py-2.5 px-4 text-right font-bold", currentStats.out[cat].real <= currentStats.out[cat].prev ? "text-emerald-500" : "text-rose-500")}>
                                            {formatVarPercent(currentStats.out[cat].prev, currentStats.out[cat].real)}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-slate-50/80 font-black">
                                    <td className="py-3 px-4 text-rose-600 uppercase tracking-tight">Total Saídas</td>
                                    <td className="py-3 px-4 text-right text-rose-600">{formatCurrency(currentStats.totalOutPrev)}</td>
                                    <td className="py-3 px-4 text-right text-rose-600">{formatCurrency(currentStats.totalOutReal)}</td>
                                    <td className="py-3 px-4 text-right text-rose-600">{formatVarPercent(currentStats.totalOutPrev, currentStats.totalOutReal)}</td>
                                </tr>

                                <tr className="border-t-2 border-slate-200 bg-slate-900 text-white font-black">
                                    <td className="py-4 px-4 uppercase tracking-widest">Resultado do Mês</td>
                                    <td className="py-4 px-4 text-right font-mono">{formatCurrency(resultMonthPrev)}</td>
                                    <td className="py-4 px-4 text-right font-mono">{formatCurrency(resultMonthReal)}</td>
                                    <td className="py-4 px-4 text-right">{formatVarPercent(resultMonthPrev, resultMonthReal)}</td>
                                </tr>
                                <tr className="border-t border-slate-800 bg-slate-800 text-white/70 font-bold">
                                    <td className="py-3 px-4 uppercase tracking-widest text-[10px]">Saldo Inicial (Acumulado)</td>
                                    <td className="py-3 px-4 text-right font-mono">-</td>
                                    <td className="py-3 px-4 text-right font-mono text-white">{formatCurrency(saldoInicial)}</td>
                                    <td className="py-3 px-4 text-right">-</td>
                                </tr>
                                <tr className="border-t border-slate-700 bg-slate-700 text-white font-black">
                                    <td className="py-4 px-4 uppercase tracking-widest">Saldo Final em Caixa</td>
                                    <td className="py-4 px-4 text-right font-mono">-</td>
                                    <td className="py-4 px-4 text-right font-mono text-emerald-400 text-sm">{formatCurrency(saldoFinal)}</td>
                                    <td className="py-4 px-4 text-right">-</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Card>

                {/* PROJEÇÃO 3 MESES */}
                <Card className="overflow-hidden border-slate-100 shadow-sm rounded-[2rem]">
                    <div className="bg-[#1a365d] p-4 flex items-center justify-between shrink-0">
                        <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                             <Calendar size={14} className="text-primary" />
                             Próximos 3 Meses (Previsto)
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[500px]">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    <th className="py-3 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Item / Mês</th>
                                    {nextThreeMonths.map(m => (
                                        <th key={m} className="py-3 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">{getMonthName(m)}</th>
                                    ))}
                                    <th className="py-3 px-4 text-[9px] font-bold text-slate-900 uppercase tracking-widest text-right bg-slate-50">Total</th>
                                </tr>
                            </thead>
                            <tbody className="text-[11px]">
                                <tr className="border-b border-slate-50">
                                    <td className="py-4 px-4 font-bold text-emerald-600 uppercase tracking-tight">Total Entradas</td>
                                    {projectionStats.map((s, idx) => (
                                        <td key={idx} className="py-4 px-4 text-right font-mono text-slate-700">{formatCurrency(s.totalInPrev)}</td>
                                    ))}
                                    <td className="py-4 px-4 text-right font-black text-emerald-600 bg-emerald-50/30">
                                        {formatCurrency(projectionStats.reduce((acc, curr) => acc + curr.totalInPrev, 0))}
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-50">
                                    <td className="py-4 px-4 font-bold text-rose-600 uppercase tracking-tight">Total Saídas</td>
                                    {projectionStats.map((s, idx) => (
                                        <td key={idx} className="py-4 px-4 text-right font-mono text-slate-700">{formatCurrency(s.totalOutPrev)}</td>
                                    ))}
                                    <td className="py-4 px-4 text-right font-black text-rose-600 bg-rose-50/30">
                                        {formatCurrency(projectionStats.reduce((acc, curr) => acc + curr.totalOutPrev, 0))}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-6 px-4 font-black text-slate-900 uppercase tracking-tight">Resultado do Mês</td>
                                    {projectionStats.map((s, idx) => (
                                        <td key={idx} className="py-6 px-4 text-right font-mono font-black text-slate-900">
                                            {formatCurrency(s.totalInPrev - s.totalOutPrev)}
                                        </td>
                                    ))}
                                    <td className="py-6 px-4 text-right font-black text-white bg-slate-900">
                                        {formatCurrency(projectionStats.reduce((acc, curr) => acc + (curr.totalInPrev - curr.totalOutPrev), 0))}
                                    </td>
                                </tr>
                                <tr className="border-t border-slate-100 italic bg-slate-50/50">
                                    <td className="py-3 px-4 text-[10px] text-slate-500 uppercase font-bold">Saldo Inicial</td>
                                    {projectionStats.map((_, idx) => {
                                        // Simple recursion for projection
                                        let bal = saldoFinal;
                                        for(let i=0; i<idx; i++) {
                                            bal += (projectionStats[i].totalInPrev - projectionStats[i].totalOutPrev);
                                        }
                                        return <td key={idx} className="py-3 px-4 text-right font-mono text-slate-400">{formatCurrency(bal)}</td>;
                                    })}
                                    <td className="py-3 px-4 bg-slate-100"></td>
                                </tr>
                                <tr className="border-t border-slate-100 font-black bg-slate-100">
                                    <td className="py-3 px-4 text-[10px] text-slate-900 uppercase">Saldo Final Proj.</td>
                                    {projectionStats.map((s, idx) => {
                                        let bal = saldoFinal;
                                        for(let i=0; i<=idx; i++) {
                                            bal += (projectionStats[i].totalInPrev - projectionStats[i].totalOutPrev);
                                        }
                                        return <td key={idx} className="py-3 px-4 text-right font-mono text-slate-900">{formatCurrency(bal)}</td>;
                                    })}
                                    <td className="py-3 px-4 bg-slate-200 text-right">{formatCurrency(saldoFinal + projectionStats.reduce((acc, curr) => acc + (curr.totalInPrev - curr.totalOutPrev), 0))}</td>
                                </tr>

                                {/* Visual Spacer */}
                                <tr className="h-12"><td colSpan={5}></td></tr>

                                <tr className="border-t border-slate-100">
                                    <td colSpan={5} className="p-6">
                                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                                    <Target size={18} />
                                                </div>
                                                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Resumo da Projeção Trimestral</h4>
                                            </div>
                                            <div className="grid grid-cols-2 gap-8">
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Geração de Caixa Tot. (90d)</p>
                                                    <p className="text-lg font-black text-emerald-600">{formatCurrency(projectionStats.reduce((acc, curr) => acc + (curr.totalInPrev - curr.totalOutPrev), 0))}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Margem Projetada (Média)</p>
                                                    <p className="text-lg font-black text-slate-900">
                                                        {(projectionStats.reduce((acc, curr) => acc + (curr.totalInPrev - curr.totalOutPrev), 0) / 
                                                          projectionStats.reduce((acc, curr) => acc + curr.totalInPrev, 1) * 100).toFixed(1)}%
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
            </div>

            {/* Report Preview Modal */}
            {isPreviewing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-100 w-full max-w-5xl h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative scale-in-95 animate-in">
                        <div className="flex items-center justify-between p-4 px-8 bg-white border-b border-slate-100 flex-shrink-0">
                            <div>
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">💰 Pré-visualização do Fluxo de Caixa</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Documento Profissional para Impressão</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button 
                                    onClick={() => window.print()}
                                    className="rounded-2xl h-10 px-6 text-xs bg-slate-100 text-slate-900 border border-slate-200"
                                >
                                    <Printer size={14} className="mr-2" /> Imprimir
                                </Button>
                                <Button 
                                    onClick={() => generatePDF('download')}
                                    className="rounded-2xl h-10 px-6 text-xs bg-slate-900 text-white shadow-xl shadow-slate-900/20"
                                >
                                    <Download size={14} className="mr-2" /> Baixar PDF
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => setIsPreviewing(false)}
                                    className="rounded-full w-10 h-10 text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                                >
                                    <X size={24} />
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar bg-slate-200/50">
                            <CashFlowDocument 
                                clientName={clientName}
                                month={getMonthName(currentMonthStr)}
                                currentMonth={currentMonthStr}
                                stats={currentStats}
                                projection={projectionStats}
                                saldoInicial={saldoInicial}
                                saldoFinal={saldoFinal}
                                categoriesIn={categoriesIn}
                                categoriesOut={categoriesOut}
                                formatVarPercent={formatVarPercent}
                                revenueGrowth={revenueGrowth}
                                expenseChange={expenseChange}
                                marginProjectionTrend={marginProjectionTrend}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Report Preview Component ---
const CashFlowDocument = ({ 
    clientName, 
    month, 
    currentMonth,
    stats, 
    projection, 
    saldoInicial, 
    saldoFinal,
    categoriesIn,
    categoriesOut,
    formatVarPercent,
    revenueGrowth,
    expenseChange,
    marginProjectionTrend
}: any) => {
    const [year, mPart] = currentMonth.split('-').map(Number);
    return (
        <div className="bg-white min-h-full p-8 shadow-inner font-sans text-slate-900 mx-auto max-w-[750px] print:p-0 print:shadow-none">
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
                    <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">💰 Relatório de Fluxo de Caixa</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Período: {month}</p>
                </div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-4 mb-6 text-[10px] pb-4 border-b border-slate-100">
                <p><strong>CLIENTE:</strong> {clientName.toUpperCase()}</p>
                <p className="text-right"><strong>EMISSÃO:</strong> {new Date().toLocaleString('pt-BR')}</p>
            </div>

            {/* Indicators Section (Portrait Optimized) */}
            <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[7px] font-black text-slate-400 uppercase mb-1">Saldo Inicial Acumulado</p>
                    <p className="text-xs font-black">{formatCurrency(saldoInicial)}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[7px] font-black text-slate-400 uppercase mb-1">Resultado Líquido (Mês)</p>
                    <p className={cn("text-xs font-black", stats.totalInReal - stats.totalOutReal >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {formatCurrency(stats.totalInReal - stats.totalOutReal)}
                    </p>
                </div>
                <div className="bg-slate-900 p-3 rounded-xl text-white">
                    <p className="text-[7px] font-black text-white/40 uppercase mb-1">Saldo Final em Caixa</p>
                    <p className="text-xs font-black">{formatCurrency(saldoFinal)}</p>
                </div>
            </div>

                {/* Insight Indicators (Trend, Alert, Distribution) */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className={cn("p-2.5 rounded-xl border flex flex-col justify-center", revenueGrowth >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100")}>
                        <p className={cn("text-[6px] font-black uppercase mb-0.5 tracking-wider", revenueGrowth >= 0 ? "text-emerald-600" : "text-rose-600")}>Var. Receita</p>
                        <p className="text-[9px] font-bold text-slate-700 leading-tight">{revenueGrowth >= 0 ? 'Crescimento' : 'Queda'} de {Math.abs(revenueGrowth).toFixed(1)}%</p>
                    </div>
                    <div className={cn("p-2.5 rounded-xl border flex flex-col justify-center", expenseChange <= 5 ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100")}>
                        <p className={cn("text-[6px] font-black uppercase mb-0.5 tracking-wider", expenseChange <= 5 ? "text-emerald-600" : "text-rose-600")}>Var. Saídas</p>
                        <p className="text-[9px] font-bold text-slate-700 leading-tight">{expenseChange >= 0 ? 'Aumento' : 'Redução'} de {Math.abs(expenseChange).toFixed(1)}%</p>
                    </div>
                    <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-100 flex flex-col justify-center">
                        <p className="text-[6px] font-black text-blue-600 uppercase mb-0.5 tracking-wider">Proj. Líquida (90d)</p>
                        <p className="text-[9px] font-bold text-slate-700 leading-tight">{formatCurrency(marginProjectionTrend)}</p>
                    </div>
                </div>

            {/* Main Table */}
            <table className="w-full text-left border-collapse mb-10">
                <thead>
                    <tr className="bg-[#1a365d] text-white text-[9px] uppercase">
                        <th className="py-2 px-4 rounded-tl-lg">Categoria</th>
                        <th className="py-2 px-4 text-right">Previsto</th>
                        <th className="py-2 px-4 text-right">Realizado</th>
                        <th className="py-2 px-4 text-right rounded-tr-lg">Var %</th>
                    </tr>
                </thead>
                <tbody className="text-[10px]">
                    <tr className="bg-emerald-50"><td colSpan={4} className="py-1.5 px-4 font-black text-emerald-700">ENTRADAS</td></tr>
                    {categoriesIn.map((cat: string) => (
                        <tr key={cat} className="border-b border-slate-50">
                            <td className="py-2 px-4 text-slate-600">{cat}</td>
                            <td className="py-2 px-4 text-right">{formatCurrency(stats.in[cat].prev)}</td>
                            <td className="py-2 px-4 text-right">{formatCurrency(stats.in[cat].real)}</td>
                            <td className="py-2 px-4 text-right font-bold">{formatVarPercent(stats.in[cat].prev, stats.in[cat].real)}</td>
                        </tr>
                    ))}
                    <tr className="bg-emerald-500/10 font-bold">
                        <td className="py-2 px-4">TOTAL ENTRADAS</td>
                        <td className="py-2 px-4 text-right">{formatCurrency(stats.totalInPrev)}</td>
                        <td className="py-2 px-4 text-right">{formatCurrency(stats.totalInReal)}</td>
                        <td className="py-2 px-4 text-right">{formatVarPercent(stats.totalInPrev, stats.totalInReal)}</td>
                    </tr>
                    
                    <tr className="bg-rose-50"><td colSpan={4} className="py-1.5 px-4 font-black text-rose-700">SAÍDAS</td></tr>
                    {categoriesOut.map((cat: string) => (
                        <tr key={cat} className="border-b border-slate-50">
                            <td className="py-2 px-4 text-slate-600">{cat}</td>
                            <td className="py-2 px-4 text-right">{formatCurrency(stats.out[cat].prev)}</td>
                            <td className="py-2 px-4 text-right">{formatCurrency(stats.out[cat].real)}</td>
                            <td className="py-2 px-4 text-right font-bold">{formatVarPercent(stats.out[cat].prev, stats.out[cat].real)}</td>
                        </tr>
                    ))}
                    <tr className="bg-rose-500/10 font-bold">
                        <td className="py-2 px-4">TOTAL SAÍDAS</td>
                        <td className="py-2 px-4 text-right">{formatCurrency(stats.totalOutPrev)}</td>
                        <td className="py-2 px-4 text-right">{formatCurrency(stats.totalOutReal)}</td>
                        <td className="py-2 px-4 text-right">{formatVarPercent(stats.totalOutPrev, stats.totalOutReal)}</td>
                    </tr>
                </tbody>
            </table>

            {/* Projection Indicators */}
            <div className="mb-4">
                <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Projeção Próximos 90 Dias</h3>
                <div className="grid grid-cols-3 gap-3">
                    {projection.map((proj: any, idx: number) => {
                        const monthDate = new Date(year, mPart - 1 + idx + 1, 1);
                        const monthName = monthDate.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase();
                        return (
                            <div key={idx} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-[7px] font-bold text-slate-400 uppercase mb-1">{monthName}</p>
                                <p className="text-[10px] font-black">{formatCurrency(proj.totalInPrev - proj.totalOutPrev)}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer */}
            <div className="mt-12 pt-8 flex justify-between items-center text-[8px] font-bold text-slate-400 uppercase tracking-widest border-t border-slate-100">
                <span>Relatório Gerado via Fluxo Inteligente BPO Premium</span>
                <span>Página 1 de 1</span>
            </div>
        </div>
    );
};
