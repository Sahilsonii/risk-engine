export enum TransactionStatus {
  PENDING  = 'PENDING',
  APPROVED = 'APPROVED',
  FLAGGED  = 'FLAGGED',
  REJECTED = 'REJECTED',
  SUSPICIOUS = 'SUSPICIOUS',
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
  review_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
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

export interface ReportData {
  transactions: Transaction[];
  stats: {
    total: number;
    approved: number;
    rejected: number;
    flagged: number;
    suspicious: number;
    pending: number;
    total_volume: number;
    avg_amount: number;
    approval_rate: number;
    rejection_rate: number;
  };
  ai_report: {
    executive_summary: string;
    risk_analysis: string;
    recommendations: string;
  };
  period: {
    start: string;
    end: string;
  };
}
