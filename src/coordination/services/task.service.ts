import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CoordinationModuleConfig,
  CoordinationModuleConfigToken,
} from '../coordination.module';
import { hostname } from 'os';

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
