import { AsyncLocalStorage } from 'node:async_hooks';

const orgStorage = new AsyncLocalStorage();
export const currentOrgId = () => orgStorage.getStore() || null;
export const inOrg = (orgId, next) => orgStorage.run(orgId, next);
