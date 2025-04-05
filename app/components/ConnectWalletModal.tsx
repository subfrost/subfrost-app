"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { lasereyesMiddleware } from "../middleware";

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
import { FaSnowflake } from "react-icons/fa";
import { DialogClose } from "@radix-ui/react-dialog";

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
  } = lasereyesMiddleware(useLaserEyes());
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
          "text-black",
          "rounded-3xl mx-auto",
          "fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
          "w-[300px] max-h-[413px]",
          "flex flex-col overflow-hidden p-0",
          "bg-gradient-to-b from-blue-100 to-blue-200"
        )}
      >
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-center flex flex-row gap-3 items-center justify-center font-regular text-[20px] font-medium text-blue-800">
            <FaSnowflake className="text-blue-300" size={18} />
            Connect Wallet
            <FaSnowflake className="text-blue-300" size={18} />
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 relative">
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
                    "h-[50px] text-sm rounded-xl px-4",
                    "transition-colors duration-200",
                    "bg-blue-500",
                    "group"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-[25px] min-h-[25px] w-[25px] h-[25px] flex items-center justify-center">
                      <WalletIcon
                        size={25}
                        walletName={wallet.name}
                        className="!w-[25px] !h-[25px]"
                      />
                    </div>
                    <span className="text-xs retro-text">
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
                    <div className="flex items-center justify-center">
                      <div className="flex items-center gap-2 group-hover:hidden">
                        <div className="w-2 h-2 rounded-full bg-blue-200"></div>
                        <span className="text-xs text-blue-200 dark:text-gray-400">
                          Installed
                        </span>
                      </div>
                      <div className="text-black hidden group-hover:block text-xs">Connect</div>
                      <ChevronRight className="w-8 h-8 text-black hidden group-hover:block" />
                    </div>
                  ) : (
                    <a
                      href={wallet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-800 hover:text-blue-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-xs">Install</span>
                      <ChevronRight className="w-4 h-4" />
                    </a>
                  )}
                </Button>
              );
            })}
          </DialogDescription>
        </div>

        <div className="w-full flex flex-col h-full items-center justify-center py-3 fixed bottom-0 text-[10px] dark:bg-gray-900  dark:border-gray-800 group relative">
          <div className="text-blue-500 dark:text-gray-400 text-center retro-text absolute bottom-2 transition-opacity duration-300 ease-in-out opacity-100 group-hover:opacity-0">
            <a
              href="https://www.lasereyes.build/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Powered by LaserEyes
            </a>
          </div>
          <div className=" transition-opacity bottom-1 duration-500 ease-in-out absolute opacity-0 group-hover:opacity-100">
            <a
              href="https://www.lasereyes.build/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex justify-center"
            >
              <LaserEyesLogo width={30} color={"darkBlue"} />
            </a>
          </div>
        </div>
      </DialogContent>

    </Dialog>
  );
}
