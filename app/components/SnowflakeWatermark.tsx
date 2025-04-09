"use client"

import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  radius: number
  speed: number
  opacity: number
  type: 'snowflake' | 'bitcoin'
}

export function SnowflakeWatermark() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: Particle[] = []

    for (let i = 0; i < 100; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 4 + 2,
        speed: Math.random() * 0.5 + 0.1,
        opacity: Math.random() * 0.7 + 0.3,
        type: Math.random() < 0.8 ? 'snowflake' : 'bitcoin' // 20% chance of being a Bitcoin logo
      })
    }

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

      // Draw the Bitcoin 'B' symbol
      ctx.font = `${radius}px Nunito`
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('₿', x, y)
    }

    function animate() {
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

      requestAnimationFrame(animate)
    }

    animate()

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full pointer-events-none z-[-1]"
    />
  )
}

