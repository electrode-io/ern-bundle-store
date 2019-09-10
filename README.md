# Electrode Native bundle store Server

To get an overview of the bundle store and its use, refer to the [Electrode Native bundle store documentation]

## Setup

- Install the bundle store server

```bash
npm install -g ern-bundle-store
```

- Start the bundle store server (with default configuration)

```bash
ern-bundle-store
```

`ern-bundle-store` executable expose the following command line options:

- `--host <string>` The server host/ip (_default: 0.0.0.0_)
- `--port <number>` The server port (_default 3000_)
- `--store-path <string>` Local path to the directory containing the database and store files (_default to \$cwd/store_)
- `--max-bundles <number>` Maximum number of bundles to keep in each store (per platform) (_default to -1 -unlimited-_)

## Development

If you are only planning to use the Bundle Store server with Electrode Native, you shouldn't pay much attention to this section unless you wish to know more about the different routes exposed by the server.

On the other hand, if you are interested in contributing to this project, or forking it for your own needs, this section might prove useful.

- To run from source :

```
npm start
```

- To run the tests :

```
npm test
```

### `REST API routes`

### Metro server routes

The following routes are emulating the routes exposed by a metro server, and are consummed by the react native client running on the phone.

#### GET /status

_Get the current status of the server_

Response will always have `HTTP 200 OK` status code and `packager-status:running` string in response body as long as the server is running.

#### GET /assets/\*

_Get an asset from the server_

This route is used by react native when it needs to retrieve a specific asset (images mostly) of the react native application, that is not already present in the native application binary or the local cache.

Example:

`GET /assets/node_modules/MyApp/images/logo@2x.png?platform=android&hash=47ce6e77f039020ee2e76a10c1e988e9`

The asset will be returned as a stream using chunked transfer encoding.

#### POST /symbolicate

_Symbolicate a JS stack trace_

This route is used by react native when an uncaught JS exception is thrown, leading to a red screen in development mode (or crashing the application in production). React native will send the unsymbolicated stack trace to the server, who is in charge to symbolicate the stack trace and send it back. React native will then display a red screen with the symbolicated stack trace.

The request should use `text-plain` Content-Type and the body of the request should be a JSON string containing the stack trace. The response will return the same stack trace, symbolicated. Response Content-Type will also be `text-plain`.

Sample request body (a real stack trace will contain much more than one frame):

```json
{
  "stack": [
    {
      "file": "http://bundlestore:8080/bundles/foo/android/latest/index.bundle?platform=android&dev=true&minify=false",
      "methodName": "onPress",
      "arguments": [],
      "lineNumber": 87771,
      "column": 24
    }
  ]
}
```

Sample response body:

```json
{
  "stack": [
    {
      "file": "foo/App.js",
      "methodName": "onPress",
      "arguments": [],
      "lineNumber": 40,
      "column": 16
    }
  ]
}
```

#### GET /bundles/:storeId/:platform/:bundleId/index.bundle

_Get a bundle from the server_

This route is used by react native to download a bundle from the server.

Example:

- `GET /bundles/mystore/android/latest/index.bundle`

Downloads `latest android` bundle from `mystore` store.

- `GET /bundles/mystore/android/790f95fd-2b02-4774-bb78-5de4b7dc73b8/index.bundle`

Downloads `android` bundle with id `790f95fd-2b02-4774-bb78-5de4b7dc73b8` from `mystore` store.

In practice, react native will call the route with some query parameters (for example `?platform=android&dev=true&minify=false`). These extra parameters are needed by metro server to generate a specific bundle on the fly, but are ignored by the bundle store given that it serves pre-generated bundles and does not generate bundles on the fly.

Possible error status codes:

- `404 Not Found` If the store or bundle does not exist in the server.

### Bundle store server specific routes

The following routes are specific to the bundle store. They are only used by Electrode Native `ern` commands and by the `Electrode Native Settings` debug menu in the native application.

#### POST /bundles/:storeId/:platform

_Upload a bundle to the server_

The access key of the store has to be set as `ERN-BUNDLE-STORE-ACCESS-KEY` header.
The request should be a multi part file upload. The bundle should be attached using `bundle` field name.  
The source map should be attached using `sourcemap` field name.

Possible error status codes:

- `400 Bad Request` If the store access key was not provided in request headers.
- `404 Not Found` If the store does not exist in the server.

#### GET /bundles/:storeId

_Get the list of bundles that this store contains_

Example:

- `GET /bundles/mystore`

Gets the list of bundles that the `mystore` store currently contains.

The response will return a JSON array of bundle metadata entries.

```json
[
  {
    "id": "12f8d4d2-84e8-4382-b293-55371e9fd567",
    "platform": "android",
    "sourceMap": "624965ab-8c0a-4cc7-9208-910eb06f0741",
    "timestamp": 1567020725835
  }
]
```

Possible error status codes:

- `404 Not Found` If the store does not exist in the server.

#### DELETE /stores/:storeId

_Delete a store in the server_

Remove a store and all its bundles and source maps from the server.
The access key of the store has to be set as `ERN-BUNDLE-STORE-ACCESS-KEY` header.

Example:

- `DELETE /stores/mystore`

Removes `mystore` from the server.

Possible error status codes:

- `400 Bad Request` If the store access key was not provided in request headers.
- `404 Not Found` If the store does not exist in the server.

#### GET /stores

_Get the list of stores that the server contains_

This route will return a JSON array containing the name (id) of all the stores present in the server.

For example

```json
["mystore", "foo-store", "bar-store"]
```

#### POST /assets

_Upload assets to the server_

Upload assets to be stored on the server.  
The assets should be zipped in a single zip file and attached to the request as multi part file upload using `assets` as the field name.  
The zip file should contain a specific directory structure, where each directory contains either a single asset (for example `logo.png`) or a group of assets representing the asset at different resolution (for example `logo.png`, `logo@2x.png`, `logo@3x.png`). The directory should be named as the `md5` hash of the file(s) contained in the directory (for example if the `md5` hash of `logo.png` file is `47ce6e77f039020ee2e76a10c1e988e9`, then the directory containing `logo.png` should be named `47ce6e77f039020ee2e76a10c1e988e9`).

The response will have `HTTP 201 Created` status code and will contain a JSON array containing the `md5` hashes of all the single assets and/or grouped assets that have been added to the server. For example :

```json
[
  "ffc71969f5f0d7b4142f729a755bc50a",
  "f6264846f4b8b90b34bbccf0c0ec38b1",
  "47ce6e77f039020ee2e76a10c1e988e9"
]
```

#### POST /assets/delta

_Get assets hashes that are not stored in the server_

Given an array of single and/or grouped assets `md5` hashes as a JSON array in the request body, the server will return a JSON array in the response body, containing all the `md5` hashes of the assets that do not exist in the server.

Sample request body:

```json
{
  "assets": [
    "ffc71969f5f0d7b4142f729a755bc50a",
    "f6264846f4b8b90b34bbccf0c0ec38b1",
    "47ce6e77f039020ee2e76a10c1e988e9"
  ]
}
```

Sample response body:

```json
["f6264846f4b8b90b34bbccf0c0ec38b1"]
```

[electrode native bundle store documentation]: https://native.electrode.io/cli-commands/bundlestore
