export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="embed-mode">{children}</div>;
}
