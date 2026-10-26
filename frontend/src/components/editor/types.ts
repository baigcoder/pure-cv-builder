import type { Entry } from "@/lib/cvBuilder";

export interface AIHelper {
  suggest: (text: string, type: string, context?: string) => Promise<string | null>;
  busy: boolean;
}

export interface EntrySectionProps {
  entries: Entry[];
  onChange: (next: Entry[]) => void;
  ai: AIHelper;
}
