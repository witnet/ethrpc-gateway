# ETH/RPC Gateway launcher CLI

A command-line tool to launch RPC gateways for Ethereum-compatible chains using preconfigured or custom ETH/RPC endopoints, with support for both **read-only** interactions and **transaction signing** using private keys set up locally on the user's development environment.

This utility provides a quick and consistent way to interact with multiple EVM networks from the command line, ideal for scripting, diagnostics, network health checks, and automated transactions.

## 🧭 Overview

The ETH/RPC Gateway launcher CLI allows you to:

- 🚀 Launch a local JSON-RPC proxy or relay to a remote ETH/RPC provider.
- 🌐 Target multiple EVM-compatible L1 & L2 networks (Ethereum, Polygon, Arbitrum, etc.).
- ⚙️ Use preconfigured endpoints or provide your own.
- 📊 Inspect basic chain info directly from the terminal.
- ✍️ **Sign transactions** with private keys from your local environment.
- 🔄 Support for ecosystems where RPC providers do not comply with the standard Ethereum JSON-RPC protocol, such as: **Conflux Core**, **Reef**, **TEN** and **zkSync**.

This makes the gateway a flexible and pretty convenient tool, even for non-standard Ethereum-compatible chains and environments.

## 📦 Installation

```bash
npm install -g ethrpc-gateway
```

or using `yarn`:
```bash
yarn global add ethrpc-gateway
```

## 🛠️ Usage

- General usage:
```bash
ethrpc [<ECOSYSTEM>[:<NETWORK>] [<PORT> [<REMOTE_PROVIDER_URL]]
```

### Listing supported networks:

- List supported EVM-compatible ecosystems:
```bash
ethrpc
```

- List supported networks within the specified ecosystem (e.g. Polygon):
```bash
ethrpc polygon
```

### Launching a read-only gateway:

- Launch a gateway with the specified network and port (e.g. Ethereum Sepolia):
```bash
ethrpc ethereum:sepolia 7777
```

### Launching a gateway with signing capability:

- Launch a gateway with the specified network and private keys (e.g. Conflux Core Testnet):
```bash
export ETHRPC_PRIVATE_KEYS=["your_private_key_1", ..., "your_private_key_n", ]
ethrpc conflux:core:testnet
```

- Launch a gateway with the specified network and remote provider (e.g. Ethereum Mainnet):
```bash
export ETHRPC_SEED_PHRASE="your seed phrase here"
export ETHRPC_PROVIDER_URL=https://mainnet.infura.io/v3/you_infura_key_here
ethrpc ethereum:mainnet
```

## 🌍 Supported Chains
### Testnets (36)
| Ecosystem | Network Name           | Default Port | Chain Id |
| :-------- | :--------------------- | :----------: | -------: |
| Arbitrum  | arbitrum:sepolia       | 8517 | 421614
| Avalance  | avalanche:testnet      | 8533 | 43113
| BASE      | base:sepolia           | 8502 | 84532
| BOBA      | boba:bnb:testnet       | 8510 | 9728
|           | boba:eth:goerli        | 8515 | 2888
| CELO      | celo:alfajores         | 8538 | 44787
| Conflux   | conflux:core:testnet   | 8540 | 1
|           | conflux:espace:testnet | 8529 | 71
| Cronos    | cronos:testnet         | 8530 | 338
| Dogechain | dogechain:testnet      | 8519 | 568
| Elastos   | elastos:testnet        | 8513 | 21
| Ethereum  | ethereum:sepolia       | 8506 | 11155111
| Fuse      | fuse:testnet           | 8511 | 123
| Gnosis    | gnosis:testnet         | 8509 | 10200
| KAVA      | kava:testnet           | 8526 | 2221
| KCC       | kcc:testnet            | 8537 | 322
| KAIA      | kaia:testnet           | 8527 | 1001
| Mantle    | mantle:sepolia         | 8508 | 5003
| Meter     | meter:testnet          | 8523 | 83
| Metis     | metis:sepolia          | 8536 | 59902
| Moonbeam  | moonbeam:moonbase      | 8531 | 1287
|           | moonbeam:moonriver     | 7531 | 1285
| OKC       | okx:oktchain:testnet   | 8528 | 65
|           | okx:xlayer:sepolia     | 8505 | 195
| Optimism  | optimism:sepolia       | 8503 | 11155420
| Polygon   | polygon:amoy           | 8535 | 80002
|           | polygon:zkevm:testnet  | 8512 | 1442
| Reef      | reef:testnet           | 8532 | 13939
| Scroll    | scroll:sepolia         | 8514 | 534351
| Syscoin   | syscoin:testnet        | 8521 | 5700
|           | syscoin:rollux:testnet | 8507 | 57000
| TEN       | ten:testnet            | 8504 | 443
| Ultron    | ultron:testnet         | 8516 | 1230
| Unichain  | unichain:sepolia       | 8500 | 1301
| World     | worldchain:sepolia     | 8501 | 4801
| ZkSync    | zksync:sepolia         | 8499 | 300

