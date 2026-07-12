export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="container flex flex-col items-center justify-between gap-4 py-10 text-sm text-muted-foreground md:flex-row">
        <p>&copy; {new Date().getFullYear()} Field Sales OS. All rights reserved.</p>
        <p>The platform controls access. The AI is your Custom GPT.</p>
      </div>
    </footer>
  );
}
