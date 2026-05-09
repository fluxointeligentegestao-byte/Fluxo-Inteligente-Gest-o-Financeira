import React from 'react';
import { cn } from '../lib/utils';

interface LogoProps {
  className?: string;
  showText?: boolean;
  variant?: 'light' | 'dark';
  size?: number;
}

export const Logo = ({ className, showText = true, variant = 'dark', size = 48 }: LogoProps) => {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {showText && (
        <div className="flex flex-col -space-y-1">
          <div className="flex items-center">
            <span className={cn(
              "text-lg font-black tracking-tight",
              variant === 'dark' ? "text-[#004b8d]" : "text-white"
            )}>
              Fluxo
            </span>
            <span className={cn(
              "text-lg font-black tracking-tight ml-1",
              variant === 'dark' ? "text-[#5cb85c]" : "text-[#5cb85c]"
            )}>
              Inteligente
            </span>
          </div>
          <span className={cn(
            "text-[9px] font-bold tracking-[0.2em] uppercase leading-none opacity-50",
            variant === 'dark' ? "text-slate-500" : "text-slate-300"
          )}>
            Gestão Financeira
          </span>
        </div>
      )}
    </div>
  );
};
