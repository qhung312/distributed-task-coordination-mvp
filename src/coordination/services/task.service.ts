import { Inject, Injectable, Logger } from '@nestjs/common';
import {} from '../coordination.module';
import { hostname } from 'os';
import {
  CoordinationModuleConfig,
  CoordinationModuleConfigToken,
} from '../coordination.module-definition';

@Injectable()
export class TaskService {
  public static readonly prefix = 'task';

  private readonly clientId = hostname();

  private readonly logger = new Logger(
    `${TaskService.name} - ${this.moduleConfig.taskName} - ${this.clientId}`,
  );

  constructor(
    @Inject(CoordinationModuleConfigToken)
    private moduleConfig: CoordinationModuleConfig,
  ) {}
}
