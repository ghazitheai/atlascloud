import "./globals.css";
export const metadata = {
  title: "Atlas · Procurement",
  description: "Enterprise procurement and supplier workspace",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
