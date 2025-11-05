import type { ReactNode } from 'react';

export default function AlkanesMainWrapper({
  header,
  children,
}: {
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-6">
      {header ? <div className="mt-2">{header}</div> : null}
      <div>{children}</div>
    </div>
  );
}


