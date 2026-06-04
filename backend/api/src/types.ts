export enum TransactionStatus {
  PENDING  = 'PENDING',
  APPROVED = 'APPROVED',
  FLAGGED  = 'FLAGGED',
  REJECTED = 'REJECTED',
  SUSPICIOUS = 'SUSPICIOUS',
}

export interface Transaction {
  id: string;
  tenant_id: string;
  amount: number;
  status: TransactionStatus;
  created_at: string;
  customer_name?: string;
  location?: string;
  merchant_name?: string;
  review_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

export interface QueueJob {
  id: string;
  tenant_id: string;
  amount: number;
  timestamp: string;
  customer_name?: string;
  location?: string;
  merchant_name?: string;
}
