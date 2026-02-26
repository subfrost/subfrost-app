import type { ReactNode } from 'react';

export default function PageContent({ 
  children, 
  className = '' 
}: { 
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full md:max-w-[735px] lg:max-w-[1504px] mx-auto px-2 sm:px-4 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}


