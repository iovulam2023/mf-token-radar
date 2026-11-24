# mf-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/iovulam2023/mf-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/iovulam2023/mf-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads one sealed snapshot of the protocol universe (758 protocols, DefiLlama figures) and ranks every pre-token launch candidate by expected airdrop value. Implied token value comes from a log-log peer curve (market cap / TVL against TVL) fitted at runtime on the snapshot's own token-bearing peers, with shrunk category offsets and a momentum scaler; airdrop likelihood blends age readiness, TVL scale, category token propensity, 7-day momentum and chain spread. The board carries all 40 watchlist protocols plus 138 below-floor early candidates (178 rows), each with a six-step farm plan derived from its category, chains, TVL and age. The dashboard shows the full arithmetic for every row, so any rank can be checked by hand.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

Node 22, standard library only. Writes `board.json`, the dashboard data, the dashboard, the screenshots and `dossier.json` to the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?ref=3gqhhxa8&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
