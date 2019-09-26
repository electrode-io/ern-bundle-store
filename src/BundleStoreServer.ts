/// <reference types="../types/index" />

import debug from "debug";
import express from "express";
import expressWs from "express-ws";
import fs from "fs";
import _ from "lodash";
import multer from "multer";
import path from "path";
import shell from "shelljs";
import { SourceMapConsumer } from "source-map";
import uuidv4 from "uuid/v4";
import yauzl from "yauzl";
import { BundleStoreDb } from "./BundleStoreDb";

export class BundleStoreServer {
  public readonly app: express.Application;
  public readonly wsInstance: expressWs.Instance;
  public readonly db: BundleStoreDb;
  public readonly config: BundleStoreServerConfig;
  public readonly storage: multer.StorageEngine;

  private readonly d = debug("BundleStoreServer");

  constructor(public readonly conf: BundleStoreServerUserConfig) {
    this.config = this.normalizeUserConfig(conf);
    this.createDirectories();
    this.app = express();
    this.wsInstance = expressWs(this.app);
    this.setupMiddlewares();
    this.db = new BundleStoreDb({
      dbPath: this.config.paths.db,
      seed: this.config.dbSeed,
    });
    this.storage = this.createMulterStorage();
    this.createAppRoutes();
  }

  public normalizeUserConfig(
    config: BundleStoreServerUserConfig,
  ): BundleStoreServerConfig {
    const cwd = process.cwd();
    return {
      dbSeed: config.dbSeed,
      host: config.host,
      maxBundles: config.maxBundles || -1,
      paths: config.paths
        ? config.paths
        : config.rootPath
        ? {
            assets: path.join(config.rootPath, "assets"),
            bundles: path.join(config.rootPath, "bundles"),
            db: path.join(config.rootPath, "db.json"),
            sourcemaps: path.join(config.rootPath, "sourcemaps"),
          }
        : {
            assets: path.join(cwd, "assets"),
            bundles: path.join(cwd, "bundles"),
            db: path.join(cwd, "db.json"),
            sourcemaps: path.join(cwd, "sourcemaps"),
          },
      port: config.port || 3000,
    };
  }

  public extractSegmentsFromBundleUrl(bundleUrl: string) {
    const re = /bundles\/([^\/]+)\/([^\/]+)\/([^\/]+)\//;
    if (!re.test(bundleUrl)) {
      throw new Error(`bundle url ${bundleUrl} does not match regex`);
    }
    const [
      ,
      storeId,
      platform,
      bundleId,
    ] = /bundles\/([^\/]+)\/([^\/]+)\/([^\/]+)\//.exec(bundleUrl)!;
    return { bundleId, platform, storeId };
  }

  public getSourceMap({
    bundleId,
    platform,
    storeId,
  }: {
    bundleId?: string;
    platform: Platform;
    storeId?: string;
  }) {
    const bundle =
      bundleId === "latest"
        ? this.db.getLatestBundle({ platform: platform as Platform, storeId })
        : this.db.getBundle({ bundleId, storeId });

    const sourceMapPath = this.getPathToSourceMap(bundle.sourceMap);
    return fs.readFileSync(sourceMapPath).toString();
  }

  public async symbolicate(
    stack: StackFrame[],
    sourceMap: string,
  ): Promise<StackFrame[]> {
    const consumer = await new SourceMapConsumer(JSON.parse(sourceMap));
    try {
      return stack.map((frame: StackFrame) => {
        if (
          frame.file &&
          frame.file.startsWith("http") &&
          frame.column &&
          frame.lineNumber
        ) {
          const originalPos = consumer.originalPositionFor({
            column: frame.column,
            line: frame.lineNumber,
          });
          return {
            arguments: frame.arguments,
            column: originalPos.column,
            file: originalPos.source,
            lineNumber: originalPos.line,
            methodName: frame.methodName,
          };
        } else {
          return frame;
        }
      });
    } finally {
      consumer.destroy();
    }
  }

  public addBundleToStore(store: Store, bundle: Bundle): Bundle {
    if (
      this.config.maxBundles !== -1 &&
      store.bundles.length >= this.config.maxBundles
    ) {
      const oldestBundle = store.bundles[0];
      shell.rm(
        this.getPathToBundle(oldestBundle.id),
        this.getPathToSourceMap(oldestBundle.sourceMap),
      );
      this.db.delBundle({
        bundleId: oldestBundle.id,
        storeId: store.id,
      });
    }
    this.db.addBundle({
      bundle,
      storeId: store.id,
    });
    return bundle;
  }

