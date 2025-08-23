/**
 * A mapping from client IDs to the list of task IDs assigned to each client.
 */
export type TaskDistributionResult = {
  [clientId: string]: string[];
};

export type TaskDistributionStrategy = (
  taskIds: string[],
  clientIds: string[],
) => TaskDistributionResult;
