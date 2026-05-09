import React from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { Button } from './ui/Button';
import { motion, AnimatePresence } from 'motion/react';

export const NotificationPrompt = () => {
    const { permission, requestPermission } = useNotifications();
    const [dismissed, setDismissed] = React.useState(() => {
        return localStorage.getItem('notifications_prompt_dismissed') === 'true';
    });

    const handleDismiss = () => {
        setDismissed(true);
        localStorage.setItem('notifications_prompt_dismissed', 'true');
    };

    if (permission !== 'default' || dismissed) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed bottom-6 right-6 z-50 max-w-sm w-full"
                id="notification-prompt-container"
            >
                <div className="bg-white border border-slate-100 shadow-2xl rounded-2xl p-5 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                    <button 
                        onClick={handleDismiss}
                        className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                        id="close-notification-prompt"
                    >
                        <X size={16} />
                    </button>
                    
                    <div className="flex gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0 transition-transform group-hover:scale-110 duration-300">
                            <Bell size={24} />
                        </div>
                        <div className="space-y-1">
                            <h4 className="font-bold text-slate-800 tracking-tight">Ativar Notificações?</h4>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Receba alertas importantes sobre seus documentos, mensagens de suporte e novos lembretes em tempo real.
                            </p>
                        </div>
                    </div>
                    
                    <div className="mt-5 flex gap-3">
                        <Button 
                            id="enable-notifications-btn"
                            variant="primary" 
                            className="flex-1 py-2 text-xs" 
                            onClick={async () => {
                                await requestPermission();
                                handleDismiss();
                            }}
                        >
                            Ativar Agora
                        </Button>
                        <Button 
                            id="dismiss-notifications-btn"
                            variant="outline" 
                            className="flex-1 py-2 text-xs border-slate-200" 
                            onClick={handleDismiss}
                        >
                            Depois
                        </Button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
