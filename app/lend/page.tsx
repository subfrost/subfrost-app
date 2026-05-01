import PageContent from '@/app/components/PageContent';
import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import LendShell from './LendShell';

export const metadata = { title: 'Lend — Frostlend' };

export default function LendPage() {
  return (
    <AlkanesMainWrapper>
      <PageContent className="px-4 md:px-5">
        <LendShell />
      </PageContent>
    </AlkanesMainWrapper>
  );
}
