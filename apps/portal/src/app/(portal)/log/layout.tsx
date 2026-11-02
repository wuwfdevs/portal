import { requireLogAccess } from "@/lib/log/access";
import { LogChrome } from "./log-chrome";

export default async function LogLayout({ children }: { children: React.ReactNode }) {
  await requireLogAccess();

  return (
    <div className="px-6 py-7 sm:px-8 sm:pb-12">
      <LogChrome>{children}</LogChrome>
    </div>
  );
}
