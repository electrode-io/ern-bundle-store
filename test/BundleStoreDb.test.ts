/// <reference types="../types/index" />

import { expect } from "chai";
import fs from "fs";
import "mocha";
import path from "path";
import tmp from "tmp";
import { BundleStoreDb } from "../src/BundleStoreDb";

describe("BundleStoreDb", () => {
  tmp.setGracefulCleanup();

  const androidBundleA: Bundle = {
    id: "52b4a9cd-c516-4ca7-a0a6-b310cc44345a",
    platform: "android",
    sourceMap: "e4b87a58-7cb1-408f-a30f-1ddef2e1b972",
    timestamp: 1566351493255,
  };

  const androidBundleB: Bundle = {
    id: "de0f2684-b070-4560-a01b-1a3fbc33d735",
    platform: "android",
    sourceMap: "24f0e611-5af7-49d9-bb11-5fa055c3c460",
    timestamp: 1566576535136,
  };

  function parseJsonFile(file: string): any {
    const f = fs.readFileSync(file).toString();
    return JSON.parse(f);
  }

  function createDb(seed?: Db): { db: BundleStoreDb; dbPath: string } {
    const tmpDir = tmp.dirSync({ unsafeCleanup: true }).name;
    const dbPath = path.join(tmpDir, "db.json");
    return { db: new BundleStoreDb({ dbPath, seed }), dbPath };
  }

  describe("constructor", () => {
    it("should create db file if it does not exit", () => {
      const { dbPath } = createDb();
      expect(fs.existsSync(dbPath)).true;
    });

    it("should create db with default seed", () => {
      const { dbPath } = createDb();
      const db = parseJsonFile(dbPath);
      expect(db).deep.equal({
        assets: {},
        stores: {},
      });
    });

    it("should create db with custom seed", () => {
      const seed = {
        assets: {
          "47ce6e77f039020ee2e76a10c1e988e9": {},
        },
        stores: {},
      };
      const { dbPath } = createDb(seed);
      const db = parseJsonFile(dbPath);
      expect(db).deep.equal(seed);
    });

    it("should not overwrite existing db file", () => {
      const dbData = {
        assets: {
          "47ce6e77f039020ee2e76a10c1e988e9": {},
        },
        stores: {},
      };
      const tmpDir = tmp.dirSync({ unsafeCleanup: true }).name;
      const dbPath = path.join(tmpDir, "db.json");
      fs.writeFileSync(dbPath, JSON.stringify(dbData));
      createDb();
      const db = parseJsonFile(dbPath);
      expect(db).deep.equal(dbData);
    });
  });

  describe("isStoreEmtpy", () => {
    it("should throw if the store does not exist", () => {
      const { db } = createDb();
      expect(() => db.isStoreEmpty({ storeId: "dummy" })).to.throw();
    });

    it("should return true if the store is emtpy", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [],
            id: "dummy",
          },
        },
      });
      expect(db.isStoreEmpty({ storeId: "dummy" })).true;
    });

    it("should return false if the store is not emtpy", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [
              {
                id: "52b4a9cd-c516-4ca7-a0a6-b310cc44345a",
                platform: "android",
                sourceMap: "e4b87a58-7cb1-408f-a30f-1ddef2e1b972",
                timestamp: 1566351493255,
              },
            ],
            id: "dummy",
          },
        },
      });
      expect(db.isStoreEmpty({ storeId: "dummy" })).false;
    });

    it("should return true if the store is empty for given platform", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [androidBundleA],
            id: "dummy",
          },
        },
      });
      expect(db.isStoreEmpty({ storeId: "dummy", platform: "ios" })).true;
    });

    it("should return false if the store is not empty for given platform", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [androidBundleA],
            id: "dummy",
          },
        },
      });
      expect(db.isStoreEmpty({ storeId: "dummy", platform: "android" })).false;
    });
  });

  describe("hasBundle", () => {
    it("should throw if the store does not exist", () => {
      const { db } = createDb();
      expect(() =>
        db.hasBundle({
          bundleId: "52b4a9cd-c516-4ca7-a0a6-b310cc44345a",
          storeId: "dummy",
        }),
      ).to.throw();
    });

    it("should return false if the bundle does not exist", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [],
            id: "dummy",
          },
        },
      });
      expect(
        db.hasBundle({
          bundleId: "52b4a9cd-c516-4ca7-a0a6-b310cc44345a",
          storeId: "dummy",
        }),
      ).false;
    });

    it("should return true if the bundle exist", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [androidBundleA],
            id: "dummy",
          },
        },
      });
      expect(
        db.hasBundle({
          bundleId: "52b4a9cd-c516-4ca7-a0a6-b310cc44345a",
          storeId: "dummy",
        }),
      ).true;
    });
  });

  describe("getBundle", () => {
    it("should throw if the store does not exist", () => {
      const { db } = createDb();
      expect(() =>
        db.getBundle({
          bundleId: "52b4a9cd-c516-4ca7-a0a6-b310cc44345a",
          storeId: "dummy",
        }),
      ).to.throw();
    });

    it("should throw if the bundle does not exist", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [],
            id: "dummy",
          },
        },
      });
      expect(() =>
        db.getBundle({
          bundleId: "52b4a9cd-c516-4ca7-a0a6-b310cc44345a",
          storeId: "dummy",
        }),
      ).to.throw();
    });

    it("should return the bundle if it exist", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [androidBundleA],
            id: "dummy",
          },
        },
      });
      expect(
        db.getBundle({
          bundleId: "52b4a9cd-c516-4ca7-a0a6-b310cc44345a",
          storeId: "dummy",
        }),
      ).deep.equal(androidBundleA);
    });
  });

  describe("getLatestBundle", () => {
    it("should throw if the store does not exist", () => {
      const { db } = createDb();
      expect(() =>
        db.getLatestBundle({
          platform: "android",
          storeId: "dummy",
        }),
      ).to.throw();
    });

    it("should throw if there is no bundle in store", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [],
            id: "dummy",
          },
        },
      });
      expect(() =>
        db.getLatestBundle({
          platform: "android",
          storeId: "dummy",
        }),
      ).to.throw();
    });

    it("should return the latest bundle in store", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [androidBundleA, androidBundleB],
            id: "dummy",
          },
        },
      });
      expect(
        db.getLatestBundle({ platform: "android", storeId: "dummy" }),
      ).to.deep.equal(androidBundleB);
    });
  });

  describe("addBundle", () => {
    it("should throw if the store does not exist", () => {
      const { db } = createDb();
      expect(() =>
        db.addBundle({
          bundle: androidBundleA,
          storeId: "dummy",
        }),
      ).to.throw();
    });

    it("should add the bundle to the store", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [],
            id: "dummy",
          },
        },
      });
      db.addBundle({ bundle: androidBundleA, storeId: "dummy" });
      expect(db.hasBundle({ bundleId: androidBundleA.id, storeId: "dummy" }));
    });
  });

  describe("delBundle", () => {
    it("should throw if the store does not exist", () => {
      const { db } = createDb();
      expect(() =>
        db.delBundle({
          bundleId: androidBundleA.id,
          storeId: "dummy",
        }),
      ).to.throw();
    });

    it("should throw if the bundle does not exist", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [androidBundleA, androidBundleB],
            id: "dummy",
          },
        },
      });
      expect(() =>
        db.delBundle({
          bundleId: "f540f429-879b-4425-a587-558b55082960",
          storeId: "dummy",
        }),
      ).to.throw();
    });

    it("should delete the bundle", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [androidBundleA, androidBundleB],
            id: "dummy",
          },
        },
      });
      db.delBundle({
        bundleId: androidBundleA.id,
        storeId: "dummy",
      });
      expect(db.hasBundle({ bundleId: androidBundleA.id, storeId: "dummy" }))
        .false;
    });

    it("should return the deleted bundle", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [androidBundleA, androidBundleB],
            id: "dummy",
          },
        },
      });
      const res = db.delBundle({
        bundleId: androidBundleA.id,
        storeId: "dummy",
      });
      expect(res).deep.equal(androidBundleA);
    });
  });

  describe("createStore", () => {
    it("should throw if store exist", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [],
            id: "dummy",
          },
        },
      });
      expect(() => db.createStore("dummy")).to.throw();
    });

    it("should create the store", () => {
      const { db } = createDb();
      db.createStore("dummy");
      expect(db.hasStore("dummy")).true;
    });
  });

  describe("hasStore", () => {
    it("should return true if store exist", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [],
            id: "dummy",
          },
        },
      });
      expect(db.hasStore("dummy")).true;
    });

    it("should return false if the store does not exist", () => {
      const { db } = createDb();
      expect(db.hasStore("dummy")).false;
    });
  });

  describe("getStore", () => {
    it("should throw if the store does not exist", () => {
      const { db } = createDb();
      expect(() => db.getStore("dummy")).to.throw();
    });

    it("should return the store", () => {
      const store: Store = {
        accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
        bundles: [],
        id: "dummy",
      };
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: store,
        },
      });
      expect(db.getStore("dummy")).to.deep.equal(store);
    });
  });

  describe("delStore", () => {
    it("should throw if the store does not exist", () => {
      const { db } = createDb();
      expect(() => db.delStore("dummy")).to.throw();
    });

    it("should delete the store", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [],
            id: "dummy",
          },
        },
      });
      db.delStore("dummy");
      expect(db.hasStore("dummy")).false;
    });
  });

  describe("getStores", () => {
    it("should return all the stores", () => {
      const store: Store = {
        accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
        bundles: [],
        id: "dummy",
      };
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: store,
        },
      });
      expect(Object.keys(db.getStores())).includes("dummy");
    });
  });

  describe("getAssets", () => {
    it("should return all the assets", () => {
      const assets: Assets = {
        f6264846f4b8b90b34bbccf0c0ec38b1: {},
        ffc71969f5f0d7b4142f729a755bc50a: {},
      };
      const { db } = createDb({
        assets,
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [],
            id: "dummy",
          },
        },
      });
      expect(db.getAssets()).to.deep.equal(assets);
    });
  });

  describe("createAssets", () => {
    it("should create all the assets", () => {
      const assets: Assets = {
        f6264846f4b8b90b34bbccf0c0ec38b1: {},
        ffc71969f5f0d7b4142f729a755bc50a: {},
      };
      const assetsIds = [
        "f6264846f4b8b90b34bbccf0c0ec38b1",
        "ffc71969f5f0d7b4142f729a755bc50a",
      ];
      const { db } = createDb();
      expect(db.createAssets(assetsIds)).deep.equal(assets);
    });
  });

  describe("throwIfStoreDoesNotExist", () => {
    it("should throw if store does not exist", () => {
      const { db } = createDb();
      expect(() => db.throwIfStoreDoesNotExist("dummy")).to.throw();
    });

    it("should not throw if store exist", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [],
            id: "dummy",
          },
        },
      });
      expect(() => db.throwIfStoreDoesNotExist("dummy")).to.not.throw();
    });
  });

  describe("throwIfStoreExist", () => {
    it("should not throw if store does not exist", () => {
      const { db } = createDb();
      expect(() => db.throwIfStoreExist("dummy")).to.not.throw();
    });

    it("should throw if store exist", () => {
      const { db } = createDb({
        assets: {},
        stores: {
          dummy: {
            accessKey: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
            bundles: [],
            id: "dummy",
          },
        },
      });
      expect(() => db.throwIfStoreExist("dummy")).to.throw();
    });
  });
});
