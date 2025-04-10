/**
 * Utility functions for consistent styling across components
 */

/**
 * Returns inline styles for frost background effect that works consistently across devices
 * including mobile browsers that might have issues with backdrop-filter
 */
export const getFrostBgStyle = () => {
  return {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)'
  };
};

/**
 * Returns inline styles for frost border effect
 */
export const getFrostBorderStyle = () => {
  return {
    border: '1px solid rgba(255, 255, 255, 0.3)'
  };
};