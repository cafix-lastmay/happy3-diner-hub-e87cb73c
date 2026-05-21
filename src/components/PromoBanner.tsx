// Promotional banner shown at the bottom of the customer menu (owner-managed only).
// Layout: 75% content area (text) and 25% CTA button. RTL-aware via flex.
interface PromoBannerProps {
  text: string | null | undefined;
  ctaText: string | null | undefined;
  url: string | null | undefined;
  enabled: boolean | null | undefined;
  variant?: "footer";
}

export function PromoBanner({ text, ctaText, url, enabled }: PromoBannerProps) {
  if (!enabled) return null;
  const hasText = !!text && text.trim().length > 0;
  const hasCta = !!url && !!ctaText && ctaText.trim().length > 0 && /^https?:\/\//i.test(url);
  if (!hasText && !hasCta) return null;

  return (
    <aside
      role="complementary"
      aria-label="Promotional banner"
      className="w-full mx-auto max-w-[728px] rounded-xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/15 text-foreground h-[64px] md:h-[88px] px-2 md:px-3 flex items-stretch gap-2 md:gap-3 overflow-hidden"
    >
      <div className="flex-[3] min-w-0 flex items-center py-1.5">
        {hasText && (
          <p className="text-sm md:text-base font-medium leading-tight line-clamp-2 min-w-0">{text}</p>
        )}
      </div>
      {hasCta ? (
        <a
          href={url!}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-0 inline-flex items-center justify-center px-2 md:px-3 my-1.5 rounded-full bg-accent text-accent-foreground text-xs md:text-sm font-semibold shadow-sm hover:bg-accent/90 active:scale-95 transition text-center break-words"
        >
          <span className="line-clamp-2">{ctaText}</span>
        </a>
      ) : (
        <span className="flex-1" />
      )}
    </aside>
  );
}
