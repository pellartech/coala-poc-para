"use client";

import { useAccount, useWallet } from "@getpara/react-sdk";
import { useViemAccount, useViemClient } from "@getpara/react-sdk/evm";
import { useWalletContext } from "@/contexts/WalletContext";
import { usePimlicoSmartAccount } from "@/hooks/usePimlicoSmartAccount"; // EIP-4337 (separate Smart Account)
import { usePimlico7702SmartAccount } from "@/hooks/usePimlico7702SmartAccount"; // EIP-7702 (upgrade Para wallet)
import { encodeFunctionData, parseEther, parseUnits, formatUnits, http, getAddress, isAddress, parseGwei, createPublicClient, formatEther } from "viem";
import { useState } from "react";
import { sepolia } from "viem/chains";
import { getEtherscanTxUrl } from "@/config/network";

// ERC20 ABI
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

const erc20DecimalsABI = [
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
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
  
  // Pimlico Smart Account for gasless transactions
  // EIP-4337: Separate Smart Account (different address)
  const { 
    smartAccountClient: smartAccountClient4337, 
    smartAccount: smartAccount4337, 
    isLoading: smartAccountLoading4337, 
    error: smartAccountError4337 
  } = usePimlicoSmartAccount();
  
  // EIP-7702: Upgrade Para wallet directly (SAME address as Para wallet)
  const { 
    smartAccountClient: smartAccountClient7702, 
    smartAccount: smartAccount7702, 
    isLoading: smartAccountLoading7702, 
    error: smartAccountError7702,
    paraEOA: paraEOA7702,  // Para EOA for signing authorization
    publicClient: publicClient7702  // For checking deployment status
  } = usePimlico7702SmartAccount();
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"native" | "transaction" | "erc20">("native");
  const [gaslessMode, setGaslessMode] = useState<boolean>(true);
  const [use7702, setUse7702] = useState<boolean>(true); // Default to EIP-7702 (recommended by Para team)
  
  // Select the appropriate Smart Account based on user preference
  const smartAccountClient = use7702 ? smartAccountClient7702 : smartAccountClient4337;
  const smartAccount = use7702 ? smartAccount7702 : smartAccount4337;
  const smartAccountLoading = use7702 ? smartAccountLoading7702 : smartAccountLoading4337;
  const smartAccountError = use7702 ? smartAccountError7702 : smartAccountError4337;
  
  // Form states
  const [nativeToAddress, setNativeToAddress] = useState<string>("");
  const [nativeAmount, setNativeAmount] = useState<string>("0.001");
  const [txToAddress, setTxToAddress] = useState<string>("");
  const [txAmount, setTxAmount] = useState<string>("0.001");
  const [erc20TokenAddress, setErc20TokenAddress] = useState<string>("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238");
  const [erc20ToAddress, setErc20ToAddress] = useState<string>("");
  const [erc20Amount, setErc20Amount] = useState<string>("100");
  
  // EIP-7702 Authorization Helper
  // Per Pimlico docs: https://docs.pimlico.io/guides/eip7702/demo
  const getAuthorizationIfNeeded = async () => {
    if (!use7702 || !smartAccount7702 || !paraEOA7702 || !publicClient7702) {
      return undefined; // Not using 7702 or not ready
    }
    
    try {
      // Check if Smart Account is already deployed (has authorization code set)
      const isDeployed = await smartAccount7702.isDeployed?.();
      
      if (!isDeployed) {
        console.log("🔐 First transaction - signing authorization for EIP-7702...");
        
        // Validate paraEOA7702 is available
        if (!paraEOA7702 || typeof paraEOA7702.signAuthorization !== 'function') {
          console.error("❌ Para EOA not available for signing authorization");
          return undefined;
        }
        
        // SimpleSmartAccount implementation address on Sepolia
        // This is the smart account contract that will be delegated to
        const SIMPLE_ACCOUNT_IMPLEMENTATION = "0xe6Cae83BdE06E4c305530e199D7217f42808555B";
        
        const authorization = await paraEOA7702.signAuthorization({
          address: SIMPLE_ACCOUNT_IMPLEMENTATION,
          chainId: sepolia.id,
          nonce: await publicClient7702.getTransactionCount({
            address: paraEOA7702.address,
          }),
        });
        
        console.log("✅ Authorization signed!");
        return authorization;
      }
      
      console.log("✅ Smart Account already deployed - no authorization needed");
      return undefined;
    } catch (error) {
      console.error("❌ Failed to get authorization:", error);
      return undefined;
    }
  };

  // Common handler
  const handleAction = async (action: () => Promise<any>, actionName: string) => {
    if (!isConnected || !wallet || !viemAccount) {
      setError("Please log in and connect your wallet first");
      return;
    }

    setLoading(true);
    setError("");
    setResult("");
    setProgressMessage("");
    try {
      const res = await action();
      setResult(`${actionName} successful!\n${JSON.stringify(res, null, 2)}`);
      console.log(`${actionName} result:`, res);
    } catch (err: any) {
      setError(`${actionName} failed: ${err?.message || String(err)}`);
      console.error(`${actionName} error:`, err);
    } finally {
      setLoading(false);
      setProgressMessage("");
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

  // 3. Send native token (ETH) with gasless support
  const handleSendNative = async () => {
    await handleAction(async () => {
      if (!viemAccount || !viemClient) throw new Error("No account or client");
      
      if (!nativeToAddress || !isAddress(nativeToAddress)) {
        throw new Error("Please enter a valid address (0x...)");
      }
      
      const toAddress = getAddress(nativeToAddress);
      const value = parseEther(nativeAmount);

      // GASLESS MODE - Use Pimlico Smart Account for FREE gas
      if (gaslessMode) {
        if (!smartAccountClient || !smartAccount) {
          throw new Error("Smart Account not initialized. Please wait or disable gasless mode.");
        }

        console.log("🚀 Sending GASLESS native token via Pimlico Smart Account...");
        console.log("From (Smart Account):", smartAccount.address);
        console.log("To:", toAddress);
        console.log("Value:", nativeAmount, "ETH");
        
        // Check Smart Account ETH balance
        const publicClient = createPublicClient({
          chain: sepolia,
          transport: http(),
        });
        
        const smartAccountBalance = await publicClient.getBalance({
          address: smartAccount.address as `0x${string}`,
        });
        
        console.log("💰 Smart Account ETH Balance:", formatEther(smartAccountBalance), "ETH");
        
        // Verify Smart Account has enough ETH to send
        const valueToSend = parseEther(nativeAmount);
        if (smartAccountBalance < valueToSend) {
          throw new Error(
            `❌ Insufficient balance in Smart Account!\n\n` +
            `Smart Account (${smartAccount.address}):\n` +
            `Balance: ${formatEther(smartAccountBalance)} ETH\n` +
            `Required: ${nativeAmount} ETH\n\n` +
            `Please send ETH to Smart Account first!`
          );
        }
        
        console.log("✅ Balance check passed!");
        
        // Get Para wallet balance before (to verify gas sponsorship)
        const balanceBefore = await publicClient.getBalance({
          address: viemAccount.address as `0x${string}`,
        });
        
        console.log("💰 Para Wallet ETH Balance (before):", formatEther(balanceBefore), "ETH");

        // Get authorization if needed (for EIP-7702 first transaction)
        const authorization = await getAuthorizationIfNeeded();

        // Send via Smart Account (gasless with Pimlico)
        // Per Pimlico docs: https://docs.pimlico.io/guides/eip7702/demo
        const txParams: any = {
          to: toAddress,
          value: value,
          callGasLimit: BigInt(100000),
          verificationGasLimit: BigInt(500000),
          preVerificationGas: BigInt(100000),
        };
        
        // Add authorization for EIP-7702 if needed
        if (authorization) {
          txParams.authorization = authorization;
          console.log("✅ Added EIP-7702 authorization to transaction");
        }
        
        const userOpHash = await smartAccountClient.sendTransaction(txParams);

        console.log("🎉 UserOperation Hash:", userOpHash);
        console.log("✅ Transaction submitted successfully!");

        // Get balance after to check if gas was sponsored
        const balanceAfter = await publicClient.getBalance({
          address: viemAccount.address as `0x${string}`,
        });

        // For EIP-7702: Balance decrease = value sent + gas
        // So actual gas = (balanceBefore - balanceAfter) - value
        const gasCost = balanceBefore - balanceAfter - value;

        console.log("Balance Before:", formatEther(balanceBefore), "ETH");
        console.log("Balance After:", formatEther(balanceAfter), "ETH");
        console.log("Value Sent:", formatEther(value), "ETH");
        console.log("Actual Gas Cost:", formatEther(gasCost), "ETH", gasCost === BigInt(0) ? "(SPONSORED! 🎉)" : "");

        return {
          userOpHash,
          smartAccountAddress: smartAccount.address,
          paraWalletAddress: viemAccount.address,
          balanceBefore: formatEther(balanceBefore),
          balanceAfter: formatEther(balanceAfter),
          valueSent: formatEther(value),
          gasSponsored: gasCost === BigInt(0),
          gasCost: formatEther(gasCost),
          message: `🎉 Native token transfer submitted with FREE gas!\n\nValue Sent: ${formatEther(value)} ETH\nActual Gas Cost: ${formatEther(gasCost)} ETH ${gasCost === BigInt(0) ? '(SPONSORED! 🎉)' : ''}\n\nUserOperation Hash: ${userOpHash}\n\nCheck status:\nhttps://sepolia.etherscan.io/address/${smartAccount.address}`
        };
      }

      // REGULAR MODE - User pays gas
      console.log("💵 Sending regular native token (user pays gas)...");
      const hash = await viemClient.sendTransaction({
        to: toAddress,
        value: value,
        maxFeePerGas: parseGwei("2"),
        maxPriorityFeePerGas: parseGwei("1"),
      });

      return { hash, explorer: getEtherscanTxUrl(hash), message: "Native token sent (user paid gas)" };
    }, "Send Native Token");
  };

  // 4. Send transaction with gasless support (Pimlico Smart Account)
  const handleSendTransaction = async () => {
    await handleAction(async () => {
      if (!viemAccount || !viemClient) throw new Error("No account or client");
      
      if (!txToAddress || !isAddress(txToAddress)) {
        throw new Error("Please enter a valid address (0x...)");
      }
      
      const toAddress = getAddress(txToAddress);
      const value = parseEther(txAmount);

      // GASLESS MODE - Use Pimlico Smart Account for FREE gas
      if (gaslessMode) {
        if (!smartAccountClient || !smartAccount) {
          throw new Error("Smart Account not initialized. Please wait or disable gasless mode.");
        }

        console.log("🚀 Sending GASLESS transaction via Pimlico Smart Account...");
        console.log("From (Smart Account):", smartAccount.address);
        console.log("To:", toAddress);
        console.log("Value:", txAmount, "ETH");
        
        // Check Smart Account ETH balance (for deployment and prefund)
        const publicClient = createPublicClient({
          chain: sepolia,
          transport: http(),
        });
        
        const smartAccountBalance = await publicClient.getBalance({
          address: smartAccount.address as `0x${string}`,
        });
        
        console.log("💰 Smart Account ETH Balance:", formatEther(smartAccountBalance), "ETH");
        
        // Verify Smart Account has enough ETH to send
        const valueToSend = parseEther(txAmount);
        if (smartAccountBalance < valueToSend) {
          throw new Error(
            `❌ Insufficient balance in Smart Account!\n\n` +
            `Smart Account (${smartAccount.address}):\n` +
            `Balance: ${formatEther(smartAccountBalance)} ETH\n` +
            `Required: ${txAmount} ETH\n\n` +
            `Please send ETH to Smart Account first!`
          );
        }
        
        console.log("✅ Balance check passed!");
        
        // Get Para wallet balance before (to verify gas sponsorship)
        const balanceBefore = await publicClient.getBalance({
          address: viemAccount.address as `0x${string}`,
        });
        
        console.log("💰 Para Wallet ETH Balance (before):", formatEther(balanceBefore), "ETH");
        console.log("📊 Sending transaction with INCREASED gas limits (per AA23 recommendations)...");

        // Get authorization if needed (for EIP-7702 first transaction)
        const authorization = await getAuthorizationIfNeeded();

        // Send via Smart Account (gasless with Pimlico)
        // Following: https://docs.getpara.com/v2/react/guides/web3-operations/evm/smart-accounts/sponsor-transactions#pimlico
        // Per Pimlico AA23 docs: Increase verificationGasLimit to avoid OOG
        // Per Pimlico EIP-7702 docs: https://docs.pimlico.io/guides/eip7702/demo
        const txParams: any = {
          to: toAddress,
          value: value,
          // Override gas limits to prevent AA23 OOG (per https://docs.pimlico.io/references/bundler/entrypoint-errors/aa23)
          callGasLimit: BigInt(100000),           // Increased from ~26000
          verificationGasLimit: BigInt(500000),   // Increased from ~269000 (AA23 fix)
          preVerificationGas: BigInt(100000),     // Increased from ~51000
        };
        
        // Add authorization for EIP-7702 if needed
        if (authorization) {
          txParams.authorization = authorization;
          console.log("✅ Added EIP-7702 authorization to transaction");
        }
        
        const userOpHash = await smartAccountClient.sendTransaction(txParams);
        
        console.log("✅ Transaction sent with gas limits:");
        console.log("  - verificationGasLimit: 500000 (increased to avoid AA23 OOG)");
        console.log("  - callGasLimit: 100000");
        console.log("  - preVerificationGas: 100000");

        console.log("🎉 UserOperation Hash:", userOpHash);
        console.log("✅ Transaction submitted successfully!");

        // Get balance after to check if gas was sponsored
        const balanceAfter = await publicClient.getBalance({
          address: viemAccount.address as `0x${string}`,
        });

        // For EIP-7702: Balance decrease = value sent + gas
        // So actual gas = (balanceBefore - balanceAfter) - value
        const gasCost = balanceBefore - balanceAfter - value;

        console.log("Balance Before:", formatEther(balanceBefore), "ETH");
        console.log("Balance After:", formatEther(balanceAfter), "ETH");
        console.log("Value Sent:", formatEther(value), "ETH");
        console.log("Actual Gas Cost:", formatEther(gasCost), "ETH", gasCost === BigInt(0) ? "(SPONSORED! 🎉)" : "");

        // Return immediately with userOpHash (don't wait for receipt)
        return {
          userOpHash,
          smartAccountAddress: smartAccount.address,
          paraWalletAddress: viemAccount.address,
          balanceBefore: formatEther(balanceBefore),
          balanceAfter: formatEther(balanceAfter),
          valueSent: formatEther(value),
          gasSponsored: gasCost === BigInt(0),
          gasCost: formatEther(gasCost),
          message: `🎉 Transaction submitted with FREE gas (Pimlico sponsored)!\n\nValue Sent: ${formatEther(value)} ETH\nActual Gas Cost: ${formatEther(gasCost)} ETH ${gasCost === BigInt(0) ? '(SPONSORED! 🎉)' : ''}\n\nUserOperation Hash: ${userOpHash}\n\nCheck status on Pimlico Explorer:\nhttps://pimlico.io/userOperations/${userOpHash}?network=sepolia\n\nOr Etherscan:\nhttps://sepolia.etherscan.io/address/${smartAccount.address}`
        };
      }

      // REGULAR MODE - User pays gas
      console.log("💵 Sending regular transaction (user pays gas)...");
      const hash = await viemClient.sendTransaction({
        to: toAddress,
        value: value,
        maxFeePerGas: parseGwei("2"),
        maxPriorityFeePerGas: parseGwei("1"),
      });

      return { hash, explorer: getEtherscanTxUrl(hash), message: "Transaction sent (user paid gas)" };
    }, "Send Transaction");
  };

  // 5. ERC20 Transfer with gasless support
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

      // Fetch token decimals first
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(),
      });

      const decimals = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20DecimalsABI,
        functionName: "decimals",
      });

      console.log(`Token decimals: ${decimals}`);

      // Convert amount with correct decimals (e.g., 0.1 USDC with 6 decimals = 100000)
      const amount = parseUnits(erc20Amount, Number(decimals));
      console.log(`Converting ${erc20Amount} tokens = ${amount} (with ${decimals} decimals)`);

      const data = encodeFunctionData({
        abi: erc20TransferABI,
        functionName: "transfer",
        args: [receiverAddress, amount],
      });

      // GASLESS MODE - Use Pimlico Smart Account for FREE gas
      if (gaslessMode) {
        if (!smartAccountClient || !smartAccount) {
          throw new Error("Smart Account not initialized. Please wait or disable gasless mode.");
        }

        console.log("🚀 Sending GASLESS ERC20 transfer via Pimlico Smart Account...");
        console.log("From (Smart Account):", smartAccount.address);
        console.log("Token:", tokenAddress);
        console.log("To:", receiverAddress);
        console.log("Amount:", erc20Amount);
        console.log("Data:", data);

        // Check if Smart Account has the tokens
        console.log("⚠️ WARNING: Make sure tokens are in Smart Account, not Para wallet!");
        console.log(`Smart Account: ${smartAccount.address}`);
        console.log(`Para Wallet: ${viemAccount.address}`);

        // Check token balance in Smart Account
        try {
          const smartAccountTokenBalance = await publicClient.readContract({
            address: tokenAddress,
            abi: [{
              name: "balanceOf",
              type: "function",
              stateMutability: "view",
              inputs: [{ name: "account", type: "address" }],
              outputs: [{ name: "", type: "uint256" }],
            }],
            functionName: "balanceOf",
            args: [smartAccount.address],
          });
          
          console.log(`💰 Smart Account Token Balance: ${formatUnits(smartAccountTokenBalance as bigint, Number(decimals))}`);
          
          if (smartAccountTokenBalance < amount) {
            throw new Error(
              `❌ Insufficient token balance in Smart Account!\n\n` +
              `Smart Account (${smartAccount.address}):\n` +
              `Token Balance: ${formatUnits(smartAccountTokenBalance as bigint, Number(decimals))}\n` +
              `Required: ${erc20Amount}\n\n` +
              `Please transfer tokens to Smart Account first using regular mode!`
            );
          }
          console.log("✅ Token balance check passed!");
        } catch (error: any) {
          if (error.message.includes("Insufficient token balance")) {
            throw error; // Re-throw our custom error
          }
          console.warn("⚠️ Could not check token balance:", error.message);
          console.log("Proceeding anyway... Transaction may fail if balance is insufficient.");
        }

        // Get Para wallet balance before (to verify gas sponsorship)
        const balanceBefore = await publicClient.getBalance({
          address: viemAccount.address as `0x${string}`,
        });

        console.log("💰 Para Wallet ETH Balance (before):", formatEther(balanceBefore), "ETH");
        console.log("📤 Submitting ERC20 transfer UserOperation...");

        // Get authorization if needed (for EIP-7702 first transaction)
        const authorization = await getAuthorizationIfNeeded();

        // Send ERC20 transfer via Smart Account (gasless with Pimlico)
        // ERC20 transfers need MORE gas than ETH transfers!
        // Per Pimlico EIP-7702 docs: https://docs.pimlico.io/guides/eip7702/demo
        const txParams: any = {
          to: tokenAddress,
          data,
          callGasLimit: BigInt(200000),           // Increased for ERC20 (2x)
          verificationGasLimit: BigInt(500000),   // Same as before
          preVerificationGas: BigInt(100000),     // Same as before
        };
        
        // Add authorization for EIP-7702 if needed
        if (authorization) {
          txParams.authorization = authorization;
          console.log("✅ Added EIP-7702 authorization to ERC20 transfer");
        }
        
        const userOpHash = await smartAccountClient.sendTransaction(txParams);

        console.log("🎉 UserOperation Hash:", userOpHash);
        console.log("✅ ERC20 transfer submitted successfully!");
        console.log("📊 Gas Limits Used:");
        console.log("  - callGasLimit: 200,000 (increased for ERC20)");
        console.log("  - verificationGasLimit: 500,000");
        console.log("  - preVerificationGas: 100,000");

        // Get balance after to check if gas was sponsored
        const balanceAfter = await publicClient.getBalance({
          address: viemAccount.address as `0x${string}`,
        });

        const gasCost = balanceBefore - balanceAfter;

        console.log("Balance Before:", formatEther(balanceBefore), "ETH");
        console.log("Balance After:", formatEther(balanceAfter), "ETH");
        console.log("Gas Cost:", formatEther(gasCost), "ETH", gasCost === BigInt(0) ? "(SPONSORED! 🎉)" : "");

        return {
          userOpHash,
          smartAccountAddress: smartAccount.address,
          tokenAddress,
          receiverAddress,
          amount: erc20Amount,
          gasSponsored: gasCost === BigInt(0),
          gasCost: formatEther(gasCost),
          message: `🎉 ERC20 transfer submitted with FREE gas!\n\n⚠️ Note: Tokens must be in Smart Account (${smartAccount.address})\n\nUserOperation Hash: ${userOpHash}\n\nCheck status:\nhttps://sepolia.etherscan.io/address/${smartAccount.address}`
        };
      }

      // REGULAR MODE - User pays gas
      console.log("💵 Sending regular ERC20 transfer (user pays gas)...");
      const hash = await viemClient.sendTransaction({
        to: tokenAddress,
        data,
        maxFeePerGas: parseGwei("2"),
        maxPriorityFeePerGas: parseGwei("1"),
      });

      return { hash, explorer: getEtherscanTxUrl(hash), message: "ERC20 transfer sent (user paid gas)" };
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
        
        {/* EIP-7702 vs EIP-4337 Selector */}
        {/* <div className="rounded-lg border-2 border-purple-300 dark:border-purple-700 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-4">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-2xl">⚡</span>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-purple-900 dark:text-purple-300 mb-1">
                🎉 NEW: Para Team Recommended - EIP-7702 Gasless Mode!
              </h3>
              <p className="text-xs text-purple-800 dark:text-purple-400 mb-2">
                Choose your gasless transaction method:
              </p>
            </div>
          </div>
          
          <div className="flex flex-col gap-2">
            <label className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
              use7702 
                ? 'bg-purple-100 dark:bg-purple-800/40 border-2 border-purple-500' 
                : 'bg-white/50 dark:bg-gray-800/20 border-2 border-transparent hover:border-purple-300'
            }`}>
              <input
                type="radio"
                checked={use7702}
                onChange={() => setUse7702(true)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-semibold text-sm text-purple-900 dark:text-purple-300">
                  ✅ EIP-7702: Upgrade Para Wallet (Recommended by Para Team)
                </div>
                <div className="text-xs text-purple-700 dark:text-purple-400 mt-1 space-y-1">
                  <div>• ✅ Tokens stay in Para wallet (SAME address)</div>
                  <div>• ✅ FREE gas directly from Para wallet</div>
                  <div>• ✅ No need to transfer tokens!</div>
                  <div>• 🔗 Uses Pimlico + EIP-7702</div>
                </div>
              </div>
            </label>
            
            <label className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
              !use7702 
                ? 'bg-blue-100 dark:bg-blue-800/40 border-2 border-blue-500' 
                : 'bg-white/50 dark:bg-gray-800/20 border-2 border-transparent hover:border-blue-300'
            }`}>
              <input
                type="radio"
                checked={!use7702}
                onChange={() => setUse7702(false)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-semibold text-sm text-blue-900 dark:text-blue-300">
                  EIP-4337: Separate Smart Account (Traditional AA)
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-400 mt-1 space-y-1">
                  <div>• Smart Account has DIFFERENT address</div>
                  <div>• ⚠️ Must transfer tokens to Smart Account first</div>
                  <div>• FREE gas from Smart Account</div>
                  <div>• 🔗 Uses Pimlico + EIP-4337</div>
                </div>
              </div>
            </label>
          </div>
        </div> */}
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
        {/* <div className="rounded-lg bg-orange-50 p-3 text-xs text-orange-800 dark:bg-orange-900/20 dark:text-orange-300">
          ⚠️ <strong>Warning:</strong> These transactions will be sent for real and cost gas fees. Only test on Sepolia testnet!
        </div> */}
        
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
            {/* Smart Account Status */}
            {smartAccountLoading && (
              <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                ⏳ Initializing Pimlico Smart Account for gasless transactions...
              </div>
            )}
            
            {smartAccountError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-800 dark:bg-red-900/20 dark:text-red-300">
                ❌ Smart Account Error: {smartAccountError}
              </div>
            )}
            
            {smartAccount && !smartAccountLoading && (
              <div className="rounded-lg bg-green-50 p-3 text-xs text-green-800 dark:bg-green-900/20 dark:text-green-300">
                ✅ Smart Account Ready: {smartAccount.address.slice(0, 10)}...{smartAccount.address.slice(-8)}
                <br />
                💡 Enable gasless mode below for FREE gas via Pimlico!
              </div>
            )}

            {/* Gasless Mode Toggle */}
            <div className={`flex items-center gap-3 rounded-lg p-3 ${
              gaslessMode 
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-300 dark:border-green-700' 
                : 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-300 dark:border-blue-700'
            }`}>
              <input
                type="checkbox"
                id="gaslessModeNative"
                checked={gaslessMode}
                onChange={(e) => setGaslessMode(e.target.checked)}
                disabled={!smartAccountClient || smartAccountLoading}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <label htmlFor="gaslessModeNative" className="flex-1 cursor-pointer text-sm">
                <span className={`font-semibold ${
                  gaslessMode 
                    ? 'text-green-900 dark:text-green-300' 
                    : 'text-blue-900 dark:text-blue-300'
                }`}>
                  {gaslessMode ? "🎉 Gasless Mode (FREE Gas via Pimlico!)" : "💵 Regular Mode (User pays gas)"}
                </span>
                <p className={`mt-1 text-xs ${
                  gaslessMode 
                    ? 'text-green-700 dark:text-green-400' 
                    : 'text-blue-700 dark:text-blue-400'
                }`}>
                  {gaslessMode 
                    ? `✅ Pimlico sponsors all gas fees | Sends FROM Smart Account` 
                    : `You pay ~0.0001 ETH gas (~$0.0002) | Sends FROM Para wallet`}
                </p>
              </label>
            </div>

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
              {loading ? "Sending..." : gaslessMode ? "Send Native Token (FREE Gas)" : "Send Native Token"}
            </button>
          </div>
        )}

        {/* Transaction Form */}
        {activeTab === "transaction" && (
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            {/* Smart Account Status */}
            {smartAccountLoading && (
              <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                ⏳ Initializing Pimlico Smart Account for gasless transactions...
              </div>
            )}
            
            {smartAccountError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-800 dark:bg-red-900/20 dark:text-red-300">
                ❌ Smart Account Error: {smartAccountError}
              </div>
            )}
            
            {smartAccount && !smartAccountLoading && (
              <div className="rounded-lg bg-green-50 p-3 text-xs text-green-800 dark:bg-green-900/20 dark:text-green-300">
                ✅ Smart Account Ready: {smartAccount.address.slice(0, 10)}...{smartAccount.address.slice(-8)}
                <br />
                💡 Enable gasless mode below for FREE gas via Pimlico!
              </div>
            )}

            {/* Gasless Mode Toggle */}
            <div className={`flex items-center gap-3 rounded-lg p-3 ${
              gaslessMode 
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-300 dark:border-green-700' 
                : 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-300 dark:border-blue-700'
            }`}>
              <input
                type="checkbox"
                id="gaslessModeTransaction"
                checked={gaslessMode}
                onChange={(e) => setGaslessMode(e.target.checked)}
                disabled={!smartAccountClient || smartAccountLoading}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <label htmlFor="gaslessModeTransaction" className="flex-1 cursor-pointer text-sm">
                <span className={`font-semibold ${
                  gaslessMode 
                    ? 'text-green-900 dark:text-green-300' 
                    : 'text-blue-900 dark:text-blue-300'
                }`}>
                  {gaslessMode ? "🎉 Gasless Mode (FREE Gas via Pimlico!)" : "💵 Regular Mode (User pays gas)"}
                </span>
                <p className={`mt-1 text-xs ${
                  gaslessMode 
                    ? 'text-green-700 dark:text-green-400' 
                    : 'text-blue-700 dark:text-blue-400'
                }`}>
                  {gaslessMode 
                    ? `✅ Pimlico sponsors all gas fees | Sends FROM Smart Account` 
                    : `You pay ~0.0001 ETH gas (~$0.0002) | Sends FROM Para wallet`}
                </p>
              </label>
            </div>

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
              disabled={loading || !viemAccount || wallet?.type !== "EVM" || (gaslessMode && !smartAccountClient)}
              className={`flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                gaslessMode 
                  ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700" 
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? "Sending..." : gaslessMode ? "🎉 Send Transaction (FREE Gas!)" : "💵 Send Transaction (Pay Gas)"}
            </button>
          </div>
        )}

        {/* ERC20 Transfer Form */}
        {activeTab === "erc20" && (
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            {/* Smart Account Status */}
            {smartAccountLoading && (
              <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                ⏳ Initializing Pimlico Smart Account for gasless transactions...
              </div>
            )}
            
            {smartAccountError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-800 dark:bg-red-900/20 dark:text-red-300">
                ❌ Smart Account Error: {smartAccountError}
              </div>
            )}
            
            {smartAccount && !smartAccountLoading && (
              <div className="rounded-lg bg-green-50 p-3 text-xs text-green-800 dark:bg-green-900/20 dark:text-green-300">
                ✅ Smart Account Ready: {smartAccount.address.slice(0, 10)}...{smartAccount.address.slice(-8)}
                <br />
                💡 Enable gasless mode below for FREE gas via Pimlico!
              </div>
            )}

            {/* Gasless Mode Toggle */}
            <div className={`flex items-center gap-3 rounded-lg p-3 ${
              gaslessMode 
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-300 dark:border-green-700' 
                : 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-300 dark:border-blue-700'
            }`}>
              <input
                type="checkbox"
                id="gaslessModeERC20"
                checked={gaslessMode}
                onChange={(e) => setGaslessMode(e.target.checked)}
                disabled={!smartAccountClient || smartAccountLoading}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <label htmlFor="gaslessModeERC20" className="flex-1 cursor-pointer text-sm">
                <span className={`font-semibold ${
                  gaslessMode 
                    ? 'text-green-900 dark:text-green-300' 
                    : 'text-blue-900 dark:text-blue-300'
                }`}>
                  {gaslessMode ? "🎉 Gasless Mode (FREE Gas via Pimlico!)" : "💵 Regular Mode (User pays gas)"}
                </span>
                <p className={`mt-1 text-xs ${
                  gaslessMode 
                    ? 'text-green-700 dark:text-green-400' 
                    : 'text-blue-700 dark:text-blue-400'
                }`}>
                  {gaslessMode 
                    ? `✅ Pimlico sponsors all gas fees | Sends FROM Smart Account (tokens must be in Smart Account)` 
                    : `You pay ~0.0001 ETH gas (~$0.0002) | Sends FROM Para wallet`}
                </p>
              </label>
            </div>

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
              {loading ? "Sending..." : gaslessMode ? "Send ERC20 Token (FREE Gas)" : "Send ERC20 Token"}
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
          {progressMessage || "Processing..."}
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

