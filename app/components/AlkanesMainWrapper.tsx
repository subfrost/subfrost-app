import type { ReactNode } from 'react';

export default function AlkanesMainWrapper({
  header,
  children,
  className = '',
}: {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex w-full flex-col gap-6 ${className}`}>
      {header ? <div className="mt-2">{header}</div> : null}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}


