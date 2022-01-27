# symbol-network

CLI tools to create node clusters for new or existing Symbol networks. This cli handles the creation and distribution of the nemesis block.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/symbol-network.svg)](https://npmjs.org/package/symbol-network)
[![Downloads/week](https://img.shields.io/npm/dw/symbol-network.svg)](https://npmjs.org/package/symbol-network)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Build](https://github.com/fboucquez/symbol-network/actions/workflows/build.yml/badge.svg)](https://github.com/fboucquez/symbol-network/actions/workflows/build.yml)
[![Coverage Status](https://coveralls.io/repos/github/fboucquez/symbol-network/badge.svg?branch=dev)](https://coveralls.io/github/fboucquez/symbol-network?branch=dev)
[![Api Doc](https://img.shields.io/badge/api-doc-blue.svg)](https://fboucquez.github.io/symbol-network/)

<!-- toc -->
* [symbol-network](#symbol-network)
* [Why this tool?](#why-this-tool)
* [Requirements](#requirements)
* [Installation](#installation)
* [Usage](#usage)
* [Development](#development)
* [Support](#support)
* [Command Topics](#command-topics)
<!-- tocstop -->

# Why this tool?

To handle dozens or hundreds of Symbol Nodes in "cattle" style, where nodes are created and managed in bundles.

If you are creating a Symbol node for the first time, please have look at the [symbol-bootstrap](https://github.com/fboucquez/symbol-bootstrap) cli.

# Requirements

-   Node 12.0.0+
-   Docker 18.3.0+
-   Docker Compose 1.25.0+
-   Symbol Bootstrap 1.1.4+.

# Installation

Before installing this tool, you need to install the symbol-bootstrap cli first.
Please follow the Please follow the [instructions](https://github.com/fboucquez/symbol-bootstrap#installation).

<!-- usage -->
```sh-session
$ npm install -g symbol-network
$ symbol-network COMMAND
running command...
$ symbol-network (-v|--version|version)
symbol-network/0.0.1 linux-x64 node-v12.22.1
$ symbol-network --help [COMMAND]
USAGE
  $ symbol-network COMMAND
...
```
<!-- usagestop -->

# Usage

After installing the tool. Run:

```sh-session
$ mkdir my-network-workspace
$ cd my-network-workspace
$ symbol-network verify
$ symbol-network init

```

and follow the instructions.

The wizard style CLI will guide you in the process of creating the nodes. The tool creates a bunch of files and folders.

When creating nodes to an existing network the files and folders are:

-   `network-input.yml`: This file is created by the `symbol-network init`. It generates and defines the initial node layout, describing how many nodes of each type you want to create.
-   `network.yml`: This file is created by the `symbol-network expandNodes` and maintained by the following commands. It's the "expansion" of `network-input.yml` file where each node layed out individually. It defines your node cluster.
-   `nodes`: The folder that contains the final node configurations ready to deploy. The folder is created and maintained by the `symbol-network configureNodes` command.
-   `key-store.yml`: A file that stores the private keys and voting key files of the nodes. This file is created by the default private data storage. This can be extended to store data somewhere else, like for example AWS Secrets.

In addition, for new networks, you will see the following files and folders are:

-   `custom-network-preset.yml`: This files defines the configuration of it. It's the `--preset mainnet/testnet` for your new network. You can share this file with other members that want to connect to your new private network.
-   `nemesis-target`: The target of the nemesis node. You can use this initial node to try the network before deploying the final nodes.
-   `nemesis-seed`: The seed folder copied from the `nemesis-target`. You can share with other members that want to connect to your network.

# Development

If you want to contribute to this tool, clone this repo, and run:

```shell
npm install -g
```

Then, `symbol-network` runs from the source code. You can now try your features after changing the code.

Pull Requests are appreciated! Please follow the contributing [guidelines](CONTRIBUTING.md).

Note: cloning this repo is only for people that want to tune the tool in a way it cannot be configured. If this is your case, please provide a feature request.

General users should install this tool like any other node module.

## Code style

To format the source code, verify/fix lint issues, and generate the commands docs, run:

```shell
npm run style:fix
```

# Support

Symbol Network is a personal project maintained on my free time.

If you like it, please consider supporting it by delegating your Symbol account to my [node](http://symbol-node-dual-1.tawa.solutions:3000/node/info):

```
name: symbol-node-dual-1.tawa.solutions
publicKey: 6DB275B83F4839768821FF621DD90358F99A84EC61EB7DE1F6947E5B0926B9BB
```

If you don't like it, let me know by creating issues on GitHub. Pull Requests are welcome!

<!-- commands -->
# Command Topics

* [`symbol-network autocomplete`](docs/autocomplete.md) - display autocomplete installation instructions
* [`symbol-network configureNodes`](docs/configureNodes.md) - This is the last step of the node cluster setup that generates and updates each node's configuration.
* [`symbol-network displayResolvedNetworkPreset`](docs/displayResolvedNetworkPreset.md) - It displays the resolved network preset (Bootstrap's shared + custom-network-preset.yml).
* [`symbol-network expandNodes`](docs/expandNodes.md) - This "one-time" command is the second step configuring the node cluster for an existing an network or a new network.
* [`symbol-network generateNemesis`](docs/generateNemesis.md) - This "one-time" command is the third step when creating a new network after running the "expandNodes" command.
* [`symbol-network healthCheck`](docs/healthCheck.md) - It health checks the nodes of the network once the network is running by performing several remote tests.
* [`symbol-network help`](docs/help.md) - display help for symbol-network
* [`symbol-network init`](docs/init.md) - This command is the first step configuring the node cluster for an existing an network or a new network.
* [`symbol-network link`](docs/link.md) - It announces VRF and Voting Link transactions for all the nodes to the network for each node with 'Peer' or 'Voting' roles. This command finalizes the node registration to an existing network.
* [`symbol-network listServices`](docs/listServices.md) - It lists all the known services.
* [`symbol-network verify`](docs/verify.md) - It tests the installed software in the current computer reporting if there is any missing dependency, invalid version, or software related issue.

<!-- commandsstop -->
