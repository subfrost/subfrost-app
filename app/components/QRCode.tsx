'use client';

import { useEffect, useRef } from 'react';

interface QRCodeProps {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  bgColor?: string;
  fgColor?: string;
  className?: string;
}

/**
 * Simple QR Code component using qrcode-generator library (inline)
 * For production, consider using react-qr-code or qrcode.react
 */
export default function QRCode({
  value,
  size = 256,
  level = 'M',
  bgColor = '#ffffff',
  fgColor = '#000000',
  className = '',
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    // For now, use a simple data URL approach with an external service
    // In production, you'd want to use a proper QR library like qrcode or react-qr-code
    renderQRCodeViaAPI();
  }, [value, size, level, bgColor, fgColor]);

  const renderQRCodeViaAPI = () => {
    // Using a simple approach: render as SVG using an inline generator
    // For a production app, install: npm install qrcode or react-qr-code
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Simple placeholder: Create a data matrix pattern
    // This is a PLACEHOLDER - in production use a real QR library
    canvas.width = size;
    canvas.height = size;

    // Fill background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);

    // Draw text as placeholder
    ctx.fillStyle = fgColor;
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('QR Code', size / 2, size / 2 - 10);
    ctx.font = '10px monospace';
    ctx.fillText('Install QR library', size / 2, size / 2 + 10);
  };

  return (
    <div className={`inline-block ${className}`}>
      <canvas
        ref={canvasRef}
        className="rounded-lg"
        style={{ width: size, height: size }}
      />
      <div className="mt-2 text-xs text-center text-white/60">
        <a
          href={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300"
        >
          View QR Code
        </a>
      </div>
    </div>
  );
}

/**
 * Better implementation using img tag with external QR service
 * This works immediately without installing packages
 */
export function SimpleQRCode({
  value,
  size = 256,
  className = '',
}: Omit<QRCodeProps, 'level' | 'bgColor' | 'fgColor'>) {
  return (
    <div className={`inline-block ${className}`}>
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&format=svg`}
        alt="QR Code"
        width={size}
        height={size}
        className="rounded-lg bg-white p-4"
      />
    </div>
  );
}
