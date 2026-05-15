import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, User, Loader2, ArrowLeft, ChevronLeft } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useClient } from '../context/ClientContext';
import { cn } from '../lib/utils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
    collection, 
    addDoc, 
    query, 
    orderBy, 
    onSnapshot, 
    serverTimestamp,
    Timestamp,
    where
} from 'firebase/firestore';

interface Message {
    id: string;
    text: string;
    senderId: string;
    timestamp: Timestamp;
    channelId: string;
}

interface SupportProps {
    setActiveTab?: (tab: string) => void;
    onBack?: () => void;
}

export const Support = ({ setActiveTab, onBack }: SupportProps) => {
    const { profile, user, isAdmin } = useAuth();
    const { selectedClientId, selectedClientName, clients, setSelectedClient, isPreviewMode } = useClient();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const showAdminView = isAdmin && !isPreviewMode;
    const activeChannelId = (isAdmin && !isPreviewMode) ? selectedClientId : (isPreviewMode ? selectedClientId : user?.uid);
    
    // Get the client being previewed if applicable
    const previewClient = isPreviewMode ? clients.find(c => c.id === selectedClientId) : null;
    const effectiveProfile = isPreviewMode ? previewClient : profile;

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Ensure a client is selected for admin if none is selected
    useEffect(() => {
        if (showAdminView && !selectedClientId && clients.length > 0) {
            setSelectedClient(clients[0].id, clients[0].name);
        }
    }, [showAdminView, selectedClientId, clients]);

    useEffect(() => {
        if (!activeChannelId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const path = `channels/${activeChannelId}/messages`;
        const q = query(collection(db, path), orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Message));
            setMessages(msgs);
            setLoading(false);
            scrollToBottom();
        }, (error) => {
            console.error("Error loading messages:", error);
            handleFirestoreError(error, OperationType.GET, path);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [activeChannelId]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !activeChannelId || !user?.uid || sending) return;

        setSending(true);
        const path = `channels/${activeChannelId}/messages`;
        
        try {
            await addDoc(collection(db, path), {
                text: newMessage.trim(),
                senderId: user.uid,
                channelId: activeChannelId,
                timestamp: serverTimestamp()
            });
            setNewMessage('');
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, path);
        } finally {
            setSending(false);
        }
    };

    const activeClientName = showAdminView ? (clients.find(c => c.id === selectedClientId)?.name || 'Cliente') : (profile?.name || 'Cliente');

    return (
        <div className="h-[calc(100vh-7rem)] flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-4">
                        <button 
                            onClick={() => setActiveTab && setActiveTab('dashboard')}
                            className="p-2 -ml-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                        >
                            <ChevronLeft size={24} />
                        </button>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Atendimento</h1>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                            {showAdminView ? 'Gestão de conversas com clientes' : 'Sua consultoria estratégica em tempo real'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 shadow-sm">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[9px] font-black uppercase tracking-widest leading-none">
                        {showAdminView ? 'Você está On-line' : 'Consultor On-line'}
                    </span>
                </div>
            </div>

            <Card className="flex-1 flex overflow-hidden bg-white rounded-[2.5rem] border-slate-100 shadow-xl shadow-slate-200/20">
                {/* Admin Sidebar */}
                {showAdminView && (
                    <div className="w-64 border-r border-slate-50 flex flex-col bg-slate-50/10">
                        <div className="p-6 border-b border-slate-50">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Meus Clientes</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {clients.map((client) => (
                                <button
                                    key={client.id}
                                    onClick={() => setSelectedClient(client.id, client.name)}
                                    className={cn(
                                        "w-full p-4 text-left border-b border-slate-50/50 transition-all flex items-center gap-3",
                                        selectedClientId === client.id ? "bg-primary/5 border-r-4 border-r-primary" : "hover:bg-slate-50"
                                    )}
                                >
                                    <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center text-slate-500 font-black text-xs uppercase">
                                        {client.name.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn("text-xs font-bold truncate", selectedClientId === client.id ? "text-primary" : "text-slate-700")}>
                                            {client.name}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex-1 flex flex-col min-w-0">
                    {/* Chat Header */}
                    <div className="px-4 md:px-8 py-4 md:py-6 border-b border-slate-50 bg-white flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2 md:gap-4">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-primary/5 text-primary flex items-center justify-center border border-primary/10">
                                <User size={20} className="md:w-6 md:h-6" />
                            </div>
                            <div>
                                <h4 className="font-black text-slate-900 uppercase tracking-tight text-xs md:text-base">
                                    {showAdminView ? (activeClientName || 'Selecione um cliente') : 'Suporte Central'}
                                </h4>
                                <p className="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                    {showAdminView ? 'Canal direto com o cliente' : 'Tempo de resposta: ~5 min'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 p-4 md:p-8 space-y-6 md:space-y-8 overflow-y-auto bg-slate-50/30 scroll-smooth">
                    {loading ? (
                        <div className="h-full flex items-center justify-center">
                            <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-col items-center">
                                <span className="px-4 py-1.5 rounded-full bg-white border border-slate-100 text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] shadow-sm">
                                    Início do Canal de Consultoria
                                </span>
                            </div>

                            <div className="flex justify-start">
                                <div className="max-w-[85%] md:max-w-[70%] space-y-2">
                                    <div className="bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl rounded-tl-none border border-slate-100 shadow-sm relative overflow-hidden group">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                                        <p className="text-sm text-slate-600 font-medium leading-relaxed">
                                            Olá <span className="font-black text-primary uppercase">{showAdminView ? (activeClientName?.split(' ')[0] || 'Cliente') : (effectiveProfile?.name?.split(' ')[0] || 'Bem-vindo')}</span>! <br />
                                            Este é o seu canal de comunicação direta. Como podemos ajudar com sua gestão estratégica hoje?
                                        </p>
                                    </div>
                                    <span className="text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest px-1">Mensagem do Sistema</span>
                                </div>
                            </div>

                            {messages.map((msg) => {
                                const isMe = msg.senderId === user?.uid;
                                return (
                                    <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                                        <div className={cn("max-w-[85%] md:max-w-[70%] space-y-2", isMe ? "items-end flex flex-col" : "")}>
                                            <div className={cn(
                                                "p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-sm",
                                                isMe ? "bg-primary text-white rounded-tr-none shadow-xl shadow-primary/20" : "bg-white text-slate-600 border border-slate-100 rounded-tl-none"
                                            )}>
                                                <p className="text-sm font-medium leading-relaxed break-words">
                                                    {msg.text}
                                                </p>
                                            </div>
                                            <span className="text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest px-1">
                                                {msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Enviando...'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* Chat Input */}
                <div className="p-3 md:p-6 bg-white border-t border-slate-50 shrink-0">
                    <div className="flex gap-2 md:gap-4 items-end max-w-4xl mx-auto">
                        <div className="flex-1 relative group">
                            <textarea 
                                rows={2}
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                                placeholder="Sua mensagem..." 
                                className="w-full pl-4 md:pl-6 pr-10 md:pr-14 py-3 md:py-4 bg-slate-50 border-transparent rounded-xl md:rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/5 focus:bg-white focus:border-primary/20 outline-none transition-all resize-none min-h-[60px] md:min-h-[80px]"
                            />
                            <div className="absolute right-2 md:right-4 bottom-2 md:bottom-3 flex gap-1">
                                <button className="p-1.5 md:p-2 text-slate-300 hover:text-primary transition-colors cursor-pointer"><Paperclip size={18} /></button>
                            </div>
                        </div>
                        <Button 
                            onClick={handleSendMessage}
                            disabled={!newMessage.trim() || sending}
                            className="h-12 md:h-14 px-4 md:px-8 rounded-xl md:rounded-2xl shadow-xl shadow-primary/20 flex items-center gap-2 md:gap-3 active:scale-95 transition-transform shrink-0"
                        >
                            {sending ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <>
                                    <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">Enviar</span>
                                    <Send size={16} />
                                </>
                            )}
                        </Button>
                    </div>
                    <p className="text-[8px] md:text-[9px] text-slate-300 font-bold uppercase tracking-widest text-center mt-2 md:mt-3">Envio de comprovantes e documentos rápidos.</p>
                </div>
            </div>
        </Card>
    </div>
);
}
