import React, { useState, useEffect } from 'react';
import { 
    User, 
    Mail, 
    Shield, 
    Bell, 
    Camera, 
    Save, 
    Lock,
    ExternalLink,
    CreditCard,
    CheckCircle2,
    Calendar,
    ArrowUpRight,
    Search,
    Download,
    QrCode,
    X,
    MapPin,
    Loader2,
    MessageSquare,
    ChevronLeft,
    Users, 
    TrendingUp, 
    AlertCircle, 
    Settings, 
    ShieldCheck, 
    Plus, 
    Trash2, 
    Building2, 
    Info, 
    LockIcon, 
    UnlockIcon, 
    Share2, 
    Copy,
    Check,
    Globe,
    FileText,
    Upload,
    ChevronRight,
    Clock,
    LayoutDashboard,
    UserPlus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useClient } from '../context/ClientContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';

const REPORT_CATEGORIES = [
    '📅 Minha Agenda de Contas',
    '🔄 Conciliação Bancária',
    '📈 DRE Gerencial',
    '💰 Fluxo de Caixa',
    '📝 Relatório Mensal',
    '🎯 Dashboards'
];

const CATEGORY_COLORS: Record<string, { bgColor: string; borderColor: string; textColor: string; iconBg: string; iconColor: string }> = {
    '📅 Minha Agenda de Contas': { bgColor: 'bg-slate-50/70', borderColor: 'border-slate-200', textColor: 'text-slate-700', iconBg: 'bg-slate-100', iconColor: 'text-slate-500' },
    '🔄 Conciliação Bancária': { bgColor: 'bg-emerald-50/70', borderColor: 'border-emerald-200', textColor: 'text-emerald-700', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-500' },
    '📈 DRE Gerencial': { bgColor: 'bg-amber-50/70', borderColor: 'border-amber-200', textColor: 'text-amber-700', iconBg: 'bg-amber-100', iconColor: 'text-amber-500' },
    '💰 Fluxo de Caixa': { bgColor: 'bg-indigo-50/70', borderColor: 'border-indigo-200', textColor: 'text-indigo-700', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-500' },
    '📝 Relatório Mensal': { bgColor: 'bg-rose-50/70', borderColor: 'border-rose-200', textColor: 'text-rose-700', iconBg: 'bg-rose-100', iconColor: 'text-rose-500' },
    '🎯 Dashboards': { bgColor: 'bg-teal-50/70', borderColor: 'border-teal-200', textColor: 'text-teal-700', iconBg: 'bg-teal-100', iconColor: 'text-teal-500' }
};

export const Profile = ({ setActiveTab, onBack }: { setActiveTab?: (tab: string) => void, onBack?: () => void }) => {
    const { profile, user, isAdmin, plansConfig, updateProfile, updateEmail, updatePassword, sendPasswordResetEmail } = useAuth();
    const { isPreviewMode, selectedClientId, clients } = useClient();
    const [isSaving, setIsSaving] = useState(false);
    const [isSearchingCep, setIsSearchingCep] = useState(false);
    const [activeSubTab, setActiveSubTab] = useState<'general' | 'security'>('general');
    const [adminActiveTab, setAdminActiveTab] = useState<'payments' | 'clients' | 'plans' | 'users' | 'company' | 'lgpd'>('clients');
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [inviteData, setInviteData] = useState({ email: '', name: '', plan: 'essencial' });
    const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
    const [isPhotoPreviewOpen, setIsPhotoPreviewOpen] = useState(false);
    const [photoZoom, setPhotoZoom] = useState(1);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [photoError, setPhotoError] = useState<string | null>(null);

    const compressImage = (base64Str: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = base64Str;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400;
                const MAX_HEIGHT = 400;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                // 0.7 quality for a good balance
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = (err) => reject(err);
        });
    };

    const handleSavePhoto = async () => {
        if (!pendingPhoto) return;
        setIsUploadingPhoto(true);
        setPhotoError(null);
        try {
            const compressed = await compressImage(pendingPhoto);
            
            if (isPreviewMode && selectedClientId) {
                const clientRef = doc(db, 'userProfiles', selectedClientId);
                await updateDoc(clientRef, {
                    photoURL: compressed,
                    updatedAt: serverTimestamp()
                });
            } else {
                await updateProfile({ photoURL: compressed });
            }
            setIsPhotoPreviewOpen(false);
            setPendingPhoto(null);
        } catch (err) {
            console.error('Error saving photo:', err);
            setPhotoError('Erro ao processar foto. Tente uma imagem diferente.');
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const showAdminView = isAdmin && !isPreviewMode;
    const isActuallyClient = !isAdmin || isPreviewMode;
    
    // Get the client being previewed if applicable
    const previewClient = isPreviewMode ? clients.find(c => c.id === selectedClientId) : null;
    const effectiveProfile = isPreviewMode ? previewClient : profile;
    
    // Security specific state
    const [securityData, setSecurityData] = useState({
        email: effectiveProfile?.email || '',
        newPassword: '',
        confirmPassword: ''
    });
    const [securityStatus, setSecurityStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);

    const [formData, setFormData] = useState({
        name: effectiveProfile?.name || '',
        companyName: effectiveProfile?.companyName || '',
        phone: effectiveProfile?.phone || '',
        document: effectiveProfile?.document || '',
        cep: effectiveProfile?.cep || '',
        address: effectiveProfile?.address || '',
        addressNumber: effectiveProfile?.addressNumber || '',
        complement: effectiveProfile?.complement || '',
        neighborhood: effectiveProfile?.neighborhood || '',
        city: effectiveProfile?.city || '',
        state: effectiveProfile?.state || ''
    });

    // Update form when effectiveProfile changes (useful for switching in preview mode)
    useEffect(() => {
        if (effectiveProfile) {
            setFormData({
                name: effectiveProfile.name || '',
                companyName: effectiveProfile.companyName || '',
                phone: effectiveProfile.phone || '',
                document: effectiveProfile.document || '',
                cep: effectiveProfile.cep || '',
                address: effectiveProfile.address || '',
                addressNumber: effectiveProfile.addressNumber || '',
                complement: effectiveProfile.complement || '',
                neighborhood: effectiveProfile.neighborhood || '',
                city: effectiveProfile.city || '',
                state: effectiveProfile.state || ''
            });
            setSecurityData(prev => ({
                ...prev,
                email: effectiveProfile.email || ''
            }));
        }
    }, [effectiveProfile]);

    /** 
     * Helper to mask document (CPF or CNPJ)
     */
    const maskDocument = (value: string) => {
        const clean = value.replace(/\D/g, '');
        if (clean.length <= 11) {
            // CPF: 000.000.000-00
            return clean
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
                .substring(0, 14);
        } else {
            // CNPJ: 00.000.000/0000-00
            return clean
                .replace(/^(\d{2})(\d)/, '$1.$2')
                .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
                .replace(/\.(\d{3})(\d)/, '.$1/$2')
                .replace(/(\d{4})(\d)/, '$1-$2')
                .substring(0, 18);
        }
    };

    const isDocumentValid = (doc: string) => {
        const clean = doc.replace(/\D/g, '');
        
        if (clean.length !== 11 && clean.length !== 14) return false;
        if (/^(\d)\1+$/.test(clean)) return false; // Reject all same digits

        if (clean.length === 11) {
            // CPF Validation
            let sum = 0;
            for (let i = 1; i <= 9; i++) sum += parseInt(clean.substring(i - 1, i)) * (11 - i);
            let rest = (sum * 10) % 11;
            if (rest === 10 || rest === 11) rest = 0;
            if (rest !== parseInt(clean.substring(9, 10))) return false;

            sum = 0;
            for (let i = 1; i <= 10; i++) sum += parseInt(clean.substring(i - 1, i)) * (12 - i);
            rest = (sum * 10) % 11;
            if (rest === 10 || rest === 11) rest = 0;
            if (rest !== parseInt(clean.substring(10, 11))) return false;
            
            return true;
        } else {
            // CNPJ Validation
            const size = clean.length - 2;
            const numbers = clean.substring(0, size);
            const digits = clean.substring(size);
            
            const calc = (n: string) => {
                let currentSize = n.length;
                let currentSum = 0;
                let pos = currentSize - 7;
                for (let i = currentSize; i >= 1; i--) {
                    currentSum += parseInt(n.charAt(currentSize - i)) * pos--;
                    if (pos < 2) pos = 9;
                }
                const result = currentSum % 11 < 2 ? 0 : 11 - (currentSum % 11);
                return result;
            };

            const firstDigit = calc(numbers);
            if (firstDigit !== parseInt(digits.charAt(0))) return false;

            const secondDigit = calc(numbers + firstDigit);
            if (secondDigit !== parseInt(digits.charAt(1))) return false;

            return true;
        }
    };

    /** 
     * Helper to mask Phone 
     */
    const maskPhone = (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/^(\d{2})(\d)/g, '($1) $2')
            .replace(/(\d)(\d{4})$/, '$1-$2')
            .substring(0, 15);
    };

    /**
     * Helper to mask CEP
     */
    const maskCEP = (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/^(\d{5})(\d)/, '$1-$2')
            .substring(0, 9);
    };

    const handleCepLookup = async (cep: string) => {
        const cleanCep = cep.replace(/\D/g, '');
        setFormData(prev => ({ ...prev, cep: maskCEP(cep) }));
        
        if (cleanCep.length === 8) {
            setIsSearchingCep(true);
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
                const data = await response.json();
                
                if (!data.erro) {
                    setFormData(prev => ({
                        ...prev,
                        address: data.logradouro,
                        neighborhood: data.bairro,
                        city: data.localidade,
                        state: data.uf
                    }));
                }
            } catch (error) {
                console.error('Erro ao buscar CEP:', error);
            } finally {
                setIsSearchingCep(false);
            }
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (isPreviewMode && selectedClientId) {
                const clientRef = doc(db, 'userProfiles', selectedClientId);
                await updateDoc(clientRef, {
                    ...formData,
                    updatedAt: serverTimestamp()
                });
            } else {
                await updateProfile(formData);
            }
        } catch (error) {
            console.error('Error saving profile:', error);
            handleFirestoreError(error, OperationType.WRITE, isPreviewMode ? `userProfiles/${selectedClientId}` : `userProfiles/${user?.uid}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSecurityUpdate = async () => {
        if (isPreviewMode) {
            setSecurityStatus({ type: 'error', message: 'Alterações de segurança não permitidas em modo de visualização' });
            return;
        }

        setSecurityStatus(null);
        setIsSaving(true);
        
        try {
            // Email update
            if (securityData.email !== effectiveProfile?.email) {
                await updateEmail(securityData.email);
            }

            // Password update
            if (securityData.newPassword) {
                if (securityData.newPassword !== securityData.confirmPassword) {
                    throw new Error('As senhas não coincidem');
                }
                if (securityData.newPassword.length < 6) {
                    throw new Error('A senha deve ter pelo menos 6 caracteres');
                }
                await updatePassword(securityData.newPassword);
            }

            setSecurityStatus({ type: 'success', message: 'Credenciais atualizadas com sucesso!' });
            setSecurityData(prev => ({ ...prev, newPassword: '', confirmPassword: '' }));
        } catch (error: any) {
            console.error('Security update error:', error);
            let message = 'Erro ao atualizar segurança.';
            if (error.code === 'auth/requires-recent-login') {
                message = 'Por segurança, você precisa fazer login novamente para alterar estas informações.';
            } else if (error.message) {
                message = error.message;
            }
            setSecurityStatus({ type: 'error', message });
        } finally {
            setIsSaving(false);
        }
    };

    const getPlanPrice = (planId?: string, paymentDate?: Date) => {
        const planKey = planId?.toLowerCase();
        if (plansConfig && planKey && plansConfig[planKey]) {
            const plan = plansConfig[planKey];
            
            // Se houver data de atualização de preço, verifica se o pagamento é anterior
            if (plan.priceUpdatedAt && plan.previousPrice !== undefined && paymentDate) {
                const updatedAt = plan.priceUpdatedAt.toDate ? plan.priceUpdatedAt.toDate() : new Date(plan.priceUpdatedAt);
                
                // Se a data do pagamento for anterior à mudança, usa o preço antigo
                if (paymentDate < updatedAt) {
                    return plan.previousPrice;
                }
            }
            return plan.price;
        }
        // Fallback defaults
        if (planKey === 'essencial') return 400;
        if (planKey === 'profissional') return 800;
        if (planKey === 'premium') return 1200;
        return 400;
    };

    // Simulated payment history based on registration date
    const registrationDate = profile?.createdAt?.toDate ? profile.createdAt.toDate() : new Date();
    const today = new Date();
    const [selectedPayment, setSelectedPayment] = useState<any>(null);
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card' | null>(null);

    const payments = [];
    
    let currentMonth = new Date(registrationDate.getFullYear(), registrationDate.getMonth(), 1);
    while (currentMonth <= today) {
        const dueDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 5);
        payments.unshift({
            id: currentMonth.getTime().toString(),
            month: currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
            date: dueDate.toLocaleDateString('pt-BR'),
            amount: profile?.monthlyValue || getPlanPrice(profile?.planId, dueDate),
            status: 'pago',
            method: 'Cartão •••• 4412'
        });
        currentMonth.setMonth(currentMonth.getMonth() + 1);
    }

    const nextDueDate = new Date(today.getFullYear(), today.getMonth() + 1, 5);

    const upcomingPayment = {
        id: 'upcoming',
        month: nextDueDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        date: nextDueDate.toLocaleDateString('pt-BR'),
        amount: profile?.monthlyValue || getPlanPrice(profile?.planId, nextDueDate),
        status: 'pendente',
        method: 'Aguardando Pagamento'
    };

    const activePlan = {
        name: profile?.planId === 'essencial' ? 'Essencial' : profile?.planId === 'profissional' ? 'Profissional' : profile?.planId === 'premium' ? 'Premium' : 'Nenhum Plan Ativo',
        price: profile?.monthlyValue || getPlanPrice(profile?.planId, today),
        renovation: nextDueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    };

    // Admin Company Data Management
    const CompanyManagement = () => {
        const [companyData, setCompanyData] = useState<any>({
            name: 'Fluxo Inteligente BPO',
            cnpj: '',
            email: 'contato@fluxointeligente.com',
            phone: '',
            cep: '',
            address: '',
            addressNumber: '',
            complement: '',
            neighborhood: '',
            city: '',
            state: '',
            website: 'www.fluxointeligente.com'
        });
        const [loading, setLoading] = useState(true);
        const [saving, setSaving] = useState(false);
        const [searchingCep, setSearchingCep] = useState(false);

        useEffect(() => {
            const fetchCompany = async () => {
                const unsubscribe = onSnapshot(doc(db, 'system_configs', 'company_config'), (docSnap) => {
                    if (docSnap.exists()) {
                        setCompanyData(docSnap.data());
                    }
                    setLoading(false);
                });
                return unsubscribe;
            };
            const unsub = fetchCompany();
            return () => { unsub.then(fn => fn && (typeof fn === 'function' && fn())); };
        }, []);

        const handleCepSearch = async (cep: string) => {
            const cleanCep = cep.replace(/\D/g, '');
            setCompanyData(prev => ({ ...prev, cep: maskCEP(cep) }));
            
            if (cleanCep.length === 8) {
                setSearchingCep(true);
                try {
                    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
                    const data = await response.json();
                    
                    if (!data.erro) {
                        setCompanyData(prev => ({
                            ...prev,
                            address: data.logradouro,
                            neighborhood: data.bairro,
                            city: data.localidade,
                            state: data.uf
                        }));
                    }
                } catch (error) {
                    console.error('Erro ao buscar CEP da empresa:', error);
                } finally {
                    setSearchingCep(false);
                }
            }
        };

        const handleSave = async () => {
            setSaving(true);
            try {
                await setDoc(doc(db, 'system_configs', 'company_config'), {
                    ...companyData,
                    updatedAt: serverTimestamp()
                }, { merge: true });
                alert("Dados da Fluxo Inteligente atualizados com sucesso!");
            } catch (error) {
                console.error("Error saving company data:", error);
            } finally {
                setSaving(false);
            }
        };

        return (
            <Card className="p-8 space-y-8 rounded-[2.5rem] border-slate-100 shadow-xl shadow-slate-200/5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                            <Building2 size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Dados da Empresa</h2>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Informações da Fluxo Inteligente</p>
                        </div>
                    </div>
                    <Button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="bg-primary text-white rounded-xl text-[10px] font-black uppercase px-6 h-10 shadow-lg shadow-primary/20"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : 'Salvar Dados'}
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Comercial</label>
                        <input 
                            value={companyData.name}
                            onChange={(e) => setCompanyData({...companyData, name: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CNPJ / CPF</label>
                        <input 
                            value={companyData.cnpj}
                            onChange={(e) => setCompanyData({...companyData, cnpj: maskDocument(e.target.value)})}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                            placeholder="00.000.000/0001-00 ou 000.000.000-00"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CEP</label>
                        <div className="relative">
                            <input 
                                value={companyData.cep}
                                onChange={(e) => handleCepSearch(e.target.value)}
                                maxLength={9}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                                placeholder="00000-000"
                            />
                            {searchingCep && <Loader2 className="absolute right-3 top-3 animate-spin text-primary" size={16} />}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail de Contato</label>
                        <input 
                            value={companyData.email}
                            onChange={(e) => setCompanyData({...companyData, email: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                            placeholder="contato@empresa.com"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone / WhatsApp</label>
                        <input 
                            value={companyData.phone}
                            onChange={(e) => setCompanyData({...companyData, phone: maskPhone(e.target.value)})}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                        />
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço (Logradouro)</label>
                        <input 
                            value={companyData.address}
                            onChange={(e) => setCompanyData({...companyData, address: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4 md:col-span-2">
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Número</label>
                            <input 
                                value={companyData.addressNumber}
                                onChange={(e) => setCompanyData({...companyData, addressNumber: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                                placeholder="123"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Complemento</label>
                            <input 
                                value={companyData.complement}
                                onChange={(e) => setCompanyData({...companyData, complement: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                                placeholder="Sala 01 / Bloco A"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 md:col-span-2">
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Bairro</label>
                            <input 
                                value={companyData.neighborhood}
                                onChange={(e) => setCompanyData({...companyData, neighborhood: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cidade / UF</label>
                            <input 
                                value={`${companyData.city} - ${companyData.state}`}
                                readOnly
                                className="w-full bg-slate-50/50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-400 outline-none"
                            />
                        </div>
                    </div>
                </div>
                
                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-center gap-3">
                    <Info size={16} className="text-primary" />
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">Estes dados serão utilizados em relatórios e cabeçalhos automáticos para seus clientes.</p>
                </div>
            </Card>
        );
    };

    // Admin Payment Management Component (Updated with Blocking)
    const AdminPaymentsCard = () => {
        const [clientsWithPayments, setClientsWithPayments] = useState<any[]>([]);
        const [loading, setLoading] = useState(true);
        const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM

        useEffect(() => {
            if (!isAdmin) return;

            // Use onSnapshot for real-time updates
            setLoading(true);
            const clientsQuery = query(collection(db, 'userProfiles'), where('role', '==', 'client'));
            const unsubscribeClients = onSnapshot(clientsQuery, (clientsSnap) => {
                const clientsList = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const paymentsQuery = query(collection(db, 'payments'), where('month', '==', selectedMonth));
                const unsubscribePayments = onSnapshot(paymentsQuery, (paymentsSnap) => {
                    const paymentsByClient = paymentsSnap.docs.reduce((acc: any, doc) => {
                        acc[doc.data().clientId] = doc.data();
                        return acc;
                    }, {});

                    const combined = clientsList.map(c => ({
                        ...c,
                        paymentStatus: paymentsByClient[c.id]?.status || 'pendente',
                        paymentId: paymentsByClient[c.id]?.id
                    }));

                    setClientsWithPayments(combined);
                    setLoading(false);
                }, (error) => {
                    console.error("Error listening to payments:", error);
                    handleFirestoreError(error, OperationType.GET, 'payments');
                    setLoading(false);
                });

                return () => unsubscribePayments();
            }, (error) => {
                console.error("Error listening to clients:", error);
                handleFirestoreError(error, OperationType.GET, 'userProfiles');
                setLoading(false);
            });

            return () => unsubscribeClients();
        }, [isAdmin, selectedMonth]);

        const toggleBlock = async (client: any) => {
            const newBlockStatus = !client.isBlocked;
            try {
                await updateDoc(doc(db, 'userProfiles', client.id), {
                    isBlocked: newBlockStatus,
                    status: newBlockStatus ? 'Inativo' : 'Ativo',
                    updatedAt: serverTimestamp()
                });
            } catch (error) {
                console.error("Error toggling block:", error);
            }
        };

        const togglePayment = async (client: any) => {
            const newStatus = client.paymentStatus === 'pago' ? 'pendente' : 'pago';
            const paymentId = `${client.id}_${selectedMonth}`;
            
            // Ref para o primeiro dia do mês selecionado para cálculo de preço histórico
            const refDate = new Date(selectedMonth + '-02'); 

            try {
                await setDoc(doc(db, 'payments', paymentId), {
                    clientId: client.id,
                    clientName: client.name || 'Cliente',
                    month: selectedMonth,
                    amount: client.monthlyValue || getPlanPrice(client.planId, refDate),
                    status: newStatus,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            } catch (error) {
                console.error("Error updating payment:", error);
            }
        };

        const refDate = new Date(selectedMonth + '-02');
        const totals = {
            paid: clientsWithPayments.filter(c => c.paymentStatus === 'pago').length,
            pending: clientsWithPayments.filter(c => c.paymentStatus === 'pendente').length,
            total: clientsWithPayments.length,
            revenue: clientsWithPayments.filter(c => c.paymentStatus === 'pago').reduce((acc, c) => acc + (c.monthlyValue || getPlanPrice(c.planId, refDate)), 0)
        };

        const monthYearLabel = new Date(selectedMonth + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

        return (
            <Card className="p-8 space-y-8 rounded-[2.5rem] border-slate-100 shadow-xl shadow-slate-200/5 overflow-hidden">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                            <TrendingUp size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Gestão de Mensalidades</h2>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Controle de pagamentos BPO Financeiro</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input 
                            type="month" 
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                        />
                    </div>
                </div>

                {/* Summary View */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Recebido</p>
                        <p className="text-sm font-black text-emerald-600">{formatCurrency(totals.revenue)}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Pagos</p>
                        <p className="text-sm font-black text-slate-900">{totals.paid} <span className="text-slate-400 text-[10px]">/{totals.total}</span></p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Pendentes</p>
                        <p className="text-sm font-black text-amber-500">{totals.pending}</p>
                    </div>
                    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                        <p className="text-[8px] font-black text-primary uppercase tracking-widest mb-1">Mês Ref.</p>
                        <p className="text-[10px] font-black text-slate-900 uppercase">{monthYearLabel}</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Listagem de Clientes</h3>
                    {loading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="animate-spin text-primary" size={24} />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando dados...</p>
                        </div>
                    ) : clientsWithPayments.length === 0 ? (
                        <div className="py-12 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-100">
                            <Users className="mx-auto text-slate-300 mb-2" size={32} />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum cliente cadastrado</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {clientsWithPayments.map((client) => (
                                <motion.div 
                                    layout
                                    key={client.id}
                                    className={cn(
                                        "flex items-center justify-between p-4 bg-white border rounded-2xl transition-all group",
                                        client.paymentStatus === 'pago' ? "border-emerald-100 bg-emerald-50/10" : "border-slate-100"
                                    )}
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                                            client.paymentStatus === 'pago' ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                                        )}>
                                            <User size={18} />
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">{client.name || 'Cliente Sem Nome'}</h4>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[100px]">{client.planId || 'Plano não definido'}</span>
                                                <div className="w-1 h-1 rounded-full bg-slate-200" />
                                                <span className="text-[8px] font-black text-primary uppercase tracking-widest">{formatCurrency(client.monthlyValue || getPlanPrice(client.planId, refDate))}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right hidden sm:block">
                                            <span className={cn(
                                                "text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full",
                                                client.paymentStatus === 'pago' ? "bg-emerald-500 text-white" : "bg-amber-100 text-amber-600"
                                            )}>
                                                {client.paymentStatus === 'pago' ? 'Liquidado' : 'Pendente'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button 
                                                onClick={() => toggleBlock(client)}
                                                variant="ghost"
                                                title={client.isBlocked ? "Desbloquear Acesso" : "Bloquear por falta de pagamento"}
                                                className={cn(
                                                    "rounded-xl h-10 w-10 p-0 flex items-center justify-center transition-all border",
                                                    client.isBlocked 
                                                        ? "bg-rose-500 text-white border-rose-600" 
                                                        : "bg-slate-50 text-slate-400 hover:text-rose-500 border-slate-100"
                                                )}
                                            >
                                                {client.isBlocked ? <LockIcon size={16} /> : <UnlockIcon size={16} />}
                                            </Button>
                                            <Button 
                                                onClick={() => togglePayment(client)}
                                                variant="ghost"
                                                className={cn(
                                                    "rounded-xl h-10 w-10 p-0 flex items-center justify-center transition-all",
                                                    client.paymentStatus === 'pago' 
                                                        ? "bg-emerald-500 text-white hover:bg-emerald-600" 
                                                        : "bg-slate-100 text-slate-400 hover:bg-primary/10 hover:text-primary"
                                                )}
                                            >
                                                <CheckCircle2 size={20} />
                                            </Button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </Card>
        );
    };

    // Admin Clients Management
    const ClientsManagement = () => {
        const [searchTerm, setSearchTerm] = useState('');
        const [isModalOpen, setIsModalOpen] = useState(false);
        const [isReportModalOpen, setIsReportModalOpen] = useState(false);
        const [loading, setLoading] = useState(true);
        const [saving, setSaving] = useState(false);
        const [clients, setClients] = useState<any[]>([]);
        const [reports, setReports] = useState<any[]>([]);

        // Form states (Client)
        const [name, setName] = useState('');
        const [company, setCompany] = useState('');
        const [email, setEmail] = useState('');
        const [phone, setPhone] = useState('');
        const [planId, setPlanId] = useState('essencial');
        const [selectedClient, setSelectedClient] = useState<any | null>(null);
        const [currentCategory, setCurrentCategory] = useState<string | null>(null);

        // Form states (Report)
        const [reportTitle, setReportTitle] = useState('');
        const [reportPeriod, setReportPeriod] = useState('');
        const [reportCategory, setReportCategory] = useState(REPORT_CATEGORIES[0]);
        const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
        const [previewDoc, setPreviewDoc] = useState<{name: string, url: string} | null>(null);

        // Real-time listener for clients
        useEffect(() => {
            if (!isAdmin) return;
            const q = query(
                collection(db, 'userProfiles'), 
                where('role', '==', 'client')
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const clientList = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                
                const sortedClients = clientList.sort((a: any, b: any) => {
                    const nameA = (a.name || '').toLowerCase();
                    const nameB = (b.name || '').toLowerCase();
                    return nameA.localeCompare(nameB);
                });

                setClients(sortedClients);
                setLoading(false);
            }, (error) => {
                console.error('Firestore Clients Error:', error);
                handleFirestoreError(error, OperationType.LIST, 'userProfiles');
                setLoading(false);
            });

            return () => unsubscribe();
        }, []);

        // Real-time listener for reports of selected client
        useEffect(() => {
            if (!selectedClient) {
                setReports([]);
                return;
            }

            const q = query(
                collection(db, 'reports'),
                where('clientId', '==', selectedClient.id)
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const reportList = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                const sortedReports = reportList.sort((a: any, b: any) => {
                    const dateA = a.createdAt?.seconds || 0;
                    const dateB = b.createdAt?.seconds || 0;
                    return dateB - dateA;
                });
                setReports(sortedReports);
            }, (error) => {
                handleFirestoreError(error, OperationType.LIST, 'reports');
            });

            return () => unsubscribe();
        }, [selectedClient?.id]);

        const handleSaveClient = async (e: React.FormEvent) => {
            e.preventDefault();
            if (!name || !email) return;

            setSaving(true);
            const clientId = `client_${Date.now()}`;
            const newClient = {
                uid: clientId, 
                name,
                companyName: company,
                email,
                phone,
                planId,
                role: 'client',
                status: 'Ativo',
                createdAt: serverTimestamp(),
            };

            try {
                await setDoc(doc(db, 'userProfiles', clientId), newClient);
                setIsModalOpen(false);
                setName('');
                setCompany('');
                setEmail('');
                setPhone('');
            } catch (error) {
                handleFirestoreError(error, OperationType.CREATE, `userProfiles/${clientId}`);
            } finally {
                setSaving(false);
            }
        };

        const handleSaveReport = async (e: React.FormEvent, shouldAddAnother = false) => {
            e.preventDefault();
            if (!selectedClient || !reportTitle || !reportPeriod) return;
            if (filesToUpload.length === 0) {
                alert('Por favor, anexe pelo menos um documento.');
                return;
            }

            setSaving(true);
            const reportId = `report_${Date.now()}`;
            
            try {
                const totalSize = filesToUpload.reduce((acc, f) => acc + f.size, 0);
                if (totalSize > 900000) { 
                    alert('O arquivo é um pouco grande demais. Por favor, tente um arquivo menor que 900KB.');
                    setSaving(false);
                    return;
                }

                const documentPromises = filesToUpload.map(file => {
                    return new Promise<{name: string, url: string}>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.readAsDataURL(file);
                        reader.onload = () => resolve({
                            name: file.name,
                            url: reader.result as string
                        });
                        reader.onerror = error => reject(error);
                    });
                });

                const dummyDocuments = await Promise.all(documentPromises);

                const newReport = {
                    clientId: selectedClient.id,
                    title: reportTitle,
                    category: reportCategory,
                    period: reportPeriod,
                    documents: dummyDocuments,
                    status: 'published',
                    createdAt: serverTimestamp(),
                };

                await setDoc(doc(db, 'reports', reportId), newReport);
                
                alert('Relatório publicado com sucesso!');
                setReportTitle('');
                setReportPeriod('');
                setReportCategory(REPORT_CATEGORIES[0]);
                setFilesToUpload([]);

                if (!shouldAddAnother) {
                    setIsReportModalOpen(false);
                }
            } catch (error) {
                handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
            } finally {
                setSaving(false);
            }
        };

        const filteredClients = clients.filter(c => 
            c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
            c.companyName?.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (selectedClient) {
            const filteredReports = reports.filter(r => {
                if (!currentCategory || currentCategory === 'Tudo') return true;
                const reportCat = (r.category || '').toLowerCase().trim();
                const selectedCat = (currentCategory || '').toLowerCase().trim();
                return reportCat === selectedCat || reportCat.includes(selectedCat) || selectedCat.includes(reportCat);
            });

            return (
                <Card className="p-8 space-y-8 rounded-[2.5rem] border-slate-100 shadow-xl shadow-slate-200/5 min-h-[600px]">
                    <div className="flex items-center justify-between">
                        <button 
                            onClick={() => {
                                if (currentCategory) setCurrentCategory(null);
                                else setSelectedClient(null);
                            }}
                            className="p-3 -ml-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-2xl transition-all no-print bg-white border border-slate-100 shadow-sm active:scale-95"
                        >
                            <ChevronLeft size={24} />
                        </button>

                        <div className="flex flex-col items-end">
                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">{selectedClient.name}</h2>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{selectedClient.companyName || 'Empresa não definida'}</p>
                        </div>
                    </div>

                    <div className="space-y-8">
                        {!currentCategory ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Pastas de Relatórios</h3>
                                    <Button 
                                        onClick={() => setIsReportModalOpen(true)}
                                        className="bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase px-6 h-10 shadow-lg shadow-slate-900/10"
                                    >
                                        <Plus size={16} className="mr-2" /> Novo Documento
                                    </Button>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {REPORT_CATEGORIES.map((cat) => {
                                        const categoryReports = reports.filter(r => {
                                            const reportCat = (r.category || '').toLowerCase().trim();
                                            const folderCat = cat.toLowerCase().trim();
                                            return reportCat === folderCat || reportCat.includes(folderCat) || folderCat.includes(reportCat);
                                        });
                                        const colors = CATEGORY_COLORS[cat] || { bgColor: 'bg-white', borderColor: 'border-slate-100', textColor: 'text-slate-900', iconBg: 'bg-slate-50', iconColor: 'text-slate-400' };

                                        return (
                                            <div 
                                                key={cat}
                                                onClick={() => setCurrentCategory(cat)}
                                                className={cn(
                                                    "group cursor-pointer p-8 border rounded-[2.5rem] transition-all hover:shadow-2xl hover:shadow-slate-200/50 hover:-translate-y-1 relative overflow-hidden",
                                                    colors.bgColor,
                                                    colors.borderColor
                                                )}
                                            >
                                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/40 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-white/60 transition-colors" />
                                                
                                                <div className="flex items-center justify-between mb-8">
                                                    <div className={cn(
                                                        "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-sm",
                                                        colors.iconBg,
                                                        "group-hover:scale-110 group-hover:rotate-3 group-hover:bg-white shadow-inner"
                                                    )}>
                                                        <span className="text-2xl">{cat.split(' ')[0]}</span>
                                                    </div>
                                                    <div className="w-10 h-10 rounded-2xl bg-white/50 flex items-center justify-center text-slate-300 group-hover:text-primary transition-all">
                                                        <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                                                    </div>
                                                </div>

                                                <div className="space-y-1 relative z-10">
                                                    <h4 className={cn("font-black uppercase tracking-tight text-base leading-none", colors.textColor)}>
                                                        {cat.split(' ').slice(1).join(' ') || cat}
                                                    </h4>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] opacity-60">
                                                        {categoryReports.length === 0 ? 'Pasta Vazia' : `${categoryReports.length} ${categoryReports.length === 1 ? 'arquivo' : 'arquivos'}`}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <button 
                                    onClick={() => setCurrentCategory('Tudo')}
                                    className="w-full py-6 border-2 border-dashed border-slate-100 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 hover:text-primary hover:border-primary/20 transition-all bg-slate-50/30"
                                >
                                    Ou visualizar todos os arquivos de uma vez
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 rounded-lg text-[9px] font-black text-primary uppercase tracking-widest">
                                            <span>Relatórios</span>
                                            <ChevronRight size={10} className="text-primary/30" />
                                            <span className="text-slate-900">{currentCategory === 'Tudo' ? 'Todos os Arquivos' : currentCategory}</span>
                                        </div>
                                        <button onClick={() => setCurrentCategory(null)} className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-primary transition-colors underline">Trocar Pasta</button>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            {filteredReports.length} {filteredReports.length === 1 ? 'Arquivo' : 'Arquivos'}
                                        </span>
                                        <Button 
                                            size="sm"
                                            onClick={() => setIsReportModalOpen(true)}
                                            className="bg-primary text-white rounded-xl text-[9px] font-black uppercase px-4 h-8 shadow-lg shadow-primary/20"
                                        >
                                            <Plus size={14} className="mr-1.5" /> Adicionar
                                        </Button>
                                    </div>
                                </div>

                                {filteredReports.length === 0 ? (
                                    <div className="py-20 text-center bg-slate-50/50 rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center gap-4">
                                        <FileText className="text-slate-200" size={48} />
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Nenhum documento encontrado nesta pasta</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {filteredReports.map((report) => (
                                            <div 
                                                key={report.id} 
                                                className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all group"
                                            >
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                                                        <FileText size={18} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight truncate">{report.title}</h4>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{report.period}</span>
                                                            {currentCategory === 'Tudo' && (
                                                                <>
                                                                    <div className="w-1 h-1 rounded-full bg-slate-200" />
                                                                    <span className="text-[9px] font-black text-primary/60 uppercase tracking-widest truncate max-w-[100px]">{report.category}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {report.documents?.map((doc: any, i: number) => (
                                                        <Button 
                                                            key={i}
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => setPreviewDoc(doc)}
                                                            className="h-8 w-8 text-primary hover:bg-primary/5 rounded-lg transition-all"
                                                        >
                                                            <ExternalLink size={14} />
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Report Upload Modal */}
                    <AnimatePresence>
                        {isReportModalOpen && (
                            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
                                >
                                    <div className="p-8 space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                                                    <Upload size={20} />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Publicar Documento</h3>
                                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{selectedClient.name}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => setIsReportModalOpen(false)} className="text-slate-400 hover:text-slate-900">
                                                <X size={20} />
                                            </button>
                                        </div>

                                        <form onSubmit={(e) => handleSaveReport(e)} className="space-y-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria / Pasta</label>
                                                <select 
                                                    value={reportCategory}
                                                    onChange={(e) => setReportCategory(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none appearance-none"
                                                >
                                                    {REPORT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Título do Documento</label>
                                                <input 
                                                    required
                                                    value={reportTitle}
                                                    onChange={(e) => setReportTitle(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none"
                                                    placeholder="Ex: Conciliação Bancária - Abril"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Referência (Mês/Ano)</label>
                                                <input 
                                                    required
                                                    value={reportPeriod}
                                                    onChange={(e) => setReportPeriod(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none"
                                                    placeholder="Abril 2026"
                                                />
                                            </div>
                                            
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Arquivo (PDF ou Imagem)</label>
                                                <div className="relative h-32 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-all cursor-pointer group">
                                                    <input 
                                                        type="file" 
                                                        accept=".pdf,image/*"
                                                        onChange={(e) => {
                                                            const files = Array.from(e.target.files || []);
                                                            setFilesToUpload(files);
                                                        }}
                                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                                    />
                                                    <Upload size={24} className="text-slate-300 group-hover:text-primary transition-colors mb-2" />
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                        {filesToUpload.length > 0 ? `${filesToUpload[0].name}` : 'Arraste ou clique para enviar'}
                                                    </p>
                                                </div>
                                            </div>

                                            <Button 
                                                type="submit"
                                                disabled={saving}
                                                className="w-full bg-primary text-white rounded-xl text-[10px] font-black uppercase py-4 shadow-xl shadow-primary/20"
                                            >
                                                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Publicar Documento'}
                                            </Button>
                                        </form>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>

                    {/* Preview Modal */}
                    <AnimatePresence>
                        {previewDoc && (
                            <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="bg-white w-full max-w-5xl h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
                                >
                                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                                                <FileText size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">{previewDoc.name}</h3>
                                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Visualização de Documento</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={() => {
                                                    const link = document.createElement('a');
                                                    link.href = previewDoc.url;
                                                    link.download = previewDoc.name;
                                                    link.click();
                                                }}
                                                className="rounded-xl px-4 text-[10px] font-black uppercase"
                                            >
                                                <Upload size={14} className="rotate-180 mr-2" /> Baixar
                                            </Button>
                                            <button onClick={() => setPreviewDoc(null)} className="p-2 text-slate-400 hover:text-rose-500">
                                                <X size={24} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 bg-slate-100 relative">
                                        {previewDoc.url.includes('application/pdf') || previewDoc.name.toLowerCase().endsWith('.pdf') ? (
                                            <iframe src={previewDoc.url} className="w-full h-full border-none" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center p-8">
                                                <img src={previewDoc.url} alt="Preview" className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" />
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                </Card>
            );
        }

        return (
            <Card className="p-8 space-y-8 rounded-[2.5rem] border-slate-100 shadow-xl shadow-slate-200/5">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                            <Users size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Gestão de Clientes</h2>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Selecione um cliente para enviar relatórios</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <input 
                                type="text"
                                placeholder="Buscar cliente..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                            />
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                        </div>
                        <Button 
                            onClick={() => setIsModalOpen(true)}
                            className="bg-primary text-white rounded-xl text-[10px] font-black uppercase px-6 h-10 shadow-lg shadow-primary/20 shrink-0"
                        >
                            <Plus size={16} className="mr-2" /> Novo Cliente
                        </Button>
                    </div>
                </div>

                <div className="space-y-4">
                    {loading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="animate-spin text-primary" size={24} />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Buscando clientes...</p>
                        </div>
                    ) : filteredClients.length === 0 ? (
                        <div className="py-12 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-100">
                            <Users className="mx-auto text-slate-300 mb-2" size={32} />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum cliente encontrado</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {filteredClients.map((c) => (
                                <motion.div 
                                    layout
                                    key={c.id}
                                    whileHover={{ x: 4 }}
                                    onClick={() => setSelectedClient(c)}
                                    className="p-4 bg-white border border-slate-100 rounded-2xl hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all cursor-pointer group flex items-center justify-between gap-4"
                                >
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all shadow-inner shrink-0">
                                            <User size={20} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight truncate">{c.name}</h4>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{c.companyName || 'Empresa Própria'}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-8 px-4 border-l border-slate-50">
                                        <div className="flex flex-col min-w-[80px]">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Plano Ativo</span>
                                            <span className="text-[9px] font-black text-primary uppercase">{c.planId || 'Essencial'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-primary font-black text-[9px] uppercase tracking-widest whitespace-nowrap opacity-60 group-hover:opacity-100 transition-opacity">
                                            Gerenciar <ChevronRight size={12} />
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Create Client Modal */}
                <AnimatePresence>
                    {isModalOpen && (
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
                            >
                                <div className="p-8 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                                                <UserPlus size={20} />
                                            </div>
                                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Criação de Cliente</h3>
                                        </div>
                                        <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-900">
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <form onSubmit={handleSaveClient} className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                                            <input 
                                                required
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none"
                                                placeholder="João Silva"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Razão Social</label>
                                            <input 
                                                value={company}
                                                onChange={(e) => setCompany(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none"
                                                placeholder="Sua Empresa LTDA"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail de Contato</label>
                                            <input 
                                                required
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none"
                                                placeholder="cliente@email.com"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Vincular Plano</label>
                                            <select 
                                                value={planId}
                                                onChange={(e) => setPlanId(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none appearance-none"
                                            >
                                                <option value="essencial">ESSENCIAL</option>
                                                <option value="profissional">PROFISSIONAL</option>
                                                <option value="premium">PREMIUM</option>
                                            </select>
                                        </div>

                                        <Button 
                                            type="submit"
                                            disabled={saving}
                                            className="w-full bg-primary text-white rounded-xl text-[10px] font-black uppercase py-4 shadow-xl shadow-primary/20 mt-4"
                                        >
                                            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Cadastrar Cliente'}
                                        </Button>
                                    </form>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </Card>
        );
    };

    // Admin Plan & Features Management Component
    const ClientAccessManagement = () => {
        const [usersList, setUsersList] = useState<any[]>([]);
        const [loading, setLoading] = useState(true);
        const [searchTerm, setSearchTerm] = useState('');
        const [isInviting, setIsInviting] = useState(false);

        useEffect(() => {
            if (!isAdmin) return;
            setLoading(true);
            const q = query(collection(db, 'userProfiles'), where('role', '==', 'client'));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setUsersList(list);
                setLoading(false);
            }, (error) => {
                console.error("Error loading users:", error);
                handleFirestoreError(error, OperationType.GET, 'userProfiles');
                setLoading(false);
            });
            return () => unsubscribe();
        }, []);

        const handleToggleBlock = async (client: any) => {
            const newBlockStatus = !client.isBlocked;
            try {
                await updateDoc(doc(db, 'userProfiles', client.id), {
                    isBlocked: newBlockStatus,
                    status: newBlockStatus ? 'Inativo' : 'Ativo',
                    updatedAt: serverTimestamp()
                });
            } catch (error) {
                console.error("Error toggling block:", error);
            }
        };

        const handleResetPassword = async (email: string) => {
            try {
                await sendPasswordResetEmail(email);
                alert(`Um link de redefinição de senha foi enviado para ${email}. Por favor, peça ao cliente para verificar a caixa de entrada e a pasta de SPAM.`);
            } catch (error: any) {
                console.error("Error sending reset email:", error);
                alert(error.message || `Erro ao enviar e-mail de redefinição.`);
            }
        };

        const handleShareApp = () => {
            const url = window.location.origin;
            const text = `Olá! Comece a usar nossa plataforma Fluxo Inteligente para gestão financeira. Acesse: ${url}`;
            
            if (navigator.share) {
                navigator.share({
                    title: 'Fluxo Inteligente',
                    text: text,
                    url: url,
                }).catch(() => {
                    navigator.clipboard.writeText(url);
                    alert("Link do aplicativo copiado!");
                });
            } else {
                navigator.clipboard.writeText(url);
                alert("Link do aplicativo copiado para a área de transferência!");
            }
        };

        const handleInviteUser = async () => {
            if (!inviteData.email || !inviteData.name) {
                alert("Por favor, preencha nome e e-mail.");
                return;
            }
            setIsInviting(true);
            try {
                // We don't have the UID yet, so we create a record with a temporary ID (email or random)
                // or we just tell the admin that the user needs to sign up.
                // Best practice: Admin creates the "Pre-Registration" record.
                // We'll use the email as an identifier if we want to pre-configure them.
                
                // For now, let's just add a message that they should invite the user.
                alert(`Convite preparado para ${inviteData.name}. No momento, o usuário deve se cadastrar no site usando o e-mail ${inviteData.email} para que você possa gerenciar o acesso dele aqui.`);
                setIsInviteModalOpen(false);
                setInviteData({ email: '', name: '', plan: 'essencial' });
            } catch (err) {
                console.error(err);
            } finally {
                setIsInviting(false);
            }
        };

        const filteredUsers = usersList.filter(u => 
            u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
            u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.companyName?.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return (
            <Card className="p-8 space-y-8 rounded-[2.5rem] border-slate-100 shadow-xl shadow-slate-200/5">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                            <Users size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Gestão de Acessos</h2>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Controle logins, senhas e bloqueios</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Button 
                            type="button"
                            onClick={handleShareApp}
                            variant="ghost"
                            className="bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest h-10 hover:bg-emerald-100"
                        >
                            <Share2 size={14} className="mr-2" /> Compartilhar Link
                        </Button>
                        <div className="relative flex-1 md:w-64">
                            <input 
                                type="text"
                                placeholder="Buscar usuário..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                            />
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                        </div>
                        <Button 
                            onClick={() => setIsInviteModalOpen(true)}
                            className="bg-primary text-white rounded-xl text-[10px] font-black uppercase px-6 h-10 shadow-lg shadow-primary/20 shrink-0"
                        >
                            <Plus size={16} className="mr-2" /> Novo Acesso
                        </Button>
                    </div>
                </div>

                <div className="space-y-4">
                    {loading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="animate-spin text-primary" size={24} />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando usuários...</p>
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="py-12 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-100">
                            <AlertCircle className="mx-auto text-slate-300 mb-2" size={32} />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum usuário encontrado</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {filteredUsers.map((u) => (
                                <motion.div 
                                    layout
                                    key={u.id}
                                    className={cn(
                                        "flex flex-col md:flex-row md:items-center justify-between p-5 bg-white border rounded-2xl transition-all group gap-4",
                                        u.isBlocked ? "border-red-100 bg-red-50/10" : "border-slate-100"
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-sm",
                                            u.isBlocked ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary"
                                        )}>
                                            <User size={20} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight truncate">{u.name || 'Sem Nome'}</h4>
                                                {u.isBlocked && (
                                                    <span className="px-1.5 py-0.5 bg-red-500 text-white text-[7px] font-black uppercase rounded-full">Bloqueado</span>
                                                )}
                                            </div>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{u.email}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[8px] font-black text-primary uppercase tracking-widest border border-primary/20 px-1.5 py-0.5 rounded-md">
                                                    {u.planId || 'Sem Plano'}
                                                </span>
                                                {u.companyName && (
                                                    <>
                                                        <div className="w-1 h-1 rounded-full bg-slate-200" />
                                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">{u.companyName}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end md:self-center">
                                        <Button 
                                            onClick={() => handleResetPassword(u.email)}
                                            variant="ghost"
                                            title="Enviar link de redefinição de senha"
                                            className="h-10 px-4 bg-slate-50 text-slate-500 hover:bg-amber-50 hover:text-amber-600 rounded-xl border border-slate-100 text-[9px] font-black uppercase tracking-widest"
                                        >
                                            <LockIcon size={14} className="mr-2" /> Redefinir Senha
                                        </Button>
                                        <Button 
                                            onClick={() => handleToggleBlock(u)}
                                            variant="ghost"
                                            className={cn(
                                                "rounded-xl h-10 px-4 flex items-center justify-center transition-all border text-[9px] font-black uppercase tracking-widest",
                                                u.isBlocked 
                                                    ? "bg-rose-500 text-white border-rose-600 hover:bg-rose-600" 
                                                    : "bg-slate-50 text-slate-400 hover:text-rose-500 border-slate-100"
                                            )}
                                        >
                                            {u.isBlocked ? <><UnlockIcon size={14} className="mr-2" /> Desbloquear</> : <><LockIcon size={14} className="mr-2" /> Bloquear Login</>}
                                        </Button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Invite Modal Backdrop */}
                <AnimatePresence>
                    {isInviteModalOpen && (
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
                            >
                                <div className="p-8 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                                                <Users size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Novo Acesso de Cliente</h3>
                                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Crie uma conta para seu cliente</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setIsInviteModalOpen(false)} className="text-slate-400 hover:text-slate-900">
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Cliente</label>
                                            <input 
                                                value={inviteData.name}
                                                onChange={(e) => setInviteData({...inviteData, name: e.target.value})}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                                                placeholder="Ex: João Silva"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail de Acesso</label>
                                            <input 
                                                value={inviteData.email}
                                                onChange={(e) => setInviteData({...inviteData, email: e.target.value})}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                                                placeholder="cliente@email.com"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Vincular Plano</label>
                                            <select 
                                                value={inviteData.plan}
                                                onChange={(e) => setInviteData({...inviteData, plan: e.target.value})}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none"
                                            >
                                                <option value="essencial">ESSENCIAL</option>
                                                <option value="profissional">PROFISSIONAL</option>
                                                <option value="premium">PREMIUM</option>
                                            </select>
                                        </div>
                                    </div>

                                    <Button 
                                        onClick={handleInviteUser}
                                        disabled={isInviting}
                                        className="w-full bg-primary text-white rounded-xl text-[10px] font-black uppercase py-4 shadow-xl shadow-primary/20"
                                    >
                                        {isInviting ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar e Enviar Instruções'}
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </Card>
        );
    };

    // Admin Plan & Features Management Component
    const PlanFeaturesManagement = () => {
        const [plans, setPlans] = useState<any>({
            essencial: { level: 1, label: 'Essencial', price: 400, reports: ['📅 Minha Agenda de Contas', '🔄 Conciliação Bancária'] },
            profissional: { level: 2, label: 'Profissional', price: 800, reports: ['📅 Minha Agenda de Contas', '🔄 Conciliação Bancária', '📈 DRE Gerencial', '💰 Fluxo de Caixa'] },
            premium: { level: 3, label: 'Premium', price: 1200, reports: ['📅 Minha Agenda de Contas', '🔄 Conciliação Bancária', '📈 DRE Gerencial', '💰 Fluxo de Caixa', '📝 Relatório Mensal', '🎯 Dashboards'] }
        });
        const [loading, setLoading] = useState(true);
        const [saving, setSaving] = useState(false);

        useEffect(() => {
            if (!isAdmin) return;
            const path = 'system_configs/plans_config';
            const unsubscribe = onSnapshot(doc(db, 'system_configs', 'plans_config'), (docSnap) => {
                if (docSnap.exists()) {
                    setPlans(docSnap.data().plans);
                }
                setLoading(false);
            }, (error) => {
                console.error("Error listening to plans config:", error);
                handleFirestoreError(error, OperationType.GET, path);
                setLoading(false);
            });
            return () => unsubscribe();
        }, [isAdmin]);

        const handleSave = async () => {
            setSaving(true);
            try {
                // Busca configuração atual para comparar preços
                const currentSnap = await getDoc(doc(db, 'system_configs', 'plans_config'));
                const currentData = currentSnap.exists() ? currentSnap.data().plans : {};
                
                const plansToSave = { ...plans };
                
                Object.keys(plansToSave).forEach(key => {
                    const oldPrice = currentData[key]?.price;
                    const newPrice = plansToSave[key].price;
                    
                    if (oldPrice !== undefined && oldPrice !== newPrice) {
                        // O preço mudou! Armazena histórico e data da alteração
                        plansToSave[key].previousPrice = oldPrice;
                        plansToSave[key].priceUpdatedAt = new Date().toISOString();
                    } else if (currentData[key]?.priceUpdatedAt) {
                        // Mantém os metadados de preço anteriores se não mudou agora
                        plansToSave[key].previousPrice = currentData[key].previousPrice;
                        plansToSave[key].priceUpdatedAt = currentData[key].priceUpdatedAt;
                    }
                });

                await setDoc(doc(db, 'system_configs', 'plans_config'), {
                    plans: plansToSave,
                    updatedAt: serverTimestamp(),
                    updatedBy: user?.uid
                });
                alert("Configurações salvas com sucesso! As permissões dos clientes serão atualizadas automaticamente.");
            } catch (error) {
                console.error("Error saving plans config:", error);
                alert("Erro ao salvar configurações.");
            } finally {
                setSaving(false);
            }
        };

        const toggleReport = (planKey: string, reportName: string) => {
            const currentReports = [...plans[planKey].reports];
            const index = currentReports.indexOf(reportName);
            
            if (index > -1) {
                currentReports.splice(index, 1);
            } else {
                currentReports.push(reportName);
            }

            setPlans({
                ...plans,
                [planKey]: {
                    ...plans[planKey],
                    reports: currentReports
                }
            });
        };

        const allReports = [
            '📅 Minha Agenda de Contas',
            '🔄 Conciliação Bancária',
            '📈 DRE Gerencial',
            '💰 Fluxo de Caixa',
            '📝 Relatório Mensal',
            '🎯 Dashboards'
        ];

        return (
            <Card className="p-8 space-y-8 rounded-[2.5rem] border-slate-100 shadow-xl shadow-slate-200/5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                            <Settings size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Gestão de Planos</h2>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Configure os relatórios por plano</p>
                        </div>
                    </div>
                    <Button 
                        onClick={handleSave} 
                        disabled={saving || loading}
                        className="bg-primary text-white rounded-xl text-[10px] font-black uppercase px-6 h-10 shadow-lg shadow-primary/20 transition-all hover:translate-y-[-2px]"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} className="mr-2" /> Salvar Alterações</>}
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {Object.keys(plans)
                        .sort((a, b) => (plans[a].level || 0) - (plans[b].level || 0))
                        .map((planKey) => (
                        <div key={planKey} className="space-y-4 p-6 bg-slate-50/50 rounded-3xl border border-slate-100">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">{plans[planKey].label}</h3>
                                <span className="text-[8px] font-black text-primary uppercase tracking-[0.2em] bg-primary/5 px-2 py-1 rounded-lg">Nível {plans[planKey].level}</span>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Mensal (R$)</label>
                                <input 
                                    type="number"
                                    value={plans[planKey].price || 0}
                                    onChange={(e) => setPlans({
                                        ...plans,
                                        [planKey]: {
                                            ...plans[planKey],
                                            price: Number(e.target.value)
                                        }
                                    })}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all shadow-sm"
                                    placeholder="0,00"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Lançamentos Mensais (0 = ILIM.)</label>
                                <input 
                                    type="number"
                                    value={plans[planKey].entriesLimit || 0}
                                    onChange={(e) => setPlans({
                                        ...plans,
                                        [planKey]: {
                                            ...plans[planKey],
                                            entriesLimit: Number(e.target.value)
                                        }
                                    })}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary/5 transition-all shadow-sm"
                                    placeholder="Ex: 50"
                                />
                            </div>

                            <div className="space-y-2">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 mb-2">Relatórios Disponíveis</p>
                                {allReports.map((report) => {
                                    const isEnabled = plans[planKey].reports.includes(report);
                                    return (
                                        <button
                                            key={report}
                                            onClick={() => toggleReport(planKey, report)}
                                            className={cn(
                                                "w-full flex items-center justify-between p-3 rounded-xl text-[10px] font-black uppercase transition-all border",
                                                isEnabled 
                                                    ? "bg-white border-primary/20 text-slate-900 shadow-sm" 
                                                    : "bg-slate-100/50 border-transparent text-slate-400 opacity-60 hover:opacity-100"
                                            )}
                                        >
                                            <span className="truncate mr-2">{report}</span>
                                            <div className={cn(
                                                "w-4 h-4 rounded-full flex items-center justify-center transition-colors",
                                                isEnabled ? "bg-primary text-white" : "bg-slate-200"
                                            )}>
                                                {isEnabled && <CheckCircle2 size={10} />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-amber-50 rounded-2xl p-4 flex gap-3 border border-amber-100">
                    <AlertCircle className="text-amber-500 shrink-0" size={18} />
                    <p className="text-[10px] font-bold text-amber-900 uppercase tracking-tight leading-relaxed">
                        Atenção: Estas configurações alteram o acesso de todos os clientes em tempo real de acordo com o plano vinculado ao perfil deles.
                    </p>
                </div>
            </Card>
        );
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-8 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-4 max-w-full overflow-hidden">
                    {onBack && (
                        <button 
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onBack();
                            }}
                            className="p-2 -ml-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all relative z-[60]"
                        >
                            <ChevronLeft size={24} />
                        </button>
                    )}
                    <div className="relative group shrink-0">
                        <input 
                            type="file"
                            id="photo-upload"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                
                                // Limit size to 5MB for selection, we will compress it down before saving
                                if (file.size > 5000000) {
                                    alert('A foto é muito grande. Por favor escolha uma foto menor que 5MB.');
                                    return;
                                }

                                const reader = new FileReader();
                                reader.onload = (event) => {
                                    const base64 = event.target?.result as string;
                                    setPendingPhoto(base64);
                                    setIsPhotoPreviewOpen(true);
                                };
                                reader.readAsDataURL(file);
                                // Clear input value to allow selecting same file again
                                e.target.value = '';
                            }}
                        />
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center overflow-hidden border-2 border-white shadow-lg group-hover:bg-slate-200 transition-colors">
                            {effectiveProfile?.photoURL ? (
                                <img src={effectiveProfile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                                    <User size={24} className="text-slate-300 group-hover:text-primary transition-colors" />
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={() => document.getElementById('photo-upload')?.click()}
                            className="absolute -bottom-1 -right-1 p-1.5 bg-primary text-white rounded-lg shadow-lg hover:scale-110 active:scale-95 transition-all cursor-pointer z-10"
                        >
                            <Camera size={12} />
                        </button>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase truncate">
                                {showAdminView ? 'Painel de Controle' : 'Meu Perfil'}
                            </h1>
                            <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest rounded-full shrink-0">
                                {showAdminView ? 'Adm' : 'VIP'}
                            </span>
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                            <button 
                                onClick={() => setActiveSubTab('general')}
                                className={cn(
                                    "text-[10px] font-black uppercase tracking-widest pb-2 transition-all border-b-2",
                                    activeSubTab === 'general' ? "text-primary border-primary" : "text-slate-400 border-transparent hover:text-slate-600"
                                )}
                            >
                                Dados Cadastrais
                            </button>
                            <button 
                                onClick={() => setActiveSubTab('security')}
                                className={cn(
                                    "text-[10px] font-black uppercase tracking-widest pb-2 transition-all border-b-2",
                                    activeSubTab === 'security' ? "text-primary border-primary" : "text-slate-400 border-transparent hover:text-slate-600"
                                )}
                            >
                                Segurança
                            </button>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 shrink-0">
                    <Button 
                        onClick={activeSubTab === 'general' ? handleSave : handleSecurityUpdate} 
                        disabled={isSaving}
                        className="rounded-xl px-6 py-5 shadow-lg shadow-primary/20 text-xs"
                    >
                        {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                        {!isSaving && <Save size={16} className="ml-2" />}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Content based on activeSubTab */}
                <div className="lg:col-span-2 space-y-8 min-w-0">
                    {activeSubTab === 'general' ? (
                        <div className="space-y-8">
                            {showAdminView ? (
                                <div className="space-y-8">
                                    {/* Admin Dashboard Tabs */}
                                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                        {[
                                            { id: 'clients', label: 'Clientes', icon: Users },
                                            { id: 'payments', label: 'Pagamentos', icon: TrendingUp },
                                            { id: 'plans', label: 'Planos', icon: Settings },
                                            { id: 'users', label: 'Acessos', icon: LockIcon },
                                            { id: 'company', label: 'Dados Empresa', icon: Building2 },
                                            { id: 'lgpd', label: 'LGPD', icon: ShieldCheck }
                                        ].map(tab => (
                                            <button
                                                key={tab.id}
                                                onClick={() => setAdminActiveTab(tab.id as any)}
                                                className={cn(
                                                    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border",
                                                    adminActiveTab === tab.id 
                                                        ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/10" 
                                                        : "bg-white text-slate-400 border-slate-100 hover:bg-slate-50"
                                                )}
                                            >
                                                <tab.icon size={14} />
                                                {tab.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                        {adminActiveTab === 'payments' && <AdminPaymentsCard />}
                                        {adminActiveTab === 'clients' && <ClientsManagement />}
                                        {adminActiveTab === 'plans' && <PlanFeaturesManagement />}
                                        {adminActiveTab === 'users' && <ClientAccessManagement />}
                                        {adminActiveTab === 'company' && <CompanyManagement />}
                                        {adminActiveTab === 'lgpd' && (
                                            <Card className="p-8 border-none bg-slate-900 rounded-[2.5rem] relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
                                                <div className="relative z-10 flex items-start gap-4">
                                                    <div className="w-10 h-10 bg-emerald-500/20 text-emerald-500 rounded-xl flex items-center justify-center shrink-0">
                                                        <ShieldCheck size={20} />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <h3 className="text-white text-sm font-black uppercase tracking-tight">Conformidade LGPD</h3>
                                                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                                                            Sua plataforma Fluxo Inteligente opera sob os mais rigorosos padrões de proteção de dados. 
                                                            Todos os registros de clientes e logs de atividades são criptografados e acessíveis apenas 
                                                            por pessoal autorizado de acordo com a Lei Geral de Proteção de Dados.
                                                        </p>
                                                        <div className="flex gap-4 pt-2">
                                                            <button className="text-emerald-500 text-[8px] font-black uppercase tracking-widest hover:underline">Ver Logs de Acesso</button>
                                                            <button className="text-emerald-500 text-[8px] font-black uppercase tracking-widest hover:underline">Políticas de Privacidade</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Card>
                                        )}
                                    </div>
                                </div>
                            ) : null}
                            
                            {!showAdminView && (
                                <Card className="p-8 space-y-8 rounded-3xl border-slate-100 shadow-xl shadow-slate-200/5 transition-all hover:shadow-slate-200/20">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-primary/5 text-primary rounded-xl flex items-center justify-center">
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Dados Cadastrais</h2>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Informações da sua conta e empresa</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                                        <input 
                                            type="text" 
                                            value={formData.name || ''}
                                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                                            className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-900"
                                        />
                                    </div>
                                    <div className="space-y-1.5 opacity-50">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail (Alterar em Segurança)</label>
                                        <input 
                                            type="email" 
                                            disabled
                                            value={effectiveProfile?.email || ''}
                                            className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium cursor-not-allowed outline-none text-slate-500"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Empresa</label>
                                        <input 
                                            type="text" 
                                            value={formData.companyName || ''}
                                            onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                                            placeholder="Nome da sua empresa"
                                            className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-900"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CNPJ / CPF</label>
                                        <input 
                                            type="text" 
                                            value={formData.document || ''}
                                            onChange={(e) => setFormData({...formData, document: maskDocument(e.target.value)})}
                                            placeholder=""
                                            maxLength={18}
                                            className={cn(
                                                "w-full px-5 py-3 bg-slate-50 border rounded-2xl text-sm font-medium transition-all outline-none text-slate-900",
                                                formData.document && formData.document.replace(/\D/g, '').length >= 11 && !isDocumentValid(formData.document) 
                                                    ? "border-red-200 focus:ring-red-500/10" 
                                                    : formData.document && formData.document.replace(/\D/g, '').length > 0 && formData.document.replace(/\D/g, '').length < 11
                                                        ? "border-amber-200 focus:ring-amber-500/10"
                                                        : "border-slate-100 focus:ring-primary/10"
                                            )}
                                        />
                                        {formData.document && formData.document.replace(/\D/g, '').length > 0 && (
                                            <>
                                                {formData.document.replace(/\D/g, '').length < 11 || (formData.document.replace(/\D/g, '').length > 11 && formData.document.replace(/\D/g, '').length < 14) ? (
                                                    <p className="text-[8px] font-bold text-amber-500 uppercase tracking-widest ml-1">Incompleto...</p>
                                                ) : !isDocumentValid(formData.document) ? (
                                                    <p className="text-[8px] font-bold text-red-500 uppercase tracking-widest ml-1">Documento Inválido</p>
                                                ) : (
                                                    <p className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest ml-1">Documento Válido</p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone</label>
                                        <input 
                                            type="text" 
                                            value={formData.phone || ''}
                                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                            placeholder="(00) 00000-0000"
                                            className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-900"
                                        />
                                    </div>
                                </div>

                                {/* Address Section */}
                                <div className="pt-6 border-t border-slate-50 space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 bg-primary/5 text-primary rounded-xl flex items-center justify-center">
                                            <MapPin size={18} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Endereço</h3>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Busca automática via CEP</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-1.5 relative">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CEP</label>
                                            <div className="relative">
                                                <input 
                                                    type="text" 
                                                    value={formData.cep || ''}
                                                    onChange={(e) => handleCepLookup(e.target.value)}
                                                    placeholder="00000-000"
                                                    maxLength={9}
                                                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-900"
                                                />
                                                {isSearchingCep && (
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                        <Loader2 size={16} className="text-primary animate-spin" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Logradouro</label>
                                            <input 
                                                type="text" 
                                                value={formData.address || ''}
                                                onChange={(e) => setFormData({...formData, address: e.target.value})}
                                                placeholder="Ex: Rua das Flores"
                                                className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-900"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Número</label>
                                            <input 
                                                type="text" 
                                                value={formData.addressNumber || ''}
                                                onChange={(e) => setFormData({...formData, addressNumber: e.target.value})}
                                                placeholder="123"
                                                className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-900"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Complemento</label>
                                            <input 
                                                type="text" 
                                                value={formData.complement || ''}
                                                onChange={(e) => setFormData({...formData, complement: e.target.value})}
                                                placeholder="Ex: Sala 2 / Apto 10"
                                                className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-900"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Bairro</label>
                                            <input 
                                                type="text" 
                                                value={formData.neighborhood || ''}
                                                onChange={(e) => setFormData({...formData, neighborhood: e.target.value})}
                                                placeholder="Bairro"
                                                className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-900"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cidade</label>
                                            <input 
                                                type="text" 
                                                value={formData.city || ''}
                                                onChange={(e) => setFormData({...formData, city: e.target.value})}
                                                placeholder="Cidade"
                                                className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-900"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">UF</label>
                                            <input 
                                                type="text" 
                                                value={formData.state || ''}
                                                onChange={(e) => setFormData({...formData, state: e.target.value})}
                                                maxLength={2}
                                                placeholder="UF"
                                                className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-900 uppercase"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                            )}
                        </div>
                    ) : (
                        <Card className="p-8 space-y-8 rounded-3xl border-slate-100 shadow-xl shadow-slate-200/5 transition-all hover:shadow-slate-200/20">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/5 text-primary rounded-xl flex items-center justify-center">
                                    <Lock size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Segurança</h2>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Altere seu e-mail de acesso e senha</p>
                                </div>
                            </div>

                            {securityStatus && (
                                <div className={cn(
                                    "p-4 rounded-2xl text-xs font-bold uppercase tracking-widest animate-in fade-in slide-in-from-top-2",
                                    securityStatus.type === 'success' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-600 border border-red-100"
                                )}>
                                    {securityStatus.message}
                                </div>
                            )}

                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Alterar E-mail</h3>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Novo E-mail</label>
                                            <div className="relative">
                                                <input 
                                                    type="email" 
                                                    value={securityData.email || ''}
                                                    onChange={(e) => setSecurityData({...securityData, email: e.target.value})}
                                                    className="w-full pl-12 pr-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-900"
                                                />
                                                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-50 space-y-4">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Alterar Senha</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nova Senha</label>
                                            <div className="relative">
                                                <input 
                                                    type="password" 
                                                    value={securityData.newPassword || ''}
                                                    onChange={(e) => setSecurityData({...securityData, newPassword: e.target.value})}
                                                    placeholder="••••••••"
                                                    className="w-full pl-12 pr-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-900"
                                                />
                                                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirmar Senha</label>
                                            <div className="relative">
                                                <input 
                                                    type="password" 
                                                    value={securityData.confirmPassword || ''}
                                                    onChange={(e) => setSecurityData({...securityData, confirmPassword: e.target.value})}
                                                    placeholder="••••••••"
                                                    className="w-full pl-12 pr-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none text-slate-900"
                                                />
                                                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-2 px-1">
                                        A senha deve ter pelo menos 6 caracteres.
                                    </p>
                                </div>
                            </div>
                        </Card>
                    )}
                    
                    {/* Meus Pagamentos Section (CLIENT ONLY) */}
                    {!showAdminView && (
                        <Card className="p-8 space-y-8 rounded-[2.5rem] border-slate-100 shadow-xl shadow-slate-200/5 relative overflow-hidden group">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-emerald-50 text-emerald-500 rounded-xl flex items-center justify-center">
                                        <CreditCard size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Meus Pagamentos</h2>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Toque em uma mensalidade para pagar</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {/* Proxima Mensalidade (Interactive) */}
                                <motion.div 
                                    whileHover={{ scale: 1.002 }}
                                    whileTap={{ scale: 0.998 }}
                                    onClick={() => setSelectedPayment(upcomingPayment)}
                                    className="relative overflow-hidden cursor-pointer p-4 bg-primary/5 rounded-[2rem] border border-primary/10 group"
                                >
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl -mr-8 -mt-8 group-hover:scale-125 transition-transform duration-500" />
                                    <div className="relative flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0">
                                                <Calendar size={16} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[8px] font-black text-primary uppercase tracking-[0.2em] mb-0.5 truncate">Próxima Fatura</p>
                                                <h3 className="text-slate-900 text-[11px] font-black uppercase tracking-tight leading-tight truncate">{upcomingPayment.month}</h3>
                                                <p className="text-slate-400 text-[8px] font-bold uppercase tracking-wider truncate">Vencimento: {upcomingPayment.date}</p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-sm font-black text-slate-900 leading-none mb-1.5">{formatCurrency(upcomingPayment.amount)}</p>
                                            <span className="px-2 py-0.5 bg-primary text-white text-[7px] font-black uppercase tracking-widest rounded-lg shadow-md shadow-primary/10">Pagar</span>
                                        </div>
                                    </div>
                                </motion.div>

                                <div className="pt-4 space-y-2">
                                    <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2">Histórico de Mensalidades</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {payments.map((p) => (
                                            <div 
                                                key={p.id} 
                                                className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm transition-all hover:border-primary/20 hover:shadow-md group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all">
                                                        <CheckCircle2 size={18} className="text-emerald-500" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight truncate">{p.month}</p>
                                                        <p className="text-[8px] text-slate-400 font-bold uppercase truncate">{p.date}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-xs font-black text-slate-900">{formatCurrency(p.amount)}</p>
                                                    <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Liquidado</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Payment Selection Modal Overlay */}
                            {selectedPayment && (
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="absolute inset-0 bg-slate-900/95 backdrop-blur-xl z-50 p-8 flex flex-col items-center justify-center text-center space-y-6"
                                >
                                    <button 
                                        onClick={() => { setSelectedPayment(null); setPaymentMethod(null); }}
                                        className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors"
                                    >
                                        <X size={24} />
                                    </button>

                                    <div className={cn(
                                        "w-16 h-16 rounded-3xl bg-primary/20 flex items-center justify-center text-primary mb-2",
                                        paymentMethod === 'pix' ? 'bg-emerald-500/20 text-emerald-500' : ''
                                    )}>
                                        <CreditCard size={32} />
                                    </div>

                                    {!paymentMethod ? (
                                        <>
                                            <div className="space-y-1">
                                                <h3 className="text-white text-xl font-black uppercase tracking-tight">Checkout Seguro</h3>
                                                <p className="text-slate-400 text-sm">Fatura de {selectedPayment.month}</p>
                                                <p className="text-primary text-2xl font-black mt-2">{formatCurrency(selectedPayment.amount)}</p>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-sm">
                                                <button 
                                                    onClick={() => setPaymentMethod('pix')}
                                                    className="p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all group flex flex-col items-center gap-3"
                                                >
                                                    <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center font-black">PIX</div>
                                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Liberado na Hora</span>
                                                </button>
                                                <button 
                                                    onClick={() => setPaymentMethod('card')}
                                                    className="p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all group flex flex-col items-center gap-3"
                                                >
                                                    <CreditCard size={24} className="text-primary" />
                                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Cartão de Crédito</span>
                                                </button>
                                            </div>
                                        </>
                                    ) : paymentMethod === 'pix' ? (
                                        <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="space-y-6 w-full max-w-xs">
                                            <div className="bg-white p-4 rounded-3xl aspect-square flex items-center justify-center shadow-2xl">
                                                {/* Simulated QR Code */}
                                                <div className="w-full h-full bg-slate-900 rounded-2xl flex items-center justify-center">
                                                    <QrCode size={120} className="text-white" />
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                <p className="text-white text-sm font-bold">Escaneie o QR Code ou copie a chave</p>
                                                <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase h-12">Copiar Chave PIX</Button>
                                                <p className="text-slate-500 text-[9px] uppercase font-black tracking-widest">Aguardando confirmação bancária...</p>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="space-y-6 w-full max-w-sm text-left">
                                            <div className="space-y-4 bg-white/5 p-6 rounded-3xl border border-white/10">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Número do Cartão</label>
                                                    <input className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-primary" placeholder="0000 0000 0000 0000" />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Validade</label>
                                                        <input className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-primary" placeholder="MM/AA" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">CVV</label>
                                                        <input className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-primary" placeholder="000" />
                                                    </div>
                                                </div>
                                                <Button className="w-full bg-primary text-white rounded-xl text-[10px] font-black uppercase h-12 mt-4 shadow-xl shadow-primary/20">Finalizar Pagamento</Button>
                                            </div>
                                        </motion.div>
                                    )}
                                </motion.div>
                            )}
                        </Card>
                    )}
                </div>

                {/* Right Column: Mini Dashboard */}
                <div className="space-y-8">
                    {!showAdminView && (
                        <Card className="p-8 bg-slate-900 border-none rounded-[2.5rem] overflow-hidden relative shadow-2xl shadow-slate-900/20 group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-[60px] group-hover:scale-125 transition-transform duration-700" />
                            <div className="relative z-10 space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white backdrop-blur-md">
                                        <CreditCard size={24} />
                                    </div>
                                    <span className="px-3 py-1 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-emerald-500/20">Ativo</span>
                                </div>
                                <div>
                                    <h3 className="text-white text-xl font-black uppercase tracking-tight leading-none mb-2">{activePlan.name}</h3>
                                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                                        {activePlan.price > 0 ? formatCurrency(activePlan.price) : 'Sem Custo'} • Renovação: {activePlan.renovation}
                                    </p>
                                </div>
                                <Button 
                                    onClick={() => setActiveTab && setActiveTab('plans')}
                                    className="w-full bg-white text-slate-900 hover:bg-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] py-5 h-auto transition-all hover:translate-y-[-2px] active:translate-y-0"
                                >
                                    Alterar Plano <ArrowUpRight size={14} className="ml-2" />
                                </Button>
                            </div>
                        </Card>
                    )}

                    {!showAdminView && (
                        <Card className="p-8 space-y-6 rounded-[2.5rem] border-slate-100 shadow-xl shadow-slate-200/5">
                            <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Atalhos de Suporte</h3>
                            <div className="space-y-3">
                                <button 
                                    onClick={() => setActiveTab && setActiveTab('support')}
                                    className="w-full flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl group hover:bg-primary/5 hover:border-primary/20 transition-all text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm text-slate-400 group-hover:text-primary transition-colors">
                                            <MessageSquare size={16} />
                                        </div>
                                        <span className="text-xs font-black text-slate-700 uppercase tracking-tight group-hover:text-primary">Chat de Atendimento</span>
                                    </div>
                                    <ArrowUpRight size={14} className="text-slate-300 group-hover:text-primary transition-colors" />
                                </button>
                                <button className="w-full flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl group hover:bg-primary/5 hover:border-primary/20 transition-all text-left">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm text-slate-400 group-hover:text-primary transition-colors">
                                            <Shield size={16} />
                                        </div>
                                        <span className="text-xs font-black text-slate-700 uppercase tracking-tight group-hover:text-primary">Privacidade</span>
                                    </div>
                                    <ExternalLink size={14} className="text-slate-300 group-hover:text-primary transition-colors" />
                                </button>
                            </div>
                        </Card>
                    )}

                    <div className="p-6 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                        <div className="flex gap-4 items-start text-slate-500">
                            <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed text-slate-400">
                                Suas informações estão protegidas por criptografia de ponta e protocolos de segurança bancária.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Photo Preview Modal */}
            <AnimatePresence>
                {isPhotoPreviewOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !isUploadingPhoto && setIsPhotoPreviewOpen(false)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden p-8"
                        >
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Ajustar Foto</h3>
                                <button 
                                    onClick={() => setIsPhotoPreviewOpen(false)}
                                    className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex flex-col items-center gap-8">
                                {photoError && (
                                    <div className="w-full p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600">
                                        <AlertCircle size={18} />
                                        <p className="text-[10px] font-bold uppercase tracking-tight">{photoError}</p>
                                    </div>
                                )}
                                <div className="w-48 h-48 rounded-3xl bg-slate-100 flex items-center justify-center overflow-hidden border-4 border-slate-50 shadow-inner relative">
                                    <div 
                                        className="w-full h-full transition-transform duration-200 ease-out"
                                        style={{ 
                                            transform: `scale(${photoZoom})`,
                                        }}
                                    >
                                        <img 
                                            src={pendingPhoto || ''} 
                                            alt="Preview" 
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                </div>

                                <div className="w-full space-y-2">
                                    <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                        <span>Zoom</span>
                                        <span>{(photoZoom * 100).toFixed(0)}%</span>
                                    </div>
                                    <input 
                                        type="range"
                                        min="1"
                                        max="3"
                                        step="0.01"
                                        value={photoZoom}
                                        onChange={(e) => setPhotoZoom(parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary"
                                    />
                                </div>

                                <div className="flex gap-4 w-full">
                                    <Button 
                                        variant="outline"
                                        className="flex-1 rounded-2xl py-4"
                                        onClick={() => setIsPhotoPreviewOpen(false)}
                                        disabled={isUploadingPhoto}
                                    >
                                        Cancelar
                                    </Button>
                                    <Button 
                                        className="flex-1 rounded-2xl py-4"
                                        onClick={handleSavePhoto}
                                        disabled={isUploadingPhoto}
                                    >
                                        {isUploadingPhoto ? (
                                            <Loader2 size={20} className="animate-spin" />
                                        ) : (
                                            'Salvar Foto'
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
