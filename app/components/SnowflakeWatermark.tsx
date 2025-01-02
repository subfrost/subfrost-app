"use client"

import React, { useEffect, useRef } from 'react'

export function SnowflakeWatermark() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const updateCanvasSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      drawWatermark()
    }

    function drawWatermark() {
      if (!ctx || !canvas) return
      
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const size = Math.min(canvas.width, canvas.height) * 0.4

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
      ctx.lineWidth = 2

      // Draw main snowflake pattern
      for (let i = 0; i < 6; i++) {
        ctx.save()
        ctx.translate(centerX, centerY)
        ctx.rotate((Math.PI / 3) * i)

        // Main branch
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(0, size)

        // Side branches
        for (let j = 1; j <= 3; j++) {
          const branchStart = (size / 4) * j
          const branchLength = size / 6

          // Right branch
          ctx.moveTo(0, branchStart)
          ctx.lineTo(branchLength, branchStart + branchLength)

          // Left branch
          ctx.moveTo(0, branchStart)
          ctx.lineTo(-branchLength, branchStart + branchLength)
        }

        ctx.stroke()
        ctx.restore()
      }
    }

    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)

    return () => {
      window.removeEventListener('resize', updateCanvasSize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full pointer-events-none z-[-2]"
    />
  )
} 