"use client"

import { useEffect, useRef, useState, memo } from 'react'

interface Particle {
  x: number
  y: number
  radius: number
  speed: number
  opacity: number
  type: 'snowflake' | 'bitcoin'
}

// Reduce particle count for better performance
const PARTICLE_COUNT = 50

function SnowflakeWatermarkComponent() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const particlesRef = useRef<Particle[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const setCanvasSize = () => {
      if (!canvas) return
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    setCanvasSize()

    // Initialize particles only once
    if (particlesRef.current.length === 0) {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 4 + 2,
          speed: Math.random() * 0.5 + 0.1,
          opacity: Math.random() * 0.7 + 0.3,
          type: Math.random() < 0.95 ? 'snowflake' : 'bitcoin'
        })
      }
    }

    const particles = particlesRef.current

    function drawSnowflake(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, opacity: number) {
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        ctx.moveTo(x, y)
        ctx.lineTo(x + radius * Math.cos(i * Math.PI / 3), y + radius * Math.sin(i * Math.PI / 3))
      }
      ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    function drawBitcoin(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, opacity: number) {
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.font = `${radius}px Arial`
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('₿', x, y)
    }

    function animate() {
      if (!ctx || !canvas) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach(particle => {
        if (particle.type === 'snowflake') {
          drawSnowflake(ctx, particle.x, particle.y, particle.radius, particle.opacity)
        } else {
          drawBitcoin(ctx, particle.x, particle.y, particle.radius, particle.opacity)
        }

        particle.y += particle.speed

        if (particle.y > canvas.height) {
          particle.y = 0
          particle.x = Math.random() * canvas.width
        }
      })

      // Store animation frame ID for cleanup
      animationRef.current = requestAnimationFrame(animate)
    }

    // Start animation
    animationRef.current = requestAnimationFrame(animate)

    // Throttled resize handler
    let resizeTimeout: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(setCanvasSize, 100)
    }

    window.addEventListener('resize', handleResize)

    // Cleanup function - CRITICAL: cancel animation frame
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      window.removeEventListener('resize', handleResize)
      clearTimeout(resizeTimeout)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full pointer-events-none"
      style={{
        zIndex: -1,
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        visibility: 'visible',
        opacity: 1
      }}
    />
  )
}

// Memoize to prevent re-renders from parent
export const SnowflakeWatermark = memo(SnowflakeWatermarkComponent)
