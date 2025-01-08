"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

import {
  MAGIC_EDEN,
  useLaserEyes,
  WalletIcon,
  SUPPORTED_WALLETS,
  LaserEyesLogo,
  ProviderType,
} from "@omnisat/lasereyes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { PixelSprite } from "./PixelSprite";
import Image from "next/image";

export default function ConnectWalletModal({ className }: { className?: string }) {
  const {
    connect,
    disconnect,
    isConnecting,
    address,
    provider,
    hasUnisat,
    hasXverse,
    hasOyl,
    hasMagicEden,
    hasOkx,
    hasLeather,
    hasPhantom,
    hasWizz,
    hasOrange,
    hasOpNet,
  } = useLaserEyes();
  const [isOpen, setIsOpen] = useState(false);

  const hasWallet = {
    unisat: hasUnisat,
    xverse: hasXverse,
    oyl: hasOyl,
    [MAGIC_EDEN]: hasMagicEden,
    okx: hasOkx,
    op_net: hasOpNet,
    leather: hasLeather,
    phantom: hasPhantom,
    wizz: hasWizz,
    orange: hasOrange,
  } as any

  const handleConnect = async (
    walletName: ProviderType
  ) => {
    if (provider === walletName) {
      await disconnect();
    } else {
      setIsOpen(false);
      await connect(walletName as never);
    }
  };



  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {address ? (
        <Link href="/profile" className="flex items-center space-x-2 bg-blue-700 bg-opacity-50 rounded-full px-3 py-1">
          <PixelSprite address={address} size={24} />
          <span className="retro-text text-xs text-white truncate w-24">{address}</span>
        </Link>
      ) : (
        <DialogTrigger asChild>
          <Button
            className={cn(
              "retro-text text-xs bg-blue-500 hover:bg-blue-600",
              className
            )}
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className={cn(
          "readable-text",
          "text-white",
          "rounded-3xl mx-auto",
          "fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
          "w-[480px] max-h-[660px]",
          "flex flex-col overflow-hidden p-0",
          " bg-blue-200 backdrop-blur-lg"
        )}
      >
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="text-center text-[22px] font-medium text-blue-800">
            Connect Wallet
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-6">
          <DialogDescription className="flex flex-col gap-2 w-full">
            {Object.values(SUPPORTED_WALLETS).map((wallet) => {
              // @ts-ignore
              const isMissingWallet = !hasWallet[wallet.name];
              return (
                <Button
                  key={wallet.name}
                  onClick={
                    isMissingWallet
                      ? () => null
                      : () => handleConnect(wallet.name)
                  }
                  variant="ghost"
                  className={cn(
                    'text-white',
                    "font-normal justify-between",
                    "h-[60px] text-base rounded-xl px-4",
                    "transition-colors duration-200",
                    "bg-blue-800",
                    "group"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-[32px] min-h-[32px] w-[32px] h-[32px] flex items-center justify-center">
                      <WalletIcon
                        size={32}
                        walletName={wallet.name}
                        className="!w-[32px] !h-[32px]"
                      />
                    </div>
                    <span className="text-lg">
                      {wallet.name
                        .replace(/[-_]/g, " ")
                        .split(" ")
                        .map(
                          (word) =>
                            word.charAt(0).toUpperCase() +
                            word.slice(1).toLowerCase()
                        )
                        .join(" ")}
                    </span>
                  </div>
                  {hasWallet[wallet.name] ? (
                    <div className="flex items-center">
                      <div className="flex items-center gap-2 group-hover:hidden">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span className="text-sm text-blue-200 dark:text-gray-400">
                          Installed
                        </span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 hidden group-hover:block" />
                    </div>
                  ) : (
                    <a
                      href={wallet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-500 hover:text-blue-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ChevronRight className="w-4 h-4" />
                      <span className="text-sm">Install</span>
                    </a>
                  )}
                </Button>
              );
            })}
          </DialogDescription>
        </div>

        <div className="w-full bg-gray-50 dark:bg-gray-900 p-4 pt-7 mt-4  border-t border-gray-200 dark:border-gray-800 group relative">
          <Image src="/snowman.png" className="absolute left-2 grayscale bottom-6" height={30} width={30} alt="snowman" />

          <Image src="/snowman.png" className="absolute right-2 grayscale top-6 scale-x-[-1]" height={30} width={30} alt="snowman" />
          <div className="text-blue-500 dark:text-gray-400 text-sm text-center transition-opacity duration-300 ease-in-out opacity-100 group-hover:opacity-0">
            <a
              href="https://www.lasereyes.build/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Powered by LaserEyes
            </a>
          </div>
          <div className="absolute top-5 left-0 right-0 transition-opacity duration-500 ease-in-out opacity-0 group-hover:opacity-100">
            <a
              href="https://www.lasereyes.build/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex justify-center"
            >
              <LaserEyesLogo width={48} color={"blue"} />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
