import React, { useState, useEffect } from 'react';
import { 
    Calendar, 
    ArrowUpCircle, 
    ArrowDownCircle, 
    AlertCircle, 
    TrendingUp, 
    TrendingDown, 
    Filter, 
    Plus,
    Search,
    ChevronLeft,
    ChevronRight,
    SearchX,
    Clock,
    CheckCircle2,
    AlertTriangle,
    FileEdit,
    Trash2,
    User,
    Download,
    FileText
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';
import { useAuth } from '../context/AuthContext';
import { useClient } from '../context/ClientContext';
import { PLAN_CONFIG, normalizePlan } from '../lib/planUtils';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { normalizeDate, getYearMonth } from '../lib/dateUtils';
import { 
    collection, 
    query, 
    where, 
    onSnapshot, 
    orderBy,
    addDoc,
    deleteDoc,
    doc,
    updateDoc,
    serverTimestamp,
    Timestamp,
    getCountFromServer
} from 'firebase/firestore';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

import { 
    UNIVERSAL_CHART_OF_ACCOUNTS, 
    UNIVERSAL_COST_CENTERS,
    ChartAccount,
    CostCenter 
} from '../constants/financial';

interface FinancialEntry {
    id: string;
    date: string;
    description: string;
    type: 'pagar' | 'receber';
    category: string;
    accountId?: string;
    costCenterId?: string;
    value: number;
    status: 'Pago' | 'Parcial' | 'Recebido' | 'Vencido' | 'Pendente';
    observation: string;
    clientId: string;
    month: string;
}

interface FinancialAgendaProps {
    setActiveTab?: (tab: string) => void;
    onBack?: () => void;
}

export const FinancialAgenda = ({ setActiveTab, onBack }: FinancialAgendaProps) => {
    const { profile, user, isAdmin, plansConfig } = useAuth();
    const { selectedClientId, selectedClientName, clients, setSelectedClient } = useClient();
    const [entries, setEntries] = useState<FinancialEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
    
    // Live Registers
    const [dbAccounts, setDbAccounts] = useState<ChartAccount[]>([]);
    const [dbCostCenters, setDbCostCenters] = useState<CostCenter[]>([]);

    useEffect(() => {
        const unsubscribeAccounts = onSnapshot(query(
            collection(db, 'chartOfAccounts'), 
            where('clientId', '==', 'global'),
            orderBy('code', 'asc')
        ), (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChartAccount));
            setDbAccounts(list);
        });
        const unsubscribeCostCenters = onSnapshot(query(
            collection(db, 'costCenters'), 
            where('clientId', '==', 'global'),
            orderBy('name', 'asc')
        ), (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CostCenter));
            setDbCostCenters(list);
        });
        return () => {
            unsubscribeAccounts();
            unsubscribeCostCenters();
        };
    }, []);

    const effectiveAccounts = dbAccounts.length > 0 ? dbAccounts : UNIVERSAL_CHART_OF_ACCOUNTS;
    const effectiveCostCenters = dbCostCenters.length > 0 ? dbCostCenters : UNIVERSAL_COST_CENTERS;

    // Admin state for adding entries
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const [newEntry, setNewEntry] = useState<Partial<FinancialEntry>>({
        type: 'pagar',
        status: 'Pendente',
        date: new Date().toISOString().substring(0, 10),
        value: 0,
        description: '',
        category: 'Geral',
        accountId: '',
        costCenterId: '',
        observation: ''
    });

    const activeClientId = selectedClientId;

    // Redundant client loader removed as it's now in ClientContext

    // Load entries for active client 
    useEffect(() => {
        if (!activeClientId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const path = `financialAgenda/${activeClientId}/entries`;
        const q = query(
            collection(db, path), 
            orderBy("date", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as FinancialEntry));
            setEntries(items);
            setLoading(false);
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, path);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [activeClientId]); // Removed currentMonth dependency to fetch all entries once

    const handleAddEntry = async () => {
        if (!activeClientId || !newEntry.description || !newEntry.value) return;

        const path = `financialAgenda/${activeClientId}/entries`;
        try {
            // Check plan limits for creation
            if (!isAdmin) {
                const planKey = normalizePlan(profile?.planId);
                const config = Array.isArray(plansConfig) 
                    ? plansConfig.find((p: any) => (p.id || p.planId || '').toLowerCase() === planKey)
                    : (plansConfig ? plansConfig[planKey] : null);
                
                // Use profile.entriesLimit if defined (custom limit), otherwise fallback to config/plan default
                const limit = (profile?.entriesLimit && profile.entriesLimit > 0)
                    ? profile.entriesLimit
                    : (config?.entriesLimit ?? PLAN_CONFIG[planKey].entriesLimit);
                
                if (limit > 0) {
                    const q = query(collection(db, path));
                    const snap = await getCountFromServer(q);
                    const currentCount = snap.data().count;
                    
                    if (currentCount >= limit) {
                        alert(`Limite de lançamentos atingido (${limit}). Por favor, faça um upgrade para o plano Profissional ou Premium para continuar.`);
                        return;
                    }
                }
            }

            // Normalize date to YYYY-MM-DD
            const dateStr = newEntry.date || new Date().toISOString().substring(0, 10);
            const month = dateStr.substring(0, 7);
            
            await addDoc(collection(db, path), {
                ...newEntry,
                date: dateStr,
                clientId: activeClientId,
                month: month,
                createdAt: serverTimestamp()
            });
            setIsAddModalOpen(false);
            setNewEntry({
                type: 'pagar',
                status: 'Pendente',
                date: new Date().toISOString().substring(0, 10),
                value: 0,
                description: '',
                category: 'Geral',
                accountId: '',
                costCenterId: '',
                observation: ''
            });
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, path);
        }
    };

    const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeClientId) return;

        setImporting(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const path = `financialAgenda/${activeClientId}/entries`;
                let count = 0;

                // Check plan limits first
                let currentCount = 0;
                let limit = 0;
                
                if (!isAdmin) {
                    const planKey = profile?.planId || 'essencial';
                    const config = Array.isArray(plansConfig) 
                        ? plansConfig.find((p: any) => (p.id || p.planId || '').toLowerCase() === planKey)
                        : (plansConfig ? plansConfig[planKey] : null);
                    
                    limit = config?.entriesLimit ?? (planKey === 'essencial' ? 50 : planKey === 'profissional' ? 150 : 0);
                    
                    if (limit > 0) {
                        const q = query(collection(db, path));
                        const snap = await getCountFromServer(q);
                        currentCount = snap.data().count;
                        
                        if (currentCount >= limit) {
                            alert(`Limite de lançamentos atingido (${limit}). Por favor, faça um upgrade de plano.`);
                            setImporting(false);
                            return;
                        }
                    }
                }

                for (const row of results.data as any) {
                    try {
                        // Check limit per row for safety
                        if (!isAdmin && limit > 0 && (currentCount + count) >= limit) {
                            alert(`Importação interrompida: Limite de lançamentos atingido (${limit}). Foram importados somente ${count} itens.`);
                            break;
                        }

                        const rawValue = row.valor || row.Valor || row.Value || row.Amount || row.amount;
                        const valueStr = String(rawValue).replace(/[^\d.,-]/g, '').replace(',', '.');
                        const value = parseFloat(valueStr);
                        
                        if (isNaN(value)) continue;

                        const rawDate = row.data || row.Data || row.Date || row.Data_Vencimento || '';
                        const normalizedDate = normalizeDate(rawDate);
                        
                        if (!normalizedDate) continue;

                        const entryMonth = getYearMonth(normalizedDate);
                        const description = row.descricao || row.Descrição || row.Description || row.Memo || row.Historico || row.Histórico;

                        await addDoc(collection(db, path), {
                            description: description || 'Lançamento Importado',
                            type: value < 0 ? 'pagar' : 'receber',
                            value: Math.abs(value),
                            date: normalizedDate,
                            month: entryMonth,
                            status: value < 0 ? 'Pago' : 'Recebido',
                            category: 'Conciliação',
                            observation: 'Importado via CSV',
                            clientId: activeClientId,
                            createdAt: serverTimestamp()
                        });
                        count++;
                    } catch (err) {
                        console.error("Erro ao importar linha:", err);
                    }
                }
                alert(`${count} lançamentos importados com sucesso!`);
                setImporting(false);
            },
            error: (err) => {
                console.error("Erro no Parse do CSV:", err);
                setImporting(false);
                alert("Erro ao ler o arquivo CSV. Verifique o formato.");
            }
        });
    };

    const handleDeleteEntry = async (id) => {
        if (!activeClientId || !window.confirm('Excluir este lançamento?')) return;
        const path = `financialAgenda/${activeClientId}/entries`;
        try {
            await deleteDoc(doc(db, path, id));
        } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, path);
        }
    };

    const today = new Date();

    // Calculations and Metrics for Report
    const monthlyEntries = entries.filter(e => {
        const entryMonth = getYearMonth(e.date || e.month);
        return entryMonth === currentMonth;
    });
    const receivables = monthlyEntries.filter(e => e.type === 'receber');
    const payables = monthlyEntries.filter(e => e.type === 'pagar');

    // Monthly totals
    const totalAReceber = receivables.reduce((acc, curr) => acc + curr.value, 0);
    const recebidoNoMes = receivables.filter(e => e.status === 'Recebido').reduce((acc, curr) => acc + curr.value, 0);
    
    // Global Overdue (Independent of month)
    const allReceivables = entries.filter(e => e.type === 'receber');
    const valorInadimplente = allReceivables.filter(e => e.status === 'Vencido').reduce((acc, curr) => acc + curr.value, 0);
    const inadimplenciaPercent = totalAReceber > 0 ? (valorInadimplente / totalAReceber) * 100 : 0;
    const qtdInadimplentes = allReceivables.filter(e => e.status === 'Vencido').length;

    const totalAPagar = payables.reduce((acc, curr) => acc + curr.value, 0);
    const pagoNoMes = payables.filter(e => e.status === 'Pago').reduce((acc, curr) => acc + curr.value, 0);
    
    // Global Late (Independent of month)
    const allPayables = entries.filter(e => e.type === 'pagar');
    const valorEmAtraso = allPayables.filter(e => e.status === 'Vencido').reduce((acc, curr) => acc + curr.value, 0);
    const emAtrasoPercent = totalAPagar > 0 ? (valorEmAtraso / totalAPagar) * 100 : 0;
    const qtdEmAtraso = allPayables.filter(e => e.status === 'Vencido').length;

    const calculateAverageTerm = (entries: FinancialEntry[]) => {
        const pending = entries.filter(e => {
            const s = (e.status as string).toLowerCase();
            return s === 'pendente' || s === 'vencido' || s === 'parcial';
        });
        if (pending.length === 0) return 0;
        
        const todayNoTime = new Date();
        todayNoTime.setHours(0, 0, 0, 0);
        
        let totalWeightedDays = 0;
        let totalValue = 0;
        
        pending.forEach(e => {
            const dueDate = new Date(e.date);
            dueDate.setHours(0, 0, 0, 0);
            const diffTime = dueDate.getTime() - todayNoTime.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            totalWeightedDays += e.value * Math.max(0, diffDays); // Only consider future/current days for "Prazo Médio" in agenda
            totalValue += e.value;
        });
        
        return totalValue > 0 ? Math.round(totalWeightedDays / totalValue) : 0;
    };

    const avgTermReceber = calculateAverageTerm(receivables);
    const avgTermPagar = calculateAverageTerm(payables);

    const getWeekRanges = (month: string) => {
        if (!month) return [];
        const [year, mon] = month.split('-').map(Number);
        const ranges: { start: Date; end: Date; label: string }[] = [];
        
        const firstDay = new Date(year, mon - 1, 1);
        const lastDay = new Date(year, mon, 0);
        
        let currentStart = new Date(firstDay);
        let weekNum = 1;
        
        while (currentStart <= lastDay) {
            let currentEnd = new Date(currentStart);
            while (currentEnd.getDay() !== 0 && currentEnd < lastDay) {
                currentEnd.setDate(currentEnd.getDate() + 1);
            }
            
            ranges.push({
                start: new Date(currentStart),
                end: new Date(currentEnd),
                label: `${weekNum}ª SEMANA (${currentStart.getDate().toString().padStart(2, '0')}/${mon.toString().padStart(2, '0')} - ${currentEnd.getDate().toString().padStart(2, '0')}/${mon.toString().padStart(2, '0')})`
            });
            
            currentStart = new Date(currentEnd);
            currentStart.setDate(currentStart.getDate() + 1);
            weekNum++;
        }
        return ranges;
    };

    const weekRanges = getWeekRanges(currentMonth);

    const getWeeklyAgingData = (list: FinancialEntry[], start: Date, end: Date) => {
        const s = new Date(start); s.setHours(0, 0, 0, 0);
        const e = new Date(end); e.setHours(23, 59, 59, 999);
        const filtered = list.filter(item => {
            const entryDate = new Date(item.date);
            const entryStatus = (item.status as string).toLowerCase();
            return (entryStatus === 'pendente' || entryStatus === 'vencido' || entryStatus === 'parcial') && entryDate >= s && entryDate <= e;
        });
        return {
            total: filtered.reduce((acc, curr) => acc + curr.value, 0),
            entries: filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        };
    };

    const monthlyWeeklyAgingReceber = weekRanges.map(range => ({
        ...range,
        data: getWeeklyAgingData(receivables, range.start, range.end)
    }));

    const monthlyWeeklyAgingPagar = weekRanges.map(range => ({
        ...range,
        data: getWeeklyAgingData(payables, range.start, range.end)
    }));

    const getTopList = (list: FinancialEntry[]) => {
        const aggregated: Record<string, number> = {};
        list.forEach(e => {
            aggregated[e.description] = (aggregated[e.description] || 0) + e.value;
        });
        return Object.entries(aggregated)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);
    };

    const topCustomers = getTopList(receivables);
    const topExpenses = getTopList(payables);

    const prevReceber = receivables.length > 0 ? (receivables.filter(e => e.status === 'Recebido').length / receivables.length) * 100 : 0;
    const prevPagar = payables.length > 0 ? (payables.filter(e => e.status === 'Pago').length / payables.length) * 100 : 0;

    const saldoProjetadoFinal = totalAReceber - totalAPagar;

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'Recebido':
            case 'Pago': return 'bg-emerald-50 text-emerald-600';
            case 'Pendente': return 'bg-amber-50 text-amber-600';
            case 'Vencido': return 'bg-rose-50 text-rose-600';
            default: return 'bg-slate-50 text-slate-600';
        }
    };

    const handleDownloadPDF = () => {
        const doc = new jsPDF();
        const clientName = selectedClientName || profile?.name || 'Cliente';
        
        // Use manual parsing to avoid timezone shifts
        const [year, month] = currentMonth.split('-');
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
        const monthName = dateObj.toLocaleDateString('pt-BR', { month: 'long' });
        const monthYear = `${monthName} de ${year}`;

        doc.setFontSize(20);
        doc.setTextColor(0, 75, 141); // #004b8d
        doc.text('Fluxo', 14, 20);
        doc.setTextColor(92, 184, 92); // #5cb85c
        doc.text('Inteligente', 36, 20);
        
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text('GESTÃO FINANCEIRA BPO PREMIUM', 14, 26);

        doc.setFontSize(14);
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text('RELATÓRIO DE 📅 MINHA AGENDA DE CONTAS', 14, 40);
        
        doc.setFontSize(9); // More proportional
        doc.setTextColor(100, 116, 139); // slate-400
        doc.text(`CLIENTE: ${clientName.toUpperCase()}`, 14, 48);
        doc.text(`MÊS DE REFERÊNCIA: ${monthYear.toUpperCase()}`, 14, 53);

        // Section: CONTAS A RECEBER
        doc.setFillColor(26, 85, 122); // #1a557a
        doc.rect(14, 65, 90, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7); // Proportional
        doc.text('CONTAS A RECEBER', 59, 70, { align: 'center' });

        doc.setTextColor(15, 23, 42);
        doc.setFontSize(7);
        doc.text('Total a Receber:', 16, 80);
        doc.text(formatCurrency(totalAReceber), 102, 80, { align: 'right' });
        
        doc.text('Recebido no Mês:', 16, 85);
        doc.text(formatCurrency(recebidoNoMes), 102, 85, { align: 'right' });

        doc.setTextColor(225, 29, 72);
        doc.text('Inadimplência:', 16, 90);
        doc.text(`${inadimplenciaPercent.toFixed(1)}% (${formatCurrency(valorInadimplente)})`, 102, 90, { align: 'right' });

        // Section: CONTAS A PAGAR (Symmetrical)
        doc.setFillColor(185, 28, 28); // #b91c1c
        doc.rect(106, 65, 90, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text('CONTAS A PAGAR', 151, 70, { align: 'center' });

        doc.setTextColor(15, 23, 42);
        doc.text('Total a Pagar:', 108, 80);
        doc.text(formatCurrency(totalAPagar), 194, 80, { align: 'right' });
        
        doc.text('Pago no Mês:', 108, 85);
        doc.text(formatCurrency(pagoNoMes), 194, 85, { align: 'right' });

        doc.setTextColor(225, 29, 72);
        doc.text('Em Atraso:', 108, 90);
        doc.text(`${emAtrasoPercent.toFixed(1)}% (${formatCurrency(valorEmAtraso)})`, 194, 90, { align: 'right' });

        // Aging Headers
        doc.setTextColor(26, 85, 122);
        doc.setFontSize(7);
        doc.text('AGENDA DE RECEBIMENTOS (SEMANAL)', 14, 100);

        doc.setTextColor(185, 28, 28);
        doc.text('AGENDA DE PAGAMENTOS (SEMANAL)', 106, 100);

        const renderAgingRowPDF = (receberEntry: FinancialEntry | null, pagarEntry: FinancialEntry | null, xReceber: number, xPagar: number, y: number) => {
            doc.setFontSize(6);
            doc.setTextColor(148, 163, 184);
            
            if (receberEntry) {
                const dt = new Date(receberEntry.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                const desc = receberEntry.description.substring(0, 18);
                doc.text(dt, xReceber + 2, y);
                doc.text(desc, xReceber + 14, y);
                doc.text(formatCurrency(receberEntry.value), xReceber + 88, y, { align: 'right' });
            }
            
            if (pagarEntry) {
                const dt = new Date(pagarEntry.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                const desc = pagarEntry.description.substring(0, 18);
                doc.text(dt, xPagar + 2, y);
                doc.text(desc, xPagar + 14, y);
                doc.text(formatCurrency(pagarEntry.value), xPagar + 88, y, { align: 'right' });
            }
        };

        let currentAgingY = 105;
        
        monthlyWeeklyAgingReceber.forEach((weekR, idx) => {
            const weekP = monthlyWeeklyAgingPagar[idx];
            
            const maxEntries = Math.max(weekR.data.entries.length, weekP.data.entries.length);
            const displayCount = Math.min(maxEntries, 5);
            const rowCount = maxEntries === 0 ? 1 : displayCount + (maxEntries > 5 ? 1 : 0);
            const blockHeight = 4 + (rowCount * 4) + 2;

            // Subtle shading background
            doc.setFillColor(248, 250, 252); // slate-50
            doc.rect(13, currentAgingY - 4, 184, blockHeight, 'F');
            
            // Render Week Header
            doc.setFontSize(7);
            doc.setTextColor(26, 85, 122);
            doc.text(weekR.label, 14, currentAgingY);
            doc.text(formatCurrency(weekR.data.total), 102, currentAgingY, { align: 'right' });
            
            doc.setTextColor(185, 28, 28);
            doc.text(weekP.label, 106, currentAgingY);
            doc.text(formatCurrency(weekP.data.total), 194, currentAgingY, { align: 'right' });
            
            currentAgingY += 4;

            // Render Symmetrical Rows
            if (maxEntries === 0) {
                doc.setFontSize(6);
                doc.setTextColor(203, 213, 225);
                doc.text('- Sem pendências', 16, currentAgingY);
                doc.text('- Sem pendências', 108, currentAgingY);
                currentAgingY += 4;
            } else {
                for (let i = 0; i < displayCount; i++) {
                    renderAgingRowPDF(weekR.data.entries[i] || null, weekP.data.entries[i] || null, 14, 106, currentAgingY);
                    currentAgingY += 4;
                }
                if (maxEntries > 5) {
                    doc.setFontSize(5);
                    doc.setTextColor(148, 163, 184);
                    doc.text(`... (+ ${weekR.data.entries.length - 5})`, 16, currentAgingY);
                    doc.text(`... (+ ${weekP.data.entries.length - 5})`, 108, currentAgingY);
                    currentAgingY += 4;
                }
            }
            
            currentAgingY += 6; // Space between blocks
        });

        currentAgingY += 2;

        // Metrics Section
        doc.setFontSize(7); 
        doc.setTextColor(26, 85, 122);
        doc.text(`PRAZO MÉDIO RECEBIMENTO: ${avgTermReceber} DIAS`, 14, currentAgingY);
        doc.text(`PREVISIBILIDADE: ${prevReceber.toFixed(1)}%`, 14, currentAgingY + 6);
        
        doc.setTextColor(185, 28, 28);
        doc.text(`PRAZO MÉDIO PAGAMENTO: ${avgTermPagar} DIAS`, 106, currentAgingY);
        doc.text(`PREVISIBILIDADE: ${prevPagar.toFixed(1)}%`, 106, currentAgingY + 6);
        
        currentAgingY += 20;

        // Tops Section
        doc.setTextColor(26, 85, 122);
        doc.text('TOP CLIENTES:', 14, currentAgingY);
        doc.setTextColor(185, 28, 28);
        doc.text('TOP DESPESAS:', 106, currentAgingY);
        
        let yTops = currentAgingY + 4;
        doc.setFontSize(6);
        doc.setTextColor(148, 163, 184);
        for(let i=0; i<3; i++) {
            if (topCustomers[i]) {
                doc.text(topCustomers[i][0].substring(0, 25).toUpperCase(), 16, yTops);
                doc.text(formatCurrency(topCustomers[i][1]), 102, yTops, { align: 'right' });
            }
            if (topExpenses[i]) {
                doc.text(topExpenses[i][0].substring(0, 25).toUpperCase(), 108, yTops);
                doc.text(formatCurrency(topExpenses[i][1]), 194, yTops, { align: 'right' });
            }
            yTops += 4;
        }

        const finalMetricsY = yTops + 10;

        // Final Balance Box
        doc.setFillColor(16, 185, 129); // #10b981
        doc.rect(14, finalMetricsY, 182, 20, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text('SALDO PROJETADO FINAL (RECEBER - PAGAR)', 105, finalMetricsY + 7, { align: 'center' });
        doc.setFontSize(16);
        doc.text(formatCurrency(saldoProjetadoFinal), 105, finalMetricsY + 17, { align: 'center' });

        const finalY = finalMetricsY + 35;
        
        doc.setFontSize(6);
        doc.setTextColor(148, 163, 184);
        doc.text('RELATÓRIO GERADO AUTOMATICAMENTE PELO SISTEMA FLUXO INTELIGENTE', 14, finalY);
        doc.text(`DATA DA EMISSÃO: ${new Date().toLocaleString('pt-BR')}`, 14, finalY + 4);

        window.open(doc.output('bloburl'), '_blank');
    };

    const populateTestData = async () => {
        if (!activeClientId) {
            alert('Por favor, selecione um cliente primeiro.');
            return;
        }

        const path = `financialAgenda/${activeClientId}/entries`;
        const mockEntries = [
            // Receivables (Receber)
            {
                clientId: activeClientId,
                description: 'Consultoria Mensal - Cliente Alfa',
                value: 15000,
                date: `${currentMonth}-10`,
                month: currentMonth,
                type: 'receber',
                category: 'Serviços',
                status: 'Recebido',
                createdAt: serverTimestamp()
            },
            {
                clientId: activeClientId,
                description: 'Venda de Software - Beta SA',
                value: 45500.50,
                date: `${currentMonth}-15`,
                month: currentMonth,
                type: 'receber',
                category: 'Produtos',
                status: 'Vencido',
                createdAt: serverTimestamp()
            },
            {
                clientId: activeClientId,
                description: 'Manutenção Preventiva - Gama Ltda',
                value: 8200,
                date: `${currentMonth}-22`,
                month: currentMonth,
                type: 'receber',
                category: 'Serviços',
                status: 'Pendente',
                createdAt: serverTimestamp()
            },
            {
                clientId: activeClientId,
                description: 'Implementação ERP - Delta Corp',
                value: 125000,
                date: `${currentMonth}-05`,
                month: currentMonth,
                type: 'receber',
                category: 'Projetos',
                status: 'Recebido',
                createdAt: serverTimestamp()
            },

            // Payables (Pagar)
            {
                clientId: activeClientId,
                description: 'Aluguel Escritório Central',
                value: 12000,
                date: `${currentMonth}-01`,
                month: currentMonth,
                type: 'pagar',
                category: 'Infraestrutura',
                status: 'Pago',
                createdAt: serverTimestamp()
            },
            {
                clientId: activeClientId,
                description: 'Folha de Pagamento - Abril',
                value: 85000,
                date: `${currentMonth}-05`,
                month: currentMonth,
                type: 'pagar',
                category: 'RH',
                status: 'Pago',
                createdAt: serverTimestamp()
            },
            {
                clientId: activeClientId,
                description: 'Fornecedor de Nuvem AWS',
                value: 4500.25,
                date: `${currentMonth}-10`,
                month: currentMonth,
                type: 'pagar',
                category: 'Tecnologia',
                status: 'Vencido',
                createdAt: serverTimestamp()
            },
            {
                clientId: activeClientId,
                description: 'Marketing Digital - Ads',
                value: 15000,
                date: `${currentMonth}-20`,
                month: currentMonth,
                type: 'pagar',
                category: 'Marketing',
                status: 'Pendente',
                createdAt: serverTimestamp()
            },
            {
                clientId: activeClientId,
                description: 'Energia Elétrica',
                value: 2300.40,
                date: `${currentMonth}-12`,
                month: currentMonth,
                type: 'pagar',
                category: 'Utilidades',
                status: 'Pendente',
                createdAt: serverTimestamp()
            }
        ];

        try {
            for (const entry of mockEntries) {
                await addDoc(collection(db, path), entry);
            }
            alert('Dados de teste criados com sucesso!');
        } catch (error) {
            console.error('Error populating test data:', error);
            alert('Erro ao criar dados de teste.');
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">📅 Minha Agenda de Contas</h1>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                            Planejamento mensal e fluxo de caixa projetado
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-white border border-slate-100 rounded-xl p-1 shadow-sm">
                        <button 
                            onClick={() => {
                                const d = new Date(currentMonth + '-01');
                                d.setMonth(d.getMonth() - 1);
                                setCurrentMonth(d.toISOString().substring(0, 7));
                            }}
                            className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <input 
                            type="month" 
                            value={currentMonth}
                            onChange={(e) => setCurrentMonth(e.target.value)}
                            className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-slate-900 focus:ring-0 px-2 cursor-pointer outline-none"
                        />
                        <button 
                            onClick={() => {
                                const d = new Date(currentMonth + '-01');
                                d.setMonth(d.getMonth() + 1);
                                setCurrentMonth(d.toISOString().substring(0, 7));
                            }}
                            className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    {isAdmin && (
                        <div className="relative group">
                            <select 
                                value={selectedClientId || ''} 
                                onChange={(e) => {
                                    const client = clients.find(c => c.id === e.target.value);
                                    setSelectedClient(e.target.value, client?.name || null);
                                }}
                                className="appearance-none bg-white border border-slate-100 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 shadow-sm pr-10 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                            >
                                <option value="">Selecionar Cliente...</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <User size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    )}

                    <Button 
                        onClick={() => isAdmin && populateTestData()}
                        variant="ghost"
                        className="text-[8px] font-bold text-slate-300 hover:text-primary uppercase tracking-[0.2em]"
                    >
                        Gerar Dados Teste
                    </Button>

                    <Button 
                        onClick={handleDownloadPDF}
                        className="bg-primary hover:bg-primary/90 text-white rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <FileText size={14} className="mr-2" /> Exportar Relatório PDF
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="h-64 flex items-center justify-center">
                    <Clock className="animate-spin text-slate-300" size={32} />
                </div>
            ) : !selectedClientId && isAdmin ? (
                <Card className="p-12 text-center bg-white border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                    <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Calendar size={32} />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Nenhum Cliente Selecionado</h3>
                    <p className="text-slate-400 text-xs font-medium max-w-xs mx-auto mt-2">
                        Selecione um cliente no seletor acima ou no Monitor Geral para visualizar a agenda financeira.
                    </p>
                    <Button 
                        variant="primary" 
                        className="mt-8 rounded-xl px-8 py-3 text-[11px] font-black uppercase tracking-widest"
                        onClick={() => setActiveTab && setActiveTab('dashboard')}
                    >
                        Ir para Monitor Geral
                    </Button>
                </Card>
            ) : (
                <>
                <div id="print-report" className="space-y-6 print:space-y-0 max-w-5xl mx-auto">
                    {/* Header for PRINT only */}
                    <div className="hidden print:flex items-center justify-between mb-8 border-b pb-6">
                        <div className="flex flex-col -space-y-1">
                            <div className="flex items-center">
                                <span className="text-2xl font-black tracking-tight text-[#004b8d]">Fluxo</span>
                                <span className="text-2xl font-black tracking-tight ml-1 text-[#5cb85c]">Inteligente</span>
                            </div>
                            <span className="text-[10px] font-bold tracking-[0.2em] uppercase leading-none opacity-50 text-slate-500">
                                Gestão Financeira BPO Premium
                            </span>
                        </div>
                        <div className="text-right">
                            <h1 className="text-xl font-black text-slate-900 uppercase">📅 Minha Agenda de Contas</h1>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{new Date(currentMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                        </div>
                    </div>

                    {/* Main Dashboard Report Layout */}
                    <div className="bg-slate-200 border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-2xl">
                        {/* Headers */}
                        <div className="grid grid-cols-2 gap-px text-white font-black uppercase tracking-widest text-sm">
                            <div className="bg-[#1a557a] py-6 text-center">CONTAS A RECEBER</div>
                            <div className="bg-[#b91c1c] py-6 text-center">CONTAS A PAGAR</div>
                        </div>

                        <div className="bg-white p-8 space-y-16">
                            {/* Row 1: Global Stats */}
                            <div className="grid grid-cols-2 gap-16">
                                {/* Receber Stats */}
                                <div className="space-y-8">
                                    <div className="grid grid-cols-2 gap-4 text-center">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total a Receber</p>
                                            <p className="text-lg font-black text-slate-800">{formatCurrency(totalAReceber)}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recebido no Mês</p>
                                            <p className={cn("text-lg font-black", recebidoNoMes > 0 ? "text-emerald-500" : "text-slate-200")}>
                                                {recebidoNoMes > 0 ? formatCurrency(recebidoNoMes) : '-'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-center">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">% Inadimplência</p>
                                            <p className={cn("text-xl font-black", inadimplenciaPercent > 10 ? "text-rose-500" : "text-emerald-500")}>
                                                {inadimplenciaPercent.toFixed(1)}%
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Vencido</p>
                                            <p className="text-xl font-black text-rose-500">{formatCurrency(valorInadimplente)}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Pagar Stats */}
                                <div className="space-y-8">
                                    <div className="grid grid-cols-2 gap-4 text-center">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total a Pagar</p>
                                            <p className="text-lg font-black text-slate-800">{formatCurrency(totalAPagar)}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pago no Mês</p>
                                            <p className={cn("text-lg font-black", pagoNoMes > 0 ? "text-emerald-500" : "text-slate-200")}>
                                                {pagoNoMes > 0 ? formatCurrency(pagoNoMes) : '-'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-center">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">% Em Atraso</p>
                                            <p className={cn("text-xl font-black", emAtrasoPercent > 10 ? "text-rose-500" : "text-emerald-500")}>
                                                {emAtrasoPercent.toFixed(1)}%
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo em Atraso</p>
                                            <p className="text-xl font-black text-rose-500">{formatCurrency(valorEmAtraso)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* AGING SECTION (Synchronized Weekly Rows) */}
                            <div className="space-y-12">
                                <div className="grid grid-cols-2 gap-16 border-b-2 border-slate-50 pb-4">
                                    <h3 className="text-[11px] font-black text-[#1a557a] uppercase tracking-[0.2em]">Aging — Recebimentos Projetados</h3>
                                    <h3 className="text-[11px] font-black text-[#b91c1c] uppercase tracking-[0.2em]">Aging — Pagamentos Projetados</h3>
                                </div>

                                {monthlyWeeklyAgingReceber.map((weekR, idx) => {
                                    const weekP = monthlyWeeklyAgingPagar[idx];
                                    const maxItems = Math.max(weekR.data.entries.length, weekP.data.entries.length);
                                    
                                    return (
                                        <div key={idx} className="grid grid-cols-2 gap-16 items-start">
                                            {/* Receivable Aging Card */}
                                            <div className="bg-slate-50/80 rounded-[2rem] p-6 border border-slate-100 min-h-[160px] flex flex-col">
                                                <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-200/50">
                                                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{weekR.label}</span>
                                                    <span className="text-[13px] font-black text-[#1a557a]">{formatCurrency(weekR.data.total)}</span>
                                                </div>
                                                <div className="space-y-2 flex-grow">
                                                    {maxItems > 0 ? Array.from({ length: Math.min(maxItems, 5) }).map((_, i) => {
                                                        const e = weekR.data.entries[i];
                                                        return (
                                                            <div key={i} className="grid grid-cols-[40px,1fr,80px] gap-4 items-center text-[10px] min-h-[20px]">
                                                                {e ? (
                                                                    <>
                                                                        <span className="font-black text-slate-300 tabular-nums">{new Date(e.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                                                        <span className="font-bold text-slate-600 truncate">{e.description}</span>
                                                                        <span className="font-black text-slate-900 tabular-nums text-right">{formatCurrency(e.value)}</span>
                                                                    </>
                                                                ) : (
                                                                    <div className="col-span-3 h-4" /> // Empty space for symmetry
                                                                )}
                                                            </div>
                                                        );
                                                    }) : (
                                                        <div className="h-full flex items-center justify-center opacity-30 italic font-bold text-[10px] uppercase text-slate-400">Sem lançamentos</div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Payable Aging Card */}
                                            <div className="bg-slate-50/80 rounded-[2rem] p-6 border border-slate-100 min-h-[160px] flex flex-col">
                                                <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-200/50">
                                                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{weekP.label}</span>
                                                    <span className="text-[13px] font-black text-[#b91c1c]">{formatCurrency(weekP.data.total)}</span>
                                                </div>
                                                <div className="space-y-2 flex-grow">
                                                    {maxItems > 0 ? Array.from({ length: Math.min(maxItems, 5) }).map((_, i) => {
                                                        const e = weekP.data.entries[i];
                                                        return (
                                                            <div key={i} className="grid grid-cols-[40px,1fr,80px] gap-4 items-center text-[10px] min-h-[20px]">
                                                                {e ? (
                                                                    <>
                                                                        <span className="font-black text-slate-300 tabular-nums">{new Date(e.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                                                        <span className="font-bold text-slate-600 truncate">{e.description}</span>
                                                                        <span className="font-black text-slate-900 tabular-nums text-right">{formatCurrency(e.value)}</span>
                                                                    </>
                                                                ) : (
                                                                    <div className="col-span-3 h-4" /> // Empty space for symmetry
                                                                )}
                                                            </div>
                                                        );
                                                    }) : (
                                                        <div className="h-full flex items-center justify-center opacity-30 italic font-bold text-[10px] uppercase text-slate-400">Sem lançamentos</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Additional Metrics Row */}
                            <div className="grid grid-cols-2 gap-16 pt-8">
                                <div className="space-y-8">
                                    <div className="grid grid-cols-2 gap-4 items-end border-b border-slate-100 pb-4">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-400 uppercase">Prazo Médio</p>
                                            <p className="font-black text-slate-700">{avgTermReceber} DIAS</p>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <p className="text-[9px] font-black text-slate-400 uppercase">Previsibilidade</p>
                                            <p className={cn("text-lg font-black", prevReceber > 85 ? "text-emerald-500" : "text-amber-500")}>{prevReceber.toFixed(1)}%</p>
                                            <p className="text-[7px] font-bold text-slate-300 uppercase italic">Meta: 85%+</p>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-[#1a557a] uppercase tracking-widest">Maiores Clientes</h4>
                                        <div className="space-y-2">
                                            {topCustomers.slice(0,3).map(([name, val], i) => (
                                                <div key={i} className="flex justify-between text-[11px] font-bold pb-1 border-b border-slate-50 last:border-0 uppercase tracking-tighter">
                                                    <span className="text-slate-400 truncate pr-4">{name}</span>
                                                    <span className="text-slate-900 tabular-nums">{formatCurrency(val)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    <div className="grid grid-cols-2 gap-4 items-end border-b border-slate-100 pb-4">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-400 uppercase">Prazo Médio</p>
                                            <p className="font-black text-slate-700">{avgTermPagar} DIAS</p>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <p className="text-[9px] font-black text-slate-400 uppercase">Previsibilidade</p>
                                            <p className={cn("text-lg font-black", prevPagar > 95 ? "text-emerald-500" : "text-amber-500")}>{prevPagar.toFixed(1)}%</p>
                                            <p className="text-[7px] font-bold text-slate-300 uppercase italic">Meta: 95%+</p>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-[#b91c1c] uppercase tracking-widest">Maiores Despesas</h4>
                                        <div className="space-y-2">
                                            {topExpenses.slice(0,3).map(([name, val], i) => (
                                                <div key={i} className="flex justify-between text-[11px] font-bold pb-1 border-b border-slate-50 last:border-0 uppercase tracking-tighter">
                                                    <span className="text-slate-400 truncate pr-4">{name}</span>
                                                    <span className="text-slate-900 tabular-nums">{formatCurrency(val)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* FINAL PROJECTED BALANCE SECTION */}
                    <div className="bg-[#10b981] text-white rounded-3xl overflow-hidden shadow-xl mb-12">
                        <div className="p-4 border-b border-white/10 text-center">
                            <h2 className="text-xs font-black uppercase tracking-widest">SALDO PROJETADO FINAL</h2>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                                <div className="space-y-3">
                                    <div className="flex justify-between text-[11px] font-black uppercase tracking-tight border-b border-white/10 pb-1">
                                        <span className="text-white/60">Recebível no mês</span>
                                        <span className="text-emerald-200">{formatCurrency(recebidoNoMes)}</span>
                                    </div>
                                    <div className="flex justify-between text-[13px] font-black uppercase tracking-tight">
                                        <span>Total a Receber</span>
                                        <span className="text-emerald-100">{formatCurrency(totalAReceber)}</span>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between text-[11px] font-black uppercase tracking-tight border-b border-white/10 pb-1">
                                        <span className="text-white/60">Pago no mês</span>
                                        <span className="text-white/70">{formatCurrency(pagoNoMes)}</span>
                                    </div>
                                    <div className="flex justify-between text-[13px] font-black uppercase tracking-tight">
                                        <span className="text-white/80">Total a Pagar</span>
                                        <span className="text-white/90">{formatCurrency(totalAPagar)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center pt-6 border-t border-white/20 text-center">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 mb-2">SALDO PROJETADO (RECEBER – PAGAR)</p>
                                <h3 className="text-3xl font-black tracking-tight">{formatCurrency(saldoProjetadoFinal)}</h3>
                            </div>
                        </div>
                        <div className="p-2 bg-black/10 text-center">
                            <p className="text-[7px] text-white/40 uppercase font-bold italic">
                                Relatório gerado automaticamente — Dados atualizados em tempo real a partir das abas Contas a Pagar e Contas a Receber
                            </p>
                        </div>
                    </div>

                    {/* Table View (Collapsible) */}
                    <Card className="border-none shadow-xl shadow-slate-200/20 bg-white rounded-[2rem] overflow-hidden">
                        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                <Calendar size={14} className="text-primary" />
                                Detalhamento das Movimentações
                            </h3>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50">
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Mês</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Descrição</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                        {isAdmin && <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ação</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {monthlyEntries.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-20 text-center">
                                                <SearchX size={40} className="mx-auto text-slate-200 mb-4" />
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum lançamento encontrado para este mês</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        monthlyEntries.map((entry) => (
                                            <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="text-xs font-bold text-slate-600">
                                                        {new Date(entry.date).toLocaleDateString('pt-BR')}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase">
                                                        {entry.month}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-slate-900 tracking-tight">{entry.description}</span>
                                                        <span className={cn(
                                                            "text-[8px] font-black uppercase tracking-widest mt-0.5",
                                                            entry.type === 'receber' ? 'text-emerald-500' : 'text-rose-500'
                                                        )}>
                                                            {entry.type === 'receber' ? 'Entrada' : 'Saída'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className={cn(
                                                        "text-sm font-black",
                                                        entry.type === 'receber' ? 'text-emerald-600' : 'text-slate-900'
                                                    )}>
                                                        {entry.type === 'pagar' ? '-' : '+'} {formatCurrency(entry.value)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className={cn(
                                                        "inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                                                        getStatusColor(entry.status)
                                                    )}>
                                                        {entry.status}
                                                    </div>
                                                </td>
                                                {isAdmin && (
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button 
                                                                onClick={() => handleDeleteEntry(entry.id)}
                                                                className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-500 transition-all"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>

            {/* Add Entry Modal */}
            <AnimatePresence>
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
                        >
                            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Novo Lançamento</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Agenda para: {clients.find(c => c.id === activeClientId)?.name}</p>
                                </div>
                                <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl transition-all">
                                    <SearchX size={20} className="text-slate-400" />
                                </button>
                            </div>

                            <div className="p-8 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo</label>
                                        <select 
                                            value={newEntry.type}
                                            onChange={(e) => setNewEntry({...newEntry, type: e.target.value as any})}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all font-black uppercase tracking-tight"
                                        >
                                            <option value="pagar">SAÍDA (PAGAR)</option>
                                            <option value="receber">ENTRADA (RECEBER)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data</label>
                                        <input 
                                            type="date"
                                            value={newEntry.date}
                                            onChange={(e) => setNewEntry({...newEntry, date: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição</label>
                                    <input 
                                        type="text"
                                        value={newEntry.description}
                                        onChange={(e) => setNewEntry({...newEntry, description: e.target.value})}
                                        placeholder="Ex: Aluguel Escritório"
                                        className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Plano de Contas</label>
                                        <select 
                                            value={newEntry.accountId}
                                            onChange={(e) => {
                                                const accId = e.target.value;
                                                const acc = effectiveAccounts.find(a => a.id === accId);
                                                setNewEntry({
                                                    ...newEntry, 
                                                    accountId: accId,
                                                    category: acc ? acc.name : newEntry.category
                                                });
                                            }}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all"
                                        >
                                            <option value="">Selecione uma conta...</option>
                                            {Array.from(new Set(effectiveAccounts.map(a => a.group))).map(group => (
                                                <optgroup key={group} label={group}>
                                                    {effectiveAccounts
                                                        .filter(a => a.group === group)
                                                        .map(acc => (
                                                            <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                                                        ))
                                                    }
                                                </optgroup>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Centro de Custo</label>
                                        <select 
                                            value={newEntry.costCenterId}
                                            onChange={(e) => setNewEntry({...newEntry, costCenterId: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all"
                                        >
                                            <option value="">Selecione um centro...</option>
                                            {effectiveCostCenters.map(cc => (
                                                <option key={cc.id} value={cc.id}>{cc.code ? `${cc.code} - ` : ''}{cc.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor</label>
                                        <input 
                                            type="number"
                                            value={newEntry.value}
                                            onChange={(e) => setNewEntry({...newEntry, value: parseFloat(e.target.value)})}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                                        <select 
                                            value={newEntry.status}
                                            onChange={(e) => setNewEntry({...newEntry, status: e.target.value as any})}
                                            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all"
                                        >
                                            <option value="Pendente">Pendente</option>
                                            <option value="Pago">Pago</option>
                                            <option value="Parcial">Parcial</option>
                                            <option value="Recebido">Recebido</option>
                                            <option value="Vencido">Vencido</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria</label>
                                    <input 
                                        type="text"
                                        value={newEntry.category}
                                        onChange={(e) => setNewEntry({...newEntry, category: e.target.value})}
                                        placeholder="Ex: Operacional, Impostos..."
                                        className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="p-8 bg-slate-50 flex gap-3">
                                <Button 
                                    variant="ghost" 
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest"
                                >
                                    Cancelar
                                </Button>
                                <Button 
                                    onClick={handleAddEntry}
                                    className="flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                                >
                                    Salvar Lançamento
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            </>
            )}
        </div>
    );
};
