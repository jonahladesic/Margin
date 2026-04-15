// BQE Core API response types

export interface CoreProject {
  id: string;
  name: string;
  projectNumber: string;
  clientId?: string;
  clientName?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  contractAmount?: number;
  description?: string;
}

export interface CoreActivity {
  id: string;
  name: string;
  projectId: string;
  budget?: number;
  description?: string;
  isActive?: boolean;
}

export interface CoreTimeEntry {
  id: string;
  projectId: string;
  activityId?: string;
  employeeId?: string;
  date: string;
  hours: number;
  description?: string;
  billable?: boolean;
}

export interface CoreInvoice {
  id: string;
  projectId: string;
  invoiceNumber?: string;
  status: string;
  invoiceDate?: string;
  dueDate?: string;
  amount?: number;
  balanceDue?: number;
  lineItems?: CoreInvoiceLineItem[];
}

export interface CoreInvoiceLineItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  projectId?: string;
  activityId?: string;
}

export interface CoreClient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface CoreEmployee {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

// OAuth token response
export interface CoreTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  resources?: string[];
}

// Webhook event payload
export interface CoreWebhookEvent {
  eventType: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

// Paginated response wrapper
export interface CorePaginatedResponse<T> {
  items: T[];
  totalCount?: number;
  page?: number;
  pageSize?: number;
}

// Sync result tracking
export interface SyncResult {
  created: number;
  updated: number;
  errors: number;
  details: string[];
}
