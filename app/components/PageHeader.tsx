import type { ReactNode } from 'react';

export default function PageHeader({
  title,
  actions,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-4 border-b border-[color:var(--sf-glass-border)] pb-4">
      <div className="flex min-w-0 items-center gap-3">
        {title ? (
          <h1 className="truncate text-xl font-extrabold tracking-wide text-[color:var(--sf-text)]">
            {title}
          </h1>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}


