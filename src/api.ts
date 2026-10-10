import type { Command, Reply } from './types';

// Firefox exposes the promise-based browser API. Modern Chrome supports promises
// for the APIs used here; callback-based message replies work in both browsers.
export const api: typeof chrome = (globalThis as typeof globalThis & { browser?: typeof chrome }).browser ?? chrome;

export async function request<T>(command: Command): Promise<T> {
  const reply = await api.runtime.sendMessage(command) as Reply<T> | undefined;
  if (!reply) throw new Error('The extension did not respond. Reload the extension and try again.');
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
}
