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
  clientIds.forEach((id) => (ret[id] = []));

  const clientHashes = clientIds.map((id) => hash(id));
  clientHashes.sort();

  for (const task of taskIds) {
    const taskHash = hash(task);
    const closestClient =
      clientHashes.find((c) => c >= taskHash) ?? clientHashes[0];

    if (closestClient) {
      ret[closestClient].push(task);
    }
  }

  return ret;
};
