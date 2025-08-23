import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {} from '../coordination.module';
import { Election, Etcd3 } from 'etcd3';
import { hostname } from 'os';
import {
  CoordinationModuleConfig,
  CoordinationModuleConfigToken,
} from '../coordination.module-definition';

@Injectable()
export class DistributionService implements OnModuleInit {
  private logger: Logger;

  private clientId: string;

  private election: Election;

  private readonly LEADER_LEASE_SECONDS = 5;

  private readonly CAMPAIGN_BACKOFF_MS = 3000;

  private readonly LEADER_OBSERVER_BACKOFF_MS = 3000;

  private isLeader = false;
  private electionKeyRevision?: string;

  constructor(
    @Inject(CoordinationModuleConfigToken)
    private moduleConfig: CoordinationModuleConfig,
    private etcdClient: Etcd3,
  ) {}

  async onModuleInit() {
    this.clientId = hostname();
    this.logger = new Logger(
      `${DistributionService.name} - ${this.moduleConfig.taskName} - ${this.clientId}`,
    );
    this.election = this.etcdClient.election(
      this.moduleConfig.taskName,
      this.LEADER_LEASE_SECONDS,
    );

    this.runCampaign();
    this.observeLeader();
  }

  private runCampaign() {
    const campaign = this.election.campaign(this.clientId);

    campaign.on('elected', () => {
      this.isLeader = true;
      // Key revision should be public IMO, but for some reason the Node SDK
      // doesn't expose it. This is needed to ensure that we still have
      // leadership when performing any writes later
      // Reference: https://github.com/etcd-io/etcd/blob/929e947cad4f1f9b7bb781fa75a1066ef4c0846f/server/etcdserver/api/v3election/v3electionpb/v3election.proto#L81-L83
      this.electionKeyRevision = (campaign as any).keyRevision;
    });

    campaign.on('error', (err) => {
      this.logger.error('Election error', err);

      this.isLeader = false;
      this.electionKeyRevision = undefined;

      setTimeout(this.runCampaign.bind(this), this.CAMPAIGN_BACKOFF_MS);
    });
  }

  private async observeLeader() {
    const observer = await this.election.observe();
    this.logger.log(`Current leader is ${observer.leader()}`);

    observer.on('change', (leader) => {
      this.logger.log(`New leader elected: ${leader}`);
    });

    observer.on('error', (err) => {
      this.logger.error('Leader observation error', err);
      setTimeout(
        this.observeLeader.bind(this),
        this.LEADER_OBSERVER_BACKOFF_MS,
      );
    });
  }
}
