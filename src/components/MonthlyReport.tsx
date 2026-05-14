import React, { useState, useEffect, useRef, useMemo } from 'react';
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
    orderBy,
    where
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
            <div className="flex justify-center items-center mb-1">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest text-center leading-tight break-words">{title}</span>
            </div>
            <div className="text-center my-1">
                <p className="text-xl font-black text-slate-900 tracking-tight leading-none">{value}</p>
            </div>
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
            isBold && "bg-slate-50"
        )}>
            <td className={cn("py-2 px-4 text-left text-[10px]", isBold ? "font-black text-slate-900" : "font-medium text-slate-600")}>{label}</td>
            <td className={cn("py-2 px-4 text-center text-[10px] font-black", textColor)}>{current}</td>
            <td className="py-2 px-4 text-center text-[10px] font-bold text-slate-400">{previous}</td>
            <td className={cn("py-2 px-4 text-center text-[10px] font-black", varColor)}>{variation}</td>
        </tr>
    );
};

export const MonthlyReport = ({ clientId, clientName }: { clientId: string; clientName: string }) => {
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
        startDate: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`,
        endDate: new Date().toISOString().split('T')[0],
        category: 'all',
        type: 'all',
        view: 'complet'
    });

    useEffect(() => {
        if (!clientId) return;
        setLoading(true);
        const path = 'transactions';
        const q = query(collection(db, path), where('clientId', '==', clientId), orderBy('dueDate', 'desc'));

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

    const getMetrics = (start: string, end: string) => {
        const currentEntries = entries.filter(e => {
            const date = e.dueDate || e.date || e.month;
            return date >= start && date <= end;
        });

        const startDate = new Date(start);
        const endDate = new Date(end);
        const duration = endDate.getTime() - startDate.getTime();
        const prevEndDate = new Date(startDate.getTime() - (24 * 60 * 60 * 1000));
        const prevStartDate = new Date(prevEndDate.getTime() - duration);
        const pStart = prevStartDate.toISOString().split('T')[0];
        const pEnd = prevEndDate.toISOString().split('T')[0];

        const prevEntries = entries.filter(e => {
            const date = e.dueDate || e.date || e.month;
            return date >= pStart && date <= pEnd;
        });

        const sumByAccounts = (list: any[], codes: string[]) => {
            return list.filter(e => {
                let acc = UNIVERSAL_CHART_OF_ACCOUNTS.find(a => a.id === e.accountId);
                
                // Fallback for missing accountId: try to find by category name string match
                if (!acc && e.category) {
                    acc = UNIVERSAL_CHART_OF_ACCOUNTS.find(a => 
                        a.name.toLowerCase() === e.category.toLowerCase() ||
                        a.group.toLowerCase() === e.category.toLowerCase()
                    );
                }

                if (!acc) return false;
                return codes.some(code => acc!.code.startsWith(code));
            }).reduce((acc, curr) => acc + (curr.originalValue || curr.value || 0), 0);
        };

        const calcVar = (curr: number, prev: number) => {
            if (prev === 0) return curr === 0 ? '0%' : '100.0%';
            const v = ((curr - prev) / Math.abs(prev)) * 100;
            return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`.replace('.', ',');
        };

        const revTotal = sumByAccounts(currentEntries, ['1.1', '1.2']);
        const ded = sumByAccounts(currentEntries, ['1.3', '1.4']);
        const netRev = revTotal - ded;
        const costs = sumByAccounts(currentEntries, ['2']);
        const lb = netRev - costs;
        const desp = sumByAccounts(currentEntries, ['3']);
        const ebitda = lb - desp;
        const recFin = sumByAccounts(currentEntries, ['4.2']);
        const despFin = sumByAccounts(currentEntries, ['4.1']);
        const trib = sumByAccounts(currentEntries, ['5']);
        const ll = ebitda + recFin - despFin - trib;

        const pRevTotal = sumByAccounts(prevEntries, ['1.1', '1.2']);
        const pDed = sumByAccounts(prevEntries, ['1.3', '1.4']);
        const pNetRev = pRevTotal - pDed;
        const pCosts = sumByAccounts(prevEntries, ['2']);
        const pLb = pNetRev - pCosts;
        const pDesp = sumByAccounts(prevEntries, ['3']);
        const pEbitda = pLb - pDesp;
        const pRecFin = sumByAccounts(prevEntries, ['4.2']);
        const pDespFin = sumByAccounts(prevEntries, ['4.1']);
        const pTrib = sumByAccounts(prevEntries, ['5']);
        const pLl = pEbitda + pRecFin - pDespFin - pTrib;

        const formatC = (val: number) => formatCurrency(val);

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

    const periodData = getMetrics(activeFilters.startDate, activeFilters.endDate);
    const dreData = periodData.dre;

    const evolutionData = useMemo(() => {
        const year = activeFilters.startDate.split('-')[0];
        const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        
        return monthLabels.map((m, i) => {
            const mStr = `${year}-${String(i + 1).padStart(2, '0')}`;
            const mEntries = entries.filter(e => {
                const eMonth = e.month || (e.dueDate ? e.dueDate.substring(0, 7) : e.date ? e.date.substring(0, 7) : '');
                return eMonth === mStr;
            });
            const incoming = mEntries.filter(e => e.type === 'receber' || e.type === 'receita').reduce((acc, curr) => acc + (curr.originalValue || curr.value || 0), 0);
            const outgoing = mEntries.filter(e => e.type === 'pagar' || e.type === 'despesa').reduce((acc, curr) => acc + (curr.originalValue || curr.value || 0), 0);
            return {
                name: m,
                entries: incoming,
                exits: outgoing,
                saldo: incoming - outgoing
            };
        });
    }, [entries, activeFilters.startDate]);

    const handleDownload = async () => {
        if (!dashboardRef.current) return;
        setIsDownloading(true);
        try {
            window.scrollTo(0, 0);
            const element = dashboardRef.current;
            const canvas = await html2canvas(element, { 
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                windowWidth: element.scrollWidth,
                onclone: (clonedDoc) => {
                    const el = clonedDoc.querySelector('.print-area') as HTMLElement;
                    if (el) {
                        el.style.width = '1000px';
                        el.style.padding = '20px';
                    }

                    // Workaround: Sanitize oklch colors which html2canvas doesn't support
                    const allElements = clonedDoc.getElementsByTagName('*');
                    for (let i = 0; i < allElements.length; i++) {
                        const node = allElements[i] as HTMLElement;
                        const style = window.getComputedStyle(node);
                        ['color', 'backgroundColor', 'borderColor', 'stroke', 'fill'].forEach(prop => {
                            const val = (node.style as any)[prop] || style.getPropertyValue(prop);
                            if (val && val.includes('oklch')) {
                                (node.style as any)[prop] = ''; // Fallback
                            }
                        });
                    }
                }
            });
            const imgData = canvas.toDataURL('image/png', 1.0);
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });
            
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Relatorio_Mensal_${clientName.replace(/\s+/g, '_')}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Houve um erro ao gerar o PDF. Você pode tentar imprimir a página e salvar como PDF.');
        } finally {
            setIsDownloading(false);
        }
    };

    const ReportContent = ({ isPrint = false }) => (
        <div className={cn("bg-white font-sans text-slate-900 mx-auto", isPrint ? "w-[800px] p-8" : "w-full p-4 md:p-8")} id="print-content">
            <header className="mb-8 border-b-2 border-[#1a365d] pb-2">
                <h1 className="text-2xl font-black text-[#1a365d] uppercase tracking-tight">Relatório Mensal</h1>
                <div className="flex justify-between items-end mt-1">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Visão Executiva Gerencial</p>
                        <p className="text-[10px] font-black text-slate-600 uppercase mt-0.5">Cliente: {clientName}</p>
                    </div>
                    <p className="text-xs font-black text-[#1a365d] uppercase">
                        {new Date(activeFilters.startDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - {new Date(activeFilters.endDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                </div>
            </header>

            <section className="mb-8">
                <SectionHeader number="1" title="Resumo Executivo" />
                <div className="grid grid-cols-4 gap-0 border-r border-b border-slate-200">
                    <MetricCard title="Receita Bruta" value={formatCurrency(periodData.metrics.revenue).replace('R$ ', '')} variation={dreData[0].variation} isPositive={!dreData[0].variation.includes('-')} icon={BarChart3} isPrint={isPrint} />
                    <MetricCard title="Lucro Bruto" value={dreData[4].current.replace('R$ ', '')} variation={dreData[4].variation} isPositive={!dreData[4].variation.includes('-')} icon={TrendingUp} isPrint={isPrint} />
                    <MetricCard title="EBITDA" value={formatCurrency(periodData.metrics.ebitda).replace('R$ ', '')} variation={dreData[6].variation} isPositive={!dreData[6].variation.includes('-')} icon={TrendingUp} isPrint={isPrint} />
                    <MetricCard title="Lucro Líquido" value={formatCurrency(periodData.metrics.ll).replace('R$ ', '')} variation={dreData[9].variation} isPositive={!dreData[9].variation.includes('-')} icon={LayoutDashboard} isPrint={isPrint} />
                </div>
            </section>

            <section className="mb-8">
                <SectionHeader number="2" title="Evolução Financeira" />
                <div className="bg-white border border-slate-200 p-6">
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={evolutionData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} />
                                <Legend iconType="rect" wrapperStyle={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', paddingTop: '10px' }} />
                                <Bar dataKey="entries" name="Entradas" fill="#10b981" barSize={15} />
                                <Bar dataKey="exits" name="Saídas" fill="#ef4444" barSize={15} />
                                <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#1a365d" strokeWidth={3} dot={{ r: 4, fill: '#1a365d' }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>

            <section className="mb-8">
                <SectionHeader number="3" title="DRE Resumida Comparativa" />
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-[#1a365d] text-white">
                            <th className="py-2 px-4 text-left text-[10px] uppercase font-black">Descrição</th>
                            <th className="py-2 px-4 text-center text-[10px] uppercase font-black">Atual</th>
                            <th className="py-2 px-4 text-center text-[10px] uppercase font-black">Anterior</th>
                            <th className="py-2 px-4 text-center text-[10px] uppercase font-black">Var. %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dreData.map((row, i) => (
                            <DRERow key={i} {...row} isBold={row.bold} />
                        ))}
                    </tbody>
                </table>
            </section>

            <footer className="mt-8 text-center text-[9px] font-bold text-slate-300 uppercase tracking-[0.3em]">
                Relatório gerado automaticamente pelo sistema BPO Financeiro
            </footer>
        </div>
    );

    return (
        <div className="space-y-6 pb-20 max-w-[1200px] mx-auto animate-in fade-in duration-500">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    .print-area { padding: 0 !important; margin: 0 !important; width: 100% !important; max-width: none !important; }
                    .card { border: 1px solid #eee !important; box-shadow: none !important; }
                }
            `}</style>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm no-print">
                <div className="flex items-center gap-2 bg-slate-50 px-4 py-1.5 rounded-lg border border-slate-200">
                    <Calendar size={14} className="text-slate-400" />
                    <div className="flex items-center gap-2">
                        <input type="date" value={activeFilters.startDate} onChange={(e) => setActiveFilters({...activeFilters, startDate: e.target.value})} className="bg-transparent text-[11px] font-black outline-none w-28" />
                        <span className="text-[10px] text-slate-300 font-bold">/</span>
                        <input type="date" value={activeFilters.endDate} onChange={(e) => setActiveFilters({...activeFilters, endDate: e.target.value})} className="bg-transparent text-[11px] font-black outline-none w-28" />
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" className="rounded-xl h-10 px-4 text-[10px] font-black uppercase tracking-widest" onClick={handleDownload} disabled={isDownloading}>
                        <Download size={14} className="mr-2 text-primary" /> {isDownloading ? 'Gerando...' : 'Baixar PDF'}
                    </Button>
                    <Button variant="primary" size="sm" className="rounded-xl h-10 px-6 text-[10px] font-black uppercase tracking-widest bg-[#1a365d]" onClick={() => window.print()}>
                        <Eye size={14} className="mr-2" /> Imprimir
                    </Button>
                </div>
            </div>
            <div ref={dashboardRef} className="bg-white border rounded-2xl shadow-sm overflow-hidden print-area">
                <ReportContent />
            </div>
        </div>
    );
};
