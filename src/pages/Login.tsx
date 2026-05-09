import React, { useState } from 'react';
import { TrendingUp, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Logo } from '../components/Logo';

export const Login = () => {
    const { signInWithGoogle, signInWithEmail } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await signInWithEmail(email, password);
        } catch (err: any) {
            setError('E-mail ou senha incorretos. Verifique seus dados.');
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
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                        <div className="relative group">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
                            <input 
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                                placeholder="seu@email.com"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha</label>
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

                    <Button 
                        type="submit"
                        disabled={loading}
                        className="w-full py-7 rounded-2xl shadow-lg shadow-primary/20 text-xs font-black uppercase tracking-[0.2em]"
                    >
                        {loading ? 'Autenticando...' : 'Acessar Plataforma'}
                    </Button>
                </form>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-100"></div>
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest">
                        <span className="bg-white px-4 text-slate-400">Ou continue com</span>
                    </div>
                </div>

                <button 
                    type="button"
                    onClick={signInWithGoogle}
                    className="w-full flex items-center justify-center gap-4 px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-200 transition-all active:scale-95 shadow-sm group"
                >
                    <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span className="text-xs uppercase tracking-widest font-black">Google Workspace</span>
                </button>

                <div className="pt-4">
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-loose">
                        Decisões inteligentes começam com dados reais.
                    </p>
                </div>
            </Card>
        </div>
    );
}
