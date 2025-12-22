"use client";

import { useAccount, useWallet } from "@getpara/react-sdk";
import { useViemAccount, useViemClient } from "@getpara/react-sdk/evm";
import { useWalletContext } from "@/contexts/WalletContext";
import { encodeFunctionData, parseEther, http, getAddress, isAddress, parseGwei } from "viem";
import { useState } from "react";
import { sepolia } from "viem/chains";
import { getEtherscanTxUrl } from "@/config/network";

// ERC20 Transfer ABI
const erc20TransferABI = [
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
] as const;

export default function TransactionSigner() {
  const { isConnected } = useAccount();
  const { data: wallet } = useWallet();
  const { walletType } = useWalletContext();
  const evmWalletAddress = wallet?.type === "EVM" ? (wallet.address as `0x${string}`) : undefined;
  const { viemAccount } = useViemAccount({
    address: evmWalletAddress,
  });
  const { viemClient } = useViemClient({
    address: evmWalletAddress,
    walletClientConfig: {
      chain: sepolia,
      transport: http(),
    },
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"native" | "transaction" | "erc20">("native");
  
  // Form states
  const [nativeToAddress, setNativeToAddress] = useState<string>("");
  const [nativeAmount, setNativeAmount] = useState<string>("0.001");
  const [txToAddress, setTxToAddress] = useState<string>("");
  const [txAmount, setTxAmount] = useState<string>("0.001");
  const [erc20TokenAddress, setErc20TokenAddress] = useState<string>("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238");
  const [erc20ToAddress, setErc20ToAddress] = useState<string>("");
  const [erc20Amount, setErc20Amount] = useState<string>("100");

  // Common handler
  const handleAction = async (action: () => Promise<any>, actionName: string) => {
    if (!isConnected || !wallet || !viemAccount) {
      setError("Please log in and connect your wallet first");
      return;
    }

    setLoading(true);
    setError("");
    setResult("");
    try {
      const res = await action();
      setResult(`${actionName} successful!\n${JSON.stringify(res, null, 2)}`);
      console.log(`${actionName} result:`, res);
    } catch (err: any) {
      setError(`${actionName} failed: ${err?.message || String(err)}`);
      console.error(`${actionName} error:`, err);
    } finally {
      setLoading(false);
    }
  };

  // 1. Sign simple message
  const handleSignMessage = async () => {
    await handleAction(async () => {
      if (!viemAccount) throw new Error("No account");
      const signature = await viemAccount.signMessage({
        message: "Hello Para!",
      });
      return { signature };
    }, "Sign Message");
  };

  // 2. Sign typed data (EIP-712)
  const handleSignTypedData = async () => {
    await handleAction(async () => {
      if (!viemAccount) throw new Error("No account");
      const signature = await viemAccount.signTypedData({
        domain: {
          name: "Para Test",
          version: "1",
          chainId: sepolia.id,
        },
        primaryType: "Test",
        types: {
          Test: [{ name: "value", type: "string" }],
        },
        message: {
          value: "Hello world",
        },
      });
      return { signature };
    }, "Sign Typed Data");
  };

  // 3. Send native token (ETH)
  const handleSendNative = async () => {
    await handleAction(async () => {
      if (!viemAccount || !viemClient) throw new Error("No account or client");
      
      if (!nativeToAddress || !isAddress(nativeToAddress)) {
        throw new Error("Please enter a valid address (0x...)");
      }
      
      const toAddress = getAddress(nativeToAddress); // Checksum address
      const value = parseEther(nativeAmount);

      // Increase gas price to process transaction faster
      // On Sepolia testnet, 1-2 Gwei is sufficient
      const hash = await viemClient.sendTransaction({
        to: toAddress,
        value: value,
        maxFeePerGas: parseGwei("2"), // 2 Gwei max fee
        maxPriorityFeePerGas: parseGwei("1"), // 1 Gwei priority fee
      });

      return { hash, explorer: getEtherscanTxUrl(hash) };
    }, "Send Native Token");
  };

  // 4. Send transaction with viemClient
  const handleSendTransaction = async () => {
    await handleAction(async () => {
      if (!viemAccount || !viemClient) throw new Error("No account or client");
      
      if (!txToAddress || !isAddress(txToAddress)) {
        throw new Error("Please enter a valid address (0x...)");
      }
      
      const toAddress = getAddress(txToAddress); // Checksum address
      const value = parseEther(txAmount);

      // Increase gas price to process transaction faster
      const hash = await viemClient.sendTransaction({
        to: toAddress,
        value: value,
        maxFeePerGas: parseGwei("2"), // 2 Gwei max fee
        maxPriorityFeePerGas: parseGwei("1"), // 1 Gwei priority fee
      });

      return { hash, explorer: getEtherscanTxUrl(hash) };
    }, "Send Transaction");
  };

  // 5. ERC20 Transfer
  const handleERC20Transfer = async () => {
    await handleAction(async () => {
      if (!viemAccount || !viemClient) throw new Error("No account or client");
      
      if (!erc20TokenAddress || !isAddress(erc20TokenAddress)) {
        throw new Error("Please enter a valid token address (0x...)");
      }
      
      if (!erc20ToAddress || !isAddress(erc20ToAddress)) {
        throw new Error("Please enter a valid recipient address (0x...)");
      }

      const tokenAddress = getAddress(erc20TokenAddress);
      const receiverAddress = getAddress(erc20ToAddress);
      const amount = BigInt(erc20Amount);

      const data = encodeFunctionData({
        abi: erc20TransferABI,
        functionName: "transfer",
        args: [receiverAddress, amount],
      });

      // Increase gas price for ERC20 transfer
      const hash = await viemClient.sendTransaction({
        to: tokenAddress,
        data,
        maxFeePerGas: parseGwei("2"), // 2 Gwei max fee
        maxPriorityFeePerGas: parseGwei("1"), // 1 Gwei priority fee
      });

      return { hash, explorer: getEtherscanTxUrl(hash) };
    }, "ERC20 Transfer");
  };

  // Hide this component when using MetaMask (this is for testing Para wallet only)
  if (walletType === "metamask") {
    return (
      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        ℹ️ <strong>MetaMask Connected:</strong> This section is for testing Para wallet signing. With MetaMask, you can go directly to "NGO Wallet Management" below to create and manage Safe multisig wallets.
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          Test Transaction Signing
        </h2>
        <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
          Please log in and connect your wallet before testing transaction signing.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          Test Transaction Signing
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Examples of testing transaction signing and sending transactions with Para Wallet
        </p>
        {wallet && (
          <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
            <strong>Current wallet:</strong> {wallet.address} ({wallet.type})
          </div>
        )}
      </div>

      {/* <div className="flex flex-col gap-3">
        <h3 className="text-lg font-medium text-black dark:text-zinc-50">
          Sign Only (No transaction sent)
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSignMessage}
            disabled={loading || !viemAccount}
            className="flex h-10 items-center justify-center rounded-lg border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Sign Message
          </button>

          <button
            onClick={handleSignTypedData}
            disabled={loading || !viemAccount}
            className="flex h-10 items-center justify-center rounded-lg border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Sign Typed Data (EIP-712)
          </button>
        </div>
      </div> */}

      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-medium text-black dark:text-zinc-50">
          Send Transaction (Real transaction)
        </h3>
        <div className="rounded-lg bg-orange-50 p-3 text-xs text-orange-800 dark:bg-orange-900/20 dark:text-orange-300">
          ⚠️ <strong>Warning:</strong> These transactions will be sent for real and cost gas fees. Only test on Sepolia testnet!
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab("native")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "native"
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            Send Native Token
          </button>
          <button
            onClick={() => setActiveTab("transaction")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "transaction"
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            Send Transaction
          </button>
          <button
            onClick={() => setActiveTab("erc20")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "erc20"
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            ERC20 Transfer
          </button>
        </div>

        {/* Native Token Form */}
        {activeTab === "native" && (
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black dark:text-zinc-50">
                Recipient Address (To Address)
              </label>
              <input
                type="text"
                value={nativeToAddress}
                onChange={(e) => setNativeToAddress(e.target.value)}
                placeholder="0x..."
                className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black dark:text-zinc-50">
                Amount (ETH)
              </label>
              <input
                type="text"
                value={nativeAmount}
                onChange={(e) => setNativeAmount(e.target.value)}
                placeholder="0.001"
                className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
              />
            </div>
            <button
              onClick={handleSendNative}
              disabled={loading || !viemAccount || wallet?.type !== "EVM"}
              className="flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Native Token"}
            </button>
          </div>
        )}

        {/* Transaction Form */}
        {activeTab === "transaction" && (
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black dark:text-zinc-50">
                Recipient Address (To Address)
              </label>
              <input
                type="text"
                value={txToAddress}
                onChange={(e) => setTxToAddress(e.target.value)}
                placeholder="0x..."
                className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black dark:text-zinc-50">
                Amount (ETH)
              </label>
              <input
                type="text"
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                placeholder="0.001"
                className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
              />
            </div>
            <button
              onClick={handleSendTransaction}
              disabled={loading || !viemAccount || wallet?.type !== "EVM"}
              className="flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Transaction"}
            </button>
          </div>
        )}

        {/* ERC20 Transfer Form */}
        {activeTab === "erc20" && (
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black dark:text-zinc-50">
                Token Address
              </label>
              <input
                type="text"
                value={erc20TokenAddress}
                onChange={(e) => setErc20TokenAddress(e.target.value)}
                placeholder="0x..."
                className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
              />
              <p className="text-xs text-zinc-500">Example: USDC on Sepolia</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black dark:text-zinc-50">
                Recipient Address (To Address)
              </label>
              <input
                type="text"
                value={erc20ToAddress}
                onChange={(e) => setErc20ToAddress(e.target.value)}
                placeholder="0x..."
                className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black dark:text-zinc-50">
                Token Amount
              </label>
              <input
                type="text"
                value={erc20Amount}
                onChange={(e) => setErc20Amount(e.target.value)}
                placeholder="100"
                className="w-full rounded-lg border border-black/[.08] bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/[.145] dark:bg-[#1a1a1a] dark:text-zinc-50"
              />
              <p className="text-xs text-zinc-500">Token amount (without decimals, e.g., 100 = 100 tokens)</p>
            </div>
            <button
              onClick={handleERC20Transfer}
              disabled={loading || !viemAccount || wallet?.type !== "EVM"}
              className="flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send ERC20 Token"}
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
          Processing...
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
          <pre className="whitespace-pre-wrap font-mono text-xs">{result}</pre>
        </div>
      )}
    </div>
  );
}

