import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {} from '../coordination.module';
import { Election, Etcd3, IEvent, IOperation, IRequestOp } from 'etcd3';
import { hostname } from 'os';
import {
  CoordinationModuleConfig,
  CoordinationModuleConfigToken,
} from '../coordination.module-definition';
import { TaskService } from './task.service';
import { BigNumber } from 'bignumber.js';
import { isEqual, sortBy } from 'lodash';
import {
  CoordinationClient,
  CoordinationTaskName,
  SplitBrainError,
  TaskDistributionResult,
} from '../lib';
import { mergeMap, Subject } from 'rxjs';
import { DiscoveryService, ModuleRef } from '@nestjs/core';

type ClusterInformation = {
  clientIds: string[];
  taskIds: string[];
  clientAssignments: TaskDistributionResult;
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

  private readonly CAMPAIGN_BACKOFF_MS = 3000;

  private readonly TRIGGER_SYNC_INTERVAL_MS = 20000;

  private election: Election = this.etcdClient.election(
    this.moduleConfig.taskName,
    this.LEADER_LEASE_SECONDS,
  );

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

  private get assignmentPrefix() {
    return `assignment/${this.moduleConfig.taskName}/`;
  }

  constructor(
    @Inject(CoordinationModuleConfigToken)
    private moduleConfig: CoordinationModuleConfig,
    private etcdClient: Etcd3,
    private taskService: TaskService,
    private discoveryService: DiscoveryService,
    private moduleRef: ModuleRef,
  ) {}

  onModuleInit() {
    this.runCampaign();

    // Discover clients of this task and propagate updates to them
    this.discoveryService
      .getProviders()
      .filter(
        (item) =>
          this.discoveryService.getMetadataByDecorator(
            CoordinationTaskName,
            item,
          ) === this.moduleConfig.taskName,
      )
      .forEach((provider) => {
        const instance = this.moduleRef.get<CoordinationClient>(
          provider.token,
          { strict: false },
        );
        this.observeTasksAssignedToSelf(instance);
      });
  }

  private runCampaign() {
    const campaign = this.election.campaign(this.clientId);

    campaign.on('elected', async () => {
      // Key revision should be public IMO, but for some reason the Node SDK
      // doesn't expose it. This is needed to ensure that we still have
      // leadership when performing any writes later
      // Reference: https://github.com/etcd-io/etcd/blob/main/server/etcdserver/api/v3election/v3electionpb/v3election.proto#L84-L87
      const keyRevision = (campaign as any).keyRevision;
      const electionKey = await campaign.getCampaignKey();

      this.logger.log(`Elected as leader with key ${electionKey}`);

      try {
        await this.coordinateCluster(electionKey, keyRevision);
      } finally {
        await campaign.resign();

        // If somehow we're still alive, let's try to claim leadership again
        // We emit 'error' manually because the SDK only doesn't emit it when
        // we manually resign, only on lease lost due to network condition.
        //
        // By design, calling `resign` means that another node (other than current
        // node) will become leader.
        // See: https://microsoft.github.io/etcd3/classes/campaign.html#resign
        campaign.emit('error');
      }
    });

    campaign.on('error', (err) => {
      this.logger.error(`Lost leadership: ${err}`);

      setTimeout(this.runCampaign.bind(this), this.CAMPAIGN_BACKOFF_MS);
    });
  }

  /**
   * Acts as cluster leader to distribute tasks.
   * Settles when no longer holding leadership
   */
  private async coordinateCluster(electionKey: string, keyRevision: string) {
    const initialClusterInfo = await this.getClusterInformation();
    let { clientIds, taskIds, clientAssignments } = initialClusterInfo;

    const startWatchRevision = new BigNumber(initialClusterInfo.revision)
      .plus(1)
      .toString();
    const memberWatcher = await this.etcdClient
      .watch()
      .withPreviousKV()
      .startRevision(startWatchRevision)
      .prefix(this.membershipPrefix)
      .create();
    const taskWatcher = await this.etcdClient
      .watch()
      .withPreviousKV()
      .startRevision(startWatchRevision)
      .prefix(this.taskPrefix)
      .create();

    return new Promise(async (resolve) => {
      const writeNewDistribution = new Subject();
      let shouldStopWriting = false;

      // We're performing incremental updates, which means that updates have
      // to be sent and received in order, hence concurrency of 1
      writeNewDistribution
        .pipe(
          mergeMap(async (update: (IRequestOp | IOperation)[]) => {
            if (shouldStopWriting) {
              return;
            }
            if (update.length === 0) {
              return;
            }

            try {
              const result = await this.etcdClient
                .if(electionKey, 'Create', '==', keyRevision)
                .then(...update)
                .commit();

              if (!result.succeeded) {
                // We somehow lost leadership, so just stop everything we're doing
                throw new SplitBrainError();
              }
            } catch (err) {
              this.logger.error(err);

              // Cleanup resources and resign
              await memberWatcher.cancel();
              await taskWatcher.cancel();
              clearInterval(triggerStateSync);

              writeNewDistribution.complete();
              shouldStopWriting = true;

              resolve(undefined);
            }
          }, 1),
        )
        .subscribe();

      memberWatcher.on('data', (data) => {
        clientIds = this.processMembershipChanges(data.events, clientIds);

        const newDistribution = this.moduleConfig.distributionStrategy(
          taskIds,
          clientIds,
        );
        const updatePlan = this.buildIncrementalDistributionUpdatePlan(
          clientAssignments,
          newDistribution,
        );
        clientAssignments = newDistribution;
        writeNewDistribution.next(updatePlan);
      });

      taskWatcher.on('data', (data) => {
        taskIds = this.processTaskChanges(data.events, taskIds);

        const newDistribution = this.moduleConfig.distributionStrategy(
          taskIds,
          clientIds,
        );
        const updatePlan = this.buildIncrementalDistributionUpdatePlan(
          clientAssignments,
          newDistribution,
        );
        clientAssignments = newDistribution;
        writeNewDistribution.next(updatePlan);
      });

      // Rebalancing updates can fail, so the next leader can get stuck at a
      // suboptimal distribution if there are no membership changes. We periodically
      // touch the current leader key to make sure we always make progress
      const triggerStateSync = setInterval(() => {
        this.etcdClient
          .put(electionKey)
          .ignoreLease()
          .touch()
          .catch((err) => {
            this.logger.error(`Failed to touch leader key: ${err}`);
          });
      }, this.TRIGGER_SYNC_INTERVAL_MS);
    });
  }

  private processMembershipChanges(
    events: IEvent[],
    currentCluster: string[],
  ): string[] {
    const newCluster = [...currentCluster];

    for (const event of events) {
      if (event.type === 'Put') {
        const member = event.kv.value.toString();
        if (!newCluster.includes(member)) {
          newCluster.push(member);
        }
      } else {
        const member = event.prev_kv.value.toString();
        const idx = newCluster.indexOf(member);
        if (idx > -1) {
          newCluster.splice(idx, 1);
        }
      }
    }

    return newCluster;
  }

  private processTaskChanges(
    events: IEvent[],
    currentTasks: string[],
  ): string[] {
    const newTasks = [...currentTasks];

    for (const event of events) {
      if (event.type === 'Put') {
        const member = event.kv.key.toString().replace(this.taskPrefix, '');
        if (!newTasks.includes(member)) {
          newTasks.push(member);
        }
      } else {
        const member = event.prev_kv.key
          .toString()
          .replace(this.taskPrefix, '');
        const idx = newTasks.indexOf(member);
        if (idx > -1) {
          newTasks.splice(idx, 1);
        }
      }
    }

    return newTasks;
  }

  /**
   * Build operation to incrementally update task distribution in order to get
   * from `cur` to `target`
   */
  private buildIncrementalDistributionUpdatePlan(
    cur: TaskDistributionResult,
    target: TaskDistributionResult,
  ): (IRequestOp | IOperation)[] {
    const ops: (IRequestOp | IOperation)[] = [];

    // deleted keys
    for (const clientId of Object.keys(cur)) {
      if (!target[clientId]) {
        ops.push(
          this.etcdClient.delete().key(`${this.assignmentPrefix}${clientId}`),
        );
      }
    }

    // upserted keys
    for (const [clientId, taskIds] of Object.entries(target)) {
      const sameTasks = isEqual(sortBy(taskIds), sortBy(cur[clientId]));

      if (!sameTasks) {
        ops.push(
          this.etcdClient
            .put(`${this.assignmentPrefix}${clientId}`)
            .value(JSON.stringify(taskIds)),
        );
      }
    }

    return ops;
  }

  private async observeTasksAssignedToSelf(
    coordinationClient: CoordinationClient,
  ) {
    const initialTaskAssignment = await this.getTasksAssignedToClientId(
      this.clientId,
    );
    let { taskIds } = initialTaskAssignment;

    const watcher = await this.etcdClient
      .watch()
      .key(`${this.assignmentPrefix}${this.clientId}`)
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

      taskIds = newTaskIds;

      await coordinationClient.onTaskListUpdate(taskIds);
    });
  }

  private async getTasksAssignedToClientId(
    clientId: string,
  ): Promise<TaskAssignment> {
    const taskResult = await this.etcdClient
      .get(`${this.assignmentPrefix}${clientId}`)
      .exec();
    const taskIds: string[] = JSON.parse(
      taskResult.kvs[0]?.value.toString() || '[]',
    );
    return { taskIds, revision: taskResult.header.revision };
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

    const assignmentResults = await this.etcdClient
      .getAll()
      .prefix(this.assignmentPrefix)
      .revision(revision)
      .exec();
    const clientAssignments = assignmentResults.kvs.reduce((acc, kv) => {
      const key = kv.key.toString().replace(this.assignmentPrefix, '');
      const value = JSON.parse(kv.value.toString());
      acc[key] = value;
      return acc;
    }, {});

    return { clientIds, taskIds, clientAssignments, revision };
  }
}
