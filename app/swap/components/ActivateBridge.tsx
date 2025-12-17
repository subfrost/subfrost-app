"use client";

import { useState, useEffect, useMemo } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import QRCode from "qrcode";

type BridgeStep = 1 | 2 | 3 | 4 | 5;

type Props = {
  isVisible: boolean;
  amount: string;
  tokenSymbol: string;
  depositAddress: string;
  currentStep: BridgeStep;
  completedSteps: BridgeStep[];
  transactionHash?: string;
};

const STEP_LABELS: Record<BridgeStep, string> = {
  1: "Awaiting Deposit",
  2: "Confirming",
  3: "Swapping",
  4: "Sending",
  5: "Sent!",
};

// Snowflake SVG component matching the brand snowflake
function Snowflake({
  isActive,
  isCompleted,
  isRotating,
  isGold
}: {
  isActive: boolean;
  isCompleted: boolean;
  isRotating: boolean;
  isGold?: boolean;
}) {
  // Gold for completed step 4 (now step 5), otherwise:
  // Active/completed snowflake uses --sf-primary which is light blue in dark mode, dark blue in light mode
  // Inactive: muted grey in dark mode, light gray in light mode
  let colorClass: string;
  if (isGold) {
    colorClass = "text-amber-500";
  } else if (isActive || isCompleted) {
    colorClass = "text-[color:var(--sf-primary)]";
  } else {
    colorClass = "text-[color:var(--sf-muted)] opacity-50";
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 256 256"
      className={`${colorClass} transition-colors duration-300 ${isRotating ? 'animate-spin' : ''}`}
      style={isRotating ? { animationDuration: '3s' } : undefined}
    >
      <rect width="100%" height="100%" fill="none"/>
      <g stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none" transform="translate(128,128)">
        {/* Main vertical arm */}
        <line x1="0" y1="-96" x2="0" y2="96"/>
        {/* Rotate 60° and 120° for other arms */}
        <g transform="rotate(60)">
          <line x1="0" y1="-96" x2="0" y2="96"/>
        </g>
        <g transform="rotate(120)">
          <line x1="0" y1="-96" x2="0" y2="96"/>
        </g>
        {/* Small branches on each arm */}
        <g>
          <g>
            <line x1="0" y1="-64" x2="16" y2="-80"/>
            <line x1="0" y1="-64" x2="-16" y2="-80"/>
            <line x1="0" y1="64" x2="16" y2="80"/>
            <line x1="0" y1="64" x2="-16" y2="80"/>
          </g>
          <g transform="rotate(60)">
            <line x1="0" y1="-64" x2="16" y2="-80"/>
            <line x1="0" y1="-64" x2="-16" y2="-80"/>
            <line x1="0" y1="64" x2="16" y2="80"/>
            <line x1="0" y1="64" x2="-16" y2="80"/>
          </g>
          <g transform="rotate(120)">
            <line x1="0" y1="-64" x2="16" y2="-80"/>
            <line x1="0" y1="-64" x2="-16" y2="-80"/>
            <line x1="0" y1="64" x2="16" y2="80"/>
            <line x1="0" y1="64" x2="-16" y2="80"/>
          </g>
        </g>
        {/* Center */}
        <circle cx="0" cy="0" r="10" fill="currentColor" stroke="none"/>
      </g>
    </svg>
  );
}


