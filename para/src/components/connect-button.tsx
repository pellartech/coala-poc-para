"use client";

import { useModal, useAccount, useWallet } from "@getpara/react-sdk";
import { useEffect, useState } from "react";

export function ConnectButton() {
  const { openModal } = useModal();
  const { data: wallet } = useWallet();
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClick = () => {
    openModal();
  };

  // Prevent hydration mismatch by showing consistent content on first render
  if (!mounted) {
    return (
      <button
        disabled
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-auto opacity-50"
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-auto"
    >
      {isConnected && wallet?.address
        ? `Connected: ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
        : "Connect Wallet"}
    </button>
  );
}

