export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}
