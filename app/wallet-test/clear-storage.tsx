'use client';

/**
 * Component to clear old localStorage data
 */
export function ClearStorageButton() {
  const handleClear = () => {
    if (typeof window !== 'undefined') {
      // Clear all alkanes/wallet related data
      localStorage.removeItem('alkanes_wallet_keystore');
      localStorage.removeItem('alkanes_wallet_address');
      localStorage.removeItem('alkanes_wallet_network');
      
      // Clear any other potential old formats
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('alkanes') || key.includes('wallet') || key.includes('keystore'))) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      alert('✅ Storage cleared! Please refresh the page and try again.');
      window.location.reload();
    }
  };

  return (
    <button
      onClick={handleClear}
      className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
    >
      🗑️ Clear Old Storage Data
    </button>
  );
}
