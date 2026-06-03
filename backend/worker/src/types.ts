export enum TransactionStatus {
  PENDING  = 'PENDING',
  APPROVED = 'APPROVED',
  FLAGGED  = 'FLAGGED',
  REJECTED = 'REJECTED',
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
