import type { ReactNode } from 'react';

export default function PageContent({ 
  children, 
  className = '' 
}: { 
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-2 sm:px-4 lg:px-0 ${className}`}>
      {children}
    </div>
  );
}


