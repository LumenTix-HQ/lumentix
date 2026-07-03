export default function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="h-8 bg-white/5 rounded-lg w-1/3" />
      <div className="h-4 bg-white/5 rounded-lg w-2/3" />
      <div className="h-64 bg-white/5 rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-32 bg-white/5 rounded-xl" />
        <div className="h-32 bg-white/5 rounded-xl" />
      </div>
    </div>
  );
}