### Mainnets (28)
| Ecosystem | Network Name           | Default Port | Chain Id |
| :-------- | :--------------------- | :----------: | -------: |
| Arbitrum  | arbitrum:mainnet       | 9517 | 42161
| Avalance  | avalanche:mainnet      | 9533 | 43114
| BASE      | base:mainnet           | 9502 | 8453
| BOBA      | boba:bnb:mainnet       | 9510 | 56288
|           | boba:eth:mainnet       | 9539 | 288
| CELO      | celo:mainnet           | 9538 | 42220
| Conflux   | conflux:core:mainnet   | 9540 | 1029
|           | conflux:espace:mainnet | 9529 | 1030
| Cronos    | cronos:mainnet         | 9530 | 25
| Dogechain | dogechain:mainnet      | 9519 | 2000
| Elastos   | elastos:mainnet        | 9513 | 20
| Ethereum  | ethereum:mainnet       | 9545 | 1
| Gnosis    | gnosis:mainnet         | 9509 | 100
| KAVA      | kava:mainnet           | 9526 | 2222
| KCC       | kcc:mainnet            | 9537 | 321
| KAIA      | kaia:mainnet           | 9527 | 8217
| Mantle    | mantle:mainnet         | 9508 | 5000
| Meter     | meter:mainnet          | 9523 | 82
| Metis     | metis:sepolia          | 7536 | 1088
| Moonbeam  | moonbeam:mainnet       | 9531 | 1284
| Optimism  | optimism:mainnet       | 9520 | 10
| Polygon   | polygon:mainnet        | 9535 | 137
|           | polygon:zkevm:mainnet  | 9512 | 1101
| Reef      | reef:mainnet           | 9532 | 13939
| Scroll    | scroll:mainnet         | 9514 | 534352
| Syscoin   | syscoin:testnet        | 9521 | 57
| Ultron    | ultron:mainnet         | 9516 | 1231
| World     | worldchain:mainnet     | 9501 | 480

## 🧱 Built With
- Node.js
- Axios
- Ethers v5
- js-conflux-sdk
- zksync-ethers
- @reef-defi/evm-provider

## 🔒 Security Notice

- This tool does read private keys from system environment variables, but not doest it read nor store them on disk. Private keys are used only in memory to sign transactions. You must set either the ETHRPC_PRIVATE_KEYS or the ETHRPC_SEED_PHRASE environment variables, or provide your private keys via a secure method during development.

> ***Warning**: Never expose private keys in production environments. This tool is meant for development or testing use.*

## 📜 License
MIT © 2025 — Maintained by the [Witnet Project](https://github.com/witnet).

## 🤝 Contributing
PRs are welcome! If you'd like to add new features or extend support to more networks, feel free to open an issue or submit a pull request.
