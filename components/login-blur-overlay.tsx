interface LoginBlurOverlayProps {
  children: React.ReactNode;
  isLoggedIn?: boolean;
  label?: string;
}

export default function LoginBlurOverlay({ children }: LoginBlurOverlayProps) {
  return <>{children}</>;
}
