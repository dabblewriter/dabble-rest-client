import { createId } from 'crypto-id';

interface JSONable {
  toJSON(): any;
}

export type Hook<T extends RequestAPI = RequestAPI> = (request: T) => any;
export type JSON = string | number | boolean | null | JSONObject | Array<JSON> | JSONable;
export type JSONObject = { [x: string]: JSON | JSONable };
export type BodyTypes = BodyInit | Blob[] | JSONObject | JSONable | null;

export class RestError extends Error {
  public code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

interface RequestAPIContructor<T extends RequestAPI = RequestAPI> {
  new (method: string, url: URL, headers: HeadersInit | undefined, hooks: Hook<any>[]): T;
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
export function createRestAPI<T extends RequestAPI = RequestAPI>(
  baseUrl: string,
  headers?: HeadersInit,
  RequestClass: RequestAPIContructor<T> = RequestAPI as any
) {
  let hooks: Hook<T>[] = [];

  return {
    hook(hook: Hook<T>) {
      hooks.push(hook);
      return () => (hooks = hooks.filter(h => h === hook));
    },

    get: (path: string) => new RequestClass('GET', new URL(path, baseUrl), headers, hooks),
    post: (path: string) => new RequestClass('POST', new URL(path, baseUrl), headers, hooks),
    put: (path: string) => new RequestClass('PUT', new URL(path, baseUrl), headers, hooks),
    patch: (path: string) => new RequestClass('PATCH', new URL(path, baseUrl), headers, hooks),
    delete: (path: string) => new RequestClass('DELETE', new URL(path, baseUrl), headers, hooks),
  };
}

export class RequestAPI<T = any> {
  url: URL;
  init: RequestInit;
  hooks: Hook[];

  constructor(method: string, url: URL, headers: HeadersInit | undefined, hooks: Hook<any>[]) {
    this.url = url;
    this.init = { method, headers: new Headers(headers) };
    this.hooks = hooks;
    this.header('Accept', 'application/json');
  }

  header(key: string): string | null;
  header(key: string, value: string): this;
  header(key: HeadersInit): this;
  header(key: string | HeadersInit, value?: string) {
    if (typeof key === 'string') {
      if (value === undefined) {
        return (this.init.headers as Headers).get(key);
      }
      (this.init.headers as Headers).set(key, value || '');
    } else {
      for (const [name, value] of Object.entries(key)) {
        (this.init.headers as Headers).set(name, value);
      }
    }
    return this;
  }

  credentials(value: RequestCredentials) {
    this.init.credentials = value;
    return this;
  }

  query(key: string, value: string): this;
  query(key: Record<string, string>): this;
  query(key: string | Record<string, string>, value?: string) {
    if (typeof key === 'string') {
      this.url.searchParams.set(key, value || '');
    } else {
      for (const [name, value] of Object.entries(key)) {
        this.url.searchParams.set(name, value);
      }
    }
    return this;
  }

  body(body: BodyTypes) {
    if (isBlobArray(body)) {
      const boundary = createId(18);
      const parts: any[] = [];
      body.forEach((blob: Blob) => {
        parts.push(`--${boundary}\r\n`);
        parts.push(`Content-Type: ${blob.type}\r\n`);
        parts.push('\r\n');
        parts.push(blob);
        parts.push('\r\n');
      });
      parts.push(`--${boundary}--\r\n`);
      const contentType = 'multipart/related; boundary=' + boundary;
      const multipartBody = new Blob(parts, { type: contentType });
      body = multipartBody;
      // Blob.type will lower-case the contentType, so be sure to set the header with correct casing
      this.header('Content-Type', contentType);
    } else if (isJsonable(body)) {
      body = JSON.stringify(body);
      if (!this.header('Content-Type')) {
        this.header('Content-Type', 'application/json');
      }
    }
    this.init.body = body;
    return this;
  }

  async send<R = T>(body?: BodyTypes): Promise<R> {
    if (body !== undefined) this.body(body);
    for (const hook of this.hooks) {
      await hook(this);
    }

    const request = new Request(this.url, this.init);

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
  }
}

function isJsonable(obj: any): obj is JSONObject {
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

function isBlobArray(obj: any): obj is Blob[] {
  return Array.isArray(obj) && obj[0] instanceof Blob;
}
