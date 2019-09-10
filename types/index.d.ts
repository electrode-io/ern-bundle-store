declare type Platform = "android" | "ios";

declare interface StackFrame {
  arguments?: any[];
  column?: number;
  file?: string;
  lineNumber?: number;
  methodName: string;
}

declare interface Bundle {
  id: string;
  platform: Platform;
  sourceMap: string;
  timestamp: number;
}

declare interface Assets {
  [key: string]: any;
}

declare interface Store {
  accessKey: string;
  bundles: Bundle[];
  id: string;
}

declare interface Stores {
  [key: any]: Store;
}

declare interface Db {
  assets: Assets;
  stores: Stores;
}

declare interface BundleStoreServerPaths {
  assets: string;
  bundles: string;
  sourcemaps: string;
  db: string;
}

declare interface BundleStoreServerConfig {
  dbSeed?: Db;
  host?: string;
  port: number;
  maxBundles: number;
  rootPath?: string;
  paths?: BundleStoreServerPaths;
}

declare type BundleStoreServerUserConfig = Partial<BundleStoreServerConfig>;

declare namespace Express {
  export interface Request {
    text: string;
    params: any;
    store: Store;
    bundle: Bundle;
  }
}
