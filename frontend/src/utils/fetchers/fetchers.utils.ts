export interface FetchOptions<TRequestBody> {
  method?: string;
  headers?: Record<string, string>;
  body?: TRequestBody;
  isJSONResponse?: boolean;
  returnHeaders?: boolean;
  timeout?: number;
}

const getMutationRequestBody = <TRequestBody>(requestBody: TRequestBody): BodyInit | undefined => {
  if (requestBody) {
    return requestBody instanceof Blob || requestBody instanceof FormData
      ? requestBody
      : JSON.stringify(requestBody);
  }
  return undefined;
};

export const getFetchQueryOptions = <TRequestBody>({
  method = 'GET',
  headers,
  body,
}: FetchOptions<TRequestBody>): RequestInit => {
  return {
    method,
    credentials: 'include' as RequestCredentials,
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    ...(body ? { body: getMutationRequestBody(body) } : {}),
  };
};

export const parseErrorBody = async <TErrorBody = unknown>(
  response: Response,
): Promise<TErrorBody | string> => {
  let errorBody: TErrorBody | string = '';
  if (response.headers.get('content-length') !== '0') {
    try {
      errorBody = (await response.json()) as TErrorBody;
    } catch {
      try {
        errorBody = await response.text();
      } catch {
        errorBody = '';
      }
    }
  }
  return errorBody;
};
