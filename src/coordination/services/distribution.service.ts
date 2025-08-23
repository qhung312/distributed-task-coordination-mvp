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

    campaign.on('elected', () => {});

    campaign.on('error', (err) => {
      this.logger.error('Election error', err);
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
