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

export interface ChartBucket {
  bucket:           string;
  count:            number;
  volume:           string | number;
  flagged_rejected: number;
}

export interface AIInsights {
  total:            string;
  approval_rate:    string;
  rejection_rate:   string;
  flagged:          string;
  total_volume:     string;
  chart_explanation?: string;
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
  chart_data?:      ChartBucket[];
  ai_insights?:     AIInsights;
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
