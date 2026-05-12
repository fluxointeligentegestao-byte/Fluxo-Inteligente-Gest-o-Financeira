import React, { useState, useEffect, useRef } from 'react';
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer, 
    LineChart, 
    Line, 
    PieChart, 
    Pie, 
    Cell,
    Legend,
    AreaChart,
    Area,
    ComposedChart
} from 'recharts';
import { 
    LayoutDashboard, 
    Settings, 
    Filter, 
    Calendar, 
    TrendingUp, 
    TrendingDown, 
    Target, 
    DollarSign, 
    PieChart as PieChartIcon,
    BarChart3,
    CheckCircle2,
    X,
    Plus,
    Maximize2,
    RefreshCw,
    Download,
    Eye,
    Calculator,
    ArrowUpRight,
    ArrowDownRight,
    Wallet
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
    collection, 
    query, 
    onSnapshot, 
    orderBy 
} from 'firebase/firestore';
import { UNIVERSAL_CHART_OF_ACCOUNTS } from '../constants/financial';

// --- Types ---
interface Widget {
    id: string;
    title: string;
    type: 'metric' | 'chart_line' | 'chart_bar' | 'chart_pie' | 'chart_combo' | 'chart_margin' | 'summary_table';
    visible: boolean;
    w: number; // grid width (1-4 or 6 for full row special)
}

