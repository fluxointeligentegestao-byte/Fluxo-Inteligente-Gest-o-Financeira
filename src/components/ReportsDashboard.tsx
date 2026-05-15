import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area, ComposedChart, ReferenceLine, LabelList
} from 'recharts';
import { 
    LayoutDashboard, Filter, Calendar, TrendingUp, TrendingDown, Target, DollarSign, 
    PieChart as PieChartIcon, BarChart3, X, Download, Eye, Calculator, ArrowUpRight, 
    ArrowDownRight, Wallet, Info, Activity, Percent, Scale, RefreshCw
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, where } from 'firebase/firestore';
import { UNIVERSAL_CHART_OF_ACCOUNTS } from '../constants/financial';
import { motion } from 'motion/react';

const InsightNote = ({ title, text, color = "blue", emoji }: { title: string, text: string, color?: "blue" | "emerald" | "amber" | "indigo", emoji?: string }) => {
    const configs = {
        blue: "bg-blue-50 border-blue-100 text-blue-600",
        emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
        amber: "bg-amber-50 border-amber-100 text-amber-700",
        indigo: "bg-indigo-50 border-indigo-100 text-indigo-700"
    };
    return (
        <div className={cn("p-4 rounded-[2rem] border flex gap-3 h-full shadow-sm hover:shadow-md transition-shadow", configs[color].split(' ').slice(0,2).join(' '))}>
            <div className="text-xl shrink-0 mt-0.5">{emoji || "💡"}</div>
            <div>
                <p className={cn("text-[9px] font-black uppercase tracking-widest mb-1", configs[color].split(' ').slice(2).join(' '))}>{title}</p>
                <p className="text-[10px] text-slate-600 leading-relaxed font-medium">{text}</p>
            </div>
        </div>
    );
};

