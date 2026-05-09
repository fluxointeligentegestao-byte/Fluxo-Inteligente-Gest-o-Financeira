import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, className, ...props }, ref) => (
    <div 
      ref={ref}
      className={cn('bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden', className)}
      {...props}
    >
      {children}
    </div>
  )
);

Card.displayName = 'Card';
