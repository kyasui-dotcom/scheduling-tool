export default function Loading() {
  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto animate-pulse">
        <div className="mb-8 text-center space-y-3">
          <div className="h-8 w-64 bg-muted rounded mx-auto" />
          <div className="h-5 w-20 bg-muted rounded-full mx-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="border rounded-xl p-6 space-y-4">
            <div className="h-6 w-32 bg-muted rounded mx-auto" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="aspect-square bg-muted rounded-md" />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center text-muted-foreground text-sm">
            読み込み中...
          </div>
        </div>
      </div>
    </div>
  );
}