const KpiBox = ({ title, value, variation, trend, icon: Icon, subtitle, isCurrency = true, color = "blue", targetValue }: any) => {
    const formatValue = (v: number) => {
        if (!isCurrency) return v.toFixed(1).replace('.', ',') + '%';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
    };

    const colorClasses: Record<string, string> = {
        blue: "text-blue-600 border-blue-500",
        emerald: "text-emerald-600 border-emerald-500",
        rose: "text-rose-600 border-rose-500",
        amber: "text-amber-600 border-amber-500",
        indigo: "text-indigo-600 border-indigo-500",
        slate: "text-slate-600 border-slate-500",
        purple: "text-purple-600 border-purple-500"
    };

    // Elegant soft green and blue border colors
    const borderColors: Record<string, string> = {
        blue: "#3b82f6",
        emerald: "#10b981",
        rose: "#059669", // Soft Green
        amber: "#0d9488", // Teal/Soft Green
        indigo: "#6366f1", // Elegant Blue
        slate: "#64748b", // Soft Blueish Slate
        purple: "#3b82f6" // Soft Blue
    };

    const getStatusPos = (val: number) => {
        if (!isCurrency) return Math.min(Math.max(val * 2.5, 5), 95);
        return 70;
    };

    const statusPos = getStatusPos(value);

    return (
        <div 
            className="p-3 rounded-xl border-l-[4px] flex flex-col justify-between group min-h-[90px] bg-white relative overflow-hidden transition-all hover:translate-y-[-1px] active:translate-y-[1px]"
            style={{ 
                borderLeftColor: borderColors[color],
                borderTopColor: '#f1f5f9',
                borderRightColor: '#f1f5f9',
                borderBottomColor: '#e2e8f0',
                borderTopWidth: '1px',
                borderRightWidth: '1px',
                borderBottomWidth: '2px', // Depth effect
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)'
            }}
        >
            <div className="flex justify-between items-start mb-2">
                <div className="p-1 rounded-lg border border-slate-100" style={{ backgroundColor: '#e8f4ea' }}>
                    <Icon size={12} style={{ color: borderColors[color] }} />
                </div>
            </div>

            <div className="flex items-end justify-between gap-1">
                <div className="flex-1 min-w-0">
                    <h3 className="text-[8.5px] font-black uppercase tracking-widest leading-tight mb-2" style={{ color: '#64748b', whiteSpace: 'normal' }}>{title}</h3>
                    <p className="text-lg font-black tracking-tight leading-none" style={{ color: '#0f172a' }}>{formatValue(value)}</p>
                    {subtitle && <p className="text-[7.5px] font-bold mt-1.5 uppercase tracking-tight leading-tight italic" style={{ color: '#94a3b8' }}>{subtitle}</p>}
                </div>
                
                <div className="flex flex-col items-center gap-1 h-12 w-4 shrink-0">
                    <div className="w-1.5 h-full bg-slate-100 rounded-full relative overflow-visible flex flex-col-reverse goal-bar">
                        <div className="h-[30%] w-full" style={{ backgroundColor: '#fb7185' }} />
                        <div className="h-[30%] w-full" style={{ backgroundColor: '#fbbf24' }} />
                        <div className="h-[40%] w-full" style={{ backgroundColor: '#34d399' }} />
                        
                        {/* Goal Marker with Arrow */}
                        <div 
                            className="absolute left-[-2px] right-[-2px] h-0.5 z-10 rounded-full goal-marker" 
                            style={{ bottom: `${statusPos}%`, backgroundColor: '#0f172a' }} 
                        />
                        <div 
                            className="absolute right-[-4px] z-20 flex items-center translate-y-1/2"
                            style={{ bottom: `${statusPos}%` }}
                        >
                            <div 
                                className="w-0 h-0 border-t-[3px] border-b-[3px] border-r-[4px] border-t-transparent border-b-transparent border-r-[#0f172a]"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const ReportsDashboard = ({ clientId, clientName }: { clientId: string; clientName: string }) => {
    const [entries, setEntries] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDownloading, setIsDownloading] = useState(false);
    const dashboardRef = useRef<HTMLDivElement>(null);
    const [activeFilters, setActiveFilters] = useState({
        startDate: (() => { 
            const d = new Date(); 
            d.setMonth(d.getMonth() - 5); 
            d.setDate(1); 
            return d.toISOString().split('T')[0]; 
        })(),
        endDate: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        if (!clientId) return;
        setLoading(true);

        const transPath = 'transactions';
        const qTrans = query(collection(db, transPath), where('clientId', '==', clientId));
        
        const agendaPath = `financialAgenda/${clientId}/entries`;
        const qAgenda = query(collection(db, agendaPath));

        const accPath = 'chartOfAccounts';
        const qAcc = query(collection(db, accPath), where('clientId', 'in', ['global', clientId]));

        let transDone = false;
        let agendaDone = false;
        let accDone = false;

        let allEntries: any[] = [];

        const checkDone = () => {
            if (transDone && agendaDone && accDone) {
                // Deduplicate and sort
                const uniqueEntries = Array.from(new Map(allEntries.map(e => [e.id, e])).values());
                uniqueEntries.sort((a, b) => {
                    const dA = a.date || a.dueDate || a.month || '';
                    const dB = b.date || b.dueDate || b.month || '';
                    return dA.localeCompare(dB);
                });
                setEntries(uniqueEntries);
                setLoading(false);
            }
        };

        const unsubTrans = onSnapshot(qTrans, (snap) => {
            const list = snap.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                source: 'transactions' 
            }));
            allEntries = [...allEntries.filter(e => e.source !== 'transactions'), ...list];
            transDone = true;
            checkDone();
        }, (error) => { 
            console.error('Error fetching transactions:', error);
            transDone = true;
            checkDone();
        });

        const unsubAgenda = onSnapshot(qAgenda, (snap) => {
            const list = snap.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                source: 'agenda' 
            }));
            allEntries = [...allEntries.filter(e => e.source !== 'agenda'), ...list];
            agendaDone = true;
            checkDone();
        }, (error) => {
            console.error('Error fetching agenda entries:', error);
            agendaDone = true;
            checkDone();
        });

        const unsubAcc = onSnapshot(qAcc, (snap) => {
            setAccounts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            accDone = true;
            checkDone();
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, accPath);
        });

        return () => {
            unsubTrans();
            unsubAgenda();
            unsubAcc();
        };
    }, [clientId]);

    const effectiveAccounts = useMemo(() => {
        // Merge universal accounts with DB accounts (prefer DB if IDs match somehow, but usually they are distinct)
        // Actually, we just need a lookup table
        return [...accounts, ...UNIVERSAL_CHART_OF_ACCOUNTS];
    }, [accounts]);

    const data = useMemo(() => {
        const start = activeFilters.startDate;
        const end = activeFilters.endDate;
        const current = entries.filter(e => {
            const d = e.dueDate || e.date || e.month;
            return d >= start && d <= end;
        });

        const sumCodes = (list: any[], codes: string[]) => list.filter(e => {
            let acc = effectiveAccounts.find(a => a.id === e.accountId);
            
            // Fallback for missing accountId: try string match on category
            if (!acc && e.category) {
                acc = effectiveAccounts.find(a => 
                    a.name.toLowerCase() === e.category.toLowerCase() ||
                    (a.group && a.group.toLowerCase() === e.category.toLowerCase())
                );
            }

            if (acc) {
                return codes.some(c => acc!.code.startsWith(c));
            }
            
            // SECOND FALLBACK: If still no account, used mapped type-based logic for key boxes
            // This ensures values appear even if accounts aren't perfectly mapped
            if (codes.includes('1.1') || codes.includes('1.2')) { // Revenue
                return e.type === 'receita' || e.type === 'receber';
            }
            if (codes.includes('2') || codes.includes('3')) { // Expenses
                return e.type === 'despesa' || e.type === 'pagar';
            }
            if (codes.includes('1.3') || codes.includes('1.4')) { // Deductions
                return false; // Can't guess without account
            }

            return false;
        }).reduce((acc, curr) => acc + (curr.originalValue || curr.value || 0), 0);

        const receitaBruta = sumCodes(current, ['1.1', '1.2']);
        const deducoes = sumCodes(current, ['1.3', '1.4']);
        const netRev = receitaBruta - deducoes;
        const custosDiretos = sumCodes(current, ['2']);
        const lb = netRev - custosDiretos;
        const despesasOp = sumCodes(current, ['3']);
        const ebitda = lb - despesasOp;
        const recFin = sumCodes(current, ['4.2']);
        const desFin = sumCodes(current, ['4.1']);
        const impostos = sumCodes(current, ['5']);
        const ll = ebitda + (recFin - desFin) - impostos;

        const monthGroups: Record<string, any> = {};
        entries.forEach(e => {
            const dStr = e.dueDate || e.date || e.month;
            if (!dStr) return;
            const date = new Date(dStr + 'T12:00:00');
            const label = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase();
            if (!monthGroups[label]) monthGroups[label] = { label, rev: 0, netRev: 0, exp: 0, rawDate: date };
            
            const acc = effectiveAccounts.find(a => a.id === e.accountId);
            const val = e.originalValue || e.value || 0;

            if (!acc) {
                // Heuristics if no accountId
                if (e.type === 'receita' || e.type === 'receber') {
                    monthGroups[label].rev += val;
                    monthGroups[label].netRev += val;
                } else if (e.type === 'despesa' || e.type === 'pagar') {
                    monthGroups[label].exp += val;
                }
                return;
            }

            if (acc.code.startsWith('1')) {
                if (acc.code.startsWith('1.1') || acc.code.startsWith('1.2')) { 
                    monthGroups[label].rev += val; 
                    monthGroups[label].netRev += val; 
                } else {
                    monthGroups[label].netRev -= val;
                }
            } else if (acc.code.startsWith('2') || acc.code.startsWith('3') || acc.code.startsWith('4.1') || acc.code.startsWith('5')) {
                monthGroups[label].exp += val;
            } else if (acc.code.startsWith('4.2')) {
                monthGroups[label].netRev += val;
            }
        });

        const evolution = Object.values(monthGroups)
            .sort((a: any, b: any) => a.rawDate.getTime() - b.rawDate.getTime())
            .slice(-6)
            .map((m: any) => ({ ...m, profit: m.netRev - m.exp }));

        const margemLiquida = netRev > 0 ? (ll / netRev * 100) : 0;
        const pontoEquilibrio = (receitaBruta > 0 && lb > 0) ? (despesasOp / (lb / netRev)) : 0;
        const margemBruta = netRev > 0 ? (lb / netRev * 100) : 0;
        const margemEbitda = netRev > 0 ? (ebitda / netRev * 100) : 0;
        const cm = netRev > 0 ? ((netRev - custosDiretos) / netRev * 100) : 0;
        const rentabilidade = receitaBruta > 0 ? (ll / receitaBruta * 100) : 0;

        // Group analysis for structure chart
        const expMap: Record<string, number> = {};
        const revMap: Record<string, number> = {};

        current.forEach(e => {
            const acc = effectiveAccounts.find(a => a.id === e.accountId);
            const val = e.originalValue || e.value || 0;
            if (!acc) return;

            if (acc.code.startsWith('1')) {
                const group = acc.group || 'Geral';
                revMap[group] = (revMap[group] || 0) + val;
            } else if (acc.code.startsWith('2') || acc.code.startsWith('3')) {
                // Determine category: if it's 3.x, use the 2-digit category name
                let category = acc.group || 'Geral';
                if (acc.code.startsWith('3.')) {
                    const catCode = acc.code.split('.').slice(0, 2).join('.');
                    const level2Acc = effectiveAccounts.find(a => a.code === catCode);
                    if (level2Acc) category = level2Acc.name;
                } else if (acc.code.startsWith('2.')) {
                    const catCode = acc.code.split('.').slice(0, 2).join('.');
                    const level2Acc = effectiveAccounts.find(a => a.code === catCode);
                    if (level2Acc) category = level2Acc.name;
                }
                expMap[category] = (expMap[category] || 0) + val;
            }
        });

        const revenueStructure = Object.entries(revMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
        const expenseStructure = Object.entries(expMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);

        return { receitaBruta, netRev, ebitda, ll, lb, evolution, margemLiquida, pontoEquilibrio, despesasOp, custosDiretos, margemBruta, margemEbitda, cm, rentabilidade, revenueStructure, expenseStructure };
    }, [entries, effectiveAccounts, activeFilters]);

    const handlePrint = () => {
        // Direct print is better for iframes as it avoids popup blockers
        window.print();
    };

    const downloadPDF = async () => {
        if (!dashboardRef.current || isDownloading) return;
        
        setIsDownloading(true);
        const originalScrollY = window.scrollY;
        
        try {
            // Give time for layout to settle
            window.scrollTo(0, 0);
            await new Promise(resolve => setTimeout(resolve, 800));
            
            const element = dashboardRef.current;
            
            // html2canvas is sensitive to modern CSS. We'll try to capture with optimal settings.
            const canvas = await html2canvas(element, { 
                scale: 2.2, // Increased scale for better resolution
                useCORS: true,
                allowTaint: true,
                logging: false,
                backgroundColor: '#ffffff',
                onclone: (clonedDoc) => {
                    const el = clonedDoc.querySelector('.print-area') as HTMLElement;
                    if (el) {
                        el.style.width = '1200px'; // Standard width for clarity
                        el.style.padding = '30px';
                        el.style.margin = '0 auto';
                        el.style.background = '#ffffff';
                    }

                    const printHeader = clonedDoc.querySelector('.show-on-print') as HTMLElement;
                    if (printHeader) {
                        printHeader.style.display = 'flex';
                        printHeader.style.marginBottom = '25px';
                    }

                    // CRITICAL: Aggressive sanitization of modern CSS that crashes html2canvas
                    try {
                        const headHtml = clonedDoc.head.innerHTML;
                        const colorRegex = /(oklch|oklab|color-mix)\((?:[^)(]+|\([^)(]*\))*\)/g;
                        
                        if (headHtml.includes('oklch') || headHtml.includes('oklab') || headHtml.includes('color-mix')) {
                            clonedDoc.head.innerHTML = headHtml.replace(colorRegex, '#94a3b8');
                        }

                        clonedDoc.querySelectorAll('style').forEach(tag => {
                            if (tag.textContent && (tag.textContent.includes('oklch') || tag.textContent.includes('oklab'))) {
                                tag.textContent = tag.textContent.replace(colorRegex, '#94a3b8');
                            }
                        });

                        // Force standard colors on common elements to avoid "invisible" text or incorrectly colored backgrounds
                        clonedDoc.querySelectorAll('*').forEach(node => {
                            const htmlNode = node as HTMLElement;
                            
                            // 1. Handle modern color functions
                            const style = htmlNode.getAttribute('style') || '';
                            if (style.includes('oklch') || style.includes('oklab')) {
                                htmlNode.setAttribute('style', style.replace(colorRegex, '#94a3b8'));
                            }

                            // 2. Explicitly fix background and text colors for common Tailwind classes
                            // This bypasses html2canvas issues with modern CSS variables
                            const classes = htmlNode.classList;
                            if (classes.contains('bg-white')) htmlNode.style.backgroundColor = '#ffffff';
                            if (classes.contains('text-slate-900')) htmlNode.style.color = '#0f172a';
                            if (classes.contains('text-slate-800')) htmlNode.style.color = '#1e293b';
                            if (classes.contains('text-slate-700')) htmlNode.style.color = '#334155';
                            if (classes.contains('text-slate-600')) htmlNode.style.color = '#475569';
                            if (classes.contains('text-slate-500')) htmlNode.style.color = '#64748b';
                            if (classes.contains('text-slate-400')) htmlNode.style.color = '#94a3b8';

                            // 3. Special handling for goal bars to ensure visibility
                            if (classes.contains('goal-bar')) {
                                htmlNode.style.backgroundColor = '#f1f5f9';
                                htmlNode.style.display = 'flex';
                                htmlNode.style.flexDirection = 'column-reverse';
                            }
                            if (classes.contains('goal-marker')) {
                                htmlNode.style.backgroundColor = '#0f172a';
                                htmlNode.style.zIndex = '10';
                            }
                        });

                        clonedDoc.querySelectorAll('.no-print').forEach(node => {
                            (node as HTMLElement).style.display = 'none';
                        });
                    } catch (e) {
                        console.warn('PDF Clone Sanitize Error:', e);
                    }
                }
            });

            // Fallback check: if canvas is empty or tiny, throw error
            if (canvas.width < 100 || canvas.height < 100) {
                throw new Error('Canvas generation failed or was too small.');
            }

            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'pt',
                format: [canvas.width, canvas.height]
            });
            
            pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
            pdf.save(`Relatorio_Business_Intelligence_${clientName.replace(/\s+/g, '_')}.pdf`);
        } catch (error) { 
            console.error('PDF Export Error:', error);
            // If it fails, try a simpler approach or notify user
            alert('Erro ao gerar o PDF. Recomendamos usar a função "Imprimir" do navegador (Ctrl+P) e escolher "Salvar como PDF".');
        } finally { 
            setIsDownloading(false);
            window.scrollTo(0, originalScrollY);
        }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6 pb-20 max-w-[1400px] mx-auto animate-in fade-in duration-500">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .show-on-print { display: flex !important; }
                    body { background: white !important; }
                    .print-area { padding: 0 !important; margin: 0 !important; width: 100% !important; max-width: none !important; }
                    .card { border: 1px solid #eee !important; box-shadow: none !important; }
                }
                .show-on-print { display: none; }
            `}</style>

            <header className="flex flex-col xl:flex-row items-center justify-between gap-6 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm no-print">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#1a365d] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900">
                        <LayoutDashboard size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none mb-1">Business Intelligence Dashboard</h1>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{clientName} · Gestão Estratégica</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-[1.25rem] border border-slate-100" style={{ backgroundColor: '#e8f4ea' }}>
                        <Calendar size={14} className="text-slate-400" />
                        <input type="date" value={activeFilters.startDate} onChange={(e) => setActiveFilters({...activeFilters, startDate: e.target.value})} className="bg-transparent text-[10px] font-black outline-none w-28" />
                        <span className="text-slate-300 font-bold">/</span>
                        <input type="date" value={activeFilters.endDate} onChange={(e) => setActiveFilters({...activeFilters, endDate: e.target.value})} className="bg-transparent text-[10px] font-black outline-none w-28" />
                    </div>
                    <Button variant="outline" className="rounded-2xl h-10 px-5 text-[10px] font-black uppercase tracking-widest border-slate-200" onClick={downloadPDF} disabled={isDownloading}>
                        <Download size={14} className="mr-2 text-primary" /> {isDownloading ? 'Gerando...' : 'Baixar PDF'}
                    </Button>
                </div>
            </header>

            <div ref={dashboardRef} className="space-y-4 print-area p-1">
                {/* Header for PDF only - Discrete and professional */}
                <div className="hidden show-on-print mb-4 pb-4 border-b border-slate-100 items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col -space-y-1.5">
                            <div className="flex items-center">
                                <span className="text-[18px] font-black tracking-tight text-[#004b8d]">Fluxo</span>
                                <span className="text-[18px] font-black tracking-tight ml-1 text-[#5cb85c]">Inteligente</span>
                            </div>
                            <span className="text-[8px] font-bold tracking-[0.2em] uppercase leading-none opacity-50 text-slate-500">
                                Gestão Financeira
                            </span>
                        </div>
                        <div className="h-8 w-px bg-slate-100 mx-1" />
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] leading-tight">
                            {clientName}<br />Dashboard Executivo
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-[7px] font-black text-slate-300 uppercase tracking-widest mb-0.5">Período de Análise</div>
                        <div className="text-[9px] font-black text-slate-600 px-3 py-1 rounded-md border border-slate-100 inline-block" style={{ backgroundColor: '#e8f4ea' }}>
                            {new Date(activeFilters.startDate + 'T12:00:00').toLocaleDateString('pt-BR')} - {new Date(activeFilters.endDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </div>
                    </div>
                </div>

                {/* KPI BLOCK 1 - 1 Row of 6 Cards ABOVE CHARTS */}
                <div className="p-4 rounded-[2.5rem] border border-slate-200/60" style={{ backgroundColor: '#e8f4ea' }}>
                    <div className="grid grid-cols-6 gap-2">
                        <KpiBox 
                            title="Faturamento Bruto" 
                            value={data.receitaBruta} 
                            icon={BarChart3} 
                            color="blue" 
                        />
                        <KpiBox 
                            title="Lucro Bruto" 
                            value={data.lb} 
                            icon={DollarSign} 
                            color="emerald" 
                        />
                        <KpiBox 
                            title="EBITDA" 
                            value={data.ebitda} 
                            icon={Activity} 
                            color="purple" 
                        />
                        <KpiBox 
                            title="Lucro Líquido" 
                            value={data.ll} 
                            icon={Target} 
                            color="indigo" 
                        />
                        <KpiBox 
                            title="Rentabilidade" 
                            value={data.rentabilidade} 
                            icon={Percent} 
                            color="amber" 
                            isCurrency={false} 
                        />
                        <KpiBox 
                            title="Margem de Lucro" 
                            value={data.margemLiquida} 
                            icon={TrendingUp} 
                            color="emerald" 
                            isCurrency={false} 
                        />
                    </div>
                </div>

                {/* CHARTS BLOCK - 3 Side by Side */}
                <div className="p-4 rounded-[2.5rem] border border-slate-200/60 grid grid-cols-3 gap-4" style={{ backgroundColor: '#e8f4ea' }}>
                    {/* Evolution Chart */}
                    <Card className="p-4 rounded-[1.25rem] bg-white border-slate-100 shadow-sm relative overflow-hidden card flex flex-col">
                        <div className="flex justify-between items-center mb-3">
                            <div>
                                <h3 className="text-[9px] font-black uppercase tracking-[0.2em] mb-0.5" style={{ color: '#1e293b' }}>Evolução Mensal</h3>
                                <p className="text-[7px] font-bold uppercase tracking-widest" style={{ color: '#64748b' }}>Receita vs Lucro</p>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#1a365d]" />
                                    <span className="text-[7px] font-black uppercase text-slate-500 whitespace-nowrap">Receita</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                                    <span className="text-[7px] font-black uppercase text-slate-500 whitespace-nowrap">Lucro</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-[200px] mt-auto">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={data.evolution}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis 
                                        dataKey="label" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fontSize: 6, fontWeight: 900, fill: '#94a3b8' }} 
                                        dy={4}
                                    />
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fontSize: 6, fontWeight: 700, fill: '#94a3b8' }} 
                                        tickFormatter={(v) => `R$ ${v/1000}k`} 
                                    />
                                    <Tooltip contentStyle={{ borderRadius: '0.4rem', fontSize: '8px' }} />
                                    <Area type="monotone" dataKey="rev" stroke="#1a365d" fill="#1a365d" fillOpacity={0.03} strokeWidth={1.2}>
                                        <LabelList dataKey="rev" position="top" formatter={(v: any) => `R$${Math.round(v/1000)}k`} style={{ fontSize: 5, fontWeight: 900, fill: '#1a365d', opacity: 0.8 }} />
                                    </Area>
                                    <Bar dataKey="profit" fill="#10b981" barSize={8} radius={[2, 2, 0, 0]}>
                                        <LabelList dataKey="profit" position="right" formatter={(v: any) => `R$${Math.round(v/1000)}k`} style={{ fontSize: 6, fontWeight: 900, fill: '#10b981' }} />
                                    </Bar>
                                    <ReferenceLine y={0} stroke="#e2e8f0" strokeDasharray="3 3" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* Structure Chart */}
                    <Card className="p-4 rounded-[1.25rem] bg-white border-slate-100 shadow-sm relative overflow-hidden card flex flex-col">
                        <div className="flex justify-between items-center mb-3">
                            <div>
                                <h3 className="text-[9px] font-black uppercase tracking-[0.2em] mb-0.5" style={{ color: '#1e293b' }}>Composição</h3>
                                <p className="text-[7px] font-bold uppercase tracking-widest" style={{ color: '#64748b' }}>Entradas vs Saídas</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                    <span className="text-[7px] font-black uppercase text-slate-500">Entr.</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                    <span className="text-[7px] font-black uppercase text-slate-500">Saíd.</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-[200px] mt-auto">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={[
                                    { name: 'ENTRADAS', value: data.receitaBruta, color: '#4f46e5' },
                                    { name: 'SAÍDAS', value: data.despesasOp + data.custosDiretos, color: '#e11d48' }
                                ]} layout="vertical" margin={{ right: 10, top: 20 }}>
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 7, fontWeight: 900, fill: '#64748b' }} width={60} />
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '0.4rem', fontSize: '8px', fontWeight: 'bold' }}
                                        formatter={(v: any) => [`R$ ${v.toLocaleString('pt-BR')}`, 'Total']}
                                    />
                                    <Bar dataKey="value" barSize={35} radius={[0, 4, 4, 0]}>
                                        { [0, 1].map((i) => (
                                            <Cell key={`cell-${i}`} fill={i === 0 ? '#4f46e5' : '#e11d48'} />
                                        ))}
                                        <LabelList dataKey="value" position="top" formatter={(v: any) => `R$ ${v.toLocaleString('pt-BR')}`} style={{ fontSize: 8.5, fontWeight: 900, fill: '#1e293b' }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
 
                    {/* Expense Donut Chart - NEW */}
                    <Card className="p-4 rounded-[1.25rem] bg-white border-slate-100 shadow-sm relative overflow-hidden card flex flex-col">
                        <div className="flex justify-between items-center mb-1">
                            <div>
                                <h3 className="text-[9px] font-black uppercase tracking-[0.2em] mb-0.5" style={{ color: '#1e293b' }}>Distribuição</h3>
                                <p className="text-[7px] font-bold uppercase tracking-widest" style={{ color: '#64748b' }}>Participação por Despesa</p>
                            </div>
                        </div>
                        <div className="flex flex-row items-center h-[200px] mt-auto gap-0">
                            <div className="flex-1 h-full min-w-[120px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
                                        <Pie
                                            data={data.expenseStructure}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={25}
                                            outerRadius={45}
                                            paddingAngle={3}
                                            dataKey="value"
                                            labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                                            label={({ cx, cy, midAngle, innerRadius, outerRadius, value, index, percent }) => {
                                                const radius = outerRadius + 12;
                                                const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
                                                const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));
                                                return (
                                                    <text 
                                                        x={x} 
                                                        y={y} 
                                                        fill="#64748b" 
                                                        textAnchor={x > cx ? 'start' : 'end'} 
                                                        dominantBaseline="central" 
                                                        fontSize="7" 
                                                        fontWeight="900"
                                                    >
                                                        {percent > 0.03 ? `${(percent * 100).toFixed(0)}%` : ''}
                                                    </text>
                                                );
                                            }}
                                            minAngle={5}
                                        >
                                            {data.expenseStructure.map((e, i) => (
                                                <Cell key={`cell-${i}`} fill={['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fecdd3', '#0d9488', '#059669', '#10b981'][i % 8]} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '0.4rem', fontSize: '8px', fontWeight: 'bold' }}
                                            formatter={(v: any, name: any) => [`R$ ${v.toLocaleString('pt-BR')}`, name]}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex flex-col justify-center shrink-0 w-48 pr-1">
                                {data.expenseStructure.slice(0, 8).map((e, i) => (
                                    <div key={e.name} className="flex items-start gap-2 mb-5 last:mb-0">
                                        <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: ['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fecdd3', '#0d9488', '#059669', '#10b981'][i % 8] }} />
                                        <span className="text-[6.5px] font-black text-slate-700 uppercase leading-[1.4]" style={{ whiteSpace: 'normal', wordBreak: 'break-word', display: 'block' }}>
                                            {e.name}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>
                </div>

                {/* KPI BLOCK 2 - 1 Row of 6 Cards BELOW CHARTS */}
                <div className="p-4 rounded-[2.5rem] border border-slate-200/60" style={{ backgroundColor: '#e8f4ea' }}>
                    <div className="grid grid-cols-6 gap-2">
                        <KpiBox 
                            title="Margem Contrib." 
                            value={data.cm} 
                            icon={TrendingUp} 
                            color="indigo" 
                            isCurrency={false}
                        />
                        <KpiBox 
                            title="Margem Bruta" 
                            value={data.margemBruta} 
                            icon={Percent} 
                            color="emerald" 
                            isCurrency={false}
                        />
                        <KpiBox 
                            title="Ponto de Equilíbrio" 
                            value={data.pontoEquilibrio} 
                            icon={Scale} 
                            color="slate" 
                        />
                        <KpiBox 
                            title="Despesas Op." 
                            value={data.despesasOp} 
                            icon={TrendingDown} 
                            color="rose" 
                        />
                        <KpiBox 
                            title="Custos Diretos" 
                            value={data.custosDiretos} 
                            icon={ArrowDownRight} 
                            color="rose" 
                        />
                        <KpiBox 
                            title="Gasto Estrutura" 
                            value={data.receitaBruta > 0 ? (data.despesasOp / data.receitaBruta * 100) : 0} 
                            icon={Percent} 
                            color="slate" 
                            isCurrency={false}
                        />
                    </div>
                </div>

                <Card className="p-6 rounded-[2.5rem] border border-slate-200/60 mt-4 relative overflow-hidden card" style={{ backgroundColor: '#e8f4ea' }}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-[#1a365d] rounded-xl flex items-center justify-center text-white shadow-lg">
                            <Activity size={16} />
                        </div>
                        <div>
                            <h2 className="text-xs font-black uppercase tracking-widest leading-none mb-1" style={{ color: '#1e293b' }}>Diagnóstico & Plano de Ação</h2>
                            <p className="text-[8px] font-bold uppercase tracking-[0.2em]" style={{ color: '#94a3b8' }}>ANÁLISE ESTRATÉGICA</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 h-full">
                            <div className="flex items-center gap-1.5 mb-2" style={{ color: '#059669' }}>
                                <ArrowUpRight size={14} strokeWidth={3} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Fortalezas</span>
                            </div>
                            <div className="space-y-1.5">
                                <div className="text-[10px] font-medium flex gap-1.5" style={{ color: '#475569' }}>
                                    <div className="w-1 h-1 rounded-full bg-emerald-400 mt-1 shrink-0" />
                                    <span>Temos uma <strong>ótima notícia!</strong> Sua <strong>margem líquida</strong> ({data.margemLiquida.toFixed(1)}%) mostra que sua operação é eficiente e está gerando lucro real de forma consistente.</span>
                                </div>
                                <div className="text-[10px] font-medium flex gap-1.5" style={{ color: '#475569' }}>
                                    <div className="w-1 h-1 rounded-full bg-emerald-400 mt-1 shrink-0" />
                                    <span>O <strong>EBITDA de R$ {Math.round(data.ebitda/1000)}k</strong> é um sinal claro de saúde financeira, mostrando que o coração do seu negócio está pulsando forte antes mesmo de considerar impostos e juros.</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 h-full">
                            <div className="flex items-center gap-1.5 mb-2" style={{ color: '#e11d48' }}>
                                <ArrowDownRight size={14} strokeWidth={3} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Riscos</span>
                            </div>
                            <div className="space-y-1.5">
                                <div className="text-[10px] font-medium flex gap-1.5" style={{ color: '#475569' }}>
                                    <div className="w-1 h-1 rounded-full bg-rose-400 mt-1 shrink-0" />
                                    <span>{data.receitaBruta < data.pontoEquilibrio ? 'Notamos um ponto de atenção: o faturamento atual ainda não cobriu todos os custos (Ponto de Equilíbrio), o que exige um olhar cuidadoso para o caixa imediato.' : 'Embora os resultados sejam positivos, as despesas operacionais ainda têm um peso considerável. Monitorar esses gastos ajudará a proteger sua lucratividade futura.'}</span>
                                </div>
                                <div className="text-[10px] font-medium flex gap-1.5" style={{ color: '#475569' }}>
                                    <div className="w-1 h-1 rounded-full bg-rose-400 mt-1 shrink-0" />
                                    <span>Seus <strong>custos diretos</strong> são sensíveis ao volume de vendas. Pequenas variações aqui podem impactar sua margem rapidamente, então vale manter a negociação com fornecedores em dia.</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[#1a365d] p-3 rounded-xl shadow-lg h-full text-white">
                            <div className="flex items-center gap-1.5 mb-2 text-blue-200">
                                <Scale size={14} strokeWidth={3} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Ações Recomendadas</span>
                            </div>
                            <div className="space-y-1.5 opacity-90">
                                <div className="text-[10px] font-medium flex gap-1.5">
                                    <div className="w-1 h-1 rounded-full bg-blue-300 mt-1 shrink-0" />
                                    <span>Focar na <strong>otimização do Mix de Produtos</strong> com maior margem de contribuição (atualmente em {data.cm.toFixed(1)}%).</span>
                                </div>
                                <div className="text-[10px] font-medium flex gap-1.5">
                                    <div className="w-1 h-1 rounded-full bg-blue-300 mt-1 shrink-0" />
                                    <span>Implementar um rigoroso <strong>plano de redução de despesas fixas</strong> para reduzir o faturamento mínimo necessário (P.E.).</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-slate-200/50 flex justify-between items-center text-[8px] font-black text-slate-400 uppercase tracking-widest">
                        <span>Relatório Gerado em: {new Date().toLocaleDateString('pt-BR')}</span>
                    </div>
                </Card>
            </div>

            <footer className="mt-12 pt-8 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] no-print">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <div className="flex items-center">
                        <span className="text-[#004b8d] font-black mr-1">Fluxo</span>
                        <span className="text-[#5cb85c] font-black">Inteligente</span>
                        <span className="text-slate-400 ml-2">· Especialista em Consultoria Financeira · {new Date().getFullYear()}</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

