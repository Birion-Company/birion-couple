export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="auth">
      <div className="auth-box">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark.png" alt="" />
          <span>
            BIRIUN FINANCE
            <small>finanças da família</small>
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
