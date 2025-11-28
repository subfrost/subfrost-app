import type { ReactNode } from 'react';

export default function PageHeader({
  title,
  subtitle,
  actions,
  children,
  howItWorksButton,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  howItWorksButton?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {title ? (
            <h1 className="truncate text-3xl font-bold text-[color:var(--sf-text)]">
              {title}
            </h1>
          ) : null}
          {howItWorksButton}
          {children}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {subtitle ? <div className="text-sm text-[color:var(--sf-text)]/70">{subtitle}</div> : null}
    </div>
  );
}


