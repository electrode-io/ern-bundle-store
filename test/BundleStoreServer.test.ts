/// <reference types="../types/index" />

import chai, { expect } from "chai";
import chaiHttp from "chai-http";
import fs from "fs";
import "mocha";
import path from "path";
import shell from "shelljs";
import tmp from "tmp";
import { BundleStoreServer } from "../src/BundleStoreServer";

describe("server", () => {
  tmp.setGracefulCleanup();
  chai.use(chaiHttp);

  const fixturesPath = path.resolve(__dirname, "fixtures");
  const storeFixturePath = path.join(fixturesPath, "store");

  function createTmpDir() {
    return tmp.dirSync({ unsafeCleanup: true }).name;
  }

  function createServer(config?: BundleStoreServerUserConfig) {
    const tmpStoreDir = createTmpDir();
    return new BundleStoreServer(
      config || {
        rootPath: tmpStoreDir,
      },
    );
  }

  function binaryParser(res, callback) {
    res.setEncoding("binary");
    res.data = "";
    res.on("data", (chunk) => {
      res.data += chunk;
    });
    res.on("end", () => {
      callback(null, Buffer.from(res.data, "binary"));
    });
  }

  describe("constructor", () => {
    it("should create the directories", () => {
      const sut = createServer();
      expect(fs.existsSync(sut.config.paths.assets));
      expect(fs.existsSync(sut.config.paths.bundles));
      expect(fs.existsSync(sut.config.paths.db));
      expect(fs.existsSync(sut.config.paths.sourcemaps));
    });

    it("should create the database instance", () => {
      const sut = createServer();
      expect(sut.db).not.undefined;
    });

    it("should create the multer storage instance", () => {
      const sut = createServer();
      expect(sut.storage).not.undefined;
    });

    it("should normalize config [default maxBundles]", () => {
      const sut = createServer();
      expect(sut.config.maxBundles).equal(-1);
    });

    it("should normalize config [default port]", () => {
      const sut = createServer();
      expect(sut.config.port).equal(3000);
    });
  });

  describe("extractSegmentsFromBundleUrl", () => {
    it("should throw if the url does not contain the proper segments", () => {
      const sut = createServer();
      expect(() => sut.extractSegmentsFromBundleUrl("http://a/b/c")).to.throw();
    });

    it("should return the matched segments", () => {
      const sut = createServer();
      expect(
        sut.extractSegmentsFromBundleUrl(
          "http://localhost:3000/bundles/dummy/android/latest/index.bundle",
        ),
      ).to.deep.equal({
        bundleId: "latest",
        platform: "android",
        storeId: "dummy",
      });
    });
  });

  describe("getSourceMap", () => {
    it("should throw if store does not exist", () => {
      const sut = createServer();
      expect(() =>
        sut.getSourceMap({
          bundleId: "52b4a9cd-c516-4ca7-a0a6-b310cc44345a",
          platform: "android",
          storeId: "dummy",
        }),
      ).to.throw();
    });

    it("should throw if bundle id does not exist", () => {
      const sut = createServer();
      expect(() =>
        sut.getSourceMap({
          bundleId: "52b4a9cd-c516-4ca7-a0a6-b310cc44345a",
          platform: "android",
          storeId: "dummy",
        }),
      ).to.throw();
    });

    it("should return the sourcemap content [specific bundle id]", () => {
      const tmpDir = createTmpDir();
      const sut = createServer({
        dbSeed: {
          assets: {},
          stores: {
            dummy: {
              bundles: [
                {
                  id: "9e122bee-9a90-4158-9205-6759751d80dd",
                  platform: "android",
                  sourceMap: "4a1aaa5b-89ae-477f-b6d7-9747131750d7",
                  timestamp: 1565981244558,
                },
              ],
            },
          },
        },
        rootPath: tmpDir,
      });
      fs.writeFileSync(
        path.join(
          sut.config.paths.sourcemaps,
          "4a1aaa5b-89ae-477f-b6d7-9747131750d7",
        ),
        "SOURCEMAP_CONTENT",
      );
      const sourcemap = sut.getSourceMap({
        bundleId: "9e122bee-9a90-4158-9205-6759751d80dd",
        platform: "android",
        storeId: "dummy",
      });
      expect(sourcemap).equal("SOURCEMAP_CONTENT");
    });

    it("should return the sourcemap content [latest bundle id]", () => {
      const tmpDir = createTmpDir();
      const sut = createServer({
        dbSeed: {
          assets: {},
          stores: {
            dummy: {
              bundles: [
                {
                  id: "9e122bee-9a90-4158-9205-6759751d80dd",
                  platform: "android",
                  sourceMap: "4a1aaa5b-89ae-477f-b6d7-9747131750d7",
                  timestamp: 1565981244558,
                },
              ],
            },
          },
        },
        rootPath: tmpDir,
      });
      fs.writeFileSync(
        path.join(
          sut.config.paths.sourcemaps,
          "4a1aaa5b-89ae-477f-b6d7-9747131750d7",
        ),
        "SOURCEMAP_CONTENT",
      );
      const sourcemap = sut.getSourceMap({
        bundleId: "latest",
        platform: "android",
        storeId: "dummy",
      });
      expect(sourcemap).equal("SOURCEMAP_CONTENT");
    });
  });

  describe("addBundleToStore", () => {
    it("should add the bundle to the store", () => {
      const tmpDir = createTmpDir();
      const store: Store = {
        accessKey: "11122bee-9a90-4158-9205-6759751d80dd",
        bundles: [
          {
            id: "9e122bee-9a90-4158-9205-6759751d80dd",
            platform: "android",
            sourceMap: "4a1aaa5b-89ae-477f-b6d7-9747131750d7",
            timestamp: 1565981244558,
          },
        ],
        id: "dummy",
      };
      const bundle: Bundle = {
        id: "de0f2684-b070-4560-a01b-1a3fbc33d735",
        platform: "android",
        sourceMap: "24f0e611-5af7-49d9-bb11-5fa055c3c460",
        timestamp: 1565981271727,
      };
      const sut = createServer({
        dbSeed: {
          assets: {},
          stores: {
            dummy: store,
          },
        },
        rootPath: tmpDir,
      });
      sut.addBundleToStore(store, bundle);
      expect(
        sut.db.hasBundle({
          bundleId: bundle.id,
          storeId: store.id,
        }),
      ).true;
    });

    it("should remove oldest bundle from the store if needed", () => {
      const tmpDir = createTmpDir();
      const store: Store = {
        accessKey: "11122bee-9a90-4158-9205-6759751d80dd",
        bundles: [
          {
            id: "9e122bee-9a90-4158-9205-6759751d80dd",
            platform: "android",
            sourceMap: "4a1aaa5b-89ae-477f-b6d7-9747131750d7",
            timestamp: 1565981244558,
          },
        ],
        id: "dummy",
      };
      const bundle: Bundle = {
        id: "de0f2684-b070-4560-a01b-1a3fbc33d735",
        platform: "android",
        sourceMap: "24f0e611-5af7-49d9-bb11-5fa055c3c460",
        timestamp: 1565981271727,
      };
      const sut = createServer({
        dbSeed: {
          assets: {},
          stores: {
            dummy: store,
          },
        },
        maxBundles: 1,
        rootPath: tmpDir,
      });
      sut.addBundleToStore(store, bundle);
      expect(
        sut.db.hasBundle({
          bundleId: "9e122bee-9a90-4158-9205-6759751d80dd",
          storeId: store.id,
        }),
      ).false;
      expect(
        sut.db.hasBundle({
          bundleId: bundle.id,
          storeId: store.id,
        }),
      ).true;
    });
  });

  describe("getPathToBundle", () => {
    it("should return correct path", () => {
      const sut = createServer();
      const bundleId = "9e122bee-9a90-4158-9205-6759751d80dd";
      const pathToBundle = path.join(sut.config.paths.bundles, bundleId);
      expect(sut.getPathToBundle(bundleId)).equal(pathToBundle);
    });
  });

  describe("getPathToSourceMap", () => {
    it("should return correct path", () => {
      const sut = createServer();
      const sourceMapId = "4a1aaa5b-89ae-477f-b6d7-9747131750d7";
      const pathToSourceMap = path.join(
        sut.config.paths.sourcemaps,
        sourceMapId,
      );
      expect(sut.getPathToSourceMap(sourceMapId)).equal(pathToSourceMap);
    });
  });

  describe("unzipAssets", () => {
    it("should unzip the assets", async () => {
      const sut = createServer();
      const tmpDir = createTmpDir();
      const tmpOutDir = createTmpDir();
      const assetsZipPath = path.join(tmpDir, "assets.zip");
      shell.cp(path.join(fixturesPath, "assets.zip"), assetsZipPath);
      await sut.unzipAssets(assetsZipPath, tmpOutDir);
      expect(
        fs.existsSync(path.join(tmpOutDir, "47ce6e77f039020ee2e76a10c1e988e9")),
      ).true;
      expect(
        fs.existsSync(
          path.join(tmpOutDir, "47ce6e77f039020ee2e76a10c1e988e9", "logo.png"),
        ),
      ).true;
    });

    it("should return the assets hashes", async () => {
      const sut = createServer();
      const tmpDir = createTmpDir();
      const tmpOutDir = createTmpDir();
      const assetsZipPath = path.join(tmpDir, "assets.zip");
      shell.cp(path.join(fixturesPath, "assets.zip"), assetsZipPath);
      const hashes = await sut.unzipAssets(assetsZipPath, tmpOutDir);
      expect(hashes).deep.equal([
        "ffc71969f5f0d7b4142f729a755bc50a",
        "f6264846f4b8b90b34bbccf0c0ec38b1",
        "47ce6e77f039020ee2e76a10c1e988e9",
      ]);
    });

    it("should delete the assets zip once done", async () => {
      const sut = createServer();
      const tmpDir = createTmpDir();
      const tmpOutDir = createTmpDir();
      const assetsZipPath = path.join(tmpDir, "assets.zip");
      shell.cp(path.join(fixturesPath, "assets.zip"), assetsZipPath);
      await sut.unzipAssets(assetsZipPath, tmpOutDir);
      expect(fs.existsSync(assetsZipPath)).false;
    });
  });

  describe("integration tests", () => {
    describe("GET /status", () => {
      it("should return HTTP 200", (done) => {
        const sut = createServer();
        chai
          .request(sut.app)
          .get("/status")
          .end((err, res) => {
            expect(res).to.have.status(200);
            done();
          });
      });

      it("should return 'packager-status:running' text", (done) => {
        const sut = createServer();
        chai
          .request(sut.app)
          .get("/status")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res.text).eql("packager-status:running");
            done();
          });
      });

      it("should use chunked Transfer-Encoding", (done) => {
        const sut = createServer();
        chai
          .request(sut.app)
          .get("/status")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.header("Transfer-Encoding", "chunked");
            done();
          });
      });
    });

    describe("GET /assets/*", () => {
      it("should return HTTP 404 if asset is not found", (done) => {
        const sut = createServer();
        chai
          .request(sut.app)
          .get(
            "/assets/img/notfound.png?platform=android&hash=6efcef727ae7b1a1408e7085efec5df9",
          )
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(404);
            done();
          });
      });

      it("should return the asset if found", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        const expectedAsset = fs.readFileSync(
          path.join(
            storeFixturePath,
            "assets",
            "70d6fbba5502a18a0c052b6f6cb3fc32",
            "img@2x.png",
          ),
        );
        chai
          .request(sut.app)
          .get(
            "/assets/img/img@2x.png?platform=android&hash=70d6fbba5502a18a0c052b6f6cb3fc32",
          )
          .buffer(true)
          .parse(binaryParser)
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(Buffer.compare(res.body, expectedAsset)).equal(0);
            done();
          });
      });
    });

    describe("GET /bundles/:storeId/:platform/:bundleId/index.bundle", () => {
      it("should return HTTP 404 if the store does not exist", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .get(
            "/bundles/unkstore/android/790f95fd-2b02-4774-bb78-5de4b7dc73b8/index.bundle",
          )
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(404);
            done();
          });
      });

      it("should return HTTP 404 if the bundle does not exist", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .get(
            "/bundles/dummy/android/11111111-2b02-4774-bb78-5de4b7dc73b8/index.bundle",
          )
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(404);
            done();
          });
      });

      it("should return the bundle [specific id]", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        const expectedBundle = fs.readFileSync(
          path.join(
            storeFixturePath,
            "bundles",
            "9e122bee-9a90-4158-9205-6759751d80dd",
          ),
        );
        chai
          .request(sut.app)
          .get(
            "/bundles/dummy/android/9e122bee-9a90-4158-9205-6759751d80dd/index.bundle",
          )
          .buffer(true)
          .parse(binaryParser)
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(Buffer.compare(res.body, expectedBundle)).equal(0);
            done();
          });
      });

      it("should return the bundle [latest]", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        const expectedBundle = fs.readFileSync(
          path.join(
            storeFixturePath,
            "bundles",
            "9e122bee-9a90-4158-9205-6759751d80dd",
          ),
        );
        chai
          .request(sut.app)
          .get("/bundles/dummy/android/latest/index.bundle")
          .buffer(true)
          .parse(binaryParser)
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(Buffer.compare(res.body, expectedBundle)).equal(0);
            done();
          });
      });

      it("should set Content-Type header to application/javascript in response", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        const expectedBundle = fs.readFileSync(
          path.join(
            storeFixturePath,
            "bundles",
            "9e122bee-9a90-4158-9205-6759751d80dd",
          ),
        );
        chai
          .request(sut.app)
          .get("/bundles/dummy/android/latest/index.bundle")
          .buffer(true)
          .parse(binaryParser)
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res.header["content-type"]).equal("application/javascript");
            done();
          });
      });
    });

    describe("GET /bundles/:storeId/:platform/:bundleId/index.map", () => {
      it("should return HTTP 404 if the store does not exist", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .get(
            "/bundles/unkstore/android/790f95fd-2b02-4774-bb78-5de4b7dc73b8/index.map",
          )
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(404);
            done();
          });
      });

      it("should return HTTP 404 if the source map does not exist", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .get(
            "/bundles/dummy/android/11111111-2b02-4774-bb78-5de4b7dc73b8/index.map",
          )
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(404);
            done();
          });
      });

      it("should return the source map [specific id]", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        const expectedSourceMap = fs.readFileSync(
          path.join(
            storeFixturePath,
            "sourcemaps",
            "4a1aaa5b-89ae-477f-b6d7-9747131750d7",
          ),
        );
        chai
          .request(sut.app)
          .get(
            "/bundles/dummy/android/9e122bee-9a90-4158-9205-6759751d80dd/index.map",
          )
          .buffer(true)
          .parse(binaryParser)
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(Buffer.compare(res.body, expectedSourceMap)).equal(0);
            done();
          });
      });

      it("should return the source map [latest]", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        const expectedSourceMap = fs.readFileSync(
          path.join(
            storeFixturePath,
            "sourcemaps",
            "4a1aaa5b-89ae-477f-b6d7-9747131750d7",
          ),
        );
        chai
          .request(sut.app)
          .get("/bundles/dummy/android/latest/index.map")
          .buffer(true)
          .parse(binaryParser)
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(Buffer.compare(res.body, expectedSourceMap)).equal(0);
            done();
          });
      });
    });

    describe("POST /bundles/:storeId/:platform", () => {
      it("shoud return HTTP 400 is the acces key is missing", (done) => {
        const tmpDir = createTmpDir();
        shell.cp("-rf", path.join(storeFixturePath, "*"), tmpDir);
        const sut = createServer({ rootPath: tmpDir });
        const bundleRs = fs.createReadStream(
          path.join(fixturesPath, "index.bundle"),
        );
        const sourceMapRs = fs.createReadStream(
          path.join(fixturesPath, "index.map"),
        );
        chai
          .request(sut.app)
          .post("/bundles/dummy/android")
          .attach("bundle", bundleRs)
          .attach("sourcemap", sourceMapRs)
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(400);
            done();
          });
      });

      it("shoud return HTTP 403 is the acces key is not the store access key", (done) => {
        const tmpDir = createTmpDir();
        shell.cp("-rf", path.join(storeFixturePath, "*"), tmpDir);
        const sut = createServer({ rootPath: tmpDir });
        const bundleRs = fs.createReadStream(
          path.join(fixturesPath, "index.bundle"),
        );
        const sourceMapRs = fs.createReadStream(
          path.join(fixturesPath, "index.map"),
        );
        chai
          .request(sut.app)
          .post("/bundles/dummy/android")
          .set(
            "ERN-BUNDLE-STORE-ACCESS-KEY",
            "11111111-d35d-43de-baa9-332e8e44f083",
          )
          .attach("bundle", bundleRs)
          .attach("sourcemap", sourceMapRs)
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(403);
            done();
          });
      });

      it("shoud return HTTP 400 is the store does not exist", (done) => {
        const tmpDir = createTmpDir();
        shell.cp("-rf", path.join(storeFixturePath, "*"), tmpDir);
        const sut = createServer({ rootPath: tmpDir });
        const bundleRs = fs.createReadStream(
          path.join(fixturesPath, "index.bundle"),
        );
        const sourceMapRs = fs.createReadStream(
          path.join(fixturesPath, "index.map"),
        );
        chai
          .request(sut.app)
          .post("/bundles/unkstore/android")
          .set(
            "ERN-BUNDLE-STORE-ACCESS-KEY",
            "f85152bd-d35d-43de-baa9-332e8e44f083",
          )
          .attach("bundle", bundleRs)
          .attach("sourcemap", sourceMapRs)
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(404);
            done();
          });
      });

      it("shoud add the bundle and the source map to the store", (done) => {
        const tmpDir = createTmpDir();
        shell.cp("-rf", path.join(storeFixturePath, "*"), tmpDir);
        const sut = createServer({ rootPath: tmpDir });
        const bundleRs = fs.createReadStream(
          path.join(fixturesPath, "index.bundle"),
        );
        const sourceMapRs = fs.createReadStream(
          path.join(fixturesPath, "index.map"),
        );
        chai
          .request(sut.app)
          .post("/bundles/dummy/android")
          .set(
            "ERN-BUNDLE-STORE-ACCESS-KEY",
            "f85152bd-d35d-43de-baa9-332e8e44f083",
          )
          .attach("bundle", bundleRs)
          .attach("sourcemap", sourceMapRs)
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.be.json;
            expect(res.body.id).not.undefined;
            expect(res.body.sourceMap).not.undefined;
            done();
          });
      });

      it("shoud return HTTP 201", (done) => {
        const tmpDir = createTmpDir();
        shell.cp("-rf", path.join(storeFixturePath, "*"), tmpDir);
        const sut = createServer({ rootPath: tmpDir });
        const bundleRs = fs.createReadStream(
          path.join(fixturesPath, "index.bundle"),
        );
        const sourceMapRs = fs.createReadStream(
          path.join(fixturesPath, "index.map"),
        );
        chai
          .request(sut.app)
          .post("/bundles/dummy/android")
          .set(
            "ERN-BUNDLE-STORE-ACCESS-KEY",
            "f85152bd-d35d-43de-baa9-332e8e44f083",
          )
          .attach("bundle", bundleRs)
          .attach("sourcemap", sourceMapRs)
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(201);
            done();
          });
      });
    });

    describe("GET /bundles/:storeId", () => {
      it("should return 400 if the store does not exit", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .get("/bundles/unkstore")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(404);
            done();
          });
      });

      it("should return HTTP 200", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .get("/bundles/dummy")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(200);
            done();
          });
      });

      it("should return the store bundles", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .get("/bundles/dummy")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.be.json;
            expect(res.body).to.be.an("array");
            expect(res.body).deep.equal([
              {
                id: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
                platform: "android",
                sourceMap: "f7117cff-efc8-4201-a297-6e571f309c2c",
                timestamp: 1565980792572,
              },
              {
                id: "9e122bee-9a90-4158-9205-6759751d80dd",
                platform: "android",
                sourceMap: "4a1aaa5b-89ae-477f-b6d7-9747131750d7",
                timestamp: 1565981244558,
              },
            ]);
            done();
          });
      });
    });

    describe("GET /bundles/:storeId/:platform", () => {
      it("should return 400 if the store does not exit", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .get("/bundles/unkstore/android")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(404);
            done();
          });
      });

      it("should return HTTP 200", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .get("/bundles/dummy/android")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(200);
            done();
          });
      });

      it("should return the store bundles [android]", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .get("/bundles/dummy/android")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.be.json;
            expect(res.body).to.be.an("array");
            expect(res.body).deep.equal([
              {
                id: "790f95fd-2b02-4774-bb78-5de4b7dc73b8",
                platform: "android",
                sourceMap: "f7117cff-efc8-4201-a297-6e571f309c2c",
                timestamp: 1565980792572,
              },
              {
                id: "9e122bee-9a90-4158-9205-6759751d80dd",
                platform: "android",
                sourceMap: "4a1aaa5b-89ae-477f-b6d7-9747131750d7",
                timestamp: 1565981244558,
              },
            ]);
            done();
          });
      });

      it("should return the store bundles [ios]", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .get("/bundles/dummy/ios")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.be.json;
            expect(res.body).to.be.an("array");
            expect(res.body).deep.equal([]);
            done();
          });
      });
    });

    describe("POST /stores/:storeId", () => {
      it("should return HTTP 400 if store id already exist", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .post("/stores/dummy")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(400);
            done();
          });
      });

      it("should return HTTP 201", (done) => {
        const tmpDir = createTmpDir();
        shell.cp("-rf", path.join(storeFixturePath, "*"), tmpDir);
        const sut = createServer({ rootPath: tmpDir });
        chai
          .request(sut.app)
          .post("/stores/newid")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(201);
            done();
          });
      });

      it("should return the created store", (done) => {
        const tmpDir = createTmpDir();
        shell.cp("-rf", path.join(storeFixturePath, "*"), tmpDir);
        const sut = createServer({ rootPath: tmpDir });
        chai
          .request(sut.app)
          .post("/stores/newid")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.be.json;
            expect(res.body.id).equal("newid");
            expect(res.body.accessKey).not.undefined;
            done();
          });
      });
    });

    describe("DELETE /stores/:storeId", () => {
      it("should return HTTP 404 if the store does not exist", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .delete("/stores/unkstore")
          .set(
            "ERN-BUNDLE-STORE-ACCESS-KEY",
            "f85152bd-d35d-43de-baa9-332e8e44f083",
          )
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(404);
            done();
          });
      });

      it("should return HTTP 200", (done) => {
        const tmpDir = createTmpDir();
        shell.cp("-rf", path.join(storeFixturePath, "*"), tmpDir);
        const sut = createServer({ rootPath: tmpDir });
        chai
          .request(sut.app)
          .delete("/stores/dummy")
          .set(
            "ERN-BUNDLE-STORE-ACCESS-KEY",
            "f85152bd-d35d-43de-baa9-332e8e44f083",
          )
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(200);
            done();
          });
      });

      it("should delete the store", (done) => {
        const tmpDir = createTmpDir();
        shell.cp("-rf", path.join(storeFixturePath, "*"), tmpDir);
        const sut = createServer({ rootPath: tmpDir });
        chai
          .request(sut.app)
          .delete("/stores/dummy")
          .set(
            "ERN-BUNDLE-STORE-ACCESS-KEY",
            "f85152bd-d35d-43de-baa9-332e8e44f083",
          )
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(sut.db.hasStore("dummy")).false;
            done();
          });
      });

      it("should return the deleted store", (done) => {
        const tmpDir = createTmpDir();
        shell.cp("-rf", path.join(storeFixturePath, "*"), tmpDir);
        const sut = createServer({ rootPath: tmpDir });
        chai
          .request(sut.app)
          .delete("/stores/dummy")
          .set(
            "ERN-BUNDLE-STORE-ACCESS-KEY",
            "f85152bd-d35d-43de-baa9-332e8e44f083",
          )
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.be.json;
            expect(res.body.id).equal("dummy");
            done();
          });
      });
    });

    describe("GET /stores", () => {
      it("should return HTTP 200", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .get("/stores")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(200);
            done();
          });
      });

      it("should return the stores ids", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .get("/stores")
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res.body).deep.equal(["dummy"]);
            done();
          });
      });
    });

    describe("POST /assets", () => {
      it("should return HTTP 201", (done) => {
        const tmpDir = createTmpDir();
        shell.cp("-rf", path.join(storeFixturePath, "*"), tmpDir);
        const sut = createServer({ rootPath: tmpDir });
        const assetsZipRs = fs.createReadStream(
          path.join(fixturesPath, "assets.zip"),
        );
        chai
          .request(sut.app)
          .post("/assets")
          .attach("assets", assetsZipRs)
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(201);
            done();
          });
      });

      it("should return the hashes of the assets that have been added to the store", (done) => {
        const tmpDir = createTmpDir();
        shell.cp("-rf", path.join(storeFixturePath, "*"), tmpDir);
        const sut = createServer({ rootPath: tmpDir });
        const assetsZipRs = fs.createReadStream(
          path.join(fixturesPath, "assets.zip"),
        );
        chai
          .request(sut.app)
          .post("/assets")
          .attach("assets", assetsZipRs)
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.be.json;
            expect(res.body).deep.equal([
              "ffc71969f5f0d7b4142f729a755bc50a",
              "f6264846f4b8b90b34bbccf0c0ec38b1",
              "47ce6e77f039020ee2e76a10c1e988e9",
            ]);
            done();
          });
      });
    });

    describe("POST /assets/delta", () => {
      it("should return HTTP 200", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        chai
          .request(sut.app)
          .post("/assets/delta")
          .send({ assets: [] })
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.have.status(200);
            done();
          });
      });

      it("should return the assets ids that are not already in the store", (done) => {
        const sut = createServer({ rootPath: storeFixturePath });
        const assetIdsInStore = [
          "47ce6e77f039020ee2e76a10c1e988e9",
          "70d6fbba5502a18a0c052b6f6cb3fc32",
        ];
        const assetIdsNotInStore = ["32d6f43a5542a18a04352b6f6cb3fc948"];
        chai
          .request(sut.app)
          .post("/assets/delta")
          .send({
            assets: [...assetIdsInStore, ...assetIdsNotInStore],
          })
          .end((err, res) => {
            if (err) {
              return done(err);
            }
            expect(res).to.be.json;
            expect(res.body).to.deep.equal(assetIdsNotInStore);
            done();
          });
      });
    });
  });
});
