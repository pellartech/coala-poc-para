"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAccount, useWallet } from "@getpara/react-sdk";
import { useViemAccount, useViemClient } from "@getpara/react-sdk/evm";
import { useMetaMask } from "@/hooks/useMetaMask";
import { http } from "viem";
import { CHAIN, RPC_URL } from "@/config/network";
import { createParaEip1193Provider } from "@/lib/safeHelpers";

type WalletType = "para" | "metamask" | null;

interface WalletContextType {
  walletType: WalletType;
  address: string | null;
  isConnected: boolean;
  getProvider: () => any;
  getSignerAddress: () => string | null;
  // Para-specific
  paraWalletClient: any;
  paraViemAccount: any;
  // MetaMask-specific
  metaMaskProvider: any;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { isConnected: isParaConnected } = useAccount();
  const { data: paraWallet } = useWallet();
  const {
    isConnected: isMetaMaskConnected,
    address: metaMaskAddress,
    getProvider: getMetaMaskProvider,
  } = useMetaMask();

  // Para wallet hooks
  const evmWalletAddress = paraWallet?.type === "EVM" ? (paraWallet.address as `0x${string}`) : undefined;
  const { viemAccount: paraViemAccount } = useViemAccount({
    address: evmWalletAddress,
  });
  const { viemClient: paraWalletClient } = useViemClient({
    address: evmWalletAddress,
    walletClientConfig: {
      chain: CHAIN,
      transport: http(RPC_URL),
    },
  });

  const [walletType, setWalletType] = useState<WalletType>(null);
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (isParaConnected && paraWallet?.address) {
      setWalletType("para");
      setAddress(paraWallet.address);
    } else if (isMetaMaskConnected && metaMaskAddress) {
      setWalletType("metamask");
      setAddress(metaMaskAddress);
    } else {
      setWalletType(null);
      setAddress(null);
    }
  }, [isParaConnected, paraWallet?.address, isMetaMaskConnected, metaMaskAddress]);

  const getProvider = () => {
    if (walletType === "metamask") {
      // MetaMask already provides EIP-1193 provider, return it directly
      return getMetaMaskProvider();
    } else if (walletType === "para") {
      if (paraWalletClient && paraViemAccount) {
        return createParaEip1193Provider(paraWalletClient, paraViemAccount, RPC_URL);
      }
      return null;
    }
    return null;
  };

  const getSignerAddress = () => {
    return address;
  };

  return (
    <WalletContext.Provider
      value={{
        walletType,
        address,
        isConnected: walletType !== null,
        getProvider,
        getSignerAddress,
        paraWalletClient,
        paraViemAccount,
        metaMaskProvider: getMetaMaskProvider(),
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }
  return context;
}

