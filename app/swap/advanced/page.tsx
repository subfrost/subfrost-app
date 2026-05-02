import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageContent from '@/app/components/PageContent';

export const metadata = { title: 'Advanced Trader' };

export default function AdvancedTraderPage() {
  return (
    <PageContent className="h-full flex flex-col">
      <AlkanesMainWrapper className="flex-1 min-h-0">
        <div className="flex flex-1 items-center justify-center py-24">
          <div className="text-center">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
              SUBFROST Advanced Trader Interface
            </h1>
            <p className="mt-3 text-sm md:text-base text-[color:var(--sf-text)]/60">
              Coming Soon
            </p>
          </div>
        </div>
      </AlkanesMainWrapper>
    </PageContent>
  );
}
