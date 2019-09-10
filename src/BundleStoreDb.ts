/// <reference types="../types/index" />

import debug from "debug";
import fs from "fs";
import _ from "lodash";
import path from "path";
import shell from "shelljs";
import uuidv4 from "uuid/v4";

export class BundleStoreDb {
  public readonly dbPath: string;

  private readonly d = debug("BundleStoreDb");

  private db: Db;

  constructor({
    dbPath,
    seed = {
      assets: {},
      stores: {},
    },
  }: {
    dbPath: string;
    seed?: Db;
  }) {
    this.d(`ctor(dbPath: ${dbPath}, seed: ${seed})`);
    this.dbPath = dbPath;
    if (!fs.existsSync(dbPath)) {
      shell.mkdir("-p", path.dirname(dbPath));
      this.db = seed;
      fs.writeFileSync(dbPath, JSON.stringify(this.db));
      this.d(`created new database in ${dbPath}`);
    } else {
      this.db = JSON.parse(fs.readFileSync(this.dbPath).toString());
    }
  }

  public get data(): Db {
    return JSON.parse(JSON.stringify(this.db));
  }

  public isStoreEmpty({
    platform,
    storeId,
  }: {
    platform?: Platform;
    storeId: string;
  }): boolean {
    this.throwIfStoreDoesNotExist(storeId);
    return this.db.stores[storeId].bundles.length === 0
      ? true
      : platform
      ? !_.some(this.db.stores[storeId].bundles, (b) => b.platform === platform)
      : false;
  }

  public hasBundle({
    bundleId,
    storeId,
  }: {
    bundleId: string;
    storeId: string;
  }): boolean {
    this.throwIfStoreDoesNotExist(storeId);
    return _.some(this.db.stores[storeId].bundles, (b) => b.id === bundleId);
  }

  public getBundle({
    bundleId,
    storeId,
  }: {
    bundleId: string;
    storeId: string;
  }): Bundle {
    this.throwIfStoreDoesNotExist(storeId);
    const bundle = _.find(
      this.db.stores[storeId].bundles,
      (b) => b.id === bundleId,
    );
    if (!bundle) {
      throw new Error(`Bundle ${bundleId} does not exist in store ${storeId}`);
    }
    return bundle;
  }

  public getLatestBundle({
    platform,
    storeId,
  }: {
    platform: Platform;
    storeId: string;
  }): Bundle {
    this.throwIfStoreDoesNotExist(storeId);
    if (this.isStoreEmpty({ platform, storeId })) {
      throw new Error(`No bundle in store ${storeId} for ${platform} platform`);
    }
    return _.last(
      _.filter(this.db.stores[storeId].bundles, (p) => p.platform === platform),
    );
  }

  public addBundle({
    bundle,
    storeId,
  }: {
    bundle: Bundle;
    storeId: string;
  }): void {
    this.throwIfStoreDoesNotExist(storeId);
    this.db.stores[storeId].bundles.push(bundle);
    this.write();
  }

  public delBundle({
    bundleId,
    storeId,
  }: {
    bundleId: string;
    storeId: string;
  }): Bundle {
    this.throwIfStoreDoesNotExist(storeId);
    const bundle = this.getBundle({ bundleId, storeId });
    _.remove(this.db.stores[storeId].bundles, (b: Bundle) => b.id === bundleId);
    this.write();
    return bundle;
  }

  public createStore(storeId: string): Store {
    this.throwIfStoreExist(storeId);
    const store = {
      accessKey: uuidv4(),
      bundles: [],
      id: storeId,
    };
    this.db.stores[storeId] = store;
    this.write();
    this.d(`created new store: ${store}`);
    return store;
  }

  public hasStore(storeId: string): boolean {
    return !!this.db.stores[storeId];
  }

  public getStore(storeId: string): Store {
    this.throwIfStoreDoesNotExist(storeId);
    return this.db.stores[storeId];
  }

  public delStore(storeId: string): Store {
    this.throwIfStoreDoesNotExist(storeId);
    const store = this.db.stores[storeId];
    delete this.db.stores[storeId];
    this.write();
    this.d(`deleted store: ${store.id}`);
    return store;
  }

  public getStores(): Stores {
    return this.db.stores;
  }

  public getAssets(): Assets {
    return this.db.assets;
  }

  public createAssets(assets: string[]): Assets {
    const createdAssets = {};
    for (const asset of assets) {
      createdAssets[asset] = {};
    }
    Object.assign(this.db.assets, createdAssets);
    this.write();
    this.d(`created assets: ${createdAssets}`);
    return createdAssets;
  }

  public throwIfStoreDoesNotExist(storeId: string): never | void {
    if (!this.hasStore(storeId)) {
      throw new Error(`Store id ${storeId} does not exist in database.`);
    }
  }

  public throwIfStoreExist(storeId: string): never | void {
    if (this.hasStore(storeId)) {
      throw new Error(`Store id ${storeId} already exist in database.`);
    }
  }

  public write() {
    this.d(`write database`);
    fs.writeFileSync(this.dbPath, JSON.stringify(this.db));
  }
}
