"use client";

import React from 'react';

// Components for consistent token name capitalization
export const FrBTC: React.FC<{ className?: string }> = ({ className }) => (
  <span className={`token-name ${className || ''}`}>
    <span style={{ textTransform: 'lowercase' }}>fr</span>
    <span style={{ textTransform: 'uppercase' }}>BTC</span>
  </span>
);

export const DxBTC: React.FC<{ className?: string }> = ({ className }) => (
  <span className={`token-name ${className || ''}`}>
    <span style={{ textTransform: 'lowercase' }}>dx</span>
    <span style={{ textTransform: 'uppercase' }}>BTC</span>
  </span>
);

export const DxFROST: React.FC<{ className?: string }> = ({ className }) => (
  <span className={`token-name ${className || ''}`}>
    <span style={{ textTransform: 'lowercase' }}>dx</span>
    <span style={{ textTransform: 'uppercase' }}>FROST</span>
  </span>
);