# HolyC tic-tac-toe boundary

This is an opt-in engine boundary for the standalone activities service. Set
`GAME_SERVER_TTT_ENGINE=holyc` and configure an absolute
`GAME_SERVER_TTT_HOLYC_COMMAND` plus a JSON `GAME_SERVER_TTT_HOLYC_ARGS` array.
The Node activities gateway remains the production authority for
authentication, room membership, rate limiting, Socket.IO, NATS, and
per-viewer snapshots.

The Node supervisor launches one child per active room, sends one tab-separated
request per line, and reads one tab-separated response per line. It never uses
a shell. A child timeout, malformed response, or exit rejects the current
action; accepted moves are replayed after a restart so a crash cannot silently
reset the room state. Empty rooms close the child during idle disposal. The
child environment is a small allowlist (`PATH`, locale, and `NODE_ENV`), so
gateway JWT, database, and service credentials are not inherited.

## Request

```text
move<TAB>revision<TAB>cell<TAB>mark
reset<TAB>revision
```

`mark` is `X` or `O`; `cell` is `0` through `8`; `revision` is the gateway's
monotonic room revision. The engine does not receive user IDs, tokens, cookies,
or database credentials.

## Response

```text
ok<TAB>revision<TAB>status<TAB>turn<TAB>board
reject<TAB>revision<TAB>reason
```

`board` is nine digits using `0` for empty, `1` for X, and `2` for O. Status is
`playing`, `draw`, `x_wins`, or `o_wins`. The gateway attaches user identity and
projects the response into the existing `TttView` contract.

The TypeScript module remains enabled by default. This protocol is the actual
opt-in seam for an independently supervised HolyC engine, not a second
authorization implementation.

## Building the reference engine

The checked-in `echo_ttt_process.HC` is a native host process for the
`project-solomon/holyc` compiler. Install the pinned compiler, then build it
from the repository root:

```sh
go install github.com/project-solomon/holyc/hcc/cmd/hcc@v0.1.0
export PATH="$HOME/go/bin:$PATH"
npm run build:holyc -w activities
```

Point `GAME_SERVER_TTT_HOLYC_COMMAND` at the resulting absolute executable and
set `GAME_SERVER_TTT_ENGINE=holyc`. The normal activities build does not enable
this mode or download a compiler.
