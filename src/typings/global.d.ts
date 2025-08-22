declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ETCD_HOSTS: string;
      ETCD_USERNAME?: string;
      ETCD_PASSWORD?: string;
    }
  }
}

export {};