const COLORS = ['#1a365d', '#ef4444', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'];
const DASHBOARD_DARK = '#1a365d';

// --- Metric Card Inspired by Image ---
const MetricCard = ({ 
    title, 
    value, 
    variation, 
    isPositive, 
    icon: Icon,
    isPrint = false 
}: { 
    title: string; 
    value: string; 
    variation: string; 
    isPositive: boolean; 
    icon: any;
    isPrint?: boolean;
}) => {
    return (
        <div className={cn(
            "relative p-3 bg-white border-slate-200 h-full flex flex-col justify-between border",
            !isPrint && "hover:shadow-md transition-shadow",
        )}>
            {/* Header: Title */}
            <div className="flex justify-center items-center mb-1">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest text-center leading-tight break-words">{title}</span>
            </div>

            {/* Value */}
            <div className="text-center my-1">
                <p className="text-xl font-black text-slate-900 tracking-tight leading-none">{value}</p>
            </div>

            {/* Variation */}
            <div className={cn(
                "flex items-center justify-center gap-0.5 text-[9px] font-bold",
                isPositive ? "text-emerald-500" : "text-rose-500"
            )}>
                {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {variation}
            </div>
        </div>
    );
};

// --- Section Header Helper ---
const SectionHeader = ({ number, title }: { number: string; title: string }) => (
    <div className="bg-[#1a365d] text-white px-3 py-1.5 flex items-center gap-2 mb-4">
        <span className="font-black text-xs">{number}.</span>
        <h3 className="font-black text-[11px] uppercase tracking-[0.2em]">{title}</h3>
    </div>
);

// --- DRE Table Row Helper ---
interface DRERowProps {
    label: string;
    current: string;
    previous: string;
    variation: string;
    isBold?: boolean;
    isNegative?: boolean;
    color?: "slate" | "emerald" | "rose" | "dark";
    key?: React.Key;
}

const DRERow = ({ 
    label, 
    current, 
    previous, 
    variation, 
    isBold = false, 
    isNegative = false,
    color = "slate"
}: DRERowProps) => {
    const textColor = isBold ? (color === "dark" ? "text-slate-900" : `text-${color}-600`) : "text-slate-600";
    const varColor = variation.includes("-") ? "text-rose-500" : variation === "—" ? "text-slate-300" : "text-emerald-500";
    
    return (
        <tr className={cn(
            "border-b border-slate-100",
            isBold && "bg-slate-50/30"
        )}>
            <td className={cn("py-2 px-4 text-left text-[10px]", isBold ? "font-black text-slate-900" : "font-medium text-slate-600")}>{label}</td>
            <td className={cn("py-2 px-4 text-center text-[10px] font-black", textColor)}>{current}</td>
            <td className="py-2 px-4 text-center text-[10px] font-bold text-slate-400">{previous}</td>
            <td className={cn("py-2 px-4 text-center text-[10px] font-black", varColor)}>{variation}</td>
        </tr>
    );
};

// --- Main Integration ---
export const ReportsDashboard = ({ clientId, clientName }: { clientId: string; clientName: string }) => {
    const [isCustomizing, setIsCustomizing] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const dashboardRef = useRef<HTMLDivElement>(null);
    const printRef = useRef<HTMLDivElement>(null);
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(val);
    };

    const [activeFilters, setActiveFilters] = useState({
        period: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        category: 'all',
        type: 'all',
        view: 'complet'
    });

    useEffect(() => {
        if (!clientId) return;
        setLoading(true);
        const path = `financialAgenda/${clientId}/entries`;
        const q = query(collection(db, path), orderBy('date', 'desc'));

        const unsubscribe = onSnapshot(q, (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setEntries(list);
            setLoading(false);
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, path);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [clientId]);

    const getMetrics = (monthYear: string) => {
        const [year, month] = monthYear.split('-');
        const monthYearStr = `${year}-${month}`;
        
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        date.setMonth(date.getMonth() - 1);
        const prevMonthYearStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        const currentMonthEntries = entries.filter(e => e.month === monthYearStr && (e.status === 'Pago' || e.status === 'Recebido' || e.status === 'Conciliado'));
        const prevMonthEntries = entries.filter(e => e.month === prevMonthYearStr && (e.status === 'Pago' || e.status === 'Recebido' || e.status === 'Conciliado'));

        const sumByAccounts = (list: any[], codes: string[]) => {
            return list.filter(e => {
                const acc = UNIVERSAL_CHART_OF_ACCOUNTS.find(a => a.id === e.accountId);
                if (!acc) return false;
                return codes.some(code => acc.code.startsWith(code));
            }).reduce((acc, curr) => acc + curr.value, 0);
        };

        const calcVar = (curr: number, prev: number) => {
            if (prev === 0) return curr === 0 ? '0%' : '100.0%';
            const v = ((curr - prev) / Math.abs(prev)) * 100;
            return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`.replace('.', ',');
        };

        const formatC = (val: number) => formatCurrency(val);

        // Calculations Current
        const revTotal = sumByAccounts(currentMonthEntries, ['1.1', '1.2']);
        const ded = sumByAccounts(currentMonthEntries, ['1.3', '1.4']);
        const netRev = revTotal - ded;
        const costs = sumByAccounts(currentMonthEntries, ['2']);
        const lb = netRev - costs;
        const desp = sumByAccounts(currentMonthEntries, ['3']);
        const ebitda = lb - desp;
        const recFin = sumByAccounts(currentMonthEntries, ['4.2']);
        const despFin = sumByAccounts(currentMonthEntries, ['4.1']);
        const trib = sumByAccounts(currentMonthEntries, ['5']);
        const ll = ebitda + recFin - despFin - trib;

        // Calculations Prev
        const pRevTotal = sumByAccounts(prevMonthEntries, ['1.1', '1.2']);
        const pDed = sumByAccounts(prevMonthEntries, ['1.3', '1.4']);
        const pNetRev = pRevTotal - pDed;
        const pCosts = sumByAccounts(prevMonthEntries, ['2']);
        const pLb = pNetRev - pCosts;
        const pDesp = sumByAccounts(prevMonthEntries, ['3']);
        const pEbitda = pLb - pDesp;
        const pRecFin = sumByAccounts(prevMonthEntries, ['4.2']);
        const pDespFin = sumByAccounts(prevMonthEntries, ['4.1']);
        const pTrib = sumByAccounts(prevMonthEntries, ['5']);
        const pLl = pEbitda + pRecFin - pDespFin - pTrib;

        return {
            dre: [
                { label: 'Receita Bruta', current: formatC(revTotal), previous: formatC(pRevTotal), variation: calcVar(revTotal, pRevTotal), bold: false, color: "emerald" as const },
                { label: '(-) Impostos / Deduções', current: formatC(-ded), previous: `(${formatC(pDed)})`, variation: calcVar(ded, pDed), bold: false, color: "rose" as const },
                { label: 'Receita Líquida', current: formatC(netRev), previous: formatC(pNetRev), variation: calcVar(netRev, pNetRev), bold: true, color: "dark" as const },
                { label: '(-) Custos Diretos', current: formatC(-costs), previous: formatC(-pCosts), variation: calcVar(costs, pCosts), bold: false },
                { label: 'Lucro Bruto', current: formatC(lb), previous: formatC(pLb), variation: calcVar(lb, pLb), bold: true, color: "dark" as const },
                { label: '(-) Desp. Operacionais', current: formatC(-desp), previous: `(${formatC(pDesp)})`, variation: calcVar(desp, pDesp), bold: false, color: "rose" as const },
                { label: 'EBITDA', current: formatC(ebitda), previous: formatC(pEbitda), variation: calcVar(ebitda, pEbitda), bold: true, color: "emerald" as const },
                { label: 'Resultado Financeiro', current: formatC(recFin - despFin), previous: formatC(pRecFin - pDespFin), variation: calcVar(recFin - despFin, pRecFin - pDespFin), bold: false },
                { label: '(-) IRPJ / CSLL', current: formatC(-trib), previous: `(${formatC(pTrib)})`, variation: calcVar(trib, pTrib), bold: false, color: "rose" as const },
                { label: 'Lucro Líquido', current: formatC(ll), previous: formatC(pLl), variation: calcVar(ll, pLl), bold: true, color: "emerald" as const },
            ],
            metrics: {
                revenue: revTotal,
                ebitda: ebitda,
                ll: ll,
                margin: revTotal > 0 ? (ll / revTotal) * 100 : 0
            }
        };
    };

    const periodData = getMetrics(activeFilters.period);
    const dreData = periodData.dre;

    // Cash Flow Months (Full Year)
    const year = activeFilters.period.split('-')[0];
    const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const cashFlowMonths = monthLabels.map((m, i) => {
        const mStr = `${year}-${String(i + 1).padStart(2, '0')}`;
        const mEntries = entries.filter(e => e.month === mStr && (e.status === 'Pago' || e.status === 'Recebido' || e.status === 'Conciliado'));
        const incoming = mEntries.filter(e => e.type === 'Receita').reduce((acc, curr) => acc + curr.value, 0);
        const outgoing = mEntries.filter(e => e.type === 'Despesa').reduce((acc, curr) => acc + curr.value, 0);
        return {
            month: m,
            in: formatCurrency(incoming),
            out: formatCurrency(outgoing),
            res: formatCurrency(incoming - outgoing)
        };
    });

    const evolutionData = monthLabels.map((m, i) => {
        const mStr = `${year}-${String(i + 1).padStart(2, '0')}`;
        const mEntries = entries.filter(e => e.month === mStr && (e.status === 'Pago' || e.status === 'Recebido' || e.status === 'Conciliado'));
        const incoming = mEntries.filter(e => e.type === 'Receita').reduce((acc, curr) => acc + curr.value, 0);
        const outgoing = mEntries.filter(e => e.type === 'Despesa').reduce((acc, curr) => acc + curr.value, 0);
        return {
            name: m,
            entries: incoming,
            exits: outgoing,
            saldo: incoming - outgoing
        };
    });

    // Pie Data - Despesas por Grupo
    const currentMonthEntries = entries.filter(e => e.month === activeFilters.period && (e.status === 'Pago' || e.status === 'Recebido' || e.status === 'Conciliado') && e.type === 'Despesa');
    const expensesByGroupMap: Record<string, number> = {};
    currentMonthEntries.forEach(e => {
        const acc = UNIVERSAL_CHART_OF_ACCOUNTS.find(a => a.id === e.accountId);
        const group = acc?.group || 'Outros';
        expensesByGroupMap[group] = (expensesByGroupMap[group] || 0) + e.value;
    });
    const pieData = Object.entries(expensesByGroupMap).map(([name, value]) => ({ name, value }));

    const handleDownload = async () => {
        const element = printRef.current;
        if (!element) return;
        
        setIsDownloading(true);
        try {
            element.style.display = 'block';
            
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                onclone: (doc) => {
                    const clonedElement = doc.getElementById('print-container');
                    if (clonedElement) {
                        clonedElement.style.display = 'block';
                    }
                }
            });
            
            element.style.display = 'none';
            
            const imgData = canvas.toDataURL('image/png', 1.0);
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });
            
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            // Handle multi-page if height exceeds A4
            let heightLeft = pdfHeight;
            let position = 0;
            const pageHeight = pdf.internal.pageSize.getHeight();

            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight, undefined, 'FAST');
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight, undefined, 'FAST');
                heightLeft -= pageHeight;
            }

            pdf.save(`Relatorio_Mensal_${clientName.replace(/\s+/g, '_')}.pdf`);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setIsDownloading(false);
        }
    };

    const ReportContent = ({ isPrint = false }) => (
        <div className={cn(
            "bg-white font-sans text-slate-900 mx-auto",
            isPrint ? "w-[800px] p-8" : "w-full p-4 md:p-8"
        )} id="print-content">
            {/* Report Header */}
            <header className="mb-8 border-b-2 border-[#1a365d] pb-2">
                <h1 className="text-2xl font-black text-[#1a365d] uppercase tracking-tight">Relatório Mensal</h1>
                <div className="flex justify-between items-end mt-1">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Demonstração do Resultado · Visão Executiva</p>
                        <p className="text-[10px] font-black text-slate-600 uppercase mt-0.5">Cliente: {clientName}</p>
                    </div>
                    <p className="text-xs font-black text-[#1a365d] uppercase">{activeFilters.period.split('-')[1] === '01' ? 'JANEIRO' : activeFilters.period.split('-')[1] === '02' ? 'FEVEREIRO' : activeFilters.period.split('-')[1] === '03' ? 'MARÇO' : activeFilters.period.split('-')[1] === '04' ? 'ABRIL' : activeFilters.period.split('-')[1] === '05' ? 'MAIO' : activeFilters.period.split('-')[1] === '06' ? 'JUNHO' : activeFilters.period.split('-')[1] === '07' ? 'JULHO' : activeFilters.period.split('-')[1] === '08' ? 'AGOSTO' : activeFilters.period.split('-')[1] === '09' ? 'SETEMBRO' : activeFilters.period.split('-')[1] === '10' ? 'OUTUBRO' : activeFilters.period.split('-')[1] === '11' ? 'NOVEMBRO' : 'DEZEMBRO'} / {activeFilters.period.split('-')[0]}</p>
                </div>
            </header>

            {/* 1. RESUMO EXECUTIVO */}
            <section className="mb-8">
                <SectionHeader number="1" title="Resumo Executivo" />
                <div className="grid grid-cols-4 gap-0 border-r border-b border-slate-200">
                    <MetricCard title="Receita Bruta" value={formatCurrency(periodData.metrics.revenue).replace('R$ ', '')} variation={periodData.dre[0].variation} isPositive={!periodData.dre[0].variation.includes('-')} icon={BarChart3} isPrint={isPrint} />
                    <MetricCard title="Lucro Bruto" value={dreData[4].current.replace('R$ ', '')} variation={dreData[4].variation} isPositive={!dreData[4].variation.includes('-')} icon={TrendingUp} isPrint={isPrint} />
                    <MetricCard title="EBITDA" value={formatCurrency(periodData.metrics.ebitda).replace('R$ ', '')} variation={periodData.dre[6].variation} isPositive={!periodData.dre[6].variation.includes('-')} icon={TrendingUp} isPrint={isPrint} />
                    <MetricCard title="Lucro Líquido" value={formatCurrency(periodData.metrics.ll).replace('R$ ', '')} variation={periodData.dre[9].variation} isPositive={!periodData.dre[9].variation.includes('-')} icon={LayoutDashboard} isPrint={isPrint} />
                    <MetricCard title="Receita Líquida" value={dreData[2].current.replace('R$ ', '')} variation={dreData[2].variation} isPositive={!dreData[2].variation.includes('-')} icon={DollarSign} isPrint={isPrint} />
                    <MetricCard title="Margem Líquida" value={`${periodData.metrics.margin.toFixed(1).replace('.', ',')}%`} variation="—" isPositive={true} icon={PieChartIcon} isPrint={isPrint} />
                    <MetricCard title="Margem EBITDA" value={`${(periodData.metrics.revenue > 0 ? (periodData.metrics.ebitda / periodData.metrics.revenue) * 100 : 0).toFixed(1).replace('.', ',')}%`} variation="—" isPositive={true} icon={TrendingUp} isPrint={isPrint} />
                    <MetricCard title="Fluxo de Caixa" value={formatCurrency(evolutionData.find(d => d.name === monthLabels[parseInt(activeFilters.period.split('-')[1]) - 1])?.saldo || 0).replace('R$ ', '')} variation="—" isPositive={(evolutionData.find(d => d.name === monthLabels[parseInt(activeFilters.period.split('-')[1]) - 1])?.saldo || 0) >= 0} icon={Wallet} isPrint={isPrint} />
                </div>
            </section>

            {/* 2. CONTAS A RECEBER */}
            <section className="mb-8">
                <SectionHeader number="2" title="Contas a Receber" />
                <div className="grid grid-cols-4 gap-0 border-r border-b border-slate-200">
                    <div className="p-4 border-l border-t border-slate-200 text-center">
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">A Receber</p>
                        <p className="text-xl font-black text-slate-900">{formatCurrency(entries.filter(e => e.type === 'Receita' && e.status === 'Pendente').reduce((acc, curr) => acc + curr.value, 0)).replace('R$ ', '')}</p>
                    </div>
                    <div className="p-4 border-l border-t border-slate-200 text-center">
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Vencido</p>
                        <p className="text-xl font-black text-rose-500">{formatCurrency(entries.filter(e => e.type === 'Receita' && e.status === 'Vencido').reduce((acc, curr) => acc + curr.value, 0)).replace('R$ ', '')}</p>
                    </div>
                    <div className="p-4 border-l border-t border-slate-200 text-center">
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Recebido no Mês</p>
                        <p className="text-xl font-black text-emerald-500">{formatCurrency(entries.filter(e => e.month === activeFilters.period && e.type === 'Receita' && (e.status === 'Recebido' || e.status === 'Conciliado')).reduce((acc, curr) => acc + curr.value, 0)).replace('R$ ', '')}</p>
                    </div>
                    <div className="p-4 border-l border-t border-slate-200 text-center">
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">% Inadimplência</p>
                        <p className="text-xl font-black text-slate-900">
                            {(() => {
                                const total = entries.filter(e => e.type === 'Receita').reduce((acc, curr) => acc + curr.value, 0);
                                const vencido = entries.filter(e => e.type === 'Receita' && e.status === 'Vencido').reduce((acc, curr) => acc + curr.value, 0);
                                return total > 0 ? ((vencido / total) * 100).toFixed(1).replace('.', ',') + '%' : '0,0%';
                            })()}
                        </p>
                    </div>
                </div>
            </section>

            {/* 3. CONTAS A PAGAR */}
            <section className="mb-8">
                <SectionHeader number="3" title="Contas a Pagar" />
                <div className="grid grid-cols-4 gap-0 border-r border-b border-slate-200">
                    <div className="p-4 border-l border-t border-slate-200 text-center">
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">A Pagar</p>
                        <p className="text-xl font-black text-slate-900">{formatCurrency(entries.filter(e => e.type === 'Despesa' && e.status === 'Pendente').reduce((acc, curr) => acc + curr.value, 0)).replace('R$ ', '')}</p>
                    </div>
                    <div className="p-4 border-l border-t border-slate-200 text-center">
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Em Atraso</p>
                        <p className="text-xl font-black text-rose-500">{formatCurrency(entries.filter(e => e.type === 'Despesa' && e.status === 'Vencido').reduce((acc, curr) => acc + curr.value, 0)).replace('R$ ', '')}</p>
                    </div>
                    <div className="p-4 border-l border-t border-slate-200 text-center">
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Pago no Mês</p>
                        <p className="text-xl font-black text-emerald-500">{formatCurrency(entries.filter(e => e.month === activeFilters.period && e.type === 'Despesa' && (e.status === 'Pago' || e.status === 'Conciliado')).reduce((acc, curr) => acc + curr.value, 0)).replace('R$ ', '')}</p>
                    </div>
                    <div className="p-4 border-l border-t border-slate-200 text-center">
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">% Atraso</p>
                        <p className="text-xl font-black text-slate-900">
                            {(() => {
                                const total = entries.filter(e => e.type === 'Despesa').reduce((acc, curr) => acc + curr.value, 0);
                                const atraso = entries.filter(e => e.type === 'Despesa' && e.status === 'Vencido').reduce((acc, curr) => acc + curr.value, 0);
                                return total > 0 ? ((atraso / total) * 100).toFixed(1).replace('.', ',') + '%' : '0,0%';
                            })()}
                        </p>
                    </div>
                </div>
            </section>

            {/* 4. CONCILIAÇÃO BANCÁRIA */}
            <section className="mb-8">
                <SectionHeader number="4" title="Conciliação Bancária" />
                <div className="grid grid-cols-4 gap-0 border-r border-b border-slate-200">
                     <div className="p-4 border-l border-t border-slate-200 text-center">
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Saldo Extrato</p>
                        <p className="text-xl font-black text-slate-900">-</p>
                        <p className="text-[8px] font-medium text-slate-400 mt-1 uppercase tracking-tighter">Banco Itaú</p>
                    </div>
                    <div className="p-4 border-l border-t border-slate-200 text-center">
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Saldo Sistema</p>
                        <p className="text-xl font-black text-slate-900">12.950</p>
                        <p className="text-[8px] font-medium text-amber-600 mt-1 uppercase font-bold tracking-tighter">0 itens não conciliados</p>
                    </div>
                    <div className="p-4 border-l border-t border-slate-200 text-center">
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Diferença</p>
                        <p className="text-xl font-black text-rose-500">(12.950)</p>
                    </div>
                    <div className="p-4 border-l border-t border-slate-200 text-center">
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Status</p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                            <X size={14} className="text-rose-500" />
                            <p className="text-sm font-black text-rose-500 uppercase">Divergente</p>
                        </div>
                    </div>
                </div>
                
                {/* Cash Flow Chart */}
                <div className="mt-8 bg-white border border-slate-200 p-6">
                    <h4 className="text-center font-black text-slate-800 text-sm mb-4">Fluxo de Caixa Mensal</h4>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={evolutionData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} />
                                <Legend iconType="rect" wrapperStyle={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', paddingTop: '20px' }} />
                                <Bar dataKey="entries" name="Entradas" fill="#10b981" barSize={15} />
                                <Bar dataKey="exits" name="Saídas" fill="#ef4444" barSize={15} />
                                <Line type="monotone" dataKey="saldo" name="Saldo Final" stroke="#1a365d" strokeWidth={3} dot={{ r: 4, fill: '#1a365d' }} isAnimationActive={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>

            {/* 5. DRE RESUMIDA */}
            <section className="mb-8 overflow-hidden">
                <SectionHeader number="5" title="DRE Resumida — Comparativo Mensal" />
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-[#1a365d] text-white">
                            <th className="py-2 px-4 text-left text-[10px] uppercase font-black tracking-widest">Descrição</th>
                            <th className="py-2 px-4 text-center text-[10px] uppercase font-black tracking-widest">{activeFilters.period.split('-')[1] === '01' ? 'JAN' : activeFilters.period.split('-')[1] === '02' ? 'FEV' : activeFilters.period.split('-')[1] === '03' ? 'MAR' : activeFilters.period.split('-')[1] === '04' ? 'ABR' : activeFilters.period.split('-')[1] === '05' ? 'MAI' : activeFilters.period.split('-')[1] === '06' ? 'JUN' : activeFilters.period.split('-')[1] === '07' ? 'JUL' : activeFilters.period.split('-')[1] === '08' ? 'AGO' : activeFilters.period.split('-')[1] === '09' ? 'SET' : activeFilters.period.split('-')[1] === '10' ? 'OUT' : activeFilters.period.split('-')[1] === '11' ? 'NOV' : 'DEZ'}/{activeFilters.period.split('-')[0]}</th>
                            <th className="py-2 px-4 text-center text-[10px] uppercase font-black tracking-widest">MÊS ANTERIOR</th>
                            <th className="py-2 px-4 text-center text-[10px] uppercase font-black tracking-widest">Var. %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dreData.map((row, i) => (
                            <DRERow 
                                key={i}
                                label={row.label}
                                current={row.current}
                                previous={row.previous}
                                variation={row.variation}
                                isBold={row.bold}
                                color={row.color || "slate"}
                            />
                        ))}
                    </tbody>
                </table>
            </section>

            {/* 6. FLUXO DE CAIXA — Resumo Mensal */}
            <section className="mb-8">
                <SectionHeader number="6" title="Fluxo de Caixa — Resumo Mensal" />
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-[#1a365d] text-white">
                            <th className="py-2 px-4 text-center text-[10px] uppercase font-black tracking-widest w-24">Mês</th>
                            <th className="py-2 px-4 text-center text-[10px] uppercase font-black tracking-widest">Entradas (R$)</th>
                            <th className="py-2 px-4 text-center text-[10px] uppercase font-black tracking-widest">Saídas (R$)</th>
                            <th className="py-2 px-4 text-center text-[10px] uppercase font-black tracking-widest">Resultado (R$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cashFlowMonths.map((row, i) => (
                            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="py-2 px-4 text-center text-[11px] font-bold text-slate-800">{row.month}</td>
                                <td className="py-2 px-4 text-center text-[11px] font-bold text-emerald-600">{row.in}</td>
                                <td className="py-2 px-4 text-center text-[11px] font-bold text-rose-500">{row.out}</td>
                                <td className={cn(
                                    "py-2 px-4 text-center text-[11px] font-black underline decoration-slate-200 underline-offset-4",
                                    row.res.startsWith("-") ? "text-rose-600 bg-rose-50/30" : "text-emerald-700 bg-emerald-50/30"
                                )}>{row.res}</td>
                            </tr>
                        ))}
                        <tr className="bg-[#0f172a] text-white">
                            <td className="py-3 px-4 text-center text-[11px] font-black uppercase tracking-widest">Total Ano</td>
                            <td className="py-3 px-4 text-center text-[11px] font-black tracking-widest">415.012,30</td>
                            <td className="py-3 px-4 text-center text-[11px] font-black tracking-widest">376.276,89</td>
                            <td className="py-3 px-4 text-center text-[11px] font-black tracking-widest text-emerald-400">38.735,41</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <footer className="mt-12 text-center text-[9px] font-bold text-slate-300 uppercase tracking-[0.3em] flex justify-between items-center">
                <span>Relatório gerado automaticamente pelo sistema BPO Financeiro</span>
                <span>Dados integrados das abas operacionais</span>
            </footer>
        </div>
    );

    return (
        <div className="space-y-6 pb-20 max-w-[1400px] mx-auto">
            {/* Control Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm no-print">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 px-4 py-1.5 rounded-lg border border-slate-200">
                        <Calendar size={14} className="text-slate-400" />
                        <select 
                            value={activeFilters.period}
                            onChange={(e) => setActiveFilters({...activeFilters, period: e.target.value})}
                            className="bg-transparent text-[11px] font-black text-slate-700 uppercase tracking-widest outline-none cursor-pointer"
                        >
                            <option value="2024-04">Abril/2026</option>
                            <option value="2024-03">Março/2026</option>
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" className="rounded-lg h-9" onClick={() => setIsPreviewOpen(true)}>
                        <Eye size={14} className="mr-2" /> Visualizar
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-lg h-9" onClick={handleDownload} disabled={isDownloading}>
                        <Download size={14} className={cn("mr-2", isDownloading && "animate-bounce")} /> 
                        {isDownloading ? 'Gerando...' : 'Baixar PDF'}
                    </Button>
                </div>
            </div>

            {/* Dashboard View - Now showing the Report Content itself */}
            <div ref={dashboardRef} className="bg-slate-100/50 p-4 rounded-2xl border border-slate-200">
                <ReportContent />
            </div>

            {/* Hidden Print Content */}
            <div style={{ position: 'fixed', top: '-10000px', left: '-10000px', width: '800px', display: 'none' }} ref={printRef} id="print-container">
                <ReportContent isPrint />
            </div>

            {/* Preview Modal */}
            <AnimatePresence>
                {isPreviewOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 no-print">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-5xl h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                            <div className="flex items-center justify-between p-4 border-b border-slate-100">
                                <h3 className="font-black text-slate-900 uppercase tracking-tight">Visualização de Impressão</h3>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={handleDownload} disabled={isDownloading}>
                                        <Download size={14} className="mr-2" /> Baixar PDF
                                    </Button>
                                    <button onClick={() => setIsPreviewOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto p-4 md:p-12 bg-slate-100/30">
                                <div className="bg-white shadow-2xl mx-auto w-[850px] min-h-[1100px] border border-slate-200">
                                    <ReportContent isPrint />
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