export default function ActivateBridge({
  isVisible,
  amount,
  tokenSymbol,
  depositAddress,
  currentStep,
  completedSteps,
  transactionHash = "0x05412cb541a2306b1da3f0272003c5f59964d2777d62647705e44730f0421dde",
}: Props) {
  const [copied, setCopied] = useState(false);
  const [txCopied, setTxCopied] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  // Track transaction link visibility (appears 1 second after step 5)
  const [showTransaction, setShowTransaction] = useState(false);

  // Generate QR code
  useEffect(() => {
    if (depositAddress) {
      QRCode.toDataURL(depositAddress, {
        width: 200,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.error("QR code generation failed:", err));
    }
  }, [depositAddress]);

  // Step 5: Show transaction link after 1 second
  useEffect(() => {
    if (currentStep === 5) {
      const showTimer = setTimeout(() => {
        setShowTransaction(true);
      }, 1000);
      return () => clearTimeout(showTimer);
    }
  }, [currentStep]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  const handleCopyTransaction = async () => {
    try {
      await navigator.clipboard.writeText(transactionHash);
      setTxCopied(true);
      setTimeout(() => setTxCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy transaction:", err);
    }
  };

  // Format the amount display
  const formattedAmount = useMemo(() => {
    const num = parseFloat(amount);
    if (isNaN(num)) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }, [amount]);

  // Text is only active color when it's the current step
  // Snowflake remains active color if current or completed
  const getTextColorClass = (step: BridgeStep) => {
    // Step 5 (Sent!) gets gold text
    if (step === 5 && (currentStep === 5 || completedSteps.includes(5))) {
      return "text-amber-500";
    }
    if (currentStep === step) {
      return "text-[color:var(--sf-primary)]";
    }
    return "text-[color:var(--sf-muted)]";
  };

  // Get the label for step 4 - changes to "Sent!" when step 5 is reached
  const getStep4Label = () => {
    if (currentStep === 5 || completedSteps.includes(5)) {
      return STEP_LABELS[5]; // "Sent!"
    }
    return STEP_LABELS[4]; // "Sending"
  };

  // Check if step 4 snowflake should be gold (when step 5 is active/completed)
  const isStep4Gold = currentStep === 5 || completedSteps.includes(5);

  // Etherscan URL for the transaction
  const etherscanUrl = `https://etherscan.io/tx/${transactionHash}`;

  return (
    <div
      className={`overflow-hidden transition-all duration-500 ease-out ${
        isVisible ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
      }`}
    >
      <div className="rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] p-[2px]">
        <div className="rounded-[10px] bg-[color:var(--sf-surface)] p-6">
          {/* Title */}
          <h3 className="text-center text-lg font-bold text-[color:var(--sf-text)] mb-6">
            Send {formattedAmount} {tokenSymbol}
          </h3>

          {/* QR Code */}
          <div className="flex justify-center mb-4">
            <div className="rounded-xl bg-white p-3 shadow-lg">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt={`QR code for ${depositAddress}`}
                  width={180}
                  height={180}
                  className="rounded-lg"
                />
              ) : (
                <div className="w-[180px] h-[180px] bg-gray-100 rounded-lg animate-pulse" />
              )}
            </div>
          </div>

          {/* Address with copy button */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {/* Full address on lg+ screens, truncated on smaller */}
            <code className="hidden lg:block text-xs font-mono text-[color:var(--sf-text)]/80 bg-[color:var(--sf-glass-bg)] px-3 py-2 rounded-lg border border-[color:var(--sf-outline)] whitespace-nowrap">
              {depositAddress}
            </code>
            <code className="lg:hidden text-xs font-mono text-[color:var(--sf-text)]/80 bg-[color:var(--sf-glass-bg)] px-3 py-2 rounded-lg border border-[color:var(--sf-outline)] whitespace-nowrap">
              {`${depositAddress.slice(0, 6)}...${depositAddress.slice(-4)}`}
            </code>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 p-2 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-glass-bg)] transition-all"
              title={copied ? "Copied!" : "Copy address"}
            >
              {copied ? (
                <Check size={16} className="text-green-500" />
              ) : (
                <Copy size={16} className="text-[color:var(--sf-text)]/60" />
              )}
            </button>
          </div>

          {/* Steps indicator - 2x2 grid */}
          {/* Extra gap on xs, sm, lg, xl but normal gap on md */}
          <div className="grid grid-cols-2 gap-y-10 md:gap-y-4 lg:gap-y-10">
            {/* Step 1 */}
            <div className="flex flex-col items-center gap-1">
              <Snowflake
                isActive={currentStep === 1}
                isCompleted={completedSteps.includes(1)}
                isRotating={currentStep === 1 && !completedSteps.includes(1)}
              />
              <span className={`text-xs font-semibold text-center transition-colors duration-300 ${getTextColorClass(1)}`}>
                1. {STEP_LABELS[1]}
              </span>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center gap-1">
              <Snowflake
                isActive={currentStep === 2}
                isCompleted={completedSteps.includes(2)}
                isRotating={currentStep === 2 && !completedSteps.includes(2)}
              />
              <span className={`text-xs font-semibold text-center transition-colors duration-300 ${getTextColorClass(2)}`}>
                2. {STEP_LABELS[2]}
              </span>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center gap-1">
              <Snowflake
                isActive={currentStep === 3}
                isCompleted={completedSteps.includes(3)}
                isRotating={currentStep === 3 && !completedSteps.includes(3)}
              />
              <span className={`text-xs font-semibold text-center transition-colors duration-300 ${getTextColorClass(3)}`}>
                3. {STEP_LABELS[3]}
              </span>
            </div>

            {/* Step 4 (becomes "Sent!" on step 5) */}
            <div className="flex flex-col items-center gap-1">
              <Snowflake
                isActive={currentStep === 4 || currentStep === 5}
                isCompleted={completedSteps.includes(4) || completedSteps.includes(5)}
                isRotating={currentStep === 4 && !completedSteps.includes(4)}
                isGold={isStep4Gold}
              />
              <span className={`text-xs font-semibold text-center transition-colors duration-300 ${isStep4Gold ? "text-[color:var(--sf-muted)]" : getTextColorClass(4)}`}>
                {isStep4Gold ? getStep4Label() : `4. ${getStep4Label()}`}
              </span>
            </div>
          </div>

          {/* Transaction link - appears 1 second after step 5 */}
          <div
            className={`mt-6 transition-all duration-500 ease-out ${
              showTransaction ? "max-h-[100px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <code className="text-xs font-mono text-[color:var(--sf-text)]/80 bg-[color:var(--sf-glass-bg)] px-3 py-2 rounded-lg border border-[color:var(--sf-outline)] truncate max-w-[240px]">
                {transactionHash}
              </code>
              <button
                onClick={handleCopyTransaction}
                className="flex-shrink-0 p-2 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-glass-bg)] transition-all"
                title={txCopied ? "Copied!" : "Copy transaction"}
              >
                {txCopied ? (
                  <Check size={16} className="text-green-500" />
                ) : (
                  <Copy size={16} className="text-[color:var(--sf-text)]/60" />
                )}
              </button>
              <a
                href={etherscanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 p-2 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-glass-bg)] transition-all"
                title="View on Etherscan"
              >
                <ExternalLink size={16} className="text-[color:var(--sf-text)]/60" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
