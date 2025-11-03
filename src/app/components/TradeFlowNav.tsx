'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

type TradeFlowNavProps = {
  title: string;
};

export const TradeFlowNav = ({ title }: TradeFlowNavProps) => {
  return (
    <motion.div layout className="relative flex items-center justify-between">
      <Link href="/">
        <Button variant="secondary">
          <svg
            className="size-3 text-gray-600"
            stroke="currentColor"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5.11765 10L1 6.00001L5.11765 2M11 6.00001L1.29412 6"
              stroke="#090A0C"
              strokeWidth="1.6"
              strokeLinecap="square"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
      </Link>
      {title && (
        <span className="absolute left-1/2 -translate-x-1/2 text-lg font-medium">
          {title}
        </span>
      )}
    </motion.div>
  );
};
