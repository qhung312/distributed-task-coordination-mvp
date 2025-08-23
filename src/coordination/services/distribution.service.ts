import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CoordinationModuleConfig,
  CoordinationModuleConfigToken,
} from '../coordination.module';
import { Election, Etcd3 } from 'etcd3';
import { hostname } from 'os';

@Injectable()
export class DistributionService implements OnModuleInit {
  private logger: Logger;

  private clientId: string;

  private election: Election;

  private readonly leaderLeaseTTLSeconds = 5;

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
      this.leaderLeaseTTLSeconds,
    );

    this.runCampaign();
  }

  private runCampaign() {
    const campaign = this.election.campaign(this.clientId);

    campaign.on('elected', () => {});

    campaign.on('error', (err) => {
      this.logger.error('Election error', err);
    });
  }
}
