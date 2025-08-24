import { Inject, Injectable, Logger } from '@nestjs/common';
import {} from '../coordination.module';
import { hostname } from 'os';
import {
  CoordinationModuleConfig,
  CoordinationModuleConfigToken,
} from '../coordination.module-definition';
import { Etcd3 } from 'etcd3';

@Injectable()
export class TaskService {
  public static readonly prefix = 'task';

  private readonly clientId = hostname();

  private readonly logger = new Logger(
    `${TaskService.name} - ${this.moduleConfig.taskName} - ${this.clientId}`,
  );

  public get taskPrefix() {
    return `${TaskService.prefix}/${this.moduleConfig.taskName}/`;
  }

  constructor(
    @Inject(CoordinationModuleConfigToken)
    private moduleConfig: CoordinationModuleConfig,
    private etcdClient: Etcd3,
  ) {}

  public async addTask<T>(taskId: string, payload: T): Promise<void> {
    const key = `${this.taskPrefix}${taskId}`;
    await this.etcdClient.put(key).value(JSON.stringify(payload));
    this.logger.log(`Added task with ID ${taskId}`);
  }

  public async removeTask(taskId: string): Promise<void> {
    const key = `${this.taskPrefix}${taskId}`;
    await this.etcdClient.delete().key(key);
    this.logger.log(`Removed task with ID ${taskId}`);
  }
}
