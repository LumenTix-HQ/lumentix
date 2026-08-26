import TableSkeleton from '@/components/skeletons/TableSkeleton';

export default function Loading() {
  return (
    <div className="min-h-[60vh] bg-[#060609] text-white p-6">
      <div className="max-w-5xl mx-auto">
        <TableSkeleton />
      </div>
    </div>
  );
}
