# Subfrost App Ecosystem: A Comprehensive Guide

## High-Level Architecture

The Subfrost ecosystem is a decentralized financial application built on a Bitcoin L0 blockchain. It is composed of several interconnected repositories and services that work together to provide a seamless user experience. The architecture is designed to be modular, allowing for independent development and deployment of each component.

### Core Components

*   **`subfrost-app`**: The main frontend application, built with Next.js and React. It provides the user interface for interacting with the Subfrost ecosystem.
*   **`alkanes-rs`**: A Rust-based repository that contains the core blockchain logic, including the indexer, WASM runtime, and smart contracts.
*   **`ts-sdk`**: a TypeScript SDK that provides a convenient way to interact with the `alkanes-rs` backend from the frontend application.
*   **Docker Stack**: A collection of services, including `bitcoind`, `metashrew`, `memshrew`, `esplora`, `jsonrpc`, and the `indexer`, that provide the necessary infrastructure for the local development environment.

### Repositories

The Subfrost ecosystem is spread across several repositories, each with a specific purpose:

*   **`subfrost-app`**: The main frontend application.
*   **`alkanes-rs`**: The core blockchain logic.
*   **`ts-sdk`**: The TypeScript SDK for frontend integration.
*   **`oy-amm`**: The automated market maker (AMM) used for token swaps.

This guide will provide a detailed explanation of each of these components and how they interact with each other.

## The Indexer

The indexer is a critical component of the `alkanes-rs` repository. It is responsible for scanning the Bitcoin blockchain and indexing all transactions and data related to the Subfrost ecosystem. This includes tracking the creation and transfer of all Subfrost-related tokens, as well as the state of all smart contracts.

### How it Works

The indexer works by connecting to a Bitcoin node (in the local development environment, this is `bitcoind`) and listening for new blocks. When a new block is detected, the indexer scans the block for any transactions that are relevant to the Subfrost ecosystem. These transactions are then parsed and stored in a local database.

### `metashrew` and `memshrew`

The indexer is built on top of `metashrew` and `memshrew`, two a custom high-performance data-parallel indexer framework for ordinals. `metashrew` is used to define the data structures and business logic for the indexer, while `memshrew` provides a framework for processing and storing the indexed data in-memory. This allows the indexer to be extremely fast and efficient, even when processing large amounts of data.

## WebAssembly (WASM)

WebAssembly (WASM) is a binary instruction format for a stack-based virtual machine. It is designed as a portable compilation target for programming languages, enabling deployment on the web for client and server applications. In the Subfrost ecosystem, WASM is used to execute smart contracts in a secure and efficient manner.

### Smart Contracts

All smart contracts in the Subfrost ecosystem are compiled to WASM. This allows them to be executed in a sandboxed environment, which prevents them from accessing the host system or other smart contracts without permission. The WASM runtime is provided by the `alkanes-rs` repository, which uses the Wasmer engine to execute the WASM bytecode.

### `prod_wasms`

The `prod_wasms` directory contains the compiled WASM binaries for all of the smart contracts used in the Subfrost ecosystem. These binaries are deployed to the blockchain using the `deploy-regtest.sh` script, and are then executed by the WASM runtime when a user interacts with a smart contract.

## `alkanes-rs`

The `alkanes-rs` repository is the heart of the Subfrost ecosystem. It is a Rust-based monorepo that contains all of the core blockchain logic, including the indexer, the WASM runtime, and all of the smart contracts. It is responsible for maintaining the state of the blockchain, executing smart contracts, and providing an API for the frontend application to interact with.

### Key Components

*   **`alkanes-core`**: The core blockchain logic, including the data structures for blocks, transactions, and accounts.
*   **`alkanes-runtime`**: The WASM runtime, which is responsible for executing smart contracts.
*   **`alkanes-indexer`**: The indexer, which is responsible for scanning the Bitcoin blockchain and indexing all Subfrost-related data.
*   **`alkanes-cli`**: A command-line interface for interacting with the Subfrost blockchain.
*   **`subfrost-contracts`**: A collection of all the smart contracts used in the Subfrost ecosystem.

## Vaults

Vaults are smart contracts that allow users to deposit their tokens and earn yield. They are a core component of the Subfrost ecosystem, and are used to provide liquidity to the AMM and to generate yield for users.

### How they Work

Users can deposit their tokens into a vault, and in return they will receive a "vault token" that represents their share of the vault. The vault then uses the deposited tokens to provide liquidity to the AMM, and any fees generated from the AMM are then distributed to the vault token holders.

### `yv-fr-btc` Vault

The `yv-fr-btc` vault is a special vault that is used to generate yield on `frBTC`. It works by depositing `frBTC` into the AMM and earning fees from token swaps. The vault also earns fees from the `ftrBTC` master contract, which is used to wrap and unwrap `BTC`.

## `frBTC` Wrapping and Unwrapping

`frBTC` is a wrapped version of `BTC` that is used in the Subfrost ecosystem. It is an ERC-20-style token that is pegged 1:1 to the value of `BTC`. The `ftrBTC` master contract is responsible for wrapping and unwrapping `BTC`.

### Wrapping

To wrap `BTC`, a user sends `BTC` to a special address controlled by the `ftrBTC` master contract. The `ftrBTC` master contract then mints an equivalent amount of `frBTC` and sends it to the user's address.

### Unwrapping

To unwrap `frBTC`, a user sends `frBTC` to the `ftrBTC` master contract. The `ftrBTC` master contract then burns the `frBTC` and sends an equivalent amount of `BTC` to the user's address.

## L0 Architecture

The Subfrost ecosystem is built on a "Layer 0" architecture. This means that it is built directly on top of the Bitcoin blockchain, without any additional layers of consensus or security. This has several advantages, including:

*   **Security**: The Subfrost ecosystem inherits the security of the Bitcoin blockchain, which is the most secure blockchain in the world.
*   **Simplicity**: The L0 architecture is much simpler than other multi-layered architectures, which makes it easier to develop and maintain.
*   **Flexibility**: The L0 architecture is very flexible, and can be easily extended to support new features and applications.

### Repository Interaction

The different repositories in the Subfrost ecosystem interact with each other in a client-server model. The `subfrost-app` is the client, and the `alkanes-rs` repository is the server. The `ts-sdk` acts as a bridge between the two, providing a convenient way for the frontend to interact with the backend.

The `oy-amm` repository is a standalone component that is used by the `alkanes-rs` repository to provide an automated market maker for token swaps. It is not directly accessed by the `subfrost-app`, but is instead accessed through the `alkanes-rs` API.