"use client"

import { useEffect, useRef, useState } from 'react'

export function SnowflakeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Check if window is defined (client-side)
    if (typeof window !== 'undefined') {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 768)
      }
      
      // Initial check
      checkMobile()
      
      // Add event listener for window resize
      window.addEventListener('resize', checkMobile)
      
      // Cleanup
      return () => window.removeEventListener('resize', checkMobile)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    // Create more snowflakes on mobile for better visibility
    const snowflakeCount = isMobile ? 150 : 100

    const snowflakes: { x: number; y: number; radius: number; speed: number }[] = []

    for (let i = 0; i < snowflakeCount; i++) {
      snowflakes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * (isMobile ? 3 : 2) + 1, // Slightly larger snowflakes on mobile
        speed: Math.random() * 0.5 + 0.1
      })
    }

    function drawSnowflakes() {
      if (!ctx || !canvas) return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'

      for (let flake of snowflakes) {
        ctx.beginPath()
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2)
        ctx.fill()

        flake.y += flake.speed

        if (flake.y > canvas.height) {
          flake.y = 0
          flake.x = Math.random() * canvas.width
        }
      }

      requestAnimationFrame(drawSnowflakes)
    }

    drawSnowflakes()

    const handleResize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [isMobile])

  // Ensure the blue gradient background is applied on mobile
  useEffect(() => {
    // Remove any inline styles that might be overriding the background
    if (typeof document !== 'undefined') {
      document.body.style.removeProperty('background');
      document.body.style.removeProperty('background-color');
      
      // Add a class to ensure the gradient is visible on mobile
      if (isMobile) {
        document.body.classList.add('mobile-gradient-bg');
      } else {
        document.body.classList.remove('mobile-gradient-bg');
      }
    }
    
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('mobile-gradient-bg');
      }
    }
  }, [isMobile]);

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

