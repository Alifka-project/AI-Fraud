import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  centered?: boolean;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
  centered = false,
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-3xl", centered && "mx-auto text-center", className)}>
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-600 mb-3">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-3xl md:text-4xl font-bold text-navy-900 tracking-tight">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base text-muted-foreground leading-relaxed">{description}</p>
      ) : null}
    </div>
  );
}
