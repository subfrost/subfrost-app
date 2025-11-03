'use client';

import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type SwapFlowCardProps = {
  className?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
};

export const SwapFlowCard = ({
  className,
  footer,
  children,
}: SwapFlowCardProps) => {
  return (
    <motion.div
      initial={{ height: 'auto' }}
      animate={{ height: 'auto' }}
      className={cn('overflow-hidden', className)}
    >
      <Card
        className={clsx(
          'flex flex-col justify-between overflow-x-hidden',
        )}
      >
        <CardContent
          className={clsx(
            `min-h-0 flex-1 shrink pt-4`,
          )}
        >
          <div className="flex h-full flex-col">
            <AnimatePresence mode="wait">{children}</AnimatePresence>
          </div>
        </CardContent>
        {footer}
      </Card>
    </motion.div>
  );
};
