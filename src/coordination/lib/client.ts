import { DiscoveryService } from '@nestjs/core';

export interface CoordinationClient {
  onTaskListUpdate(taskIds: string[]): Promise<void> | void;
}

export const CoordinationTaskName = DiscoveryService.createDecorator();
