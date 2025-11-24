'use client';

import { X } from 'lucide-react';

interface KeystoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateKeystore: () => void;
  onImportKeystore: () => void;
}

export default function KeystoreModal({
  isOpen,
  onClose,
  onCreateKeystore,
  onImportKeystore,
}: KeystoreModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="w-[400px] max-w-[92vw] overflow-hidden rounded-3xl border border-white/10 bg-[#1a1f2e]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 pt-6 pb-4">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-white/60 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
          <h2 className="text-xl font-medium text-white">Keystore</h2>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-3">
          <button
            onClick={onCreateKeystore}
            className="w-full rounded-xl bg-[#5b7cff] hover:bg-[#4d6de8] transition-colors px-6 py-4 text-white font-semibold"
          >
            Create Keystore
          </button>
          
          <button
            onClick={onImportKeystore}
            className="w-full rounded-xl bg-[#2a3142] hover:bg-[#343d52] transition-colors px-6 py-4 text-white font-semibold"
          >
            Import Keystore
          </button>
        </div>
      </div>
    </div>
  );
}
