import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {} from '../coordination.module';
import { Election, Etcd3 } from 'etcd3';
import { hostname } from 'os';
import {
  CoordinationModuleConfig,
  CoordinationModuleConfigToken,
} from '../coordination.module-definition';
import { TaskService } from './task.service';
import { BigNumber } from 'bignumber.js';
import { difference } from 'lodash';

type ClusterInformation = {
  clientIds: string[];
  taskIds: string[];
  revision: string;
};

type TaskAssignment = {
  taskIds: string[];
  revision: string;
};

@Injectable()
export class DistributionService implements OnModuleInit {
  private readonly clientId = hostname();

  private logger = new Logger(
    `${DistributionService.name} - ${this.moduleConfig.taskName} - ${this.clientId}`,
  );

  private readonly LEADER_LEASE_SECONDS = 5;

  private election: Election = this.etcdClient.election(
    this.moduleConfig.taskName,
    this.LEADER_LEASE_SECONDS,
  );

  private readonly CAMPAIGN_BACKOFF_MS = 3000;

  private readonly LEADER_OBSERVER_BACKOFF_MS = 3000;

  /**
   * Prefix that the SDK uses to perform leader election. We piggyback on this
   * for cluster membership notifications
   * Reference: https://github.com/microsoft/etcd3/blob/master/src/election.ts#L409-L421
   */
  private get membershipPrefix() {
    return `${Election.prefix}/${this.moduleConfig.taskName}/`;
  }

  private get taskPrefix() {
    return this.taskService.taskPrefix;
  }

  constructor(
    @Inject(CoordinationModuleConfigToken)
    private moduleConfig: CoordinationModuleConfig,
    private etcdClient: Etcd3,
    private taskService: TaskService,
  ) {}

  async onModuleInit() {
    this.runCampaign();
    this.observeTasksAssignedToSelf();
  }

  private runCampaign() {
    const campaign = this.election.campaign(this.clientId);

    campaign.on('elected', async () => {
      // Key revision should be public IMO, but for some reason the Node SDK
      // doesn't expose it. This is needed to ensure that we still have
      // leadership when performing any writes later
      // Reference: https://github.com/etcd-io/etcd/blob/main/server/etcdserver/api/v3election/v3electionpb/v3election.proto#L84-L87
      const electionKeyRevision = (campaign as any).keyRevision;
      await this.coordinateCluster(electionKeyRevision);
    });

    campaign.on('error', (err) => {
      this.logger.error('Election error', err);

      setTimeout(this.runCampaign.bind(this), this.CAMPAIGN_BACKOFF_MS);
    });
  }

  /**
   * Acts as cluster leader to distribute tasks.
   * Resolves when no longer holding leadership
   */
  private async coordinateCluster(leaderKeyRevision: string) {
    const {
      clientIds,
      taskIds,
      revision: snapshotRevision,
    } = await this.getClusterInformation();

    const startWatchRevision = new BigNumber(snapshotRevision)
      .plus(1)
      .toString();
    const memberWatcher = await this.etcdClient
      .watch()
      .startRevision(startWatchRevision)
      .prefix(this.membershipPrefix)
      .create();
    const taskWatcher = await this.etcdClient
      .watch()
      .startRevision(startWatchRevision)
      .prefix(this.taskPrefix)
      .create();
  }

  private async observeTasksAssignedToSelf() {
    const initialTaskAssignment = await this.getTasksAssignedToClientId(
      this.clientId,
    );
    let { taskIds } = initialTaskAssignment;

    const watcher = await this.etcdClient
      .watch()
      .key(`${this.taskPrefix}${this.clientId}`)
      .startRevision(
        new BigNumber(initialTaskAssignment.revision).plus(1).toString(),
      )
      .create();

    watcher.on('data', async (data) => {
      let newTaskIds: string[] = [];
      for (const event of data.events) {
        newTaskIds =
          event.type === 'Put' ? JSON.parse(event.kv.value.toString()) : [];
      }

      const added = difference(newTaskIds, taskIds);
      const removed = difference(taskIds, newTaskIds);
      this.logger.log(`Added tasks: ${added}. Removed tasks: ${removed}`);

      taskIds = newTaskIds;
    });
  }

  private async getTasksAssignedToClientId(
    clientId: string,
  ): Promise<TaskAssignment> {
    const taskResult = await this.etcdClient
      .get(`${this.taskPrefix}${clientId}`)
      .exec();
    const taskIds: string[] = JSON.parse(
      taskResult.kvs[0]?.value.toString() || '[]',
    );
    return { clientId, taskIds, revision: taskResult.header.revision };
  }

  /**
   * Perform a consistent read of clients and tasks in the cluster
   */
  private async getClusterInformation(): Promise<ClusterInformation> {
    const clientsResult = await this.etcdClient
      .getAll()
      .prefix(this.membershipPrefix)
      .exec();
    const clientIds = clientsResult.kvs.map((kv) => kv.value.toString());

    const revision = clientsResult.header.revision;

    const tasksResult = await this.etcdClient
      .getAll()
      .prefix(this.taskPrefix)
      .revision(revision)
      .exec();
    const taskIds = tasksResult.kvs.map((kv) => {
      const key = kv.key.toString();
      return key.replace(this.taskPrefix, '');
    });

    return { clientIds, taskIds, revision };
  }
}
