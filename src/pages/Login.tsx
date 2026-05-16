import React, { useState } from 'react';
import { TrendingUp, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Logo } from '../components/Logo';

export const Login = () => {
    const { signInWithGoogle, signInWithEmail, sendPasswordResetEmail } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccessMessage(null);
        try {
            await signInWithEmail(email, password);
        } catch (err: any) {
            if (err.code === 'auth/invalid-credential') {
                setError('E-mail ou senha incorretos. Se for seu primeiro acesso sem usar o Google, clique em "Primeiro acesso" abaixo para criar sua senha.');
            } else if (err.code === 'auth/user-disabled') {
                setError('Este usuário foi desativado. Entre em contato com o administrador.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Acesso bloqueado temporariamente por excesso de tentativas. Tente novamente mais tarde.');
            } else {
                setError('Erro ao acessar o sistema. Verifique sua internet e tente novamente.');
            }
            console.error('Login error:', err.code, err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            setError('Digite seu e-mail para receber o link de redefinição.');
            return;
        }
        
        setLoading(true);
        setError(null);
        setSuccessMessage(null);
        try {
            await sendPasswordResetEmail(email);
            setSuccessMessage('E-mail de redefinição enviado com sucesso! Verifique sua caixa de entrada.');
        } catch (err: any) {
            setError(err.message || 'Erro ao enviar e-mail de redefinição. Tente novamente.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-[-5%] left-[-5%] w-[30%] h-[30%] bg-secondary/5 rounded-full blur-3xl" />

            <Card className="w-full max-w-md p-8 md:p-10 text-center space-y-8 shadow-2xl border-none relative z-10 rounded-[2.5rem]">
                <div className="space-y-4 flex flex-col items-center">
                    <Logo size={64} className="mb-2" />
                </div>
                
                <div className="space-y-2">
                    <p className="text-slate-500 text-sm font-medium px-4">
                        Acesse sua plataforma exclusiva de gestão estratégica.
                    </p>
                </div>

                <form onSubmit={handleEmailLogin} className="space-y-4 text-left">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail de Acesso</label>
                        <div className="relative group">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
                            <input 
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all font-medium"
                                placeholder="seu@email.com"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between ml-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sua Senha</label>
                            <button 
                                type="button"
                                onClick={handleForgotPassword}
                                className="text-[10px] font-bold text-primary hover:underline uppercase tracking-tight"
                            >
                                Primeiro acesso ou esqueceu a senha?
                            </button>
                        </div>
                        <div className="relative group">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
                            <input 
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-bold uppercase tracking-tight">
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    )}

                    {successMessage && (
                        <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-bold uppercase tracking-tight">
                            <AlertCircle size={14} className="rotate-180" />
                            {successMessage}
                        </div>
                    )}

                    <Button 
                        type="submit"
                        disabled={loading}
                        className="w-full py-7 rounded-2xl shadow-lg shadow-primary/20 text-xs font-black uppercase tracking-[0.2em]"
                    >
                        {loading ? 'Validando Acesso...' : 'Entrar no Sistema'}
                    </Button>
                </form>

                <div className="pt-2">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-loose">
                        Acesso exclusivo para clientes cadastrados.
                    </p>
                </div>
            </Card>
        </div>
    );
}
