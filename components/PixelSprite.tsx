"use client"

import { useEffect, useRef } from 'react'

interface PixelSpriteProps {
  address: string
  size: number
}

export function PixelSprite({ address, size }: PixelSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pixelSize = size / 8
    const colors = generateColors(address)

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const colorIndex = Math.floor(Math.random() * colors.length)
        ctx.fillStyle = colors[colorIndex]
        ctx.fillRect(i * pixelSize, j * pixelSize, pixelSize, pixelSize)
      }
    }
  }, [address, size])

  return <canvas ref={canvasRef} width={size} height={size} className="rounded-full" />
}

function generateColors(address: string): string[] {
  const hash = address.slice(0, 6)
  const hue = parseInt(hash, 16) % 360
  return [
    `hsl(${hue}, 70%, 50%)`,
    `hsl(${hue}, 70%, 60%)`,
    `hsl(${hue}, 70%, 70%)`,
    `hsl(${hue}, 70%, 80%)`,
    `hsl(${hue}, 70%, 90%)`
  ]
}

