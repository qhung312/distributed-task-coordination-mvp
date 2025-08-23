import { Module } from '@nestjs/common';
import { Etcd3 } from 'etcd3';
import { DistributionService, TaskService } from './services';
import {
  CoordinationConfigurableModuleClass,
  CoordinationModuleConfig,
  CoordinationModuleConfigToken,
} from './coordination.module-definition';

@Module({
  imports: [],
  providers: [
    {
      provide: Etcd3,
      useFactory: (options: CoordinationModuleConfig) =>
        new Etcd3({
          hosts: options.etcdHosts,
          auth: options.etcdAuth,
        }),
      inject: [CoordinationModuleConfigToken],
    },
    DistributionService,
    TaskService,
  ],
})
export class CoordinationModule extends CoordinationConfigurableModuleClass {}
