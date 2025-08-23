import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {} from '../coordination.module';
import { hostname } from 'os';
import {
  CoordinationModuleConfig,
  CoordinationModuleConfigToken,
} from '../coordination.module-definition';

@Injectable()
export class TaskService implements OnModuleInit {
  private logger: Logger;

  private clientId: string;

  constructor(
    @Inject(CoordinationModuleConfigToken)
    private moduleConfig: CoordinationModuleConfig,
  ) {}

  onModuleInit() {
    this.clientId = hostname();
    this.logger = new Logger(
      `${TaskService.name} - ${this.moduleConfig.taskName} - ${this.clientId}`,
    );
  }
}
