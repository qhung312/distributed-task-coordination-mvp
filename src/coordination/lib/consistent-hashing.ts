import { createHash } from 'crypto';
import {
  TaskDistributionResult,
  TaskDistributionStrategy,
} from './distribution-strategy';

function hash(s: string): string {
  return createHash('md5').update(s).digest('hex');
}

export const consistentHashing: TaskDistributionStrategy = (
  taskIds: string[],
  clientIds: string[],
): TaskDistributionResult => {
  const ret: TaskDistributionResult = {};

  const clients = clientIds.map((id) => ({
    originalId: id,
    hash: hash(id),
  }));
  clients.forEach((c) => (ret[c.originalId] = []));
  clients.sort((a, b) => (a.hash < b.hash ? -1 : 1));

  for (const task of taskIds) {
    const taskHash = hash(task);
    const closestClient = clients.find((c) => c.hash >= taskHash) ?? clients[0];

    if (closestClient) {
      ret[closestClient.originalId].push(task);
    }
  }

  return ret;
};
