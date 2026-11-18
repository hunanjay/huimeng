import { AsyncLocalStorage } from 'node:async_hooks';

const userStorage = new AsyncLocalStorage();
export const currentUserId = () => userStorage.getStore()?.userId || null;
export const currentRole = () => userStorage.getStore()?.role || null;
export const inUser = (userId, role, next) => userStorage.run({ userId, role }, next);
