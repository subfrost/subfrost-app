import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageHeader from '@/app/components/PageHeader';
import PageContent from '@/app/components/PageContent';

export const metadata = { title: 'Transaction' };

export default function TransactionDetails({ params }: { params: { id: string } }) {
  const { id } = params;

  return (
    <PageContent>
      <AlkanesMainWrapper header={<PageHeader title={`Transaction ${id}`} />}> 
        <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 text-sm text-[color:var(--sf-text)]/80">
          Transaction details coming soon.
        </div>
      </AlkanesMainWrapper>
    </PageContent>
  );
}


