import Image from "next/image";
import { ConnectButton } from "@/components/connect-button";
import WalletCreator from "@/components/wallet-creator";
import TransactionSigner from "@/components/transaction-signer";
import SafeSmartAccount from "@/components/safe-smart-account";
import NGOWalletManager from "@/components/ngo-wallet-manager";
import MySafeWallets from "@/components/my-safe-wallets";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex w-full flex-col gap-8">
          <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
            <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
              Next.js with Para Wallet
            </h1>
            <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              Next.js application integrated with Para wallet. Connect your wallet to get started!
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
              <ConnectButton />
              <a
                className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
                href="https://docs.getpara.com/v2/introduction/welcome"
                target="_blank"
                rel="noopener noreferrer"
              >
                Para Docs
              </a>
            </div>

            <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800" />

            {/* <MySafeWallets /> */}

            <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800" />

            <WalletCreator />

            <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800" />

            <TransactionSigner />

            {/* <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800" />

            <SafeSmartAccount />

            <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800" />

            <NGOWalletManager /> */}
          </div>
        </div>
      </main>
    </div>
  );
}
