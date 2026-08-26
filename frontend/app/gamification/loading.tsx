import CardSkeleton from '@/components/skeletons/CardSkeleton';

export default function Loading() {
  return (
    <div className="min-h-[60vh] bg-[#060609] text-white p-6">
      <div className="max-w-5xl mx-auto">
        <CardSkeleton />
      </div>
    </div>
  );
}
