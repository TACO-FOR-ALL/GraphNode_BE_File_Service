import { AsyncLocalStorage } from 'async_hooks';

interface RequestStore {
  correlationId?: string;
  userId?: string;
}

export const requestStore = new AsyncLocalStorage<RequestStore>();

export function getCorrelationId(): string | undefined {
  return requestStore.getStore()?.correlationId;
}

export function getRequestUserId(): string | undefined {
  return requestStore.getStore()?.userId;
}

export function runWithRequestContext<T>(ctx: RequestStore, fn: () => T): T {
  return requestStore.run(ctx, fn);
}
