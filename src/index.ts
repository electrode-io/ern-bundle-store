#!/usr/bin/env node
import program from "commander";
import path from "path";
import { BundleStoreServer } from "./BundleStoreServer";

const DEFAULT_STORE_PATH = path.join(process.cwd(), "store");
const DEFAULT_PORT = 3000;
const DEFAULT_MAX_BUNDLES = -1;

program
  .option("--host <string>", "sever host/ip")
  .option(
    "--max-bundles <number>",
    "maximum number of bundles per store",
    DEFAULT_MAX_BUNDLES,
  )
  .option("--port <number>", "server port", DEFAULT_PORT)
  .option("--store-path <string>", "store path", DEFAULT_STORE_PATH)
  .parse(process.argv);

new BundleStoreServer({
  host: program.host,
  maxBundles: program.maxBundles || DEFAULT_MAX_BUNDLES,
  port: program.port || DEFAULT_PORT,
  rootPath: program.storePath,
}).start();
