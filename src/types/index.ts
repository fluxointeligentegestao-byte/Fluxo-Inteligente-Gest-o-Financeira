export type UserRole = 'admin' | 'client';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  planId?: string;
  monthlyValue?: number;
  companyName?: string;
  document?: string;
  phone?: string;
  cep?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  createdAt: any;
  photoURL?: string;
}

export interface Payment {
  id: string;
  userId: string;
  amount: number;
  status: 'pago' | 'pendente' | 'atrasado';
  method: string;
  date: any;
  dueDate: any;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
}

export interface Report {
  id: string;
  clientId: string;
  title: string;
  status: 'draft' | 'published';
  period: string;
  revenue: number;
  expenses: number;
  notes?: string;
  pdfUrl?: string;
  createdAt: any;
}

export interface ClientDocument {
  id: string;
  clientId: string;
  fileName: string;
  fileUrl: string;
  type: string;
  status: 'pending' | 'processed' | 'rejected';
  uploadedAt: any;
}

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  description?: string;
  dueDate: any;
  isCompleted: boolean;
  level: 'info' | 'warning' | 'urgent';
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  text: string;
  timestamp: any;
}
