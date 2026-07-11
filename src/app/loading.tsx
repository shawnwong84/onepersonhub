import Image from "next/image";

export default function Loading() {
  return (
    <div className="flex h-full min-h-screen w-full flex-col items-center justify-center bg-owly-bg">
      <Image src="/owly.png" alt="Cosstigo" width={56} height={56} className="mb-4" />
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-owly-primary border-t-transparent" />
    </div>
  );
}
