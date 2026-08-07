export function AdminPlaceholderPage({ title }: { title: string }) {
  return <div><p className="text-sm font-bold text-violet-600">Admin module</p><h1 className="mt-1 text-3xl font-bold">{title}</h1><div className="mt-7 rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center text-stone-500">{title} will connect when its backend service is introduced.</div></div>
}
