import { notFound } from "next/navigation";
import { ResumePdfViewer } from "@/components/resume-pdf-viewer";
import { resumeTemplateSchema } from "@/lib/product/resume-schema";

export default async function ResumeViewerPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const parsed = resumeTemplateSchema.safeParse((await searchParams).template);
  if (!parsed.success) notFound();
  return <ResumePdfViewer template={parsed.data} />;
}
