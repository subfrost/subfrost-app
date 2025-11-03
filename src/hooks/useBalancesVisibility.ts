"use client"

import { useState, useEffect } from 'react'

// Create global variables to store the state
// Initialize to false to hide the button in desktop view by default
let globalShowBalancesButton = false
let globalIsPinchZoomed = false
let listeners: Array<(show: boolean) => void> = []
let pinchListeners: Array<(isPinched: boolean) => void> = []

// Function to update all listeners
const notifyListeners = (value: boolean) => {
  listeners.forEach(listener => listener(value))
}

const notifyPinchListeners = (value: boolean) => {
  pinchListeners.forEach(listener => listener(value))
}

export function useBalancesVisibility() {
  const [showBalancesButton, setLocalShowBalancesButton] = useState(globalShowBalancesButton)
  const [isMobile, setIsMobile] = useState(false)
  const [isPinchZoomed, setLocalIsPinchZoomed] = useState(globalIsPinchZoomed)

  // Check if we're on mobile and handle pinch zoom
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkMobile = () => {
        const isMobileView = window.innerWidth < 768
        setIsMobile(isMobileView)
        
        // On mobile, we automatically set isPinchZoomed to true to show the wallet button
        // and hide the balances button in the navbar
        if (isMobileView) {
          setIsPinchZoomed(true)
        } else {
          setIsPinchZoomed(false)
        }
        
        // On mobile, we want to show the balances button in the navbar (unless pinch zoomed)
        // On desktop, we want to hide it (it will be in the bottom right corner)
        if (isMobileView && !globalIsPinchZoomed && !globalShowBalancesButton) {
          setShowBalancesButton(true)
        } else if ((!isMobileView || globalIsPinchZoomed) && globalShowBalancesButton) {
          setShowBalancesButton(false)
        }
      }
      
      // Initial check
      checkMobile()
      
      // Add event listener for window resize
      window.addEventListener('resize', checkMobile)
      
      // Track pinch zoom using touch events and scale
      let initialDistance = 0;
      
      const touchStartHandler = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          initialDistance = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
          );
        }
      };
      
      const touchMoveHandler = (e: TouchEvent) => {
        if (e.touches.length === 2 && initialDistance > 0) {
          const currentDistance = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
          );
          
          // Detect pinch in (zoom out)
          if (currentDistance < initialDistance * 0.8 && !globalIsPinchZoomed) {
            setIsPinchZoomed(true);
          }
          // Detect pinch out (zoom in)
          else if (currentDistance > initialDistance * 1.2 && globalIsPinchZoomed) {
            setIsPinchZoomed(false);
          }
        }
      };
      
      // Add touch event listeners
      window.addEventListener('touchstart', touchStartHandler);
      window.addEventListener('touchmove', touchMoveHandler);
      
      // Cleanup
      return () => {
        window.removeEventListener('resize', checkMobile);
        window.removeEventListener('touchstart', touchStartHandler);
        window.removeEventListener('touchmove', touchMoveHandler);
      }
    }
  }, [])

  // Update local state when global state changes
  useEffect(() => {
    const handleChange = (value: boolean) => {
      setLocalShowBalancesButton(value)
    }

    // Add listener
    listeners.push(handleChange)

    // Remove listener on cleanup
    return () => {
      listeners = listeners.filter(listener => listener !== handleChange)
    }
  }, [])

  // Update local pinch zoom state when global state changes
  useEffect(() => {
    const handlePinchChange = (value: boolean) => {
      setLocalIsPinchZoomed(value)
    }

    // Add listener
    pinchListeners.push(handlePinchChange)

    // Remove listener on cleanup
    return () => {
      pinchListeners = pinchListeners.filter(listener => listener !== handlePinchChange)
    }
  }, [])

  // Function to update global state
  const setShowBalancesButton = (value: boolean) => {
    globalShowBalancesButton = value
    notifyListeners(value)
  }

  // Function to update global pinch zoom state
  const setIsPinchZoomed = (value: boolean) => {
    globalIsPinchZoomed = value
    notifyPinchListeners(value)
    
    // When pinch zoom changes, update balances button visibility
    if (isMobile) {
      setShowBalancesButton(!value)
    }
  }

  return { showBalancesButton, setShowBalancesButton, isMobile, isPinchZoomed, setIsPinchZoomed }
}