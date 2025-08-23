import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CoordinationModuleConfig,
  CoordinationModuleConfigToken,
} from '../coordination.module';

@Injectable()
export class TaskService {
  private readonly logger: Logger;

  constructor(
    @Inject(CoordinationModuleConfigToken)
    moduleConfig: CoordinationModuleConfig,
  ) {
    this.logger = new Logger(`${TaskService.name} - ${moduleConfig.taskName}`);
  }
}
