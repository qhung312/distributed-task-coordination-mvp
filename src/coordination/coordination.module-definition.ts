import { ConfigurableModuleBuilder } from '@nestjs/common';
import { TaskDistributionStrategy } from './lib';

export interface CoordinationModuleConfig {
  etcdHosts: string[];
  etcdAuth?: {
    username: string;
    password: string;
  };
  taskName: string;
  distributionStrategy: TaskDistributionStrategy;
}

export const {
  ConfigurableModuleClass: CoordinationConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN: CoordinationModuleConfigToken,
} = new ConfigurableModuleBuilder<CoordinationModuleConfig>()
  .setExtras({ isGlobal: false }, (definition, extras) => ({
    ...definition,
    isGlobal: extras.isGlobal,
  }))
  .build();
