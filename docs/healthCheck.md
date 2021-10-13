`symbol-network healthCheck`
============================

It health checks the nodes of the network once the network is running by performing several remote tests.

* [`symbol-network healthCheck`](#symbol-network-healthcheck)

## `symbol-network healthCheck`

It health checks the nodes of the network once the network is running by performing several remote tests.

```
USAGE
  $ symbol-network healthCheck

OPTIONS
  -h, --help                                     It shows the help of this command.
  --maxBlockDiff=maxBlockDiff                    [default: 10] max block diff
  --maxFinalizedBlockDiff=maxFinalizedBlockDiff  [default: 5] max finalized block diff
  --timeout=timeout                              [default: 10000] test timeout

EXAMPLE
  $ symbol-network healthCheck
```
