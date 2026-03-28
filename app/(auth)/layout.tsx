import { FlagBar } from "@/components/ui/flag-bar";
import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <FlagBar />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-[375px]">
          <div className="mb-8 flex flex-col items-center">
            <Image
              src="/logo-ColombiAndo.png"
              alt="Colombiando"
              width={80}
              height={80}
              className="mb-3 rounded-2xl"
              priority
            />
            <h1 className="text-xl font-bold">
              <span className="text-brand-yellow">col</span>
              <span className="text-brand-blue">om</span>
              <span className="text-brand-red">bi</span>
              <span className="text-text-primary">ANDO</span>
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Apoyando la educacion rural
            </p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
