import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { refreshAccessToken, extractBaseUrl, type BqeAuthConfig } from "./auth.js";

export interface BqeClientOptions {
  baseUrl: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  authConfig: BqeAuthConfig;
  onTokenRefresh?: (newAccessToken: string, newRefreshToken: string, newExpiresAt: Date, newBaseUrl: string) => Promise<void>;
}

export interface QueryParams {
  where?: string;
  orderBy?: string;
  page?: number;
  pageSize?: number;
  fields?: string;
  expand?: string;
  count?: boolean;
}

/**
 * BQE Core API client with auto-refresh, rate limiting, and error handling.
 */
export class BqeClient {
  private http: AxiosInstance;
  private accessToken: string;
  private refreshToken: string;
  private expiresAt: Date;
  private baseUrl: string;
  private authConfig: BqeAuthConfig;
  private onTokenRefresh?: BqeClientOptions["onTokenRefresh"];

  // Simple rate limiter: track request timestamps
  private requestTimestamps: number[] = [];
  private readonly MAX_REQUESTS_PER_MINUTE = 95; // stay under the 100/min limit

  constructor(options: BqeClientOptions) {
    this.baseUrl = options.baseUrl;
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.expiresAt = options.expiresAt;
    this.authConfig = options.authConfig;
    this.onTokenRefresh = options.onTokenRefresh;

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });

    // Request interceptor for auth + rate limiting
    this.http.interceptors.request.use(async (config) => {
      await this.ensureTokenValid();
      await this.waitForRateLimit();
      config.headers.Authorization = `Bearer ${this.accessToken}`;
      config.headers["Content-Type"] = "application/json";
      return config;
    });
  }

  private async ensureTokenValid(): Promise<void> {
    // Refresh if token expires within 60 seconds
    if (new Date() >= new Date(this.expiresAt.getTime() - 60_000)) {
      const tokenResponse = await refreshAccessToken(this.authConfig, this.refreshToken);
      this.accessToken = tokenResponse.access_token;
      this.refreshToken = tokenResponse.refresh_token;
      this.expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
      const newBaseUrl = extractBaseUrl(tokenResponse);
      if (newBaseUrl !== this.baseUrl) {
        this.baseUrl = newBaseUrl;
        this.http.defaults.baseURL = newBaseUrl;
      }
      if (this.onTokenRefresh) {
        await this.onTokenRefresh(this.accessToken, this.refreshToken, this.expiresAt, this.baseUrl);
      }
    }
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60_000);
    if (this.requestTimestamps.length >= this.MAX_REQUESTS_PER_MINUTE) {
      const oldest = this.requestTimestamps[0];
      const waitMs = 60_000 - (now - oldest) + 100;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.requestTimestamps.push(Date.now());
  }

  private buildParams(query?: QueryParams): Record<string, string> {
    const params: Record<string, string> = {};
    if (!query) return params;
    if (query.where) params.where = query.where;
    if (query.orderBy) params.orderBy = query.orderBy;
    if (query.page !== undefined) params.page = String(query.page);
    if (query.pageSize !== undefined) params.pageSize = String(query.pageSize);
    if (query.fields) params.fields = query.fields;
    if (query.expand) params.expand = query.expand;
    if (query.count) params.count = "true";
    return params;
  }

  // === Generic CRUD ===

  async get<T>(endpoint: string, query?: QueryParams): Promise<T[]> {
    const response = await this.http.get(endpoint, { params: this.buildParams(query) });
    // Core API may return array directly or wrapped in an object
    const data = response.data;
    return Array.isArray(data) ? data : data.items ?? data.value ?? [data];
  }

  async getById<T>(endpoint: string, id: string): Promise<T> {
    const response = await this.http.get(`${endpoint}/${id}`);
    return response.data;
  }

  async post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.http.post(endpoint, body);
    return response.data;
  }

  async put<T>(endpoint: string, id: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.http.put(`${endpoint}/${id}`, body);
    return response.data;
  }

  async delete(endpoint: string, id: string): Promise<void> {
    await this.http.delete(`${endpoint}/${id}`);
  }

  // === Typed API methods ===

  // Projects
  async getProjects(query?: QueryParams) {
    return this.get<Record<string, unknown>>("/project", query);
  }

  async getProject(id: string) {
    return this.getById<Record<string, unknown>>("/project", id);
  }

  // Activities (phases)
  async getActivities(query?: QueryParams) {
    return this.get<Record<string, unknown>>("/activity", query);
  }

  async getActivitiesByProject(projectId: string) {
    return this.get<Record<string, unknown>>("/activity", {
      where: `projectId='${projectId}'`,
    });
  }

  // Time Entries
  async getTimeEntries(query?: QueryParams) {
    return this.get<Record<string, unknown>>("/timeentry", query);
  }

  async createTimeEntry(entry: Record<string, unknown>) {
    return this.post<Record<string, unknown>>("/timeentry", entry);
  }

  // Invoices
  async getInvoices(query?: QueryParams) {
    return this.get<Record<string, unknown>>("/invoice", query);
  }

  async createInvoice(invoice: Record<string, unknown>) {
    return this.post<Record<string, unknown>>("/invoice", invoice);
  }

  async getInvoice(id: string) {
    return this.getById<Record<string, unknown>>("/invoice", id);
  }

  // Clients
  async getClients(query?: QueryParams) {
    return this.get<Record<string, unknown>>("/client", query);
  }

  // Employees
  async getEmployees(query?: QueryParams) {
    return this.get<Record<string, unknown>>("/employee", query);
  }

  // Expenses
  async getExpenseEntries(query?: QueryParams) {
    return this.get<Record<string, unknown>>("/expenseentry", query);
  }

  async createExpenseEntry(expense: Record<string, unknown>) {
    return this.post<Record<string, unknown>>("/expenseentry", expense);
  }
}
