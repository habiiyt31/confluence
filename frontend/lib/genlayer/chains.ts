/**
 * GenLayer network registry.
 *
 * Two things live here for each network:
 *  1. The genlayer-js chain object (used to build the read/write client).
 *  2. A plain EIP-3085 `wallet_addEthereumChain` parameter object, used by
 *     our own manual chain-switching code in `wallet/connect.ts`.
 *
 * Source: https://docs.genlayer.com/developers/networks (checked against
 * the live docs while building this — always re-check there before
 * changing chain IDs / RPC URLs, they do change between network resets).
 */
import {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} from "genlayer-js/chains";
import type { GenLayerChain } from "genlayer-js/types";

export type NetworkKey = "localnet" | "studionet" | "testnetAsimov" | "testnetBradbury";

export interface AddChainParams {
  chainId: `0x${string}`;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

export const GENLAYER_CHAINS: Record<NetworkKey, GenLayerChain> = {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
};

export const ADD_CHAIN_PARAMS: Record<NetworkKey, AddChainParams> = {
  studionet: {
    chainId: "0xf22f", // 61999
    chainName: "GenLayer Studionet",
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: ["https://studio.genlayer.com/api"],
    blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
  },
  localnet: {
    chainId: "0xeeb7", // 61127
    chainName: "GenLayer Localnet",
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: ["http://localhost:4000/api"],
    blockExplorerUrls: ["http://localhost:8080"],
  },
  testnetAsimov: {
    chainId: "0x107d", // 4221
    chainName: "GenLayer Testnet Asimov",
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: ["https://rpc-asimov.genlayer.com"],
    blockExplorerUrls: ["https://explorer-asimov.genlayer.com"],
  },
  testnetBradbury: {
    chainId: "0x107d", // 4221
    chainName: "GenLayer Testnet Bradbury",
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: ["https://rpc-bradbury.genlayer.com"],
    blockExplorerUrls: ["https://explorer-bradbury.genlayer.com"],
  },
};

/** Network the whole app runs against, set via NEXT_PUBLIC_GENLAYER_NETWORK. */
export const ACTIVE_NETWORK: NetworkKey =
  (process.env.NEXT_PUBLIC_GENLAYER_NETWORK as NetworkKey) || "studionet";

export const ACTIVE_CHAIN = GENLAYER_CHAINS[ACTIVE_NETWORK];
export const ACTIVE_ADD_CHAIN_PARAMS = ADD_CHAIN_PARAMS[ACTIVE_NETWORK];

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "") as `0x${string}`;
