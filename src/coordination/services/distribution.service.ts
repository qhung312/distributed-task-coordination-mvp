import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {} from '../coordination.module';
import { Election, Etcd3 } from 'etcd3';
import { hostname } from 'os';
import {
  CoordinationModuleConfig,
  CoordinationModuleConfigToken,
} from '../coordination.module-definition';
import { TaskService } from './task.service';

type ClusterInformation = {
  clientIds: string[];
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

  private isLeader = false;
  private electionKeyRevision?: string;

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
  }

  private runCampaign() {
    const campaign = this.election.campaign(this.clientId);

    campaign.on('elected', () => {
      this.isLeader = true;
      // Key revision should be public IMO, but for some reason the Node SDK
      // doesn't expose it. This is needed to ensure that we still have
      // leadership when performing any writes later
      // Reference: https://github.com/etcd-io/etcd/blob/main/server/etcdserver/api/v3election/v3electionpb/v3election.proto#L84-L87
      this.electionKeyRevision = (campaign as any).keyRevision;
    });

    campaign.on('error', (err) => {
      this.logger.error('Election error', err);

      this.isLeader = false;
      this.electionKeyRevision = undefined;

      setTimeout(this.runCampaign.bind(this), this.CAMPAIGN_BACKOFF_MS);
    });
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
