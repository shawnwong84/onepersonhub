import { BrandMark } from "@/components/brand-mark";

export default function Loading() {
  return (
    <div className="flex h-full min-h-screen w-full flex-col items-center justify-center bg-owly-bg">
      <BrandMark size={56} className="mb-4" />
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-owly-primary border-t-transparent" />
    </div>
  );
}
