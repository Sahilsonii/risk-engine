export enum TransactionStatus {
  PENDING  = 'PENDING',
  APPROVED = 'APPROVED',
  FLAGGED  = 'FLAGGED',
  REJECTED = 'REJECTED',
}

export interface Transaction {
  id:         string;
  tenant_id:  string;
  amount:     number;
  status:     TransactionStatus;
  created_at: string;
  customer_name?: string;
  location?: string;
  merchant_name?: string;
}

export interface Stats {
  total:            string;
  approved:         string;
  rejected:         string;
  flagged:          string;
  pending:          string;
  approval_rate:    string;
  total_volume:     string;
  avg_amount:       string;
  queue_depth:      number;
  tenant_breakdown: TenantBreakdown[];
}

export interface TenantBreakdown {
  tenant_id: string;
  total:     string;
  approved:  string;
  flagged:   string;
  rejected:  string;
  volume:    string;
}

export interface Pagination {
  page:  number;
  limit: number;
  total: number;
  pages: number;
}

export interface TransactionsResponse {
  data:       Transaction[];
  pagination: Pagination;
}
