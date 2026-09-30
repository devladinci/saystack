import type { ReactNode } from "react";

interface IProps {
  children: ReactNode;
}

export function Passthrough({ children }: IProps) {
  return children;
}
