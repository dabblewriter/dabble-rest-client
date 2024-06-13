import { createId } from 'crypto-id';

export type Hook = (url: string, init: RequestInit) => any;
export interface Headers {
  [name: string]: string;
}

export class RestError extends Error {
  public code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * A library for working with JSON REST APIs. This function creates a REST API client that can be used to make requests
 * to the specified URL. It returns an object with methods for making GET, POST, PUT, PATCH, and DELETE requests.
 * Examples:
 *
 * ```ts
 * const api = createRestAPI('https://api.example.com');
 * const data = await api.get('/users').send();
 * const user = await api.post('/users').body({ name: 'Alice' }).send();
 * const user = await api.post('/users').send({ name: 'Alice' });
 * await api.delete('/users').query({ id: 123 }).send();
 * ```
 */
export function createRestAPI(url: string, headers?: HeadersInit) {
  const baseUrl = url.replace(/\/$/, '');
  const globalHeaders = new Headers(headers);
  globalHeaders.set('Accept', 'application/json');
  let hooks: Hook[] = [];

  function newRequest<T = any>(method: string, path: string) {
    const url = getUrl(baseUrl, path);
    const headers = new Headers(globalHeaders);
    const searchParams = new URLSearchParams();
    let body: any;

    const requestAPI = {
      header(key: string | HeadersInit, value?: string) {
        if (typeof key === 'string') {
          headers.set(key, value || '');
        } else {
          for (const [name, value] of Object.entries(key)) {
            headers.set(name, value);
          }
        }
        return requestAPI;
      },

      query(key: string | Record<string, string>, value?: string) {
        if (typeof key === 'string') {
          searchParams.set(key, value || '');
        } else {
          for (const [name, value] of Object.entries(key)) {
            searchParams.set(name, value);
          }
        }
        return requestAPI;
      },

      body(payload: any) {
        if (Array.isArray(payload) && payload[0] instanceof Blob) {
          const boundary = createId(18);
          const parts: any[] = [];
          payload.forEach((blob: Blob) => {
            parts.push(`--${boundary}\r\n`);
            parts.push(`Content-Type: ${blob.type}\r\n`);
            parts.push('\r\n');
            parts.push(blob);
            parts.push('\r\n');
          });
          parts.push(`--${boundary}--\r\n`);
          const contentType = 'multipart/related; boundary=' + boundary;
          const multipartBody = new Blob(parts, { type: contentType });
          payload = multipartBody;
          // Blob.type will lower-case the contentType, so be sure to set the header with correct casing
          headers.set('Content-Type', contentType);
        } else if (isJsonable(payload)) {
          if (!headers.has('Content-Type')) {
            payload = JSON.stringify(payload);
            headers.set('Content-Type', 'application/json');
          }
        }
        body = payload;
        return requestAPI;
      },

      async send<R = T>(payload?: any): Promise<R> {
        if (payload) requestAPI.body(payload);
        const init: RequestInit = { method, headers, body, credentials: 'include' };
        for (const hook of hooks) {
          await hook(url, init);
        }

        let request = new Request(url, init);

        const response = await fetch(request);
        let text = await response.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch (e) {}

        if (response.ok) {
          return data;
        }

        try {
          text = data.error || (typeof data === 'string' ? data : 'Unknown error');
        } catch (e) {}

        throw new RestError(response.status, text);
      },
    };

    return requestAPI;
  }

  return {
    hook(hook: Hook) {
      hooks.push(hook);
      return () => (hooks = hooks.filter(h => h === hook));
    },

    get: (path: string) => newRequest('GET', path),
    post: (path: string) => newRequest('POST', path),
    put: (path: string) => newRequest('PUT', path),
    patch: (path: string) => newRequest('PATCH', path),
    delete: (path: string) => newRequest('DELETE', path),
  };
}

function getUrl(baseUrl: string, path: string) {
  if (path.includes('//')) return path;
  if (path[0] !== '/') path = `/${path}`;
  return `${baseUrl}${path}`;
}

function isJsonable(obj: any) {
  return (
    obj &&
    !(
      typeof obj === 'string' ||
      obj instanceof Blob ||
      obj instanceof FormData ||
      obj instanceof File ||
      obj instanceof ReadableStream ||
      typeof obj.getReader === 'function'
    )
  );
}
