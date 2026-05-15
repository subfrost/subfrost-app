import StakeCard from "@/app/components/StakeCard";

export const metadata = {
  title: 'Earn — Stake BTC',
};

export default function EarnPage() {
  return (
    <div className="flex w-full flex-col items-center gap-4 py-4 sm:gap-8 sm:py-8">
      <StakeCard />
    </div>
  );
}


