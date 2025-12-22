"use client";

import { useState, useEffect, useCallback } from "react";
import { CHAIN } from "@/config/network";

// Type for MetaMask provider
interface MetaMaskProvider {
  isMetaMask: boolean;
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
  chainId?: string;
}

interface MetaMaskState {
  isConnected: boolean;
  address: string | null;
  chainId: number | null;
  isInstalled: boolean;
  error: string | null;
}

const METAMASK_DISCONNECTED_KEY = "metamask_disconnected";

export function useMetaMask() {
  const [state, setState] = useState<MetaMaskState>({
    isConnected: false,
    address: null,
    chainId: null,
    isInstalled: false,
    error: null,
  });

  // Check if MetaMask is installed
  useEffect(() => {
    const checkMetaMask = () => {
      const ethereum = (window as any).ethereum as MetaMaskProvider | undefined;
      const isInstalled = typeof window !== "undefined" && !!ethereum?.isMetaMask;
      setState((prev) => ({ ...prev, isInstalled }));
    };

    checkMetaMask();

    // Listen for MetaMask installation
    if (typeof window !== "undefined") {
      window.addEventListener("ethereum#initialized", checkMetaMask);
      return () => {
        window.removeEventListener("ethereum#initialized", checkMetaMask);
      };
    }
  }, []);

  // Check connection status on mount
  useEffect(() => {
    const checkConnection = async () => {
      const ethereum = (window as any).ethereum as MetaMaskProvider | undefined;
      if (typeof window === "undefined" || !ethereum?.isMetaMask) {
        return;
      }

      // Check if user manually disconnected
      const wasDisconnected = localStorage.getItem(METAMASK_DISCONNECTED_KEY);
      if (wasDisconnected === "true") {
        console.log("MetaMask was manually disconnected, not auto-connecting");
        return;
      }

      try {
        const accounts = await ethereum.request({ method: "eth_accounts" });
        const chainId = await ethereum.request({ method: "eth_chainId" });

        if (accounts && Array.isArray(accounts) && accounts.length > 0) {
          setState({
            isConnected: true,
            address: accounts[0],
            chainId: chainId ? parseInt(chainId as string, 16) : null,
            isInstalled: true,
            error: null,
          });
        }
      } catch (error: any) {
        console.error("Error checking MetaMask connection:", error);
      }
    };

    checkConnection();
  }, []);

  // Listen for account changes
  useEffect(() => {
    const ethereum = (window as any).ethereum as MetaMaskProvider | undefined;
    if (typeof window === "undefined" || !ethereum?.isMetaMask) {
      return;
    }

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (!accounts || accounts.length === 0) {
        setState({
          isConnected: false,
          address: null,
          chainId: null,
          isInstalled: true,
          error: null,
        });
      } else {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          address: accounts[0],
          error: null,
        }));
      }
    };

    const handleChainChanged = (...args: unknown[]) => {
      const chainId = args[0] as string;
      setState((prev) => ({
        ...prev,
        chainId: chainId ? parseInt(chainId, 16) : null,
      }));
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);

    return () => {
      ethereum.removeListener("accountsChanged", handleAccountsChanged);
      ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    const ethereum = (window as any).ethereum as MetaMaskProvider | undefined;
    if (typeof window === "undefined" || !ethereum?.isMetaMask) {
      setState((prev) => ({
        ...prev,
        error: "MetaMask is not installed. Please install MetaMask extension.",
      }));
      throw new Error("MetaMask is not installed");
    }

    // Clear disconnect flag when connecting
    localStorage.removeItem(METAMASK_DISCONNECTED_KEY);

    try {
      // Request account access
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found");
      }

      // Get chain ID
      const chainId = await ethereum.request({ method: "eth_chainId" });

      // Switch to Sepolia if not already on it
      const currentChainId = parseInt(chainId as string, 16);
      if (currentChainId !== CHAIN.id) {
        try {
          await ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${CHAIN.id.toString(16)}` }],
          });
        } catch (switchError: any) {
          // If chain doesn't exist, add it
          if (switchError.code === 4902) {
            await ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: `0x${CHAIN.id.toString(16)}`,
                  chainName: CHAIN.name,
                  nativeCurrency: {
                    name: CHAIN.nativeCurrency.name,
                    symbol: CHAIN.nativeCurrency.symbol,
                    decimals: CHAIN.nativeCurrency.decimals,
                  },
                  rpcUrls: [CHAIN.rpcUrls.default.http[0]],
                  blockExplorerUrls: CHAIN.blockExplorers?.default?.url
                    ? [CHAIN.blockExplorers.default.url]
                    : [],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
      }

      setState({
        isConnected: true,
        address: accounts[0],
        chainId: CHAIN.id,
        isInstalled: true,
        error: null,
      });

      return accounts[0];
    } catch (error: any) {
      const errorMessage =
        error.message || "Failed to connect to MetaMask";
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isConnected: false,
      }));
      throw error;
    }
  }, []);

  const disconnect = useCallback(async () => {
    const ethereum = (window as any).ethereum as MetaMaskProvider | undefined;
    
    // Mark as manually disconnected in localStorage
    localStorage.setItem(METAMASK_DISCONNECTED_KEY, "true");
    
    // Try to revoke permissions (MetaMask 10.18+)
    if (ethereum && typeof ethereum.request === "function") {
      try {
        // Attempt to revoke permissions using EIP-2255
        await ethereum.request({
          method: "wallet_revokePermissions",
          params: [
            {
              eth_accounts: {},
            },
          ],
        });
        console.log("✅ MetaMask permissions revoked successfully");
      } catch (error: any) {
        // If wallet_revokePermissions is not supported, that's okay
        if (error.code === -32601) {
          console.log("⚠️ wallet_revokePermissions not supported by this MetaMask version");
          console.log("💡 User can disconnect manually from MetaMask extension: Settings → Connected Sites");
        } else if (error.code === 4001) {
          console.log("User rejected the disconnect request");
        } else {
          console.error("Error revoking MetaMask permissions:", error);
        }
      }
    }
    
    setState({
      isConnected: false,
      address: null,
      chainId: null,
      isInstalled: state.isInstalled,
      error: null,
    });
    
    console.log("MetaMask disconnected from app. To reconnect, click Connect MetaMask again.");
  }, [state.isInstalled]);

  const getProvider = useCallback(() => {
    const ethereum = (window as any).ethereum as MetaMaskProvider | undefined;
    if (typeof window === "undefined" || !ethereum?.isMetaMask) {
      return null;
    }
    return ethereum;
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    getProvider,
  };
}