  public async unzipAssets(
    zipFilePath: string,
    targetDir: string,
  ): Promise<string[]> {
    const newAssets: Set<string> = new Set<string>();
    try {
      await new Promise((resolve, reject) =>
        yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
          if (err) {
            reject(err);
          }
          zipfile.readEntry();
          zipfile.on("entry", (entry) => {
            if (/\/$/.test(entry.fileName)) {
              // Directory. Skip.
              zipfile.readEntry();
            } else {
              newAssets.add(path.dirname(entry.fileName));
              const filePath = path.join(targetDir, entry.fileName);
              shell.mkdir("-p", path.dirname(filePath));
              zipfile.openReadStream(entry, (e, readStream) => {
                if (e) {
                  reject(e);
                }
                const writeStream = fs.createWriteStream(filePath);
                readStream.pipe(writeStream);
                readStream.on("end", () => zipfile.readEntry());
              });
            }
          });
          zipfile.on("error", (error) => reject(error));
          zipfile.on("close", () => resolve());
        }),
      );
    } finally {
      shell.rm(zipFilePath);
    }
    return Array.from(newAssets);
  }

  public getPathToBundle(bundleId: string) {
    return path.join(this.config.paths.bundles, bundleId);
  }

  public getPathToSourceMap(sourceMap: string) {
    return path.join(this.config.paths.sourcemaps, sourceMap);
  }

  public start() {
    this.app.listen(this.config.port, this.config.host, () =>
      this.d(
        `Electrode Native bundle store server listening on port ${this.config.port}`,
      ),
    );
  }

  private createDirectories() {
    shell.mkdir(
      "-p",
      this.config.paths.assets,
      this.config.paths.bundles,
      path.dirname(this.config.paths.db),
      this.config.paths.sourcemaps,
    );
  }

  private setupMiddlewares() {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      if (req.is("text/*")) {
        req.text = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => (req.text += chunk));
        req.on("end", next);
      } else {
        next();
      }
    });
  }

  private createMulterStorage() {
    return multer.diskStorage({
      destination: (req, file, cb) => {
        if (file.fieldname === "bundle") {
          cb(null, this.config.paths.bundles);
        } else if (file.fieldname === "sourcemap") {
          cb(null, this.config.paths.sourcemaps);
        } else if (file.fieldname === "assets") {
          cb(null, this.config.paths.assets);
        }
      },
      filename: (req, file, cb) => {
        if (file.fieldname === "bundle") {
          cb(null, req.params.bundleId);
        } else if (file.fieldname === "sourcemap") {
          cb(null, req.params.sourceMapId);
        } else if (file.fieldname === "assets") {
          cb(null, `${uuidv4()}.zip`);
        }
      },
    });
  }

  private addFileIdsToReqParams(req, res, next) {
    req.params.bundleId = uuidv4();
    req.params.sourceMapId = uuidv4();
    next();
  }

  private validateStoreAccessKey(req, res, next) {
    const accessKey = req.header("ERN-BUNDLE-STORE-ACCESS-KEY");
    if (!accessKey) {
      return res
        .status(400)
        .send("Missing ERN-BUNDLE-STORE-ACCESS-KEY in request headers.");
    }
    if (req.store.accessKey !== accessKey) {
      return res.status(403).send("Invalid store access key");
    } else {
      next();
    }
  }

  private addBundleToReq(req, res, next) {
    const {
      bundleId,
      platform,
    }: { bundleId: string; platform: Platform } = req.params;
    const storeId = req.store.id;
    try {
      req.bundle =
        bundleId === "latest"
          ? this.db.getLatestBundle({ platform, storeId })
          : this.db.getBundle({ bundleId, storeId });
    } catch (err) {
      return res
        .status(404)
        .send(`Bundle ${bundleId} not found in store ${req.store.id}`);
    }
    next();
  }

  private addStoreToReq(req, res, next) {
    const { storeId } = req.params;
    if (!this.db.hasStore(storeId)) {
      return res.status(404).send(`Store ${storeId} does not exist`);
    }
    req.store = this.db.getStore(storeId);
    next();
  }

  private noop() {
    // noop
  }

  private createAppRoutes() {
    const upload = multer({ storage: this.storage });

    this.wsInstance.app.ws("*", (ws, req) => {
      // Swallow
    });

    this.app.get("/status", (req, res) => {
      res.writeHead(200, {
        "Transfer-Encoding": "chunked",
      });
      res.write("packager-status:running");
      res.end();
    });

    this.app.get("/assets/*", (req, res) => {
      const { hash } = req.query;
      const pathToFile = path.join(
        this.config.paths.assets,
        hash,
        path.basename(req.path),
      );
      if (fs.existsSync(pathToFile)) {
        res.writeHead(200, {
          "Transfer-Encoding": "chunked",
        });
        const readabale = fs.createReadStream(pathToFile);
        readabale.pipe(res);
      } else {
        res.sendStatus(404);
      }
    });

    this.app.post("/symbolicate", async (req, res) => {
      const stack = JSON.parse(req.text).stack;
      const bundleUrl = _.find(stack, (frame) => frame.file.startsWith("http"))
        .file;
      const { bundleId, platform, storeId } = this.extractSegmentsFromBundleUrl(
        bundleUrl,
      );
      const sourceMap = this.getSourceMap({
        bundleId,
        platform: platform as Platform,
        storeId,
      });
      const symbolicated = await this.symbolicate(stack, sourceMap);
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Transfer-Encoding": "chunked",
      });

      res.write(JSON.stringify({ stack: symbolicated }));
      res.end();
    });

    this.app.get(
      "/bundles/:storeId/:platform/:bundleId/index.bundle",
      this.addStoreToReq.bind(this),
      this.addBundleToReq.bind(this),
      (req, res) => {
        const bundle = req.bundle;
        res.sendFile(this.getPathToBundle(bundle.id), {
          headers: {
            "Content-Type": "application/javascript",
          },
        });
      },
    );

    this.app.get(
      "/bundles/:storeId/:platform/:bundleId/index.map",
      this.addStoreToReq.bind(this),
      this.addBundleToReq.bind(this),
      (req, res) => {
        const bundle = req.bundle;
        res.sendFile(this.getPathToSourceMap(bundle.sourceMap));
      },
    );

    // ============================================================================
    // Bundle Store Endpoints
    // ============================================================================

    this.app.post(
      "/bundles/:storeId/:platform",
      this.addStoreToReq.bind(this),
      this.validateStoreAccessKey.bind(this),
      this.addFileIdsToReqParams.bind(this),
      upload.fields([
        { name: "bundle", maxCount: 1 },
        { name: "sourcemap", maxCount: 1 },
      ]),
      (req, res) => {
        const { bundleId, sourceMapId, platform } = req.params;
        const bundle = {
          id: bundleId,
          platform: platform as Platform,
          sourceMap: sourceMapId,
          timestamp: Date.now(),
        };
        this.addBundleToStore(req.store, bundle);
        res.status(201).json(bundle);
      },
    );

    this.app.get(
      "/bundles/:storeId",
      this.addStoreToReq.bind(this),
      (req, res) => {
        res.json(req.store.bundles);
      },
    );

    this.app.get(
      "/bundles/:storeId/:platform",
      this.addStoreToReq.bind(this),
      (req, res) => {
        res.json(
          _.filter(
            req.store.bundles,
            (s) => s.platform === req.params.platform,
          ),
        );
      },
    );

    this.app.post("/stores/:storeId", (req, res) => {
      const { storeId } = req.params;
      if (this.db.hasStore(storeId)) {
        return res.status(400).send(`store id ${storeId} already exist`);
      }
      const store = this.db.createStore(req.params.storeId);
      res.status(201).json(store);
    });

    this.app.delete(
      "/stores/:storeId",
      this.addStoreToReq.bind(this),
      this.validateStoreAccessKey.bind(this),
      (req, res) => {
        for (const bundle of req.store.bundles) {
          shell.rm(
            this.getPathToBundle(bundle.id),
            this.getPathToSourceMap(bundle.sourceMap),
          );
        }
        const store = this.db.delStore(req.store.id);
        res.status(200).json(store);
      },
    );

    this.app.get("/stores", (req, res) => {
      const { accessKey } = req.query;
      if (accessKey) {
        const store = _.find(
          this.db.getStores(),
          (s: Store) => s.accessKey === accessKey,
        );
        if (!store) {
          res.status(404).send(`No store found with access key ${accessKey}`);
        } else {
          res.json(store);
        }
      } else {
        res.json(Object.keys(this.db.getStores()));
      }
    });

    this.app.post(
      "/assets",
      upload.single("assets").bind(this),
      async (req, res, next) => {
        try {
          const zippedAssetsPath = path.join(
            req.file.destination,
            req.file.filename,
          );
          const newAssets = await this.unzipAssets(
            zippedAssetsPath,
            this.config.paths.assets,
          );
          this.db.createAssets(newAssets);
          res.status(201).send(newAssets);
        } catch (err) {
          next(err);
        }
      },
    );

    this.app.post("/assets/delta", (req, res) => {
      const { assets } = req.body;
      const newAssets = _.difference(assets, Object.keys(this.db.getAssets()));
      res.json(newAssets);
    });
  }
}
