export class ApiResponseError<TErrorBody = unknown> extends Error {
  public status: number;
  public statusText: string;
  public body: TErrorBody;

  public constructor(rawResponse: Response, body: TErrorBody, message?: string) {
    super(message);
    this.name = 'ApiResponseError';
    this.statusText = rawResponse.statusText;
    this.status = rawResponse.status;
    this.body = body;
  }

  public hasStatusCode(statusCode: number) {
    return this.status === statusCode;
  }
}
