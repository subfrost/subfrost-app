import StakeCard from "@/app/components/StakeCard";

export const metadata = {
  title: 'Earn — Stake BTC',
};

export default function EarnPage() {
  return (
    <div className="flex w-full flex-col items-center gap-8 py-8">
      <StakeCard />
    </div>
  );
}


