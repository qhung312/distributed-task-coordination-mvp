import { Logger } from '@nestjs/common';
import { CoordinationClient, CoordinationTaskName } from './coordination/lib';

@CoordinationTaskName('demoTask')
export class AppService implements CoordinationClient {
  private logger = new Logger(AppService.name);

  onTaskListUpdate(taskIds: string[]): void {
    this.logger.log(`Received updated task list: ${taskIds.join(', ')}`);
  }
}
